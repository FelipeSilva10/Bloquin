-- Remove a RPC destrutiva legada que nunca foi migrada para o schema atual.
--
-- Evidências para remoção:
-- - nenhum consumidor no frontend, Tauri, scripts ou bundles públicos;
-- - nenhum objeto dependente registrado em pg_depend;
-- - o único consumidor encontrado no Git foi removido em fevereiro de 2026;
-- - a função falha antes de qualquer efeito porque referencia
--   public.projects, public.classroom_students e public.profiles, inexistentes;
-- - public.apagar_utilizador(uuid), restrita a service_role, é o caminho
--   administrativo atual baseado nas FKs de auth.users/public.perfis.
--
-- Sem CASCADE: uma dependência inesperada deve interromper a migration.

begin;

drop function if exists public.delete_student_user(uuid);

commit;
