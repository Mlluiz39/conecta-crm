# ConectaCRM - CRM Multicanal com Agentes de IA 🇧🇷

O **ConectaCRM** é uma plataforma moderna e completa de CRM multicanal (WhatsApp, Instagram Direct, Facebook Messenger e Webchat) com orquestração de **Agentes Autônomos de Inteligência Artificial**, funil Kanban dinâmico, gestão de contatos com campos customizados, agenda de visitas integrada e relatórios executivos em Recharts.

Desenvolvido com design inspirado no Dribbble (índigo primário, cards arredondados, sombras suaves, micro-interações, suporte a Light/Dark Mode) e 100% em **Português do Brasil**.

---

## 🚀 Arquitetura e Páginas da Aplicação

### 1. Dashboard Executivo (`/src/pages/DashboardPage.tsx`)
- **5 KPI Cards**: Clientes Contactados, Valor do Funil em R$, Leads Novos (+18%), Taxa de Conversão e Visitas Agendadas.
- **Gráficos Recharts**:
  - Faturamento Mensal (R$) com meta em área/barras.
  - Aquisição de Novos Leads com volume de conversões.
  - Taxa de Conversão mensal e distribuição por canais (WhatsApp, Instagram, Messenger).
- **Mini-Kanban do Pipeline**: Visualização compacta dos negócios em andamento por etapa.

### 2. Conversas & Inbox Unificado (`/src/pages/ConversasPage.tsx`)
- **Filtros rápidos**: Canal (WhatsApp, Instagram, Messenger), Status (Abertas, Atendimento Humano, Bot Ativo, Resolvidas), Tags e Atendente.
- **Thread de Mensagens**:
  - Balões de mensagem com status de entrega (enviado, recebido, lido).
  - Áudios com waveform interativo e reprodução.
  - Fotos e mídias compartilhadas.
  - **Avisos de Transição**: Notificação quando o bot transfere ou quando o atendente assume a conversa.
- **Assumir Conversa / Reativar Bot**:
  - Desativa instantaneamente o robô autônomo e transfere a responsabilidade para o atendente logado.
  - Opção para devolver o controle ao bot com 1 clique.
- **Sugestões Rápidas de IA**:
  - Sugestões contextuais de resposta com 1 clique geradas pelo modelo da IA.
- **Notas Internas**:
  - Anotações privadas entre a equipe de vendas não visíveis para o lead.
- **Painel Lateral do Contato**:
  - Ficha completa do cliente, canal de origem, oportunidade associada e tags rápidas.

### 3. Gestão de Contatos (`/src/pages/ContatosPage.tsx`)
- Tabela com busca em tempo real por nome, e-mail, telefone e empresa.
- **Segmentação por Chips de Tags**: Todos, Leads Quentes, Clientes Ativos B2B, WhatsApp Aberto, Reagendados.
- **Modal de Detalhes do Contato** com 4 abas completas:
  - **Dados Cadastrais**: Informações gerais e campos customizados editáveis (Creci, Bairro, ID Pedido, CNPJ, etc.).
  - **Histórico & Atividades**: Linha do tempo de todas as interações, chamadas e mensagens trocadas.
  - **Oportunidades**: Negócios abertos e fechados vinculados ao lead.
  - **Agendamentos**: Visitas e reuniões marcadas para o contato com botão de agendar.
- Exportação para CSV.

### 4. Pipeline Kanban Visual (`/src/pages/PipelinePage.tsx`)
- Board Kanban com drag-and-drop nativo (`@dnd-kit/core`).
- Colunas com valor total acumulado em R$ e contagem de oportunidades.
- **Personalização de Etapas**:
  - Adição de novas etapas.
  - Renomear etapas existentes.
  - Troca da paleta de cores (Azul, Âmbar, Roxo, Índigo, Esmeralda, Rosa).

### 5. Calendário de Visitas (`/src/pages/CalendarioPage.tsx`)
- Visualizações em **Mês**, **Semana**, **Dia** e **Lista**.
- Time grid interativo de 08:00 às 20:00 com linha de horário atual.
- Criação e edição de visitas e compromissos com local, link de videoconferência e notas.
- Indicador de sincronização em tempo real com **Google Calendar**.
- Configurações de lembretes automáticos via WhatsApp (24h antes, 2h antes e follow-up de no-show).

### 6. Relatórios & Métricas (`/src/pages/RelatoriosPage.tsx`)
- Métricas consolidadas de receita, novos leads, tempo médio de resposta (TMR) e ticket médio.
- Gráfico de faturamento mensal vs meta anual.
- Gráfico de pizza com canais de aquisição.
- Tabela detalhada de **Desempenho por Atendente** (Humanos e Robôs de IA).
- Exportação completa dos relatórios em planilha CSV.

### 7. Agentes de IA (`/src/pages/AgentesPage.tsx`)
- Criação e gestão de múltiplos agentes com fotos, nomes e funções (Vendedor, Atendente, Suporte, Agendador, Personalizado).
- Vínculo por canal: escolha se o agente atua no WhatsApp, Instagram, Messenger ou em todos.
- **Ferramentas Ativas (Toggles)**:
  - 🔍 Buscar Informações da Base de Conhecimento
  - 📅 Agendar Visita / Consulta
  - 👤 Derivar para Atendente Humano
- **Editor de Prompt de Sistema**:
  - Templates pré-configurados por perfil de negócio.
  - Suporte a variáveis dinâmicas: `{{nome_empresa}}`, `{{nome_cliente}}`, `{{canal}}`, `{{telefone_contato}}`.
  - Versionamento de Prompt: Alternância entre versão **Rascunho (Draft)** e versão **Publicada (Live)** com botão de publicar alterações.
- **Playground de Teste Integrado com Gemini**:
  - Chat interativo para testar o comportamento do agente em tempo real.
  - Conexão direta com a API do Google Gemini (`@google/genai` via `/api/gemini/chat`).
  - Painel de ferramentas acionadas pelo agente durante a conversa.

### 8. Templates de WhatsApp (`/src/pages/TemplatesPage.tsx`)
- Gestão de templates oficiais WhatsApp HSM (High-Structured Messages).
- Badges de status: `APROVADO`, `PENDENTE`, `REJEITADO`.
- Pré-visualização ao vivo em balão de WhatsApp em tempo real.
- Suporte a cabeçalhos (Texto, Imagem, Documento, Vídeo), rodapé e botões de Ação Rápida ou Chamada para Ação (URL / Telefone).
- Inserção de variáveis dinâmicas (`{{1}}`, `{{2}}`).

### 9. Configurações & Adaptação de Negócio (`/src/pages/SettingsPage.tsx`)
- **Seletor de Tipo de Negócio (Presets)**:
  - 🏢 **Imobiliária & Construtora**: Campos como Creci, Bairro Desejado, Tipo de Imóvel, Tipologia; funil focado em visita e decorado; agente Sofia.
  - 🛍️ **E-commerce & Varejo D2C**: Campos de ID do Pedido, Cupom, Valor do Carrinho; funil de recuperação de checkout; agente Lucas.
  - 🩺 **Clínica & Saúde / Odonto**: Campos de Convênio, Especialidade, Data da Consulta; funil de confirmação de consulta; agente Dra. Beatriz.
  - 💼 **Agência & Serviços B2B**: Campos de CNPJ, Budget Mensal, Decisor; funil de diagnóstico e proposta; agente Felipe.
- **Gerenciador de Campos Customizados**:
  - Adição de campos nos tipos: `text`, `number`, `date`, `select` (com opções) e `currency` (R$).
- **Lembretes Automáticos e Follow-ups**.

---

## 🔌 Guia de Integração: Do Mock para Produção

O projeto foi construído seguindo o padrão de **Service Layer Desacoplada** (`/src/services/` e `/src/types/`). Nenhuma informação de negócio está acoplada diretamente no layout.

Abaixo está o mapeamento exato do que está em mock local e o que deve ser plugado para colocar a aplicação em produção:

| Recurso | Estado Atual (Mock) | Serviço Responsável | O que plugar em Produção |
| :--- | :--- | :--- | :--- |
| **Banco de Dados & Autenticação** | `localStorage` + `INITIAL_*` em memória | `src/services/crmStorage.ts` | **Supabase (PostgreSQL)**:<br>1. Instalar `@supabase/supabase-js`<br>2. Definir tabelas `contacts`, `opportunities`, `conversations`, `messages`, `agents`, `templates`<br>3. Substituir os métodos de `crmStorage.ts` por queries `supabase.from('...')` |
| **Mensagens WhatsApp / Instagram** | Mensagens simuladas em `src/mocks/initialData.ts` | `src/context/CrmContext.tsx` | **Cernio Webhook / Meta Cloud API**:<br>1. Criar rota no Express `POST /api/webhooks/whatsapp`<br>2. Receber o payload da Meta/Cernio e injetar na tabela de mensagens<br>3. Para envio, chamar `https://graph.facebook.com/v19.0/{phone-id}/messages` |
| **Agendamento & Calendário** | Lista de compromissos local | `src/pages/CalendarioPage.tsx` | **Google Calendar API**:<br>1. Configurar OAuth Google com escopos de `calendar.events`<br>2. Ao criar visita no modal, chamar `calendar.events.insert`<br>3. Webhook de Google Calendar Push Notifications para sincronização bidirecional |
| **Agente de IA (Playground & Produção)** | Servidor Express `/api/gemini/chat` chamando SDK `@google/genai` com fallback simulado inteligente | `server.ts` & `src/services/geminiService.ts` | **Google Gemini API** ou **Claude API (Anthropic)**:<br>O backend já possui a rota pronta em `server.ts` consumindo o modelo `gemini-3.8-flash`. Basta certificar-se de ter `GEMINI_API_KEY` injetada no ambiente. Se desejar usar Claude, instale `@anthropic-ai/sdk` e direcione a rota `/api/gemini/chat` para a API da Anthropic. |
| **Modelos de Templates HSM WhatsApp** | Lista com validações de sintaxe e status simulados | `src/pages/TemplatesPage.tsx` | **Meta WhatsApp Business Management API**:<br>Submeter templates diretamente no endpoint `POST /{waba-id}/message_templates` da Meta para aprovação oficial em até 24h. |

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React (ícones), Motion (animações).
- **Gráficos**: Recharts (Área, Barras, Pizza, Tooltips customizados).
- **Drag and Drop**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- **Backend / API**: Node.js, Express, `tsx`, `@google/genai` (SDK oficial).
- **Formatadores**: `Intl.NumberFormat` para moeda brasileira (`pt-BR`, `BRL`) e `Intl.DateTimeFormat` para datas e horas.

---

## 💻 Como Rodar Localmente

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento (Express + Vite)
npm run dev
# Acesse em http://localhost:3000
```
