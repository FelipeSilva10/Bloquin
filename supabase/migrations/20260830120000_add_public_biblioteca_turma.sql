-- Biblioteca Pública: permite marcar uma turma como pública e ler suas
-- publicações sem login (role anon). Só leitura — nada muda nas políticas de
-- escrita, que continuam exigindo autor_id = auth.uid() e role = 'teacher'.

alter table public.turmas
  add column if not exists publica boolean not null default false;

-- Único ponto de verificação usado por todas as políticas SELECT da
-- Biblioteca (publicações, anexos, turma-alvo e Storage) — estender aqui
-- propaga a leitura pública pra tudo, sem duplicar a lógica em cada política.
create or replace function private.biblioteca_can_read_publicacao(p_publicacao_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'pg_catalog', 'public'
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
         or (
           publication.excluido_em is null
           and publication.status = 'published'
           and exists (
             select 1
               from public.biblioteca_publicacao_turmas target
               join public.turmas classroom on classroom.id = target.turma_id
              where target.publicacao_id = publication.id
                and classroom.publica = true
           )
         )
       )
  );
$$;

grant execute on function private.biblioteca_can_read_publicacao(uuid) to anon;

grant select on public.turmas to anon;
grant select on public.biblioteca_publicacoes to anon;
grant select on public.biblioteca_anexos to anon;
grant select on public.biblioteca_publicacao_turmas to anon;

-- Só expõe a turma marcada como pública — nunca as turmas reais dos alunos.
drop policy if exists turmas_public_select on public.turmas;
create policy turmas_public_select
  on public.turmas for select to anon, authenticated
  using (publica = true);

drop policy if exists biblioteca_publicacoes_select on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_select
  on public.biblioteca_publicacoes for select to authenticated, anon
  using (private.biblioteca_can_read_publicacao(id));

drop policy if exists biblioteca_anexos_select on public.biblioteca_anexos;
create policy biblioteca_anexos_select
  on public.biblioteca_anexos for select to authenticated, anon
  using (private.biblioteca_can_read_publicacao(publicacao_id));

drop policy if exists biblioteca_publicacao_turmas_select on public.biblioteca_publicacao_turmas;
create policy biblioteca_publicacao_turmas_select
  on public.biblioteca_publicacao_turmas for select to authenticated, anon
  using (private.biblioteca_can_read_publicacao(publicacao_id));

drop policy if exists biblioteca_storage_select on storage.objects;
create policy biblioteca_storage_select
  on storage.objects for select to authenticated, anon
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
