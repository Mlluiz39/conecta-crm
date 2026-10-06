#!/usr/bin/env python3
"""enable-hermes-plugin.py — habilita um plugin do Hermes em `plugins.enabled` do config.yaml.

Por que existe: a trava de saída (`crm-output-guard`) fica no disco depois do
`install-hermes-assets.sh`, mas o Hermes só a carrega se ela estiver em `plugins.enabled`.
Editar YAML na mão num arquivo de produção (`~/.hermes/config.yaml`, ~250 linhas) é fácil de
errar: um item no lugar errado derruba o agente inteiro. Este script faz a edição cirúrgica,
com backup e sem tocar em mais nada.

Uso:
    python3 scripts/enable-hermes-plugin.py                      # habilita crm-output-guard
    python3 scripts/enable-hermes-plugin.py --plugin outro       # outro plugin
    python3 scripts/enable-hermes-plugin.py --config /caminho/config.yaml
    python3 scripts/enable-hermes-plugin.py --check               # só diz se já está habilitado

Config padrão: $HERMES_HOME/config.yaml e, se não existir, ~/.hermes/config.yaml.
Sai com código 1 quando `--check` não encontra o plugin habilitado (serve para CI/cron).
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

PADRAO = "crm-output-guard"


def config_padrao() -> Path:
    """$HERMES_HOME/config.yaml -> ~/.hermes/config.yaml -> .hermes-home/.hermes/config.yaml.

    O terceiro é o home local do docker compose (montado como /opt/data no container), o que
    evita precisar exportar HERMES_HOME só para rodar o --check na máquina de desenvolvimento.
    """
    home = os.environ.get("HERMES_HOME")
    if home:
        return Path(home) / "config.yaml"

    candidatos = [
        Path.home() / ".hermes" / "config.yaml",
        Path(__file__).resolve().parent.parent / ".hermes-home" / ".hermes" / "config.yaml",
    ]
    for c in candidatos:
        if c.is_file():
            try:
                if bloco_plugins(c.read_text(encoding="utf-8").splitlines(keepends=True))[0] is not None:
                    return c
            except OSError:
                continue
    return candidatos[0]


def bloco_plugins(linhas: list) -> tuple:
    """Acha `plugins:` de topo e devolve (indice_enabled, indent, ultimo_item) ou (None,...)."""
    i_plugins = None
    for i, linha in enumerate(linhas):
        if re.match(r"^plugins:\s*(#.*)?$", linha):
            i_plugins = i
            break
    if i_plugins is None:
        return None, None, None

    i = i_plugins + 1
    while i < len(linhas):
        # acabou o bloco plugins: outra chave de topo
        if re.match(r"^\S", linhas[i]):
            break
        if re.match(r"^\s+enabled:\s*(#.*)?$", linhas[i]):
            indent = None
            ultimo = i
            j = i + 1
            while j < len(linhas) and re.match(r"^\s+-\s", linhas[j]):
                if indent is None:
                    m = re.match(r"^(\s+)", linhas[j])
                    indent = m.group(1) if m else "    "
                ultimo = j
                j += 1
            return i, indent or "    ", ultimo
        i += 1
    return None, None, None


def main() -> int:
    ap = argparse.ArgumentParser(description="Habilita um plugin do Hermes no config.yaml.")
    ap.add_argument("--plugin", default=PADRAO, help=f"nome do plugin (padrão: {PADRAO})")
    ap.add_argument("--config", default=None, help="caminho do config.yaml")
    ap.add_argument("--check", action="store_true", help="só verifica; não escreve")
    args = ap.parse_args()

    cfg = Path(args.config) if args.config else config_padrao()
    if not cfg.is_file():
        print(f"!! não achei {cfg}", file=sys.stderr)
        print("   defina HERMES_HOME ou passe --config /caminho/config.yaml", file=sys.stderr)
        return 1

    linhas = cfg.read_text(encoding="utf-8").splitlines(keepends=True)
    i_enabled, indent, i_ultimo = bloco_plugins(linhas)

    if i_enabled is None:
        print(f"!! não achei um bloco 'plugins: enabled:' em {cfg}", file=sys.stderr)
        print("   edite na mão e adicione a linha do plugin em plugins.enabled", file=sys.stderr)
        return 1

    ja = [
        linhas[k].strip()[1:].strip()
        for k in range(i_enabled + 1, i_ultimo + 1)
        if linhas[k].strip().startswith("-")
    ]
    if args.plugin in ja:
        print(f"✓ {args.plugin} já está em plugins.enabled ({cfg})")
        return 0

    if args.check:
        print(f"✗ {args.plugin} NÃO está em plugins.enabled ({cfg}) — rode sem --check para habilitar")
        return 1

    backup = cfg.with_name(f"{cfg.name}.bak-{datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(cfg, backup)
    linhas.insert(i_ultimo + 1, f"{indent}- {args.plugin}\n")
    cfg.write_text("".join(linhas), encoding="utf-8")

    print(f"✓ {args.plugin} adicionado em plugins.enabled")
    print(f"  config : {cfg}")
    print(f"  backup : {backup}")
    print(f"  antes  : {', '.join(ja) or '(vazio)'}")
    print(f"  agora  : {', '.join(ja + [args.plugin])}")
    print()
    print("Reinicie o processo do Hermes para ele carregar o plugin, por exemplo:")
    print("  pm2 restart whatsapp-bridge --update-env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
