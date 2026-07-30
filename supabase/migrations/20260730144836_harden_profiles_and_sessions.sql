-- Lote 1: menor privilégio para perfis, sessões e funções auxiliares.
--
-- public.perfis.id referencia auth.users.id. Portanto, a identidade usada nas
-- policies é sempre auth.uid(); turma_id é apenas o vínculo acadêmico.

begin;

alter table public.perfis enable row level security;

drop policy if exists "Professor lê perfis da sua turma" on public.perfis;
drop policy if exists "Usuário lê seu próprio perfil" on public.perfis;
drop policy if exists perfis_authenticated_read on public.perfis;

create policy perfis_authenticated_read
  on public.perfis
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      id = (select auth.uid())
      or (
        (select private.current_profile_role()) = 'teacher'
        and perfis.role = 'student'
        and exists (
          select 1
          from public.turmas classroom
          where classroom.id = perfis.turma_id
            and classroom.professor_id = (select auth.uid())
        )
      )
    )
  );

-- O Data API só precisa destes quatro campos. E-mail, senhas temporárias,
-- estados administrativos e timestamps continuam disponíveis ao backend via
-- service_role, mas não ao cliente autenticado.
revoke all on table public.perfis from public, anon, authenticated;
grant select (id, nome, role, turma_id)
  on table public.perfis
  to authenticated;
grant all on table public.perfis to service_role;

alter table public.user_sessions enable row level security;

drop policy if exists user_sessions_teacher_read on public.user_sessions;
drop policy if exists user_sessions_self on public.user_sessions;
drop policy if exists user_sessions_self_select on public.user_sessions;
drop policy if exists user_sessions_self_insert on public.user_sessions;
drop policy if exists user_sessions_self_update on public.user_sessions;
drop policy if exists user_sessions_self_delete on public.user_sessions;

create policy user_sessions_self_select
  on public.user_sessions
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy user_sessions_self_insert
  on public.user_sessions
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy user_sessions_self_update
  on public.user_sessions
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  )
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy user_sessions_self_delete
  on public.user_sessions
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

revoke all on table public.user_sessions from public, anon, authenticated;
grant select on table public.user_sessions to authenticated;
grant insert (user_id, session_token, updated_at)
  on table public.user_sessions
  to authenticated;
grant update (session_token, updated_at)
  on table public.user_sessions
  to authenticated;
grant delete on table public.user_sessions to authenticated;
grant all on table public.user_sessions to service_role;

-- A assinatura Realtime é parte do contrato de substituição de sessão. O
-- estado autoritativo continua na tabela; a publicação só notifica mudanças.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_sessions'
  ) then
    alter publication supabase_realtime add table public.user_sessions;
  end if;
end;
$$;

-- encerrar_escola é uma operação administrativa mutável e deve ser chamada
-- apenas pelo backend privilegiado. set_updated_at existe somente para
-- triggers; o proprietário da função conserva o privilégio implícito.
revoke all on function public.encerrar_escola(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.encerrar_escola(uuid, text, text)
  to service_role;

revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;

-- O dump remoto registra defaults legados que autoexpõem novos objetos.
-- Novos acessos do Data API passam a exigir GRANT explícito em cada migration.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
