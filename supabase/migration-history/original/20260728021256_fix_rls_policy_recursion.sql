-- Evita recursão entre as políticas de turmas e perfis.
-- Os helpers ficam em schema privado e são executáveis apenas pelo papel
-- autenticado para avaliação de políticas; não ficam publicados via REST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.role
  from public.perfis p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function private.current_profile_turma_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.turma_id
  from public.perfis p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function private.current_profile_role() from public, anon, authenticated;
revoke all on function private.current_profile_turma_id() from public, anon, authenticated;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_turma_id() to authenticated;

drop policy if exists turmas_student_select on public.turmas;
create policy turmas_student_select
  on public.turmas
  for select
  to authenticated
  using (
    private.current_profile_role() = 'student'
    and id = private.current_profile_turma_id()
  );

drop policy if exists turmas_app_admin on public.turmas;
create policy turmas_app_admin
  on public.turmas
  for all
  to authenticated
  using (private.current_profile_role() = 'admin')
  with check (private.current_profile_role() = 'admin');
