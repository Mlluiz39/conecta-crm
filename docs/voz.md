# Voz do atendimento (TTS/STT)

Quando o lead manda **nota de voz**, o agente responde em voz. Duas formas de gerar essa voz:

| Provedor | O que é | Quando usar |
|---|---|---|
| `proxy` (padrão) | endpoint OpenAI-compatible já configurado (`OPENAI_BASE_URL` → Gemini/9router) | funciona sem nada extra, custo por uso |
| `chatterbox` | **Chatterbox** local na própria VPS (MIT, ~0,5B, roda em CPU) | voz própria por agente, sem custo por uso |

A transcrição (voz do lead → texto) continua no proxy — o Chatterbox é só síntese.

## Como ligar o Chatterbox

```bash
# 1. sobe o serviço (clona o projeto, trava a porta no localhost e limita memória)
./deploy/tts/setup.sh

# 2. coloque uma amostra de ~10s por voz em deploy/tts/voices/
#    nome do arquivo = papel do agente: vendedor.mp3, suporte.mp3, atendente.mp3, agendador.mp3, gerente.mp3
node scripts/setup-voices.mjs          # cadastra as vozes e liga cada agente (chatterbox:<papel>)

# 3. liga no CRM e recria os containers
echo 'TTS_PROVIDER=chatterbox' >> .env.local
CONECTA_ROOT="$PWD" docker compose --env-file .env.local up -d
```

Teste rápido do serviço, sem passar pelo CRM:

```bash
curl -sS -X POST http://127.0.0.1:4123/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"input":"Oi! Aqui é o Luiz, da MLLuiz DevTech.","voice":"vendedor","response_format":"opus"}' \
  -o /tmp/voz.opus && ffprobe -hide_banner /tmp/voz.opus
```

## Como o CRM escolhe a voz

`agents.voice` manda no provedor:

| Valor | Efeito |
|---|---|
| `chatterbox:vendedor` | voz clonada no serviço local (nome da voz na biblioteca do serviço) |
| `alloy`, `shimmer`, `nova`… | voz do proxy (Gemini), como antes |
| vazio | `TTS_VOICE` (proxy) |

Com `TTS_PROVIDER=chatterbox`, tudo vai para o serviço local — inclusive agentes sem o prefixo.
Com `TTS_PROVIDER=auto` (padrão), só quem tem o prefixo `chatterbox:` usa o local.

**Reserva automática:** se o serviço local falhar ou estourar o tempo (`TTS_TIMEOUT_MS`), a
resposta sai em voz pelo proxy — lead nunca fica sem áudio. Fica no log como
`[audio] caindo para o proxy`.

## Saída em OGG/OPUS

O WhatsApp usa OGG/OPUS em nota de voz. O CRM pede `response_format: "opus"` ao serviço local e,
para qualquer áudio que chegue em wav/mp3 (ex.: o proxy), converte com ffmpeg antes de enfileirar
para a Evolution API. Ou seja: **o que sai do CRM já é a nota de voz pronta**.

## Vozes por agente (exemplo)

| Agente | Papel | Voz |
|---|---|---|
| Luiz Carlos | vendedor | `chatterbox:vendedor` |
| Ana Silva | atendente | `chatterbox:atendente` |
| Leonardo | suporte | `chatterbox:suporte` |
| Fatima | agendador | `chatterbox:agendador` |
| Gerente | gerente | `chatterbox:gerente` |

A amostra de referência pode vir de qualquer lugar (uma gravação sua, um clipe do ElevenLabs
etc.): ela é só o **molde do timbre**. Depois de cadastrada, a geração é local e gratuita.

## Custos e limites (importante)

* O Chatterbox em **CPU** é lento: a geração leva bem mais que o tempo real do áudio. O valor
  medido nesta VPS está no fim deste arquivo.
* O container fica com teto de memória (`mem_limit`/`memswap_limit` no `deploy/tts/setup.sh`)
  porque Postgres e Evolution rodam na mesma máquina — se ele estourar, morre o container do TTS,
  não o banco.
* Resposta maior que `TTS_MAX_CHARS` (600 por padrão) **não** vira áudio: vai como texto, para a
  nota de voz não ficar um monólogo.

## Requisitos

* ~6 GB de disco (imagem + modelo) e ~3 GB de RAM livre para o serviço.
* `TTS_TIMEOUT_MS` (padrão 180000) é o teto de espera da síntese. Com GPU dá para baixar bem.
* O container do CRM precisa de `ffmpeg` (a imagem já tem).

## Medição nesta VPS (4 vCPU, sem GPU)

Medido em 07/10/2026, container CPU (`docker/docker-compose.cpu.yml`), modelo multilíngue v3:

| Frase | Áudio gerado | Tempo de geração | Fator |
|---|---|---|---|
| ~170 caracteres ("Oi! Aqui é o Luiz, da MLLuiz DevTech…") | 12,0 s | **109,8 s** | ~9x o tempo real |
| ~55 caracteres ("Perfeito! Consigo te mostrar isso hoje às 15h…") | 4,4 s | **41,8 s** | ~9,5x o tempo real |

Carga do modelo: ~40 s depois do download (fica em cache no volume `docker_chatterbox-models`).
Memória em repouso com o modelo carregado: **3,4 GB** (teto do container: 4 GB).

Ou seja: **funciona, mas nesta VPS (4 vCPU, sem GPU) é ~10x mais lento que o tempo real.** Uma
resposta em voz de 10 s leva ~100 s para ficar pronta — contra poucos segundos do Gemini.
Para uso em produção com voz local, o caminho é uma máquina com GPU (aí cai para ~1-2 s) ou um
TTS leve de CPU (Piper, por exemplo), aceitando um timbre menos natural.

Se ligar mesmo assim, suba também `CRON_TIMEOUT_MS` (o job da outbox tem teto de 120 s e a
síntese sozinha passa de 100 s).
