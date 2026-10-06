"""crm-output-guard — trava de saída do atendimento (WhatsApp/e-mail).

Caso 1 (06/10/2026): o modelo `stealth/space-bunny-alpha` escreveu o monólogo interno
DENTRO da resposta e o Hermes entregou tudo ao cliente (1504 caracteres), incluindo
marcador interno "(texto real enviado ao cliente)", auto-correção ("⚠️ Hmm, espere...")
e uma assinatura de spam com URL.

Caso 2 (06/10/2026): o `whatsapp_manager.py` (template `whatsappkit`) imprimiu o log do
boot no stdout e esse texto foi colado NA FRENTE da resposta entregue ao lead:

    [whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw...
    [whatsapp-manager] ✓ Skills registradas: google-oauth, research-sources, ...
    [whatsapp-manager] [post_llm_call] chamado — kwargs keys: ['session_id', ...]
    Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, ...

Isso vazou caminho interno, URL de repositório e nome de skill para o cliente.

Esta trava roda no hook `transform_llm_output` (antes de persistir e de entregar):
  - se não houver marca de vazamento, log interno nem spam, devolve None e nada muda;
  - linhas de log interno são descartadas (linha inteira, nunca o meio de uma frase);
  - se houver marca de monólogo, corta tudo até o fim da última frase com marca (o modelo
    costuma escrever a mensagem real por último) e joga fora linhas de spam/CTA;
  - se sobrar pouco (ou só log), entrega um aviso neutro em vez de vazar;
  - avisa no Telegram e registra em `<HERMES_HOME>/output-guard.log`.

Funções puras no topo (testáveis sem o Hermes): `sanitize`, `split_sentences`,
`strip_log_lines`, `is_log_line`. O conjunto de regras de log é espelhado no lado do CRM
em `src/services/messaging/hermes-noise.ts` — **mexeu aqui, mexa lá também**.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Frases que só existem no monólogo interno do modelo (não em conversa com cliente).
_MARKERS = [
    r"texto real enviado ao cliente",
    r"mensagem real enviada",
    r"⚠️\s*hmm",
    r"\bhmm,?\s+espere\b",
    r"deixa eu (olhar|ver|revisar|pensar)",
    r"espere\.\s+foi isso",
    r"minha resposta (deve|real|final)",
    r"o turno deve terminar",
    r"como o sistema espera",
    r"erro de pensamento",
    r"eu não preciso \(e não devo\)",
    r"a memória já foi salva",
    r"ignoro completamente",
    r"não vou inventar",
    r"resposta final correta",
    r"vou revisar",
    r"devo responder",
    r"o cliente disse apenas",
    r"ele está se despedindo",
    r"não há mais nada a fazer",
    r"respeitar o encerramento",
    r"o que eu devia responder",
    r"foi um erro",
    r"</?parameter[^>]*>",
    r"</?function[^>]*>",
    r"<tool_call>",
    r"antml:",
]
_MARKER_RE = re.compile("|".join(_MARKERS), re.IGNORECASE)

# ── Log interno do bridge/plugin que não pode ir ao cliente ────────────────────
# Tag no começo da linha: [whatsapp-manager], [owner-status], [post_llm_call] e o caso
# aninhado "[whatsapp-manager] [owner-status] ...". Exige uma letra na tag, então uma
# lista tipo "[1] item" não é tratada como log.
_LOG_TAG_RE = re.compile(r"^\s*(?:\[(?=[^\]]*[a-z])[a-z0-9][^\]\n]{0,40}\]\s*)+", re.IGNORECASE)
_LOG_META_RE = re.compile(
    r"^\s*(session_id|task_id|turn_id|conversation_id|chat_id|provider|model)\s*[:=]",
    re.IGNORECASE,
)
# Frases do bootstrap que aparecem SEM tag. Específicas de propósito: uma frase genérica
# ("baixado com sucesso") poderia casar com uma resposta legítima.
_LOG_PHRASES = (
    "/opt/data/",  # caminho interno do container: nunca pertence a mensagem de cliente
    "puxando últimas configurações",
    "verificando atualizações de código",
    "skills registradas:",
    "cache de notificações carregado",
    "restaurado do disco:",
    "agendador periódico (24h)",
)

# Assinatura de spam/CTA que não pode ir ao cliente (regra de exposição do SOUL).
_SPAM_RE = re.compile(
    r"(clique aqui|me ajudar|aumentar minha produtividade|lluiz\.top|se inscreva|"
    r"ganhe dinheiro|renda extra|promo[çc][ãa]o imperd[íi]vel)",
    re.IGNORECASE,
)
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_EMOJI_RE = re.compile(
    "[\U0001f300-\U0001faff\U00002600-\U000027bf\U0001f1e6-\U0001f1ff\u2728\u2764\ufe0f\u2705\U0001f4af\U0001f64c]"
)
_SEPARATOR_RE = re.compile(r"^\s*(-{3,}|_{3,}|\*{3,})\s*$")
# Sintaxe interna de tool-call que vazou em teste (06/10): '</parameter>', '<function=...>'.
_XML_LEAK_RE = re.compile(
    r"</?(?:parameter|parameters|function|functions|tool_call|tool_calls|tool|invoke|antml:[a-z_]+)[^>]*>",
    re.IGNORECASE,
)

_MIN_CLEAN_CHARS = 12
_MAX_LOG_BYTES = 512_000

# Usado quando o que chegou era só log interno (nada de conversa sobrou).
_SAFE_FALLBACK = (
    "Desculpe, tive um problema para montar a resposta agora. "
    "Já registrei tudo por aqui e o responsável te retorna no próximo horário de atendimento."
)


def is_log_line(line: str) -> bool:
    """Esta linha é log interno do Hermes/bridge (e não conversa)?"""
    texto = (line or "").strip()
    if not texto:
        return False
    if _LOG_META_RE.match(texto):
        return True
    baixo = texto.lower()
    if any(frase in baixo for frase in _LOG_PHRASES):
        return True
    return bool(_LOG_TAG_RE.match(texto))


def strip_log_lines(text: str) -> str:
    """Descarta linhas de log internas, preservando a conversa.

    Só remove a linha inteira — nunca corta o meio de uma frase do cliente.
    """
    linhas = [l for l in (text or "").replace("\r\n", "\n").split("\n") if not is_log_line(l)]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(linhas)).strip()


def scan_text(text: str) -> Dict[str, Any]:
    """Diagnóstico puro: o texto tem vazamento? tem spam? tem log interno?"""
    linhas = (text or "").split("\n")
    return {
        "markers": sorted({m.group(0).lower().strip() for m in _MARKER_RE.finditer(text)}),
        "logs": [l.strip()[:120] for l in linhas if is_log_line(l)],
        "spam": bool(_SPAM_RE.search(text)),
        "urls": _URL_RE.findall(text or ""),
        "has_url_spam": bool(_URL_RE.search(text or "") and _SPAM_RE.search(text or "")),
    }


def looks_like_spam(line: str) -> bool:
    """Linha que não pode ir ao cliente: CTA/assinatura comercial ou link com emoji-salada."""
    if not line.strip():
        return False
    if _SPAM_RE.search(line):
        return True
    if _URL_RE.search(line) and len(_EMOJI_RE.findall(line)) >= 3:
        return True
    if _SEPARATOR_RE.match(line):
        return True
    return False


def _sentence_spans(text: str) -> List[tuple]:
    """Posições (início, fim) de cada frase no texto original.

    Guardar as posições permite RECORTAR o texto original em vez de rejuntar pedaços com
    espaço — rejuntar corrompia nomes colados em camel case ("MLLuiz DevTech" virava
    "MLLuiz Dev Tech") e achatava as quebras de linha da mensagem.
    """
    spans: List[tuple] = []
    offset = 0
    for linha in text.split("\n"):
        cursor = 0
        for pedaco in re.split(
            r"(?<=[.!?…])\s+"                      # fim de frase com espaço
            r"|(?<=[.!?…])(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])"    # emendada sem espaço ('natural.Fico')
            r"|(?<=[a-záéíóúâêôãõç])(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])",  # emendada sem pontuação
            linha,
        ):
            if not pedaco.strip():
                cursor += len(pedaco)
                continue
            idx = linha.find(pedaco, cursor)
            if idx < 0:
                idx = cursor
            spans.append((offset + idx, offset + idx + len(pedaco)))
            cursor = idx + len(pedaco)
        offset += len(linha) + 1
    return spans


def split_sentences(text: str) -> List[str]:
    """Quebra em frases: pontuação normal e também emenda sem espaço ('natural.Fico por aqui')."""
    t = (text or "").replace("\r\n", "\n")
    return [t[a:b] for a, b in _sentence_spans(t)]


def _spotless_slice(text: str, spans: List[tuple]) -> str:
    """Maior trecho contíguo de frases sem monólogo/spam, recortado do texto original."""
    melhor = None
    inicio = None
    for k, (a, b) in enumerate(spans):
        if not _MARKER_RE.search(text[a:b]) and not looks_like_spam(text[a:b]):
            if inicio is None:
                inicio = k
        elif inicio is not None:
            if melhor is None or spans[k - 1][1] - spans[inicio][0] > spans[melhor[1]][1] - spans[melhor[0]][0]:
                melhor = (inicio, k - 1)
            inicio = None
    if inicio is not None:
        ultimo = len(spans) - 1
        if melhor is None or spans[ultimo][1] - spans[inicio][0] > spans[melhor[1]][1] - spans[melhor[0]][0]:
            melhor = (inicio, ultimo)
    if melhor is None:
        return ""
    return text[spans[melhor[0]][0] : spans[melhor[1]][1]]


def sanitize(text: str) -> Optional[str]:
    """Texto do cliente, ou None quando não há nada a corrigir."""
    if not isinstance(text, str) or not text.strip():
        return None

    linhas = text.split("\n")
    tem_log = any(is_log_line(l) for l in linhas)
    tem_marcador = bool(_MARKER_RE.search(text)) or any(looks_like_spam(l) for l in linhas)
    if not tem_log and not tem_marcador:
        return None

    # 0) tira o log interno colado na frente da resposta (o resto do trabalho é sobre o resto)
    base = strip_log_lines(text) if tem_log else text
    if not base.strip():
        # era só log: não há conversa nenhuma para entregar
        return _SAFE_FALLBACK

    if not tem_marcador:
        # O único problema era o log. Devolve a conversa EXATAMENTE como estava —
        # sem passar pelo fatiador de frases, que mexe no espaçamento.
        return _tidy(base)

    t = base.replace("\r\n", "\n")
    spans = _sentence_spans(t)
    sujas = [k for k, (a, b) in enumerate(spans) if _MARKER_RE.search(t[a:b]) or looks_like_spam(t[a:b])]

    # 1) preferência: o que vem DEPOIS do último monólogo (é onde este modelo escreve a resposta real)
    limpo = ""
    if sujas and sujas[-1] + 1 < len(spans):
        limpo = t[spans[sujas[-1] + 1][0] : spans[-1][1]].strip()

    # 2) se sobrou pouco, pega o maior trecho limpo do texto inteiro
    if len(limpo) < _MIN_CLEAN_CHARS:
        alternativo = _spotless_slice(t, spans).strip()
        if len(alternativo) > len(limpo):
            limpo = alternativo

    if len(limpo) < _MIN_CLEAN_CHARS:
        limpo = _SAFE_FALLBACK
    return _tidy(limpo)


def _tidy(text: str) -> str:
    """Tira sintaxe interna de tool-call, emoji-salada e espaços duplicados."""
    limpo = _XML_LEAK_RE.sub("", text)
    limpo = re.sub(r"[ \t]{2,}", " ", limpo)
    limpo = re.sub(r"\n{3,}", "\n\n", limpo)
    return limpo.strip()


def _hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes"))


def _env_var(name: str) -> str:
    try:
        for linha in (_hermes_home() / ".env").read_text(encoding="utf-8").splitlines():
            if linha.startswith(f"{name}="):
                return linha[len(name) + 1 :].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _log(entry: Dict[str, Any]) -> None:
    try:
        caminho = _hermes_home() / "output-guard.log"
        if caminho.exists() and caminho.stat().st_size > _MAX_LOG_BYTES:
            caminho.replace(caminho.with_suffix(".log.1"))
        with caminho.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass


_LAST_NOTIFY = {"at": 0.0}


def _notify(texto: str) -> None:
    """Avisa no Telegram, no máximo a cada 10 min (evita enxurrada se o modelo repetir)."""
    import time

    agora = time.time()
    if agora - _LAST_NOTIFY["at"] < 600:
        return
    _LAST_NOTIFY["at"] = agora
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or _env_var("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("ALERTS_TELEGRAM_CHAT_ID") or _env_var("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps({"chat_id": chat, "text": texto, "disable_web_page_preview": True}).encode(),
            headers={"content-type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=15)
    except Exception as exc:  # noqa: BLE001 — nunca quebrar o turno por causa do aviso
        logger.warning("output-guard: falha ao avisar no Telegram: %s", exc)


def _on_transform(
    response_text: Any = None,
    session_id: str = "",
    model: str = "",
    platform: str = "",
    turn_id: str = "",
    **_kwargs: Any,
) -> Optional[str]:
    """Hook `transform_llm_output`: devolve texto substituto ou None."""
    original = response_text if isinstance(response_text, str) else ""
    if not original.strip():
        return None

    limpo = sanitize(original)
    if limpo is None:
        _log({"at": datetime.now().isoformat(timespec="seconds"), "fired": False, "platform": platform, "session_id": session_id})
        return None

    diag = scan_text(original)
    _log(
        {
            "at": datetime.now().isoformat(timespec="seconds"),
            "fired": True,
            "platform": platform,
            "session_id": session_id,
            "model": model,
            "antes": original[:600],
            "depois": limpo[:600],
            "markers": diag["markers"],
            "logs": diag["logs"],
            "spam": diag["spam"],
            "urls": diag["urls"],
        }
    )
    vazou = ", ".join(diag["markers"]) or ""
    if diag["logs"]:
        vazou = (vazou + f" | {len(diag['logs'])} linha(s) de log interno").strip(" |")
    _notify(
        "🛡️ Trava de saída agiu no atendimento\n"
        f"Canal: {platform or '—'}\n"
        f"Vazou: {vazou or 'assinatura/CTA'}\n"
        f"Entreguei ao cliente: \"{limpo[:280]}\""
    )
    return limpo


def register(ctx) -> None:
    ctx.register_hook("transform_llm_output", _on_transform)
