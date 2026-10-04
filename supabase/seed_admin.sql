-- =====================================================================
-- CRIAR USUÁRIO ADMIN E ORGANIZAÇÃO INICIAL
-- Execute este script no SQL Editor do Supabase após rodar o schema.sql.
-- =====================================================================

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_org_id  uuid := '00000000-0000-0000-0000-000000000001';

  -- >>> CONFIGURE SEUS DADOS AQUI <<<
  v_email   text := 'admin@conectacrm.com.br';
  v_senha   text := 'TROCAR-ESTA-SENHA';
  v_nome    text := 'Administrador';
  v_tipo    business_type := 'agencia'; -- 'imobiliaria' | 'ecommerce' | 'clinica' | 'agencia'
  v_empresa text := 'Minha Empresa';
begin
  -- 1. Cria o usuário no Supabase Auth com senha encriptada (se já não existir)
  if not exists (select 1 from auth.users where email = v_email) then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', v_nome),
      now(),
      now()
    );
  else
    select id into v_user_id from auth.users where email = v_email;
  end if;

  -- 2. Cria a organização inicial
  insert into organizations (id, name, business_type)
  values (v_org_id, v_empresa, v_tipo)
  on conflict (id) do update set business_type = v_tipo;

  -- 3. Vincula o usuário como admin da organização
  insert into organization_members (organization_id, user_id, role, full_name, is_active)
  values (v_org_id, v_user_id, 'admin', v_nome, true)
  on conflict (organization_id, user_id) do update set role = 'admin', is_active = true;

  -- 4. Executa a procedure para popular etapas do funil, tags, campos customizados e agentes iniciais
  perform apply_business_profile(v_org_id);

  raise notice 'Admin criado com sucesso! E-mail: %, Organização: %', v_email, v_empresa;
end $$;
