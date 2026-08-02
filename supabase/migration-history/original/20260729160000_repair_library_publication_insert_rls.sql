-- A identidade do professor no schema atual é public.perfis.id, que referencia
-- auth.users.id. Não existe uma tabela professores separada usada pelo app.
-- O helper evita que a validação do papel dependa da policy SELECT de perfis.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.library_current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.id
    from public.perfis profile
   where profile.id = (select auth.uid())
     and profile.role = 'teacher'
   limit 1;
$$;

revoke all on function private.library_current_teacher_id() from public, anon, authenticated;
grant execute on function private.library_current_teacher_id() to authenticated;

alter table public.biblioteca_publicacoes enable row level security;

drop policy if exists biblioteca_publicacoes_select on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_select
  on public.biblioteca_publicacoes
  for select
  to authenticated
  using (private.biblioteca_can_read_publicacao(id));

drop policy if exists biblioteca_publicacoes_insert on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_insert
  on public.biblioteca_publicacoes
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and autor_id = (select private.library_current_teacher_id())
  );

drop policy if exists biblioteca_publicacoes_update on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_update
  on public.biblioteca_publicacoes
  for update
  to authenticated
  using (autor_id = (select private.library_current_teacher_id()))
  with check (autor_id = (select private.library_current_teacher_id()));

drop policy if exists biblioteca_publicacoes_delete on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_delete
  on public.biblioteca_publicacoes
  for delete
  to authenticated
  using (autor_id = (select private.library_current_teacher_id()));

grant select, insert, update, delete on public.biblioteca_publicacoes to authenticated;
