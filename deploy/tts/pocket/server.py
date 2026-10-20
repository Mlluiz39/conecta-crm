#!/usr/bin/env python3
"""Adaptador MLVoice → Pocket TTS.

O CRM fala com motores de voz locais em dois dialetos:

- OpenAI-compatible (`POST /v1/audio/speech`) — Piper e Chatterbox;
- **MLVoice** (`POST /v1/tts`, header `X-API-Key`, corpo
  `{text, voice?, format?, normalize?}`) — usado pelo MLVoice Engine.

O `pocket-tts serve` expõe só `POST /tts` (multipart: `text` + `voice_url`),
então este adaptador traduz o dialeto MLVoice → Pocket TTS e devolve o WAV
(o CRM converte para ogg/opus com o ffmpeg que já tem na imagem).

Porta padrão: 127.0.0.1:8765 (somente o CRM, no mesmo host, alcança).
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("POCKET_URL", "http://127.0.0.1:8000").rstrip("/")
ADAPTER_HOST = os.environ.get("ADAPTER_HOST", "127.0.0.1")
ADAPTER_PORT = int(os.environ.get("ADAPTER_PORT", "8765"))
API_KEY = os.environ.get("MLVOICE_API_KEY", "").strip()
TIMEOUT = float(os.environ.get("POCKET_TIMEOUT", "180"))


def upstream_ok() -> bool:
    try:
        with urllib.request.urlopen(f"{UPSTREAM}/openapi.json", timeout=4) as res:
            return res.status == 200
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args) -> None:  # silencia o access log
        pass

    def _send(self, code: int, body: bytes, content_type: str = "application/json", extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health":
            ok = upstream_ok()
            self._send(200 if ok else 503, json.dumps({"status": "ok" if ok else "upstream_down"}).encode())
            return
        self._send(404, b'{"error":"not found"}')

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/v1/tts":
            self._send(404, b'{"error":"not found"}')
            return

        if API_KEY and self.headers.get("X-API-Key") != API_KEY:
            self._send(401, b'{"error":"invalid api key"}')
            return

        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send(400, b'{"error":"invalid json"}')
            return

        text = str(data.get("text") or "").strip()
        voice = str(data.get("voice") or "").strip()
        if not text:
            self._send(400, b'{"error":"text required"}')
            return

        # multipart/form-data para o /tts do pocket-tts (text + voice_url opcional)
        boundary = "----pocketttsboundary"
        parts: list[bytes] = []

        def campo(nome: str, valor: str) -> None:
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n{valor}\r\n'.encode()
            )

        campo("text", text)
        if voice:
            campo("voice_url", voice)
        body = b"".join(parts) + f"--{boundary}--\r\n".encode()

        req = urllib.request.Request(
            f"{UPSTREAM}/tts",
            data=body,
            method="POST",
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body)),
            },
        )

        inicio = time.time()
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                audio = res.read()
        except urllib.error.HTTPError as err:
            self._send(err.code, (err.read() or b'{"error":"upstream error"}')[:400])
            return
        except Exception as err:  # noqa: BLE001
            self._send(502, json.dumps({"error": str(err)}).encode())
            return

        if len(audio) < 1024:
            self._send(502, b'{"error":"empty audio"}')
            return

        self._send(
            200,
            audio,
            "audio/wav",
            {"X-Generation-Seconds": f"{time.time() - inicio:.3f}"},
        )


if __name__ == "__main__":
    print(f"[mlvoice-adapter] escutando em {ADAPTER_HOST}:{ADAPTER_PORT} → {UPSTREAM}/tts", flush=True)
    ThreadingHTTPServer((ADAPTER_HOST, ADAPTER_PORT), Handler).serve_forever()
