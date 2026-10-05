-- Canal de e-mail no CRM (suficiente quando o envio é feito pela plataforma do Hermes).
-- Não adiciona colunas de token: essa parte só é necessária se usar a Gmail API.
alter type channel_type add value if not exists 'email';
