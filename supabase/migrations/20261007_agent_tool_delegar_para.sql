-- Ferramenta de delegação (Fase 2: gerente → subagentes)
--
-- A tabela `agent_tools` tem um CHECK com a lista de ferramentas permitidas; incluir a
-- ferramenta no código sem atualizar a constraint faz o insert falhar com 23514
-- ("new row for relation agent_tools violates check constraint").

alter table agent_tools drop constraint if exists agent_tools_tool_key_check;

alter table agent_tools
  add constraint agent_tools_tool_key_check check (tool_key in (
    'buscar_informacoes',
    'agendar_visita',
    'derivar_para_atendente',
    'atualizar_contato',
    'mover_etapa_funil',
    'delegar_para'
  ));
