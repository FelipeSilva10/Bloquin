-- RLS já nega usuários anônimos, mas os grants herdados do snapshot antigo
-- não devem sugerir que essas tabelas fazem parte da superfície pública.
revoke all on table public.biblioteca_publicacoes
  from public, anon, authenticated;
revoke all on table public.biblioteca_publicacao_turmas
  from public, anon, authenticated;
revoke all on table public.biblioteca_anexos
  from public, anon, authenticated;

-- Documenta os privilégios realmente usados pelo cliente autenticado. A
-- autorização por linha continua a cargo das policies específicas.
grant select, insert, update, delete
  on table public.biblioteca_publicacoes
  to authenticated;
grant select, insert, delete
  on table public.biblioteca_publicacao_turmas
  to authenticated;
grant select, insert, update, delete
  on table public.biblioteca_anexos
  to authenticated;
