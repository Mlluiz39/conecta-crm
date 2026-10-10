# Skills do CRM para o agente

Aqui ficam as **skills** que ensinam o agente a operar o ConectaCRM (`atendente`, `crm-worker`,
`suporte`, `vendedor`). Elas não são código do CRM: são o material que o agente lê antes de
mexer no banco, no painel ou na prospecção.

O CRM em si **não depende** disto para rodar — o atendimento é feito pelo Evolution API + pelos
agentes nativos (`src/services/agents`). As skills servem ao Hermes que você mantém na VPS.

## Instalar no Hermes da VPS

```bash
# no home do Hermes (ex.: /root/.hermes)
mkdir -p skills/conecta-crm
scp -r deploy/hermes/skills/conecta-crm/* usuario@vps:/root/.hermes/skills/conecta-crm/
```

As skills entram em `$HERMES_HOME/skills/<nome>/SKILL.md` e o agente as descobre pelo front
matter (`name`, `description`). Depois de copiar, `hermes skills list` (ou `hermes doctor`)
confirma o que foi carregado.

## O que saiu daqui

Este diretório já teve `plugins/crm-output-guard/` (trava de saída do gateway antigo) e um README
que documentava a instalação das personas em `/opt/data` para o `whatsapp_manager`. Nada disso
existe mais: o gateway de WhatsApp do Hermes foi desligado e a limpeza de saída vive no próprio
CRM (`src/services/agents/sanitizer.ts` e `text-noise.ts`).
