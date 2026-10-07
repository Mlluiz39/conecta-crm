#!/usr/bin/env python3
"""Enfileira uma nota de voz por agente e dispara o flush da outbox.
Usa o caminho real: messages pendente com media.voice -> flushOutbox -> TTS + sendVoice.
Este script NÃO é aplicado no produto: serve para o teste de audição das vozes.
"""
import json, os, urllib.request

BASE = os.environ["SB_URL"].rstrip("/")
KEY = os.environ["SB_KEY"]
ORG = "00000000-0000-0000-0000-000000000001"
CONTACT = "8f5a23b2-5c04-4846-a38c-bcdd1f6bd90f"   # Marcelo Luiz
CHANNEL = "b34d08fa-6b01-4f3f-b73d-5051c5cb940d"
EXT_CONV = "teste-voz-agentes"


def req(path, method="GET", body=None, prefer=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    r = urllib.request.Request(
        f"{BASE}/rest/v1/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=h,
    )
    with urllib.request.urlopen(r) as f:
        raw = f.read()
        return json.loads(raw) if raw else None


conv = req(
    "conversations?on_conflict=channel_id,external_id&select=id",
    "POST",
    {
        "organization_id": ORG,
        "contact_id": CONTACT,
        "channel_id": CHANNEL,
        "channel_type": "whatsapp",
        "external_id": EXT_CONV,
        "status": "aberta",
    },
    prefer="resolution=merge-duplicates,return=representation",
)
conv_id = conv[0]["id"] if isinstance(conv, list) else conv["id"]

agentes = req("agents?select=id,name,role,voice&order=role")
falas = {
    "agendador": "Oi, tudo bem? Aqui é a Fatima, do agendamento. Essa é a minha voz quando eu respondo em áudio.",
    "atendente": "Oi, tudo bem? Aqui é a Ana Silva, do atendimento. Essa é a minha voz quando eu respondo em áudio.",
    "vendedor": "Oi, tudo bem? Aqui é o Luiz Carlos, do comercial. Essa é a minha voz quando eu respondo em áudio.",
    "suporte": "Oi, tudo bem? Aqui é o Leonardo, do suporte. Essa é a minha voz quando eu respondo em áudio.",
    "gerente": "Oi, tudo bem? Aqui é o gerente da equipe. Essa é a minha voz quando eu respondo em áudio.",
}

linhas = []
for a in agentes:
    fala = falas.get(a["role"])
    if not fala:
        continue
    linhas.append(
        {
            "organization_id": ORG,
            "conversation_id": conv_id,
            "direction": "out",
            "sender_type": "agent_ai",
            "agent_id": a["id"],
            "content": fala,
            "status": "pendente",
            "media": {"typing": True, "voice": True},
        }
    )

req("messages", "POST", linhas, prefer="return=minimal")
print(f"conversa {conv_id}: {len(linhas)} notas de voz na fila")
for a in agentes:
    if a["role"] in falas:
        print(f"  {a['role']:10} {a['name']:12} voz={a['voice']}")
