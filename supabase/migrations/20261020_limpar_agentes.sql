-- Limpeza de agentes de IA: mantém no máximo um VENDEDOR e um GERENTE por
-- organização (o mais antigo de cada papel) e remove os demais — inclusive as
-- memórias em `knowledge_base_items` com categoria `agent_memory:<id>`, que não
-- têm FK e ficariam órfãs.
--
-- Contexto (20/10): a organização da mlluizdevtech tinha 7 agentes de teste
-- (Rafael, Jane, Lucas, Vera, Santos, Vendedor, Atendente). O objetivo é ficar
-- só com o vendedor (Rafael) e o gerente (Santos). Em outro ambiente o script
-- mantém o agente mais antigo de cada papel — se quiser preservar pelos nomes,
-- troque o bloco `keep` por:  where name in ('Rafael', 'Santos')
--
-- Idempotente: rodar de novo não apaga nada além dos excedentes.

begin;

do $$
declare
  v_remover uuid[];
begin
  -- Um "keep" por papel (vendedor/gerente): o de menor created_at.
  with keep as (
    select distinct on (role) id
      from public.agents
     where role in ('vendedor', 'gerente')
     order by role, created_at asc
  )
  select array_agg(a.id) into v_remover
    from public.agents a
   where a.id not in (select id from keep);

  if v_remover is null then
    raise notice 'limpar_agentes: nada para remover';
    return;
  end if;

  -- Memórias do agente (knowledge_base_items não tem FK para agents).
  delete from public.knowledge_base_items
   where category = any (
     select 'agent_memory:' || a::text from unnest(v_remover) as a
   );

  -- O resto cai junto pelas FKs: prompt_versions, tools, handoff_rules,
  -- channels e memories têm ON DELETE CASCADE; conversations/messages têm
  -- ON DELETE SET NULL.
  delete from public.agents where id = any(v_remover);

  raise notice 'limpar_agentes: % agente(s) removido(s)', array_length(v_remover, 1);
end $$;

commit;
