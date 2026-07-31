-- Corrige o contrato real do PostgREST para o upsert de public.user_sessions.
--
-- O PostgREST inclui a chave de conflito no SET gerado:
--   user_id = excluded.user_id
-- Mesmo que o UUID permaneça inalterado, PostgreSQL exige UPDATE nessa coluna.
-- As policies user_sessions_self_update continuam impondo, em USING e
-- WITH CHECK, que user_id seja exatamente auth.uid(); portanto a permissão não
-- permite transferir ou alterar a propriedade de uma sessão.

begin;

grant update (user_id, session_token, updated_at)
  on table public.user_sessions
  to authenticated;

commit;
