-- Corrige o fluxo de publicação da Biblioteca em projetos que receberam as
-- tabelas, mas ficaram com policies/bucket incompletos ou de uma versão antiga.
-- A autorização continua baseada exclusivamente no JWT do Supabase e no
-- perfil/turma do usuário autenticado.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.role
    from public.perfis profile
   where profile.id = (select auth.uid())
   limit 1;
$$;

revoke all on function private.current_profile_role() from public, anon, authenticated;
grant execute on function private.current_profile_role() to authenticated;

create or replace function private.biblioteca_can_read_publicacao(p_publicacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.biblioteca_publicacoes publication
     where publication.id = p_publicacao_id
       and (
         publication.autor_id = (select auth.uid())
         or (
           publication.excluido_em is null
           and publication.status = 'published'
           and exists (
             select 1
               from public.biblioteca_publicacao_turmas target
               join public.perfis student
                 on student.id = (select auth.uid())
                and student.turma_id = target.turma_id
                and student.role = 'student'
              where target.publicacao_id = publication.id
           )
         )
       )
  );
$$;

create or replace function private.biblioteca_can_manage_publicacao(p_publicacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.biblioteca_publicacoes publication
     where publication.id = p_publicacao_id
       and publication.autor_id = (select auth.uid())
       and (select private.current_profile_role()) = 'teacher'
  );
$$;

create or replace function private.biblioteca_can_manage_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.turmas classroom
     where classroom.id = p_turma_id
       and classroom.professor_id = (select auth.uid())
       and (select private.current_profile_role()) = 'teacher'
  );
$$;

revoke all on function private.biblioteca_can_read_publicacao(uuid) from public, anon;
revoke all on function private.biblioteca_can_manage_publicacao(uuid) from public, anon;
revoke all on function private.biblioteca_can_manage_turma(uuid) from public, anon;
grant execute on function private.biblioteca_can_read_publicacao(uuid) to authenticated;
grant execute on function private.biblioteca_can_manage_publicacao(uuid) to authenticated;
grant execute on function private.biblioteca_can_manage_turma(uuid) to authenticated;

alter table public.biblioteca_publicacoes enable row level security;
alter table public.biblioteca_publicacao_turmas enable row level security;
alter table public.biblioteca_anexos enable row level security;

drop policy if exists biblioteca_publicacoes_select on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_select
  on public.biblioteca_publicacoes for select to authenticated
  using (private.biblioteca_can_read_publicacao(id));

drop policy if exists biblioteca_publicacoes_insert on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_insert
  on public.biblioteca_publicacoes for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and autor_id = (select auth.uid())
    and (select private.current_profile_role()) = 'teacher'
  );

drop policy if exists biblioteca_publicacoes_update on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_update
  on public.biblioteca_publicacoes for update to authenticated
  using (private.biblioteca_can_manage_publicacao(id))
  with check (
    autor_id = (select auth.uid())
    and (select private.current_profile_role()) = 'teacher'
  );

drop policy if exists biblioteca_publicacoes_delete on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_delete
  on public.biblioteca_publicacoes for delete to authenticated
  using (private.biblioteca_can_manage_publicacao(id));

drop policy if exists biblioteca_publicacao_turmas_select on public.biblioteca_publicacao_turmas;
create policy biblioteca_publicacao_turmas_select
  on public.biblioteca_publicacao_turmas for select to authenticated
  using (private.biblioteca_can_read_publicacao(publicacao_id));

drop policy if exists biblioteca_publicacao_turmas_insert on public.biblioteca_publicacao_turmas;
create policy biblioteca_publicacao_turmas_insert
  on public.biblioteca_publicacao_turmas for insert to authenticated
  with check (
    private.biblioteca_can_manage_publicacao(publicacao_id)
    and private.biblioteca_can_manage_turma(turma_id)
  );

drop policy if exists biblioteca_publicacao_turmas_delete on public.biblioteca_publicacao_turmas;
create policy biblioteca_publicacao_turmas_delete
  on public.biblioteca_publicacao_turmas for delete to authenticated
  using (private.biblioteca_can_manage_publicacao(publicacao_id));

drop policy if exists biblioteca_anexos_select on public.biblioteca_anexos;
create policy biblioteca_anexos_select
  on public.biblioteca_anexos for select to authenticated
  using (private.biblioteca_can_read_publicacao(publicacao_id));

drop policy if exists biblioteca_anexos_insert on public.biblioteca_anexos;
create policy biblioteca_anexos_insert
  on public.biblioteca_anexos for insert to authenticated
  with check (
    private.biblioteca_can_manage_publicacao(publicacao_id)
    and (
      tipo in ('youtube', 'link')
      or (
        (storage_path is null or (storage.foldername(storage_path))[1] = (select auth.uid())::text)
        and (thumbnail_path is null or (storage.foldername(thumbnail_path))[1] = (select auth.uid())::text)
        and (original_path is null or (storage.foldername(original_path))[1] = (select auth.uid())::text)
      )
    )
  );

drop policy if exists biblioteca_anexos_update on public.biblioteca_anexos;
create policy biblioteca_anexos_update
  on public.biblioteca_anexos for update to authenticated
  using (private.biblioteca_can_manage_publicacao(publicacao_id))
  with check (
    private.biblioteca_can_manage_publicacao(publicacao_id)
    and (
      tipo in ('youtube', 'link')
      or (
        (storage_path is null or (storage.foldername(storage_path))[1] = (select auth.uid())::text)
        and (thumbnail_path is null or (storage.foldername(thumbnail_path))[1] = (select auth.uid())::text)
        and (original_path is null or (storage.foldername(original_path))[1] = (select auth.uid())::text)
      )
    )
  );

drop policy if exists biblioteca_anexos_delete on public.biblioteca_anexos;
create policy biblioteca_anexos_delete
  on public.biblioteca_anexos for delete to authenticated
  using (private.biblioteca_can_manage_publicacao(publicacao_id));

grant select, insert, update, delete on public.biblioteca_publicacoes to authenticated;
grant select, insert, delete on public.biblioteca_publicacao_turmas to authenticated;
grant select, insert, update, delete on public.biblioteca_anexos to authenticated;

-- O bucket privado é obrigatório para PDFs e imagens. A criação idempotente
-- também corrige projetos em que as tabelas chegaram antes do Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'biblioteca-media',
  'biblioteca-media',
  false,
  26214400,
  array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists biblioteca_storage_insert on storage.objects;
create policy biblioteca_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'biblioteca-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.current_profile_role()) = 'teacher'
  );

drop policy if exists biblioteca_storage_select on storage.objects;
create policy biblioteca_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'biblioteca-media'
    and exists (
      select 1
        from public.biblioteca_anexos attachment
       where (
         attachment.storage_path = storage.objects.name
         or attachment.thumbnail_path = storage.objects.name
         or attachment.original_path = storage.objects.name
       )
         and private.biblioteca_can_read_publicacao(attachment.publicacao_id)
    )
  );

drop policy if exists biblioteca_storage_delete on storage.objects;
create policy biblioteca_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'biblioteca-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
          from public.biblioteca_anexos attachment
         where (
           attachment.storage_path = storage.objects.name
           or attachment.thumbnail_path = storage.objects.name
           or attachment.original_path = storage.objects.name
         )
           and private.biblioteca_can_manage_publicacao(attachment.publicacao_id)
      )
    )
  );
