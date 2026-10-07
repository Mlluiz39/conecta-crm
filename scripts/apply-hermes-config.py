#!/usr/bin/env python3
"""apply-hermes-config.py — garante as chaves críticas do `config.yaml` do Hermes.

Por que existe: o `config.yaml` vive no volume (não na imagem, senão todo rebuild apagaria
o pareamento do WhatsApp e o histórico), então ele sobrevive ao deploy mas **não é
reproduzível a partir do git**. Já nasceram três bugs ali:

  1. `plugins.enabled` sem a trava de saída  -> monólogo/log do bridge ia para o cliente;
  2. `support_rules.md`/`SOUL_WHATSAPP.md` ausentes (personas, tratadas noutro script);
  3. `display.tool_progress: all` + `interim_assistant_messages: true` -> o lead recebeu
     "📖 Reading arquivo.txt", "🔎 Searching files for ..." e um aviso de turno cancelado.

Os dois primeiros já são cobertos por `install-hermes-assets.sh`. Este script cobre o
terceiro: as chaves de `display` que decidem o que o cliente vê, e a trava de saída em
`plugins.enabled`.

Uso:
    python3 scripts/apply-hermes-config.py                 # aplica (com backup)
    python3 scripts/apply-hermes-config.py --check         # só verifica; sai 1 se algo difere
    python3 scripts/apply-hermes-config.py --config /caminho/config.yaml

Config padrão: $HERMES_HOME/config.yaml -> ~/.hermes/config.yaml -> .hermes-home/.hermes/config.yaml
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

# O cliente vê SÓ a resposta final. Estes valores são o que o home de desenvolvimento usa.
DISPLAY_EXIGIDO = {
    "tool_progress": '"off"',
    "live_status": '"off"',
    "thinking_progress": "false",
    "interim_assistant_messages": "false",
    "long_running_notifications": "false",
    "busy_ack_detail": "false",
    "busy_steer_ack_enabled": "false",
    "show_reasoning": "false",
    "suppress_warning_notifications": "true",
    "cleanup_progress": "true",
}

# Plugins que precisam estar habilitados em `plugins.enabled`.
PLUGINS_EXIGIDOS = ["crm-output-guard"]

# Hook que injeta data/hora/expediente a cada turno. Sem ele o agente NÃO sabe que horas são
# nem se a equipe está no horário — e passa a inventar ("estamos fechados", "volto amanhã").
# O script vem do repo e o compose monta `./scripts` como `/opt/data/hooks`.
HOOK_RELOGIO = "/opt/data/hooks/hermes-clock-context.py"

# Cadeia de modelos do atendimento (a mesma do home de desenvolvimento):
# economia primeiro — Gemini (cota grátis) -> Nous (grátis) -> DeepSeek (pago barato) ->
# OpenRouter (outro fornecedor). Sem fallback, quando o Gemini estoura a cota o bot fica mudo.
MODELO_PRIMARIO = {"provider": "gemini", "default": "gemini-3.8-flash"}
FALLBACKS = [
    ("nous", "stealth/space-bunny-alpha"),      # grátis (Nous)
    ("freellmapi", "auto"),                      # grátis (proxy próprio: llm.mlluizdevtech.qzz.io)
    ("deepseek", "deepseek-v4-pro"),             # pago barato
    ("openrouter", "qwen/qwen3.8-flash"),        # pago, outro fornecedor
]


def config_padrao() -> Path:
    home = os.environ.get("HERMES_HOME")
    if home:
        return Path(home) / "config.yaml"
    candidatos = [
        Path.home() / ".hermes" / "config.yaml",
        Path(__file__).resolve().parent.parent / ".hermes-home" / ".hermes" / "config.yaml",
    ]
    for c in candidatos:
        if c.is_file():
            return c
    return candidatos[0]


def _fim_do_bloco(linhas: list, inicio: int) -> int:
    """Índice da primeira linha depois do bloco indentado que começa em `inicio`."""
    for k in range(inicio + 1, len(linhas)):
        if re.match(r"^\S", linhas[k]):
            return k
    return len(linhas)


def aplicar_display(linhas: list) -> list:
    """Ajusta/insere as chaves de display e devolve a lista de mudanças."""
    i = next((k for k, l in enumerate(linhas) if re.match(r"^display:\s*(#.*)?$", l)), None)
    if i is None:
        return ["display: (bloco inexistente — crie e rode de novo)"]
    fim = _fim_do_bloco(linhas, i)
    mudancas = []
    vistos = set()
    for k in range(i + 1, fim):
        m = re.match(r"^(\s+)([a-z_]+):\s*(\S.*)?$", linhas[k])
        if not m:
            continue
        chave, atual = m.group(2), (m.group(3) or "").strip()
        if chave in DISPLAY_EXIGIDO:
            vistos.add(chave)
            if atual != DISPLAY_EXIGIDO[chave]:
                linhas[k] = f"{m.group(1)}{chave}: {DISPLAY_EXIGIDO[chave]}\n"
                mudancas.append(f"display.{chave}: {atual or '(vazio)'} -> {DISPLAY_EXIGIDO[chave]}")
    faltando = [k for k in DISPLAY_EXIGIDO if k not in vistos]
    if faltando:
        novas = [f"  {k}: {DISPLAY_EXIGIDO[k]}\n" for k in faltando]
        linhas[fim:fim] = novas
        mudancas.extend(f"display.{k}: (ausente) -> {DISPLAY_EXIGIDO[k]}" for k in faltando)
    return mudancas


def aplicar_plugins(linhas: list) -> list:
    """Garante os plugins exigidos em `plugins.enabled`."""
    i = next((k for k, l in enumerate(linhas) if re.match(r"^plugins:\s*(#.*)?$", l)), None)
    if i is None:
        return ["plugins: (bloco inexistente — habilite a trava manualmente)"]
    fim = _fim_do_bloco(linhas, i)
    i_enabled = next(
        (k for k in range(i + 1, fim) if re.match(r"^\s+enabled:\s*(#.*)?$", linhas[k])), None
    )
    if i_enabled is None:
        return ["plugins.enabled: (lista inexistente)"]
    mudancas = []
    j = i_enabled + 1
    itens, indent, ultimo = [], "    ", i_enabled
    while j < fim and re.match(r"^\s+-\s", linhas[j]):
        itens.append(linhas[j].strip()[1:].strip())
        indent = re.match(r"^(\s+)", linhas[j]).group(1)
        ultimo = j
        j += 1
    for plugin in PLUGINS_EXIGIDOS:
        if plugin not in itens:
            linhas.insert(ultimo + 1, f"{indent}- {plugin}\n")
            ultimo += 1
            mudancas.append(f"plugins.enabled += {plugin}")
    return mudancas


def _bloco_fallbacks(linhas: list) -> tuple:
    """(início, fim) do bloco `fallback_providers:` ou (None, None)."""
    i = next((k for k, l in enumerate(linhas) if re.match(r"^fallback_providers:\s*(#.*)?$", l)), None)
    if i is None:
        return None, None
    return i, _fim_do_bloco(linhas, i)


def _fallbacks_atuais(linhas: list, ini: int, fim: int) -> list:
    pares, prov = [], None
    for k in range(ini + 1, fim):
        mp = re.match(r"^\s*-\s*provider:\s*(\S+)", linhas[k])
        mm = re.match(r"^\s*model:\s*(\S+)", linhas[k])
        if mp:
            prov = mp.group(1).strip().strip('"')
        elif mm and prov:
            pares.append((prov, mm.group(1).strip().strip('"')))
            prov = None
    return pares


def aplicar_modelo(linhas: list) -> list:
    """Garante o modelo primário e a cadeia de fallback."""
    mudancas = []

    i = next((k for k, l in enumerate(linhas) if re.match(r"^model:\s*(#.*)?$", l)), None)
    if i is None:
        linhas[0:0] = [
            "# Modelo do atendimento (definido por apply-hermes-config.py).\n",
            "model:\n",
            f"  provider: {MODELO_PRIMARIO['provider']}\n",
            f"  default: {MODELO_PRIMARIO['default']}\n",
        ]
        mudancas.append(f"model (criado): {MODELO_PRIMARIO['provider']}/{MODELO_PRIMARIO['default']}")
    else:
        for chave, valor in MODELO_PRIMARIO.items():
            fim = _fim_do_bloco(linhas, i)
            k = next((j for j in range(i + 1, fim) if re.match(rf"^\s+{chave}:", linhas[j])), None)
            if k is None:
                linhas[fim:fim] = [f"  {chave}: {valor}\n"]
                mudancas.append(f"model.{chave} = {valor}")
            else:
                atual = linhas[k].split(":", 1)[1].strip()
                if atual.strip('"') != valor:
                    linhas[k] = f"  {chave}: {valor}\n"
                    mudancas.append(f"model.{chave}: {atual} -> {valor}")

    ini, fim = _bloco_fallbacks(linhas)
    if ini is None:
        if linhas and not linhas[-1].endswith("\n"):
            linhas[-1] += "\n"
        linhas.append("\n# Se o primário falhar (cota/rede), o Hermes continua atendendo.\nfallback_providers:\n")
        linhas.extend(f"  - provider: {p}\n    model: {m}\n" for p, m in FALLBACKS)
        mudancas.append("fallback_providers (criado com " + ", ".join(p for p, _ in FALLBACKS) + ")")
    elif _fallbacks_atuais(linhas, ini, fim) != FALLBACKS:
        atual = _fallbacks_atuais(linhas, ini, fim)
        novas = [f"  - provider: {p}\n    model: {m}\n" for p, m in FALLBACKS]
        linhas[ini + 1 : fim] = novas
        mudancas.append(
            "fallback_providers: "
            + (" | ".join(f"{p}/{m}" for p, m in atual) or "(vazio)")
            + " -> "
            + " | ".join(f"{p}/{m}" for p, m in FALLBACKS)
        )
    return mudancas


def aplicar_hooks(linhas: list) -> list:
    """Garante `hooks.pre_llm_call` com o hook do relógio/expediente."""
    i = next((k for k, l in enumerate(linhas) if re.match(r"^hooks:\s*(#.*)?$", l)), None)
    if i is None:
        if linhas and not linhas[-1].endswith("\n"):
            linhas[-1] += "\n"
        linhas.append(
            "\n# Relógio + expediente injetados a cada turno (definido por apply-hermes-config.py).\n"
            "hooks:\n"
            "  pre_llm_call:\n"
            f'    - command: "{HOOK_RELOGIO}"\n'
            "      timeout: 15\n"
        )
        return ["hooks.pre_llm_call (bloco criado com o relógio/expediente)"]

    fim = _fim_do_bloco(linhas, i)
    i_pre = next((k for k in range(i + 1, fim) if re.match(r"^\s+pre_llm_call:", linhas[k])), None)
    if i_pre is None:
        linhas[fim:fim] = [
            "  pre_llm_call:\n",
            f'    - command: "{HOOK_RELOGIO}"\n',
            "      timeout: 15\n",
        ]
        return ["hooks.pre_llm_call += relógio/expediente"]

    j = i_pre + 1
    while j < len(linhas) and re.match(r"^\s+", linhas[j]):
        if HOOK_RELOGIO in linhas[j]:
            return []
        j += 1
    linhas[i_pre + 1 : i_pre + 1] = [
        f'    - command: "{HOOK_RELOGIO}"\n',
        "      timeout: 15\n",
    ]
    return ["hooks.pre_llm_call += relógio/expediente"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Garante as chaves críticas do config.yaml do Hermes.")
    ap.add_argument("--config", default=None, help="caminho do config.yaml")
    ap.add_argument("--check", action="store_true", help="só verifica; não escreve")
    ap.add_argument(
        "--somente-modelo",
        action="store_true",
        help="aplica só model/fallback_providers (uso em perfis: não cria display/plugins/hooks)",
    )
    args = ap.parse_args()

    cfg = Path(args.config) if args.config else config_padrao()
    if not cfg.is_file():
        print(f"!! não achei {cfg}", file=sys.stderr)
        print("   defina HERMES_HOME ou passe --config /caminho/config.yaml", file=sys.stderr)
        return 1

    linhas = cfg.read_text(encoding="utf-8").splitlines(keepends=True)
    if args.somente_modelo:
        mudancas = aplicar_modelo(list(linhas))
    else:
        mudancas = (
            aplicar_display(list(linhas))
            + aplicar_plugins(list(linhas))
            + aplicar_hooks(list(linhas))
            + aplicar_modelo(list(linhas))
        )

    if not mudancas:
        print(f"✓ config.yaml com as chaves críticas em ordem ({cfg})")
        return 0

    if args.check:
        print(f"✗ {cfg} divergente do esperado:", file=sys.stderr)
        for m in mudancas:
            print(f"   - {m}", file=sys.stderr)
        print("   rode sem --check para corrigir (faz backup)", file=sys.stderr)
        return 1

    backup = cfg.with_name(f"{cfg.name}.bak-{datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(cfg, backup)
    linhas = cfg.read_text(encoding="utf-8").splitlines(keepends=True)
    if args.somente_modelo:
        aplicar_modelo(linhas)
    else:
        aplicar_display(linhas)
        aplicar_plugins(linhas)
        aplicar_hooks(linhas)
        aplicar_modelo(linhas)
    cfg.write_text("".join(linhas), encoding="utf-8")

    print(f"✓ config.yaml corrigido ({cfg})")
    print(f"  backup: {backup}")
    for m in mudancas:
        print(f"  - {m}")
    print("  reinicie o processo do Hermes para valer:")
    print("    docker compose restart hermes   # ou: pm2 restart <processo> --update-env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
