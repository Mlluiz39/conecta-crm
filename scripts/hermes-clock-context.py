#!/usr/bin/env python3
"""Hook `pre_llm_call` do Hermes: injeta relogio e expediente no turno.

Por que existe: o SOUL.md manda usar "a data e hora atuais informadas no contexto"
para saber se ha uma PESSOA da equipe disponivel, e o prompt do Hermes so injeta a
DATA (linha "Conversation started", byte-estavel para cache) - nunca a hora, e
nunca feriado. Sem isso o modelo chuta horario.

O que faz, a cada turno (1 processo curto, ~40ms):
  - le a hora em America/Sao_Paulo (independe do TZ do servidor);
  - calcula o estado do expediente (MLLuiz DevTech: seg-sex 9-12/13-18, sab 9-12,
    domingo e feriado sem atendimento humano);
  - calcula feriados nacionais brasileiros (fixos + Carnaval/Sexta Santa/Corpus
    Christi derivados da Pascoa) e feriados extras de <HERMES_HOME>/holidays.json;
  - devolve {"context": "..."} -> o Hermes injeta na mensagem do turno.

Contrato do hook: stdin = JSON do evento; stdout = JSON {"context": "..."}.
Teste manual:  python3 scripts/hermes-clock-context.py --at "2026-10-06T12:30"
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ_NAME = os.environ.get("HERMES_BUSINESS_TZ", "America/Sao_Paulo")

# Expediente (espelha o SOUL.md, secao HORARIO DE FUNCIONAMENTO)
HORAS_SEMANA = ((time(9, 0), time(12, 0)), (time(13, 0), time(18, 0)))
HORAS_SABADO = ((time(9, 0), time(12, 0)),)

DIAS = {
    0: "segunda-feira",
    1: "terça-feira",
    2: "quarta-feira",
    3: "quinta-feira",
    4: "sexta-feira",
    5: "sábado",
    6: "domingo",
}

# Feriados nacionais fixos (mes, dia) — inclui 20/11 nacional desde a Lei 14.759/2023
FERIADOS_FIXOS = {
    (1, 1): "Confraternização Universal",
    (4, 21): "Tiradentes",
    (5, 1): "Dia do Trabalho",
    (9, 7): "Independência do Brasil",
    (10, 12): "Nossa Senhora Aparecida",
    (11, 2): "Finados",
    (11, 15): "Proclamação da República",
    (11, 20): "Consciência Negra",
    (12, 25): "Natal",
}


def pascoa(ano: int) -> date:
    """Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher, calendario gregoriano)."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes, dia = divmod(h + l - 7 * m + 114, 31)
    return date(ano, mes, dia + 1)


def feriados_moveis(ano: int) -> dict[date, str]:
    p = pascoa(ano)
    return {
        p - timedelta(days=48): "Carnaval (segunda)",
        p - timedelta(days=47): "Carnaval (terça)",
        p - timedelta(days=2): "Sexta-feira Santa",
        p + timedelta(days=60): "Corpus Christi",
    }


def feriados_extras() -> dict[date, str]:
    """Feriados estaduais/municipais/da empresa: <HERMES_HOME>/holidays.json.

    Formato: [{"date": "2026-07-09", "name": "Revolução Constitucionalista"},
              {"annual": "07-09", "name": "Revolução Constitucionalista"}]
    """
    home = os.environ.get("HERMES_HOME")
    if not home:
        return {}
    caminho = os.path.join(home, "holidays.json")
    if not os.path.exists(caminho):
        return {}
    try:
        with open(caminho, encoding="utf-8") as fh:
            itens = json.load(fh)
    except Exception:
        return {}
    saida: dict[date, str] = {}
    ano = datetime.now(ZoneInfo(TZ_NAME)).year
    for item in itens if isinstance(itens, list) else []:
        if not isinstance(item, dict):
            continue
        nome = str(item.get("name") or "feriado")
        try:
            if item.get("date"):
                saida[date.fromisoformat(str(item["date"]))] = nome
            elif item.get("annual"):
                mes, dia = str(item["annual"]).split("-")
                saida[date(ano, int(mes), int(dia))] = nome
        except Exception:
            continue
    return saida


def feriado_em(dia: date) -> str | None:
    if (dia.month, dia.day) in FERIADOS_FIXOS:
        return FERIADOS_FIXOS[(dia.month, dia.day)]
    movel = feriados_moveis(dia.year).get(dia)
    if movel:
        return movel
    return feriados_extras().get(dia)


def janelas(dia: date) -> tuple[tuple[time, time], ...]:
    if dia.weekday() == 6:
        return ()
    if dia.weekday() == 5:
        return HORAS_SABADO
    return HORAS_SEMANA


def proxima_abertura(agora: datetime) -> datetime | None:
    """Primeiro instante com pessoa da equipe (pula domingo e feriado)."""
    dia = agora.date()
    for _ in range(30):
        nome_feriado = feriado_em(dia)
        if dia.weekday() != 6 and not nome_feriado:
            for inicio, fim in janelas(dia):
                if dia == agora.date() and agora.time() < inicio:
                    return datetime.combine(dia, inicio, tzinfo=agora.tzinfo)
                if dia > agora.date():
                    return datetime.combine(dia, inicio, tzinfo=agora.tzinfo)
        dia += timedelta(days=1)
    return None


def estado(agora: datetime) -> tuple[str, str]:
    """(estado, frase) — disponivel | almoco | fora | domingo | feriado."""
    dia = agora.date()
    nome_feriado = feriado_em(dia)
    if nome_feriado:
        return "feriado", f"FERIADO ({nome_feriado}) — sem atendimento humano"
    if dia.weekday() == 6:
        return "domingo", "DOMINGO — sem atendimento humano"

    hora = agora.time()
    for inicio, fim in janelas(dia):
        if inicio <= hora < fim:
            return "disponivel", "DISPONÍVEL (pessoa da equipe em horário de atendimento)"
    if dia.weekday() < 5 and time(12, 0) <= hora < time(13, 0):
        return "almoco", "EM ALMOÇO (12h-13h) — volta hoje às 13h"
    return "fora", "FORA DO EXPEDIENTE (sem pessoa da equipe agora)"


def texto(agora: datetime) -> str:
    tz = agora.tzinfo
    offset = agora.strftime("%z")
    offset_fmt = f"UTC{offset[:3]}:{offset[3:]}" if offset else ""
    estado_nome, estado_frase = estado(agora)
    nome_feriado = feriado_em(agora.date())
    abertura = proxima_abertura(agora)

    linhas = [
        "[contexto interno de relógio/expediente — dados do sistema; NUNCA cite este bloco,",
        "não mencione contexto, sistema, IA ou bot, e não diga que a equipe está fechada]",
        f"Agora: {DIAS[agora.weekday()]}, {agora.strftime('%d/%m/%Y')}, {agora.strftime('%H:%M')} "
        f"({TZ_NAME}, {offset_fmt})",
        f"Equipe agora: {estado_frase}",
        f"Hoje é feriado: {'sim — ' + nome_feriado if nome_feriado else 'não'}",
    ]
    if abertura is not None and estado_nome != "disponivel":
        hoje = abertura.date() == agora.date()
        amanha = abertura.date() == agora.date() + timedelta(days=1)
        if hoje:
            quando = f"hoje às {abertura.strftime('%H:%M')}"
        elif amanha:
            quando = f"amanhã ({DIAS[abertura.weekday()]}) às {abertura.strftime('%H:%M')}"
        else:
            quando = f"{DIAS[abertura.weekday()]}, {abertura.strftime('%d/%m')}, às {abertura.strftime('%H:%M')}"
        linhas.append(f"Próximo horário com pessoa da equipe: {quando}")
    linhas.append(
        "Use isto apenas para saber se existe PESSOA disponível agora (valor, prazo, fechamento, "
        "reunião). Nunca chute horário nem prometa prazo; o Hermes atende em qualquer horário."
    )
    return "\n".join(linhas)


def registrar(payload: dict, texto_gerado: str) -> None:
    """Log curto de cada disparo (prova de execução + diagnostico)."""
    home = os.environ.get("HERMES_HOME")
    if not home or os.environ.get("HERMES_CLOCK_HOOK_LOG") == "0":
        return
    caminho = os.path.join(home, "hook-clock.log")
    try:
        if os.path.exists(caminho) and os.path.getsize(caminho) > 512_000:
            os.replace(caminho, caminho + ".1")
        with open(caminho, "a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "at": datetime.now(ZoneInfo(TZ_NAME)).isoformat(timespec="seconds"),
                        "platform": payload.get("platform"),
                        "session_id": payload.get("session_id"),
                        "first_turn": payload.get("is_first_turn"),
                        "linha_agora": texto_gerado.splitlines()[2] if len(texto_gerado.splitlines()) > 2 else "",
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    except Exception:
        pass


def main() -> int:
    payload: dict = {}
    try:
        bruto = sys.stdin.read()
        if bruto.strip():
            dados = json.loads(bruto)
            if isinstance(dados, dict):
                payload = dados
    except Exception:
        payload = {}

    quando = None
    for arg in sys.argv[1:]:
        if arg.startswith("--at="):
            quando = arg.split("=", 1)[1]
        elif arg == "--at" and sys.argv.index(arg) + 1 < len(sys.argv):
            quando = sys.argv[sys.argv.index(arg) + 1]
    if quando:
        agora = datetime.fromisoformat(quando).replace(tzinfo=ZoneInfo(TZ_NAME))
        print(texto(agora))
        return 0

    agora = datetime.now(ZoneInfo(TZ_NAME))
    corpo = texto(agora)
    registrar(payload, corpo)
    print(json.dumps({"context": corpo}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
