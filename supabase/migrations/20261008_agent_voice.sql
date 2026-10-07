-- Voz do agente nas respostas em áudio (TTS).
-- Quando o lead manda nota de voz, a resposta sai em voz na voz de quem atendeu a conversa;
-- NULL = usa TTS_VOICE do ambiente (padrão "alloy").
-- Vozes aceitas pelo proxy: alloy, echo, fable, nova, onyx, shimmer.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS voice text;

COMMENT ON COLUMN public.agents.voice IS
  'Voz do TTS nas respostas em áudio. NULL = voz padrão do sistema (env TTS_VOICE).';

UPDATE public.agents SET voice = 'nova' WHERE voice IS NULL AND name = 'Fatima';
UPDATE public.agents SET voice = 'shimmer' WHERE voice IS NULL AND name = 'Ana Silva';
UPDATE public.agents SET voice = 'onyx' WHERE voice IS NULL AND name = 'Luiz Carlos';
UPDATE public.agents SET voice = 'echo' WHERE voice IS NULL AND name = 'Leonardo';
UPDATE public.agents SET voice = 'alloy' WHERE voice IS NULL AND name = 'Gerente';
