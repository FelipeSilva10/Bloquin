-- Endurece funções públicas sem alterar o fluxo autenticado do Bloquin.
alter function public.apagar_utilizador(uuid)
  set search_path = pg_catalog, public;

alter function public.backoffice_actor_id()
  set search_path = pg_catalog, public;

alter function public.backoffice_actor_type()
  set search_path = pg_catalog, public;

alter function public.cleanup_backoffice_sessions()
  set search_path = pg_catalog, public;

alter function public.delete_student_user(uuid)
  set search_path = pg_catalog, public;

alter function public.encerrar_escola(uuid, text, text)
  set search_path = public, pg_catalog;

alter function public.is_backoffice_admin()
  set search_path = pg_catalog, public;

alter function public.professor_turma_ids()
  set search_path = pg_catalog, public;

alter function public.set_updated_at()
  set search_path = pg_catalog, public;

alter function public.delete_project(uuid)
  set search_path = pg_catalog, public;

alter function public.share_project(uuid, uuid[], uuid, text)
  set search_path = pg_catalog, public;

-- O app chama estas RPCs somente depois do login. O grant explícito herdado
-- pelo anon não é necessário e amplia a superfície REST sem benefício.
revoke execute on function public.delete_project(uuid) from anon;
revoke execute on function public.share_project(uuid, uuid[], uuid, text) from anon;
