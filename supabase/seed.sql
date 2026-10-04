-- ════════════════════════════════════════════════════════════════════
-- Seed — presets de negócio + templates de agente + org demo
-- Rode após as migrations. `supabase db reset` já aplica este arquivo.
-- ════════════════════════════════════════════════════════════════════

-- ── Organização provisionada (single-org) ───────────────────────────
insert into organizations (id, name, slug, business_type, settings)
values (
  '00000000-0000-0000-0000-000000000001',
  'Matriz Brasil Ltda',
  'matriz-brasil',
  'agencia',
  '{"horario_atendimento":"Segunda a Sexta das 09h às 18h","branding":{"primary":"#4f46e5"}}'
) on conflict (id) do nothing;

-- ── Presets de negócio (imutáveis) ──────────────────────────────────
insert into business_presets (business_type, name, description, icon, config) values
('imobiliaria','Imobiliária & Construtora','Captação de compradores, visitas em imóveis e lançamentos.','domain',
 '{"custom_fields":[{"key":"tipo_imovel","name":"Tipo de Imóvel","type":"select","options":["Apartamento","Casa em Condomínio","Comercial","Terreno / Lote","Studio"],"required":true},{"key":"orcamento_max","name":"Orçamento Máximo","type":"currency"},{"key":"bairros_interesse","name":"Bairros de Interesse","type":"text"},{"key":"previsao_compra","name":"Previsão de Compra","type":"select","options":["Imediato (30 dias)","1 a 3 meses","6 meses a 1 ano","Apenas pesquisando"]},{"key":"qtd_quartos","name":"Quartos Desejados","type":"number"}],"pipeline_stages":[{"name":"Novo Lead","color":"#4f46e5","target":100},{"name":"Perfil Qualificado","color":"#3525cd","target":65},{"name":"Visita Agendada","color":"#bd0853","target":40},{"name":"Proposta / Reserva","color":"#4d44e3","target":25},{"name":"Contrato & Fechado","color":"#006e2f","target":18,"is_won":true},{"name":"Perdido","color":"#dc2626","is_lost":true}],"tags":["🔥 Lead Quente","🏢 Construtora","Alta Renda","Primeiro Imóvel","Investidor","Visita Feita"]}'),
('ecommerce','E-commerce & Varejo D2C','Recuperação de carrinhos, catálogo e SAC dinâmico.','shopping_bag',
 '{"custom_fields":[{"key":"valor_carrinho","name":"Valor do Carrinho Abandonado","type":"currency"},{"key":"categoria_favorita","name":"Categoria de Interesse","type":"select","options":["Moda Feminina","Calçados","Acessórios","Eletrônicos","Cosméticos"]},{"key":"cupom_aplicado","name":"Último Cupom Utilizado","type":"text"},{"key":"qtd_pedidos","name":"Qtd. Total de Pedidos","type":"number"},{"key":"data_ultima_compra","name":"Data da Última Compra","type":"date"}],"pipeline_stages":[{"name":"Carrinho / Inbound","color":"#4f46e5","target":100},{"name":"Cupom Enviado","color":"#3525cd","target":70},{"name":"Tirando Dúvidas","color":"#bd0853","target":45},{"name":"Checkout Iniciado","color":"#4d44e3","target":35},{"name":"Pedido Pago","color":"#006e2f","target":28,"is_won":true},{"name":"Perdido","color":"#dc2626","is_lost":true}],"tags":["🛒 Carrinho Abandonado","VIP / Recorrente","Primeira Compra","Frete Grátis","Pix Pendente","Reclamação"]}'),
('clinica','Clínica & Consultório Médico','Agendamento de consultas, triagem e lembretes.','medical_services',
 '{"custom_fields":[{"key":"especialidade_medica","name":"Especialidade / Tratamento","type":"select","options":["Odontologia / Implantes","Dermatologia & Estética","Ortopedia","Nutrição Clínica","Clínica Geral","Oftalmologia"]},{"key":"convenio","name":"Plano de Saúde ou Particular","type":"select","options":["Particular","Unimed","Bradesco Saúde","SulAmérica","Amil","Porto Seguro"]},{"key":"data_nascimento","name":"Data de Nascimento","type":"date"},{"key":"procedimento_interesse","name":"Procedimento de Interesse","type":"text"},{"key":"urgencia","name":"Nível de Urgência","type":"select","options":["Normal (Agendamento)","Urgente (Dor / Emergência)","Retorno"]}],"pipeline_stages":[{"name":"Primeiro Contato","color":"#4f46e5","target":100},{"name":"Triagem Realizada","color":"#3525cd","target":75},{"name":"Consulta Marcada","color":"#bd0853","target":50},{"name":"Orçamento Enviado","color":"#4d44e3","target":35},{"name":"Tratamento Fechado","color":"#006e2f","target":25,"is_won":true},{"name":"Perdido","color":"#dc2626","is_lost":true}],"tags":["🦷 Odonto","🩺 Particular","Convênio","Avaliação Grátis","Paciente VIP","Urgência"]}'),
('agencia','Agência & B2B Serviços','Venda consultiva de marketing, software e consultorias.','business_center',
 '{"custom_fields":[{"key":"segmento_empresa","name":"Segmento da Empresa","type":"select","options":["Indústria","Varejo","Tecnologia / SaaS","Saúde","Educação","Serviços Financeiros"]},{"key":"tamanho_equipe","name":"Tamanho da Equipe","type":"select","options":["1 a 5 pessoas","6 a 15 pessoas","16 a 50 pessoas","Mais de 50 pessoas"]},{"key":"faturamento_mensal","name":"Faturamento Mensal Estimado","type":"currency"},{"key":"decisor_final","name":"É Decisor Final?","type":"select","options":["Sim (Sócio / Diretor)","Não (Gerente / Coordenador)","Pesquisando para Diretoria"]},{"key":"prazo_inicio","name":"Expectativa de Início","type":"select","options":["Imediato","Próximo mês","Próximo trimestre"]}],"pipeline_stages":[{"name":"Novo Lead","color":"#4f46e5","target":100},{"name":"Qualificado (MQL)","color":"#3525cd","target":60},{"name":"Diagnóstico / Demo","color":"#bd0853","target":40},{"name":"Proposta Comercial","color":"#4d44e3","target":25},{"name":"Fechado (Ganho)","color":"#006e2f","target":18,"is_won":true},{"name":"Perdido","color":"#dc2626","is_lost":true}],"tags":["🔥 Lead Quente","🏢 B2B Enterprise","Inbound Google Ads","Indicação","15+ Licenças","Contrato Anual"]}')
on conflict (business_type) do nothing;

-- ── Templates de agente iniciais (globais: organization_id null) ────
insert into agent_templates (role, business_type, name, description, prompt) values
-- Imobiliária
('vendedor','imobiliaria','Consultor Imobiliário','Qualifica comprador e agenda visita.',
 'Você é o consultor imobiliário da {{nome_empresa}}. Acolha {{nome_contato}}, identifique se busca comprar ou alugar, faixa de valor, quantos quartos e a região preferida. Convide para uma visita física ou tour virtual. Tom profissional brasileiro; nunca pressione sem demonstrar valor.'),
('atendente','imobiliaria','Atendente de Visitas','Confirma e organiza visitas.',
 'Você é o agendador de visitas da {{nome_empresa}}. Verifique a disponibilidade de {{nome_contato}} para visitar o decorado com um corretor, confirme data, horário e envie a localização pelo {{canal}}.'),
-- E-commerce
('vendedor','ecommerce','Especialista em Estilo','Recupera carrinho e vende.',
 'Você é a especialista em estilo e vendas da loja {{nome_empresa}}. Ajude {{nome_contato}} a finalizar a compra, tire dúvidas de tamanhos, tecidos e prazos, e ofereça cupons com empatia e entusiasmo.'),
('atendente','ecommerce','SAC Ágil','Trocas, devoluções e rastreio.',
 'Você é o SAC da {{nome_empresa}}. Trate devoluções, trocas e reembolsos de {{nome_contato}} segundo o CDC, de forma rápida e cordial, e ajude com rastreamento de entregas.'),
-- Clínica
('vendedor','clinica','Secretária Virtual','Triagem e agendamento de consultas.',
 'Você é a secretária virtual da {{nome_empresa}}. Acolha o paciente {{nome_contato}}, entenda o procedimento buscado e se tem plano ou prefere particular, e guie para o agendamento presencial. Seja acolhedora, respeitosa e ética.'),
('atendente','clinica','Coordenadora de Agenda','Confirma horários e preparo.',
 'Você é a coordenadora de agenda da clínica {{nome_empresa}}. Verifique horários livres para {{nome_contato}}, confirme presença e envie instruções de preparo pelo {{canal}}.'),
-- Agência
('vendedor','agencia','Consultora de Soluções','Qualifica lead B2B e agenda demo.',
 'Você é a consultora sênior de soluções da {{nome_empresa}}. Qualifique o lead {{nome_contato}} que chegou pelo {{canal}}, entenda o tamanho da equipe e desafios atuais, e agende uma demonstração de 15 minutos. Respostas diretas, consultivas, alto nível executivo.'),
('atendente','agencia','SDR de Agendamentos','Alinha agenda com executivo.',
 'Você é o SDR de agendamentos da {{nome_empresa}}. Alinhe a agenda de {{nome_contato}} com nosso executivo, enviando o link do Google Meet e confirmando os pontos prioritários da reunião.')
on conflict do nothing;

-- ── Backfill da org demo com preset de agência ──────────────────────
do $$
declare
  org uuid := '00000000-0000-0000-0000-000000000001';
  stage jsonb;
  tag text;
  i int := 0;
  pos numeric := 1000;
begin
  -- Etapas do funil
  for stage in select jsonb_array_elements(config->'pipeline_stages')
    from business_presets where business_type = 'agencia'
  loop
    insert into pipeline_stages (organization_id, name, color, position,
      target_conversion_rate, is_won, is_lost)
    values (org, stage->>'name', stage->>'color', pos,
      nullif(stage->>'target','')::numeric,
      coalesce((stage->>'is_won')::boolean,false),
      coalesce((stage->>'is_lost')::boolean,false))
    on conflict do nothing;
    pos := pos + 1000;
  end loop;

  -- Tags
  for tag in select jsonb_array_elements_text(config->'tags')
    from business_presets where business_type = 'agencia'
  loop
    insert into tags (organization_id, name) values (org, tag)
    on conflict (organization_id, name) do nothing;
  end loop;

  -- Campos customizados
  for stage in select jsonb_array_elements(config->'custom_fields')
    from business_presets where business_type = 'agencia'
  loop
    insert into custom_field_defs (organization_id, entity, key, name, type, options, required, position)
    values (org, 'contact', stage->>'key', stage->>'name', (stage->>'type')::custom_field_type,
      stage->'options', coalesce((stage->>'required')::boolean,false), i)
    on conflict (organization_id, entity, key) do nothing;
    i := i + 1;
  end loop;

  -- Motivos de perda padrão
  insert into loss_reasons (organization_id, name) values
    (org,'Preço / Orçamento'), (org,'Sem resposta'), (org,'Escolheu concorrente'),
    (org,'Momento inadequado'), (org,'Fora do perfil')
  on conflict (organization_id, name) do nothing;

  -- Regras de lembrete padrão (24h e 1h antes)
  insert into reminder_rules (organization_id, name, offset_minutes)
  select org, 'Lembrete 24h antes', -1440
  where not exists (select 1 from reminder_rules where organization_id = org);
  insert into reminder_rules (organization_id, name, offset_minutes)
  select org, 'Lembrete 1h antes', -60
  where not exists (select 1 from reminder_rules where organization_id = org and offset_minutes = -1440);
end $$;
