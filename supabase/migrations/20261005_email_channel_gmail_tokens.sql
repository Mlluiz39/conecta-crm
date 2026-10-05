-- Canal de e-mail + tokens OAuth do Google com refresh (Gmail API)
-- Aplicar no SQL Editor do Supabase (ou via psql) antes de usar prospecção por e-mail.

-- 1) Novo tipo de canal: e-mail
alter type channel_type add value if not exists 'email';

-- 2) Guarda access_token/refresh_token de verdade (hoje o callback gravava o
--    access_token no campo sync_token, que é do Calendar e sem refresh).
alter table google_calendar_connections
  add column if not exists access_token  text,
  add column if not exists refresh_token text,
  add column if not exists expires_at    timestamptz,
  add column if not exists scopes        text;

comment on column google_calendar_connections.refresh_token is
  'Refresh token OAuth Google (Calendar + Gmail) usado para renovar o access_token.';
