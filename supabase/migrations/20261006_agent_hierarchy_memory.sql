-- Agent hierarchy + per-agent memory

alter table agents
  add column if not exists manager_agent_id uuid references agents(id) on delete set null;

create index if not exists agents_manager_agent_id_idx on agents(manager_agent_id);

create table if not exists agent_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  key text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, key)
);

create index if not exists agent_memories_agent_id_idx on agent_memories(agent_id);
