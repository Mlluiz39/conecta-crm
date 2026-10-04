import { BusinessPresetConfig } from '../types/crm';

export const BUSINESS_PRESETS: Record<string, BusinessPresetConfig> = {
  imobiliaria: {
    id: 'imobiliaria',
    name: 'Imobiliária & Construtora',
    description: 'Gestão de corretores, lançamentos imobiliários, captação de compradores e visitas em imóveis.',
    icon: 'domain',
    defaultCustomFields: [
      { id: 'f_imo_1', key: 'tipo_imovel', name: 'Tipo de Imóvel', type: 'select', options: ['Apartamento', 'Casa em Condomínio', 'Comercial', 'Terreno / Lote', 'Studio'], required: true },
      { id: 'f_imo_2', key: 'orcamento_max', name: 'Orçamento Máximo', type: 'currency', placeholder: 'R$ 650.000' },
      { id: 'f_imo_3', key: 'bairros_interesse', name: 'Bairros de Interesse', type: 'text', placeholder: 'Moema, Pinheiros, Jardins' },
      { id: 'f_imo_4', key: 'previsao_compra', name: 'Previsão de Compra', type: 'select', options: ['Imediato (30 dias)', '1 a 3 meses', '6 meses a 1 ano', 'Apenas pesquisando'] },
      { id: 'f_imo_5', key: 'qtd_quartos', name: 'Quartos Desejados', type: 'number', placeholder: '3' },
    ],
    defaultPipelineStages: [
      { id: 'st_1', name: 'Novo Lead', color: '#4f46e5', order: 0, targetConversionRate: 100 },
      { id: 'st_2', name: 'Perfil Qualificado', color: '#3525cd', order: 1, targetConversionRate: 65 },
      { id: 'st_3', name: 'Visita Agendada', color: '#bd0853', order: 2, targetConversionRate: 40 },
      { id: 'st_4', name: 'Proposta / Reserva', color: '#4d44e3', order: 3, targetConversionRate: 25 },
      { id: 'st_5', name: 'Contrato & Fechado', color: '#006e2f', order: 4, targetConversionRate: 18 },
    ],
    defaultTags: ['🔥 Lead Quente', '🏢 Construtora', 'Alta Renda', 'Primeiro Imóvel', 'Investidor', 'Visita Feita'],
    starterPrompts: {
      vendedor: `Você é o consultor imobiliário da {{nome_empresa}}.
Seu objetivo é acolher o cliente {{nome_contato}}, identificar se busca comprar ou alugar, faixa de valor pretendida e agendar uma visita física ou tour virtual no decorrer da semana.
Pergunte educadamente quantos quartos ele procura e a região preferida. Seja atencioso, use linguagem profissional brasileira e jamais pressione sem antes demonstrar valor.`,
      agendador: `Você é o agendador de visitas da {{nome_empresa}}.
Seu foco exclusivo é verificar a disponibilidade do cliente {{nome_contato}} para visitar o decorado ou imóvel com um de nossos corretores. Confirme data, horário e envie a localização via WhatsApp.`,
      suporte: `Você é o atendente de pós-venda da {{nome_empresa}}.
Auxilie {{nome_contato}} com documentação de financiamento, status de escritura ou entrega de chaves com tom seguro e cordial.`,
    },
  },

  ecommerce: {
    id: 'ecommerce',
    name: 'E-commerce & Varejo D2C',
    description: 'Vendas online, recuperação de carrinhos abandonados, catálogo de produtos e SAC dinâmico.',
    icon: 'shopping_bag',
    defaultCustomFields: [
      { id: 'f_eco_1', key: 'valor_carrinho', name: 'Valor do Carrinho Abandonado', type: 'currency', placeholder: 'R$ 280,00' },
      { id: 'f_eco_2', key: 'categoria_favorita', name: 'Categoria de Interesse', type: 'select', options: ['Moda Feminina', 'Calçados', 'Acessórios', 'Eletrônicos', 'Cosméticos'] },
      { id: 'f_eco_3', key: 'cupom_aplicado', name: 'Último Cupom Utilizado', type: 'text', placeholder: 'BEMVINDO10' },
      { id: 'f_eco_4', key: 'qtd_pedidos', name: 'Qtd. Total de Pedidos', type: 'number', placeholder: '4' },
      { id: 'f_eco_5', key: 'data_ultima_compra', name: 'Data da Última Compra', type: 'date' },
    ],
    defaultPipelineStages: [
      { id: 'st_1', name: 'Carrinho / Inbound', color: '#4f46e5', order: 0, targetConversionRate: 100 },
      { id: 'st_2', name: 'Cupom Enviado', color: '#3525cd', order: 1, targetConversionRate: 70 },
      { id: 'st_3', name: 'Tirando Dúvidas', color: '#bd0853', order: 2, targetConversionRate: 45 },
      { id: 'st_4', name: 'Checkout Iniciado', color: '#4d44e3', order: 3, targetConversionRate: 35 },
      { id: 'st_5', name: 'Pedido Pago', color: '#006e2f', order: 4, targetConversionRate: 28 },
    ],
    defaultTags: ['🛒 Carrinho Abandonado', 'VIP / Recorrente', 'Primeira Compra', 'Frete Grátis', 'Pix Pendente', 'Reclamação'],
    starterPrompts: {
      vendedor: `Você é a especialista em estilo e vendas da loja online {{nome_empresa}}.
Ajude {{nome_contato}} a finalizar sua compra, tire dúvidas sobre tamanhos, tecidos, prazos de entrega e ofereça cupons exclusivos com empatia e entusiasmo.`,
      agendador: `Você é o assistente de suporte de entregas da {{nome_empresa}}.
Auxilie {{nome_contato}} com o rastreamento do pacote, confirmação de endereço para reenvio e horários de recebimento.`,
      suporte: `Você é o SAC ágil da {{nome_empresa}}.
Trate devoluções, trocas e reembolsos de {{nome_contato}} seguindo o código de defesa do consumidor de forma rápida e cordial.`,
    },
  },

  clinica: {
    id: 'clinica',
    name: 'Clínica & Consultório Médico',
    description: 'Agendamento de consultas e procedimentos, triagem inicial de pacientes e lembretes automáticos.',
    icon: 'medical_services',
    defaultCustomFields: [
      { id: 'f_cli_1', key: 'especialidade_medica', name: 'Especialidade / Tratamento', type: 'select', options: ['Odontologia / Implantes', 'Dermatologia & Estética', 'Ortopedia', 'Nutrição Clínica', 'Clínica Geral', 'Oftalmologia'] },
      { id: 'f_cli_2', key: 'convenio', name: 'Plano de Saúde ou Particular', type: 'select', options: ['Particular', 'Unimed', 'Bradesco Saúde', 'SulAmérica', 'Amil', 'Porto Seguro'] },
      { id: 'f_cli_3', key: 'data_nascimento', name: 'Data de Nascimento', type: 'date' },
      { id: 'f_cli_4', key: 'procedimento_interesse', name: 'Procedimento de Interesse', type: 'text', placeholder: 'Alinhador Invisível, Botox, Consulta' },
      { id: 'f_cli_5', key: 'urgencia', name: 'Nível de Urgência', type: 'select', options: ['Normal (Agendamento)', 'Urgente (Dor / Emergência)', 'Retorno'] },
    ],
    defaultPipelineStages: [
      { id: 'st_1', name: 'Primeiro Contato', color: '#4f46e5', order: 0, targetConversionRate: 100 },
      { id: 'st_2', name: 'Triagem Realizada', color: '#3525cd', order: 1, targetConversionRate: 75 },
      { id: 'st_3', name: 'Consulta Marcada', color: '#bd0853', order: 2, targetConversionRate: 50 },
      { id: 'st_4', name: 'Orçamento Enviado', color: '#4d44e3', order: 3, targetConversionRate: 35 },
      { id: 'st_5', name: 'Tratamento Fechado', color: '#006e2f', order: 4, targetConversionRate: 25 },
    ],
    defaultTags: ['🦷 Odonto', '🩺 Particular', 'Convênio', 'Avaliação Grátis', 'Paciente VIP', 'Urgência'],
    starterPrompts: {
      vendedor: `Você é a secretária virtual da {{nome_empresa}}.
Acolha o paciente {{nome_contato}}, entenda qual procedimento ou avaliação busca, se tem plano de saúde ou prefere particular, e guie para o agendamento de um horário presencial com nossos doutores. Seja acolhedora, respeitosa e ética.`,
      agendador: `Você é a coordenadora de agenda da clínica {{nome_empresa}}.
Verifique horários livres para {{nome_contato}}, confirme presença e envie as instruções de preparo para a consulta médica.`,
      suporte: `Você é o suporte ao paciente da {{nome_empresa}}.
Tire dúvidas sobre receitas, atestados ou orientações pós-procedimento com total zelo e segurança.`,
    },
  },

  agencia: {
    id: 'agencia',
    name: 'Agência & B2B Serviços',
    description: 'Venda consultiva de marketing, software, consultorias e gestão de propostas corporativas.',
    icon: 'business_center',
    defaultCustomFields: [
      { id: 'f_age_1', key: 'segmento_empresa', name: 'Segmento da Empresa do Lead', type: 'select', options: ['Indústria', 'Varejo', 'Tecnologia / SaaS', 'Saúde', 'Educação', 'Serviços Financeiros'] },
      { id: 'f_age_2', key: 'tamanho_equipe', name: 'Tamanho da Equipe', type: 'select', options: ['1 a 5 pessoas', '6 a 15 pessoas', '16 a 50 pessoas', 'Mais de 50 pessoas'] },
      { id: 'f_age_3', key: 'faturamento_mensal', name: 'Faturamento Mensal Estimado', type: 'currency', placeholder: 'R$ 150.000 / mês' },
      { id: 'f_age_4', key: 'decisor_final', name: 'É Decisor Final?', type: 'select', options: ['Sim (Sócio / Diretor)', 'Não (Gerente / Coordenador)', 'Pesquisando para Diretoria'] },
      { id: 'f_age_5', key: 'prazo_inicio', name: 'Expectativa de Início', type: 'select', options: ['Imediato', 'Próximo mês', 'Próximo trimestre'] },
    ],
    defaultPipelineStages: [
      { id: 'st_1', name: 'Novo Lead', color: '#4f46e5', order: 0, targetConversionRate: 100 },
      { id: 'st_2', name: 'Qualificado (MQL)', color: '#3525cd', order: 1, targetConversionRate: 60 },
      { id: 'st_3', name: 'Diagnóstico / Demo', color: '#bd0853', order: 2, targetConversionRate: 40 },
      { id: 'st_4', name: 'Proposta Comercial', color: '#4d44e3', order: 3, targetConversionRate: 25 },
      { id: 'st_5', name: 'Fechado (Ganho)', color: '#006e2f', order: 4, targetConversionRate: 18 },
    ],
    defaultTags: ['🔥 Lead Quente', '🏢 B2B Enterprise', 'Inbound Google Ads', 'Indicação', '15+ Licenças', 'Contrato Anual'],
    starterPrompts: {
      vendedor: `Você é a Sofia, consultora sênior de soluções da {{nome_empresa}}.
Seu objetivo é qualificar leads que chegam pelo WhatsApp e Instagram, entender o tamanho da equipe e desafios atuais de {{nome_contato}} e agendar uma demonstração ou diagnóstico estratégico de 15 minutos com nosso diretor Marcelo Luiz.
Mantenha respostas diretas, consultivas e de alto nível executivo.`,
      agendador: `Você é o SDR de agendamentos da {{nome_empresa}}.
Alinhe a agenda de {{nome_contato}} com nosso executivo comercial, enviando o link do Google Meet e confirmando os pontos prioritários da reunião.`,
      suporte: `Você é o suporte corporativo da {{nome_empresa}}.
Auxilie os clientes contratantes em integrações, chamados e boas práticas na plataforma.`,
    },
  },
};
