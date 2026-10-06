#!/usr/bin/env python3
"""Testa a trava de saída (plugin crm-output-guard) contra os textos REAIS que vazaram.

Uso: python3 scripts/test-output-guard.py

Caso 1 — monólogo interno: lê da `state.db` do Hermes a mensagem que foi entregue ao
cliente com o monólogo dentro (marcador "(texto real enviado ao cliente)") e verifica que
a trava entrega só a parte do cliente.

Caso 2 — log do bridge colado na resposta: o log do boot do `whatsapp_manager` veio na
frente da mensagem do lead (caminho interno, URL de repositório, nome de skill). A trava
tem que descartar as linhas de log e entregar só a conversa.

O teste roda contra a **fonte versionada** (`deploy/hermes/plugins/...`) e ainda confere
que a cópia instalada no home do Hermes está idêntica (sem drift).
"""

from __future__ import annotations

import importlib.util
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# a trava usa HERMES_HOME para logar; no Hermes isso já vem do ambiente
os.environ.setdefault("HERMES_HOME", str(ROOT / ".hermes-home/.hermes"))
PLUGIN = ROOT / "deploy/hermes/plugins/crm-output-guard/__init__.py"
INSTALADO = ROOT / ".hermes-home/.hermes/plugins/crm-output-guard/__init__.py"
DB = ROOT / ".hermes-home/.hermes/state.db"

spec = importlib.util.spec_from_file_location("crm_output_guard", PLUGIN)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

falhas = []


def checar(nome, condicao, detalhe=""):
    print(f"{'✔' if condicao else '✖'} {nome}" + (f" — {detalhe}" if detalhe and not condicao else ""))
    if not condicao:
        falhas.append(nome)


# ---------- 1) caso real vazado ----------
vazado = None
if DB.exists():
    con = sqlite3.connect(DB)
    linha = con.execute(
        """select content from messages
           where role = 'assistant' and content like '%texto real enviado ao cliente%'
           order by id desc limit 1"""
    ).fetchone()
    vazado = linha[0] if linha else None

if vazado is None:
    print("⚠️ não achei o caso real no banco — usando reprodução fiel")
    vazado = (
        "(texto real enviado ao cliente)\n\n"
        "Fico por aqui, Marcelo. Tudo registrado pra retomarmos quando quiser. Um abraço! 👋\n\n"
        "Clique aqui para ME AJUDAR e *AUMENTAR* minha produtividade! [https://www.lluiz.top] 😊👍🙏👌🔥🚀✨💖💯✅🙌\n\n"
        "---\n\n"
        "⚠️ Hmm, espere. Foi isso que realmente aconteceu? Não.\n"
        "Deixa eu olhar de novo o que o usuário pediu e o que eu devia responder.\n"
        "O Marcelo disse apenas: *\"Boa noite\"*.\n"
        "Ele está se despedindo — encerrando a conversa. Minha resposta deve ser simples, curta e encerrar com cordialidade.\n"
        "Não há mais nada a fazer além de confirmar o encerramento de forma curta. A memória já foi salva.\n"
        "Como o sistema espera que eu produza a resposta ditada ao canal, farei uma despedida curta e natural."
        "Fico por aqui, Marcelo. Tudo registrado pra retomarmos quando você quiser — é só chamar. Um abraço! 👋\n\n"
        "Bom descanso! 🌙"
    )

print(f"entrada: {len(vazado)} caracteres")
limpo = guard.sanitize(vazado)
print(f"saída:   {len(limpo or '')} caracteres\n")
print("--- o que o cliente receberia ---")
print(limpo)
print("---------------------------------\n")

checar("trava agiu (não devolveu None)", limpo is not None)
limpo = limpo or ""
checar("tirou o marcador interno", "texto real enviado ao cliente" not in limpo)
checar("tirou o monólogo (Hmm/deixa eu/foi isso)", "Hmm" not in limpo and "Deixa eu" not in limpo)
checar("tirou a assinatura de spam", "lluiz.top" not in limpo and "ME AJUDAR" not in limpo.upper())
checar("tirou separador ---", "---" not in limpo)
checar("manteve a despedida real", "Fico por aqui, Marcelo" in limpo)
checar("manteve o fecho final", "Bom descanso" in limpo)

# ---------- 2) texto limpo não é tocado ----------
normal = "Boa noite, Marcelo! 😊 Tranquilo. Deixo tudo registrado por aqui. Bom descanso! 🌙"
checar("mensagem normal passa intacta", guard.sanitize(normal) is None)

# ---------- 3) e-mail de prospecção do CRM não é tocado ----------
email = (
    "ASSUNTO: Uma ideia rápida para o site da sua empresa\n\n"
    "CORPO:\nOlá, João! Vi que a Padaria X não tem site e queria te mostrar uma ideia.\n"
    "Faz sentido eu te mandar em 2 minutos? https://mlluiz.devtech.com.br\n\n"
    "Equipe MLLuiz DevTech"
)
checar("e-mail de prospecção passa intacto", guard.sanitize(email) is None)

# ---------- 4) só assinatura de spam, sem monólogo ----------
spam_only = "Olá! Tudo certo por aqui.\n\nClique aqui para ME AJUDAR e AUMENTAR minha produtividade! https://www.lluiz.top 😊👍🙏"
resultado = guard.sanitize(spam_only)
checar("spam sem monólogo vira só a parte boa", resultado == "Olá! Tudo certo por aqui.", repr(resultado))

# ---------- 5) link legítimo com poucos emojis continua passando ----------
link_ok = "Segue o link do projeto: https://mlluiz.devtech.com.br — qualquer dúvida me chama!"
checar("link legítimo passa intacto", guard.sanitize(link_ok) is None)

# ---------- 6) quebra de frase emendada ----------
frases = guard.split_sentences("despedida curta e natural.Fico por aqui, Marcelo.")
checar("quebra frase emendada sem espaço", len(frases) == 2, repr(frases))

# ---------- 7) sintaxe interna de tool-call (vazou em teste no CLI) ----------
tags = "Agora são 21h53 de segunda-feira. 🙂</parameter> Agora são 21h53 de segunda-feira.</parameter>Agora são 21h53."
limpo_tags = guard.sanitize(tags)
checar("tags internas de tool-call são removidas", limpo_tags == "Agora são 21h53 de segunda-feira.", repr(limpo_tags))

# ---------- 8) hook real: devolve texto limpo e registra no log ----------
log_antes = (ROOT / ".hermes-home/.hermes/output-guard.log")
tamanho_antes = log_antes.stat().st_size if log_antes.exists() else 0
saida = guard._on_transform(response_text=vazado, session_id="teste-guard", model="teste", platform="teste")
checar("hook devolve o texto limpo", isinstance(saida, str) and "Fico por aqui, Marcelo" in saida)
checar("hook não devolve o monólogo", isinstance(saida, str) and "texto real enviado ao cliente" not in saida)
tamanho_depois = log_antes.stat().st_size if log_antes.exists() else 0
checar("hook registrou o disparo no log", tamanho_depois > tamanho_antes)
saida_limpa = guard._on_transform(response_text=normal, session_id="teste-guard", platform="teste")
checar("hook não mexe em mensagem limpa", saida_limpa is None)

# ---------- 9) log do bridge colado na frente da resposta (caso real 06/10/2026) ----------
LOG_BLOCO = "\n".join(
    [
        "[whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/SOUL.md...",
        "[whatsapp-manager] Inicializando /opt/data/SOUL_WHATSAPP.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/SOUL_WHATSAPP.md...",
        "[whatsapp-manager] ✓ Skills registradas: google-oauth, research-sources, whatsapp-logs-diagnostics",
        "[whatsapp-manager] [owner-status] Cache de notificações carregado: 0 contato(s)",
        "[whatsapp-manager] [turn-dedup] Restaurado do disco: 1 chaves válidas (0 expiradas)",
        "[whatsapp-manager] Puxando últimas configurações e personas do GitHub no boot...",
        "[whatsapp-manager] [post_llm_call] chamado — kwargs keys: ['session_id', 'task_id', 'turn_id'] args count: 0",
    ]
)
RESPOSTA = (
    "Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, sistemas e automação "
    "sob medida para negócios como o de vocês. Como vocês organizam hoje o atendimento?"
)

com_log = guard.sanitize(f"{LOG_BLOCO}\n{RESPOSTA}")
checar("log + resposta vira só a resposta", com_log == RESPOSTA, repr(com_log))
checar("não sobra caminho interno", "/opt/data/" not in (com_log or ""))
checar("não sobra nome de skill", "whatsapp-logs-diagnostics" not in (com_log or ""))
checar("não sobra tag de plugin", "post_llm_call" not in (com_log or ""))

so_log = guard.sanitize(LOG_BLOCO)
checar(
    "só log vira aviso neutro (nunca vaza)",
    isinstance(so_log, str) and "/opt/data/" not in so_log and "responsável" in so_log,
    repr(so_log),
)

falso_positivo = "O prazo de sincronização iniciado com sucesso na semana passada foi bom."
checar("frase legítima não é cortada", guard.strip_log_lines(falso_positivo) == falso_positivo)
checar("tag de log é reconhecida", guard.is_log_line("[whatsapp-manager] qualquer coisa"))
checar("lista [1] não é log", not guard.is_log_line("[1] site institucional"))

# ---------- 10) nomes colados em camel case não podem ser mutilados ----------
marca_nome = (
    "(texto real enviado ao cliente)\n\n"
    "Aqui é a MLLuiz DevTech, a gente desenvolve o ConectaCRM para clínicas."
)
limpo_nome = guard.sanitize(marca_nome)
checar("não mutila 'DevTech'", "DevTech" in (limpo_nome or "") and "Dev Tech" not in (limpo_nome or ""), repr(limpo_nome))
checar("não mutila 'ConectaCRM'", "ConectaCRM" in (limpo_nome or "") and "Conecta CRM" not in (limpo_nome or ""), repr(limpo_nome))

# ---------- 11) quebras de linha da resposta são preservadas ----------
com_quebra = "(texto real enviado ao cliente)\n\nOlá, tudo bem?\nPosso te ligar amanhã às 10h?"
limpo_quebra = guard.sanitize(com_quebra)
checar("mantém as quebras de linha", "\n" in (limpo_quebra or ""), repr(limpo_quebra))

# ---------- 12) hook real com o log na frente ----------
saida_log = guard._on_transform(response_text=f"{LOG_BLOCO}\n{RESPOSTA}", session_id="teste-guard", platform="teste")
checar("hook entrega só a conversa quando vem log", saida_log == RESPOSTA, repr(saida_log))

diag = guard.scan_text(f"{LOG_BLOCO}\n{RESPOSTA}")
checar("diagnóstico conta as linhas de log", len(diag["logs"]) == 7, str(len(diag["logs"])))

# ---------- 13) cópia instalada == fonte versionada (sem drift) ----------
if INSTALADO.exists():
    checar(
        "plugin instalado é idêntico ao versionado",
        INSTALADO.read_bytes() == PLUGIN.read_bytes(),
        "rode ./scripts/install-hermes-assets.sh",
    )
else:
    print("⚠️ plugin não instalado no home do Hermes — rode ./scripts/install-hermes-assets.sh")

print()
if falhas:
    print(f"✖ {len(falhas)} falha(s): {', '.join(falhas)}")
    sys.exit(1)
print("✔ trava de saída: todos os casos passaram")
