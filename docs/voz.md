# Voz do atendimento (TTS/STT)

Quando o lead manda **nota de voz**, o agente responde em voz. Quatro formas de gerar essa voz:

| Provedor | O que é | Medido nesta VPS (4 vCPU, sem GPU) | Uso |
|---|---|---|---|
| `piper` | **Piper** local (MIT, CPU), uma voz por agente | **2,6 s** para 9,9 s de áudio (~4x mais rápido que o tempo real) | **recomendado** |
| `mlvoice` | **MLVoice Engine** (Pocket TTS), endpoint próprio (`POST /v1/tts` + `X-API-Key`) | CPU da VPS (sem GPU), latência boa — sem cronômetro ainda | voz `rafael` (Pocket TTS) |
| `proxy` | endpoint OpenAI-compatible já configurado (Gemini via 9router) | poucos segundos | sem nada extra, custo por uso |
| `chatterbox` | **Chatterbox** local (MIT, clona timbre de uma amostra de ~10 s) | **110 s** para 12 s de áudio (~9x mais lento) | só com GPU |

A transcrição (voz do lead → texto) continua no proxy em qualquer caso — os motores locais fazem só síntese.

## Como está montado

```
resposta do agente ─► synthesizeSpeech(texto, voice)
                          │
                          ├─ "piper:faber"     ─► Piper local      http://127.0.0.1:4124  (conectacrm-piper)
                          ├─ "mlvoice:rafael"  ─► MLVoice Engine   http://127.0.0.1:8765/v1/tts
                          ├─ "chatterbox:vozX" ─► Chatterbox       http://127.0.0.1:4123  (opcional, GPU)
                          └─ (qualquer outro)  ─► proxy (Gemini)
                                    │
                                    ▼
                     OGG/OPUS (ffmpeg no container do CRM)
                                    │
                                    ▼
                     Evolution API ─► WhatsApp (nota de voz)
```

* Piper e Chatterbox falam o **mesmo dialeto do OpenAI** (`POST /v1/audio/speech`), então trocar de
  motor não muda nada no resto do CRM. O **MLVoice** é a exceção: dialeto próprio, com autenticação
  por `X-API-Key`, e por isso tem função dedicada (`vozPeloMLVoice`, em `src/services/audio/voice.ts`).
  A URL pode ser a completa (`.../v1/tts`) ou só a base (`...:8765`) — o código completa o caminho.
* **Reserva automática:** se o motor escolhido falhar ou estourar `TTS_TIMEOUT_MS`, o CRM tenta o
  próximo (`mlvoice` → Piper → Chatterbox → proxy) e o log mostra cada queda
  (`[audio] MLVoice indisponível; tentando o Piper`, `[audio] caindo para o proxy (...)`). Se nem
  isso rolar, a resposta vai como **texto**: o lead nunca fica sem retorno.
  Com `MLVOICE_API_KEY` vazio o MLVoice é simplesmente ignorado — nada quebra.

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

## Instalar / ligar (MLVoice / Pocket TTS)

O MLVoice roda como serviço próprio (fora do CRM), preso em `127.0.0.1:8765`. Como o container do
CRM usa `network_mode: host`, ele alcança o motor pelo mesmo endereço.

```bash
# 1. no .env.local (os mesmos valores vão para a VPS: o .env.local inteiro é o env do container)
TTS_PROVIDER="mlvoice"
MLVOICE_URL="http://127.0.0.1:8765/v1/tts"
MLVOICE_API_KEY="<a chave do motor>"
MLVOICE_VOICE="rafael"

# 2. confirme que o motor responde antes de mexer no CRM (a chave não aparece no terminal)
curl -sS -o /tmp/voz.opus -w 'HTTP %{http_code} · %{content_type} · %{size_download} bytes\n' \
  -X POST "$MLVOICE_URL" -H "X-API-Key: $MLVOICE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Oi! Aqui é o Luiz, da MLLuiz DevTech.","format":"opus","normalize":true}'

# 3. recria os containers (env novo; NÃO precisa de --build) e olha o log da primeira nota de voz
CONECTA_ROOT="$PWD" docker compose --env-file .env.local up -d
docker logs -f --tail 100 conectacrm-web | grep -i '\[audio\]'
```

Como cada agente fica: com `TTS_PROVIDER="mlvoice"` todos usam o Pocket TTS (`rafael`, por
`MLVOICE_VOICE`) e caem no Piper se ele não responder. Para tratar o motor como exceção, use
`TTS_PROVIDER="auto"` e marque só os agentes desejados com `agents.voice = "mlvoice:rafael"`.

## Vozes por agente

`agents.voice` decide o provedor **e** a voz:

| Valor | Efeito |
|---|---|
| `piper:faber` | voz `faber` do Piper local |
| `mlvoice:rafael` | voz `rafael` do MLVoice (Pocket TTS) |
| `chatterbox:vendedor` | voz clonada no Chatterbox |
| `alloy`, `shimmer`, `nova`… | voz do proxy (Gemini), como era antes |
| vazio | `TTS_VOICE` (proxy) |

Com `TTS_PROVIDER=piper` (ou `chatterbox`/`mlvoice`), todos os agentes vão para o serviço local —
inclusive os sem prefixo. Com `auto` (padrão do código), só quem tem o prefixo.

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
| `TTS_PROVIDER` | `auto` | `mlvoice` \| `piper` \| `chatterbox` \| `proxy` \| `auto` |
| `MLVOICE_URL` | `http://127.0.0.1:8765/v1/tts` | endpoint do MLVoice (aceita também só a base) |
| `MLVOICE_API_KEY` | (vazio) | chave do MLVoice (`X-API-Key`); vazio desliga o motor |
| `MLVOICE_VOICE` | (vazio) | voz do MLVoice (ex.: `rafael`); vazio = a padrão do motor |
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
* Os motores ficam presos em `127.0.0.1` — só o CRM alcança. Não exponha em `0.0.0.0`
  (o MLVoice tem chave, mas a chave não substitui a rede fechada: `X-API-Key` vaza em log).
* `MLVOICE_API_KEY` vive só no `.env.local`/`.env.vps` (os dois estão no `.gitignore`), nunca no
  código nem em `docker-compose.yml` — e não imprima a chave no terminal.
* O contrato do `/v1/tts` **foi validado na VPS (08/10/2026)**: o motor aceita
  `{text, format:"opus", normalize:true, voice:"rafael"}` com `X-API-Key` e devolve o áudio
  corretamente, com latência boa rodando só na CPU da própria VPS. Então o caminho normal é o
  áudio binário cru; o resto do código (JSON com base64, queda para Piper/proxy) fica só como rede
  de segurança, sem custo quando o motor responde. Falta cronometrar a síntese para entrar na
  tabela de medições acima.
