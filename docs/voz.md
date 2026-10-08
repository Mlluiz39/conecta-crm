# Voz do atendimento (TTS/STT)

Quando o lead manda **nota de voz**, o agente responde em voz. Três formas de gerar essa voz:

| Provedor | O que é | Medido nesta VPS (4 vCPU, sem GPU) | Uso |
|---|---|---|---|
| `piper` | **Piper** local (MIT, CPU), uma voz por agente | **2,6 s** para 9,9 s de áudio (~4x mais rápido que o tempo real) | **recomendado** |
| `proxy` | endpoint OpenAI-compatible já configurado (Gemini via 9router) | poucos segundos | sem nada extra, custo por uso |
| `chatterbox` | **Chatterbox** local (MIT, clona timbre de uma amostra de ~10 s) | **110 s** para 12 s de áudio (~9x mais lento) | só com GPU |

A transcrição (voz do lead → texto) continua no proxy em qualquer caso — os motores locais fazem só síntese.

## Como está montado

```
resposta do agente ─► synthesizeSpeech(texto, voice)
                          │
                          ├─ "piper:faber"     ─► Piper local  http://127.0.0.1:4124  (container conectacrm-piper)
                          ├─ "chatterbox:vozX" ─► Chatterbox   http://127.0.0.1:4123  (opcional, GPU)
                          └─ (qualquer outro)  ─► proxy (Gemini)
                                    │
                                    ▼
                     OGG/OPUS (ffmpeg no container do CRM)
                                    │
                                    ▼
                     Evolution API ─► WhatsApp (nota de voz)
```

* O serviço local fala o **mesmo dialeto do OpenAI** (`POST /v1/audio/speech`), então trocar de
  motor não muda nada no resto do CRM.
* **Reserva automática:** se o motor escolhido falhar ou estourar `TTS_TIMEOUT_MS`, a resposta sai
  em voz pelo proxy — o log mostra `[audio] caindo para o proxy (...)`. Se nem isso rolar, a
  resposta vai como **texto**: o lead nunca fica sem retorno.

## Instalar / ligar (Piper)

```bash
# 1. serviço de voz: baixa as vozes pt-BR oficiais e sobe o container
./deploy/tts/piper/setup.sh

# 2. liga cada agente à voz do seu papel (grava agents.voice = "piper:<voz>")
node scripts/setup-voices.mjs

# 3. liga no CRM e recria os containers
grep -q '^TTS_PROVIDER' .env.local || echo 'TTS_PROVIDER="piper"' >> .env.local
CONECTA_ROOT="$PWD" docker compose --env-file .env.local up -d
```

Teste direto no serviço, sem passar pelo CRM (bom para escolher o timbre):

```bash
curl -sS -X POST http://127.0.0.1:4124/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"input":"Oi! Aqui é o Luiz, da MLLuiz DevTech.","voice":"faber"}' -o /tmp/voz.wav
ffplay /tmp/voz.wav
```

## Vozes por agente

`agents.voice` decide o provedor **e** a voz:

| Valor | Efeito |
|---|---|
| `piper:faber` | voz `faber` do Piper local |
| `chatterbox:vendedor` | voz clonada no Chatterbox |
| `alloy`, `shimmer`, `nova`… | voz do proxy (Gemini), como era antes |
| vazio | `TTS_VOICE` (proxy) |

Com `TTS_PROVIDER=piper` (ou `chatterbox`), todos os agentes vão para o serviço local — inclusive
os sem prefixo. Com `auto` (padrão do código), só quem tem o prefixo.

**Mapa padrão** (papel → voz), configurável com `VOZES_PAPEL="vendedor=faber,atendente=cadu"`:

| Papel | Voz | Quem |
|---|---|---|
| vendedor | `faber` | Luiz Carlos |
| atendente | `cadu` | Ana Silva |
| suporte | `jeff` | Leonardo |
| agendador | `edresson` | Fatima |
| gerente | `faber` | Gerente |

O Piper tem **4 vozes pt-BR** no repositório oficial (cadu, edresson, faber, jeff) — todas
masculinas. Para uma voz feminina (Ana Silva, por exemplo): Chatterbox com uma amostra feminina
(lento em CPU) ou aceitar o timbre atual.

## Medições (07/10/2026)

**Piper** — serviço `deploy/tts/piper`, container `conectacrm-piper`:

| Frase | Áudio gerado | Geração | Memória |
|---|---|---|---|
| ~170 caracteres | 9,86 s | **2,62 s** | 17 MB |
| ~55 caracteres | 5,94 s | **1,71 s** | 17 MB |

Ponta a ponta pelo CRM (fila → síntese → ffmpeg → Evolution): **6,5 s**, dos quais 4,5 s são a
espera proposital de "gravando áudio…" antes do envio. Resultado: mensagem `enviada`, com
`external_id` da Evolution e `[outbox] send via provider=evolution … (nota de voz)` no log.

**Chatterbox** — alternativa (`./deploy/tts/setup-chatterbox.sh`):

| Frase | Áudio gerado | Geração | Memória |
|---|---|---|---|
| ~170 caracteres | 12,0 s | **109,8 s** | 3,4 GB |
| ~55 caracteres | 4,4 s | **41,8 s** | 3,4 GB |

Clona timbres específicos (a voz de uma pessoa real), mas em CPU é ~10x mais lento que o tempo
real — na prática só vale a pena com GPU. Se ligar, suba também `CRON_TIMEOUT_MS` (o job da
outbox tem teto de 120 s e a síntese sozinha passa de 100 s).

## Env

| Variável | Padrão | Para que serve |
|---|---|---|
| `TTS_PROVIDER` | `auto` | `piper` \| `chatterbox` \| `proxy` \| `auto` |
| `PIPER_URL` | `http://127.0.0.1:4124` | serviço do Piper |
| `CHATTERBOX_URL` | `http://127.0.0.1:4123` | serviço do Chatterbox |
| `TTS_LANGUAGE` | `pt` | idioma mandado ao motor local |
| `TTS_TIMEOUT_MS` | `180000` | teto de espera da síntese |
| `TTS_VOICE` | `alloy` | voz do proxy quando o agente não tem voz própria |
| `TTS_MAX_CHARS` | `600` | acima disso a resposta vai como texto |
| `VOZES_PAPEL` | (mapa padrão) | usado só pelo `scripts/setup-voices.mjs` |

## Requisitos e cuidados

* Piper: ~300 MB de imagem + ~60 MB por voz; teto de 1 GB de RAM (usa ~17 MB).
* O container do CRM precisa de `ffmpeg` (a imagem já tem) para converter em OGG/OPUS.
* O serviço fica preso em `127.0.0.1` — só o CRM alcança. Não exponha em `0.0.0.0`.
