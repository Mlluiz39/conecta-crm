#!/usr/bin/env python3
"""
Serviço HTTP do Piper para o ConectaCRM — API no mesmo formato do OpenAI
(`POST /v1/audio/speech`), então o CRM não precisa saber qual motor está por trás.

Por que Piper: MIT, roda em CPU perto do tempo real (o Chatterbox nesta VPS é ~10x mais lento
que o tempo real) e cada voz é um arquivo .onnx de ~60 MB.

Endpoints:
  GET  /health            → estado do serviço e vozes disponíveis
  GET  /voices            → lista de vozes instaladas (nome = arquivo .onnx sem extensão)
  POST /v1/audio/speech   → {input, voice?, speed?} → WAV (o CRM converte para ogg/opus)

Variáveis: VOICES_DIR (padrão /voices), DEFAULT_VOICE, PORT (4124), HOST (0.0.0.0).
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VOICES_DIR = os.environ.get("VOICES_DIR", "/voices")
DEFAULT_VOICE = os.environ.get("DEFAULT_VOICE", "")
PORT = int(os.environ.get("PORT", "4124"))
HOST = os.environ.get("HOST", "0.0.0.0")
# Uma geração por vez: Piper usa todos os núcleos e enfileirar só aumenta a latência de todos.
LOCK = threading.Lock()


def vozes_instaladas():
    try:
        return sorted(f[: -len(".onnx")] for f in os.listdir(VOICES_DIR) if f.endswith(".onnx"))
    except FileNotFoundError:
        return []


def sintetizar(texto: str, voz: str, velocidade: float | None = None) -> bytes:
    """Texto → WAV (bytes) usando o binário do Piper."""
    modelo = os.path.join(VOICES_DIR, f"{voz}.onnx")
    if not os.path.isfile(modelo):
        raise FileNotFoundError(f"voz '{voz}' não instalada em {VOICES_DIR}")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        saida = tmp.name
    try:
        cmd = [sys.executable, "-m", "piper", "--model", modelo, "--output_file", saida]
        if velocidade:
            cmd += ["--length_scale", str(velocidade)]
        # Uma geração por vez: o modelo satura os núcleos e paralelizar piora o tempo de todos.
        with LOCK:
            proc = subprocess.run(cmd, input=texto.encode("utf-8"), capture_output=True, timeout=120)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[-400:] or "piper falhou")
        with open(saida, "rb") as fh:
            return fh.read()
    finally:
        try:
            os.unlink(saida)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # log enxuto (o docker já guarda o resto)
        sys.stderr.write("[piper] %s\n" % (fmt % args))

    def _responder(self, codigo: int, corpo: bytes, tipo: str = "application/json"):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._responder(
                200,
                json.dumps(
                    {
                        "status": "healthy" if vozes_instaladas() else "sem_vozes",
                        "engine": "piper",
                        "model_loaded": bool(vozes_instaladas()),
                        "voices": vozes_instaladas(),
                    }
                ).encode(),
            )
            return
        if self.path.startswith("/voices"):
            self._responder(200, json.dumps({"voices": vozes_instaladas()}).encode())
            return
        self._responder(404, b'{"error":"not found"}')

    def do_POST(self):
        if not self.path.startswith("/v1/audio/speech"):
            self._responder(404, b'{"error":"not found"}')
            return
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
            corpo = json.loads(self.rfile.read(tamanho) or b"{}")
        except Exception as erro:  # noqa: BLE001
            self._responder(400, json.dumps({"error": f"json inválido: {erro}"}).encode())
            return

        texto = str(corpo.get("input") or "").strip()
        if not texto:
            self._responder(400, b'{"error":"input vazio"}')
            return

        voz = str(corpo.get("voice") or DEFAULT_VOICE).strip()
        disponiveis = vozes_instaladas()
        if voz not in disponiveis:
            # Voz desconhecida não derruba a resposta: cai na primeira instalada e avisa no log.
            self.log_message("voz '%s' não instalada; usando '%s'", voz, disponiveis[0] if disponiveis else "-")
            if not disponiveis:
                self._responder(503, b'{"error":"nenhuma voz instalada"}')
                return
            voz = disponiveis[0]

        velocidade = corpo.get("speed")
        try:
            audio = sintetizar(texto, voz, float(velocidade) if velocidade else None)
        except Exception as erro:  # noqa: BLE001
            self._responder(500, json.dumps({"error": str(erro)}).encode())
            return
        self._responder(200, audio, "audio/wav")


if __name__ == "__main__":
    print(f"[piper] vozes em {VOICES_DIR}: {', '.join(vozes_instaladas()) or 'nenhuma'}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
