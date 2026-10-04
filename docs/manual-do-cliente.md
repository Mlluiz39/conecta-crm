# Manual do ConectaCRM

Bem-vindo ao ConectaCRM — o CRM que atende seus clientes no WhatsApp, Instagram
e Messenger com agentes de inteligência artificial, qualifica os contatos e
organiza suas vendas em um só lugar.

## 1. Acessar

1. Você recebeu um convite por e-mail. Clique no link e defina sua senha.
2. Entre em seu domínio do ConectaCRM com e-mail e senha.
3. Pronto — você cai no **Dashboard**.

## 2. Conheça o menu

- **Dashboard** — visão geral: contatos, valor do funil, conversas abertas,
  visitas agendadas e taxa de conversão.
- **Conversas** — a caixa de entrada unificada com todos os canais.
- **Contatos** — sua base de clientes e leads.
- **Pipeline** — o quadro de vendas (Kanban).
- **Calendário** — visitas e reuniões.
- **Relatórios** — números do seu desempenho.
- **Agentes de IA** — os atendentes virtuais.
- **Templates** — modelos de mensagem do WhatsApp.
- **Conexões** — integrações com Zernio (WhatsApp), Apify, AISA e Google.
- **Configurações** — tipo de negócio, campos, equipe.

## 3. Conversas

A tela tem três colunas: **lista de conversas**, **conversa**, **dados do contato**.

- Filtre por canal (**WhatsApp / Instagram / Messenger**) ou por status
  (**Com IA** ou **Humano**).
- Quando um agente de IA está respondendo, aparece uma etiqueta azul com o nome dele.
- **Assumir conversa** — desliga o robô e passa o atendimento para você.
  Use quando o cliente precisar de atenção pessoal.
- **Reativar bot (IA)** — devolve a conversa para o agente virtual.
- **Nota interna** — uma anotação visível **só para a sua equipe** (o cliente não vê).
  Ótima para registrar um detalhe importante do lead.
- As mensagens chegam **em tempo real** — não precisa atualizar a página.

## 4. Contatos

- **Novo Contato** — cadastre nome, telefone, e-mail, empresa e cidade.
- **Buscar** — pesquise por nome, e-mail, telefone ou empresa.
- Clique em um contato para abrir a ficha com abas:
  - **Dados** — informações e os campos do seu tipo de negócio
    (ex.: Bairro, Quartos, Convênio).
  - **Conversas**, **Oportunidades**, **Agendamentos** e **Histórico**.

## 5. Pipeline

- Cada coluna é uma **etapa do funil** (ex.: Novo Lead → Qualificação → Visita → Fechado).
- **Arraste** os cards entre as etapas para mover a oportunidade.
- Cada coluna mostra o **valor total** e a **quantidade** de oportunidades.
- Ao mover para **Perdido**, o sistema pede o **motivo da perda** — importante
  para entender o que fazer diferente.

## 6. Calendário

- Alterne entre as visões **Mês**, **Semana** e **Dia**.
- **Novo** — crie uma visita ou reunião. O agente de IA também pode agendar
  automaticamente quando você habilita a ferramenta de agendamento.
- **Conectar Google Calendar** — sincronize seus compromissos automaticamente.
- **Lembretes automáticos** — envie avisos por WhatsApp (ex.: 24h e 1h antes),
  reduzindo faltas.

## 7. Relatórios

- **Receita**, **leads novos**, **taxa de conversão**, **tempo médio de resposta**
  e **ticket médio**.
- Gráficos de receita, leads/conversões e **leads por canal**.
- Tabela de **desempenho por atendente** (humanos e agentes de IA).
- **Exportar CSV** — baixe os dados para o Excel/Google Sheets.

## 8. Agentes de IA

Um agente é um atendente virtual que responde automaticamente. Você pode ter
vários — por exemplo, um **Vendedor** no WhatsApp e um **Atendente** no Instagram.

- **Novo** — crie um agente com nome, função e canal.
- Abas do agente:
  - **Prompt** — as instruções que o agente segue. Use as **variáveis**
    (`{{nome_empresa}}`, `{{nome_contato}}`, etc.) que são preenchidas sozinhas.
    - **Melhorar prompt com IA** reescreve o texto para ficar mais claro e eficaz.
    - **Salvar rascunho** guarda a alteração sem colocá-la no ar.
    - **Publicar versão** põe o rascunho em produção. O histórico permite **restaurar**
      uma versão anterior.
  - **Canais** — escolha em qual canal o agente atua. ⚠️ **Apenas um agente pode
    estar ativo por canal** — ao ativar aqui, o canal passa para este agente.
  - **Ferramentas** — o que o agente pode fazer: buscar informações da base,
    agendar visita, derivar para humano, atualizar contato, mover etapa do funil.
  - **Handoff** — quando o agente passa a conversa para uma pessoa:
    cliente pede humano, sentimento negativo, 3 falhas seguidas, fora do horário.
- **Playground** (à direita) — teste o agente antes de publicar. Escolha usar o
  **Rascunho** ou a **Publicada** e veja quais ferramentas ele acionou.

> **Boas práticas de prompt:** diga quem o agente é, qual o objetivo (qualificar,
> agendar), o tom (formal, amigável, consultivo) e o que ele **não** deve fazer.

## 9. Templates WhatsApp

Mensagens oficiais aprovadas pela Meta — necessárias para enviar avisos fora da
janela de 24h (como lembretes).

- **Novo template** — escolha categoria (Marketing, Utilidade, Autenticação),
  idioma, cabeçalho, corpo com variáveis (`{{1}}`, `{{2}}`) e botões.
- A **prévia** mostra como o cliente verá no WhatsApp.
- **Submeter** envia para aprovação da Meta. O status aparece no card
  (**Aprovado / Pendente / Rejeitado**) com o motivo, quando houver.

## 10. Conexões & Integrações

No menu **Conexões**, você vincula os canais de atendimento e automações:

- **Zernio (WhatsApp, Instagram e Messenger)**:
  - Insira sua **API Key / Bearer Token** da Zernio.
  - Copie a **URL do Webhook** gerada na tela (`https://seu-dominio/api/webhooks/zernio`)
    e cole nas configurações de Webhook do seu painel da Zernio.
  - Cadastre seus números de WhatsApp e canais em **Canais Cadastrados** informando
    o ID da instância ou telefone.
- **Apify**:
  - Insira seu **API Token** da Apify para extração de leads, enriquecimento de contatos
    e automações externas.
- **AISA**:
  - Conecte sua chave da AISA para serviços complementares de inteligência artificial.
- **Google Calendar**:
  - Clique em **Conectar Conta Google** para sincronização direta da agenda.

## 11. Configurações

- **Tipo de negócio** — aplique um preset pronto (Imobiliária, E-commerce,
  Clínica ou Agência). Ele configura as etapas do funil, etiquetas e campos
  personalizados do seu segmento em um clique.
- **Campos personalizados** — crie campos extras para os contatos
  (texto, número, data, seleção, moeda). Ex.: "Bairro de interesse", "Convênio".
- **Equipe** — administradores convidam usuários e definem papéis:
  **Administrador** (tudo), **Gerente** (tudo, menos equipe/organização) e
  **Atendente** (conversas, contatos e vendas).

## 12. Perguntas frequentes

**O robô respondeu algo errado. E agora?**
Abra a conversa, clique em **Assumir conversa** e ajuste o **prompt** do agente.
Teste antes no **Playground**.

**Meu cliente pediu para falar com uma pessoa.**
Se a regra de handoff estiver ligada, o agente transfere sozinho. Você também
pode assumir manualmente a qualquer momento.

**Não recebo lembretes.**
Confira se os **lembretes automáticos** estão ativos no Calendário e se o contato
tem telefone cadastrado.

**Preciso mudar o funil.**
Em **Configurações → Tipo de negócio**, aplique/reaplique o preset, ou crie
etapas diretamente no Pipeline.

---

Precisa de ajuda? Fale com o responsável pelo seu ConectaCRM.
