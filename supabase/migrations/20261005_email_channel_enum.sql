-- Canal de e-mail no CRM (para envio por e-mail, ex.: Gmail conectado em Conexões).
-- Não adiciona colunas de token: essa parte só é necessária se usar a Gmail API.
alter type channel_type add value if not exists 'email';
