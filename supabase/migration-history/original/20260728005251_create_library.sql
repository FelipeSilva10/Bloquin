-- Biblioteca: publicações editoriais compartilhadas com turmas.
-- Mídias binárias ficam em bucket privado; vídeos do YouTube armazenam apenas
-- metadados e o ID externo.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.biblioteca_publicacoes (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfis(id) on delete cascade,
  autor_nome text not null default 'Professor' check (char_length(btrim(autor_nome)) between 1 and 120),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 180),
  conteudo_json jsonb not null default '{}'::jsonb,
  conteudo_texto text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  capa_anexo_id uuid,
  publicado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz
);

create table if not exists public.biblioteca_publicacao_turmas (
  publicacao_id uuid not null references public.biblioteca_publicacoes(id) on delete cascade,
  turma_id uuid not null references public.turmas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (publicacao_id, turma_id)
);

create table if not exists public.biblioteca_anexos (
  id uuid primary key default gen_random_uuid(),
  publicacao_id uuid not null references public.biblioteca_publicacoes(id) on delete cascade,
  tipo text not null check (tipo in ('image', 'pdf', 'youtube', 'link')),
  provider text,
  titulo text,
  descricao text,
  ordem integer not null default 0 check (ordem >= 0),
  pode_baixar boolean not null default true,
  mime_type text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  largura integer check (largura is null or largura > 0),
  altura integer check (altura is null or altura > 0),
  quantidade_paginas integer check (quantidade_paginas is null or quantidade_paginas > 0),
  storage_path text,
  thumbnail_path text,
  original_path text,
  external_url text,
  external_id text,
  status text not null default 'ready' check (status in ('uploading', 'ready', 'failed')),
  criado_em timestamptz not null default now(),
  constraint biblioteca_anexos_tipo_payload_check check (
    (tipo in ('image', 'pdf') and storage_path is not null)
    or (tipo = 'youtube' and provider = 'youtube' and external_id is not null and external_url is not null)
    or (tipo = 'link' and external_url is not null)
  )
);

alter table public.biblioteca_publicacoes
  add constraint biblioteca_publicacoes_capa_fk
  foreign key (capa_anexo_id) references public.biblioteca_anexos(id) on delete set null;

create index if not exists biblioteca_publicacoes_feed_idx
  on public.biblioteca_publicacoes(status, publicado_em desc, id desc)
  where excluido_em is null;

create index if not exists biblioteca_publicacoes_autor_idx
  on public.biblioteca_publicacoes(autor_id, criado_em desc)
  where excluido_em is null;

create index if not exists biblioteca_publicacao_turmas_turma_idx
  on public.biblioteca_publicacao_turmas(turma_id, publicacao_id);

create index if not exists biblioteca_anexos_publicacao_ordem_idx
  on public.biblioteca_anexos(publicacao_id, ordem, id);

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
      and publication.excluido_em is null
      and (
        publication.autor_id = (select auth.uid())
        or (
          publication.status = 'published'
          and exists (
            select 1
            from public.biblioteca_publicacao_turmas target
            join public.membros_turma membership
              on membership.turma_id = target.turma_id
             and membership.utilizador_id = (select auth.uid())
            join public.perfis student
              on student.id = membership.utilizador_id
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
    join public.perfis profile on profile.id = (select auth.uid())
    where publication.id = p_publicacao_id
      and publication.autor_id = (select auth.uid())
      and profile.role = 'teacher'
      and publication.excluido_em is null
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
    join public.perfis profile on profile.id = (select auth.uid())
    where classroom.id = p_turma_id
      and classroom.professor_id = (select auth.uid())
      and profile.role = 'teacher'
  );
$$;

revoke all on function private.biblioteca_can_read_publicacao(uuid) from public;
revoke all on function private.biblioteca_can_manage_publicacao(uuid) from public;
revoke all on function private.biblioteca_can_manage_turma(uuid) from public;
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
    autor_id = (select auth.uid())
    and exists (
      select 1 from public.perfis
      where id = (select auth.uid()) and role = 'teacher'
    )
  );

drop policy if exists biblioteca_publicacoes_update on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_update
  on public.biblioteca_publicacoes for update to authenticated
  using (private.biblioteca_can_manage_publicacao(id))
  with check (
    autor_id = (select auth.uid())
    and private.biblioteca_can_manage_publicacao(id)
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
  with check (private.biblioteca_can_manage_publicacao(publicacao_id));

drop policy if exists biblioteca_anexos_update on public.biblioteca_anexos;
create policy biblioteca_anexos_update
  on public.biblioteca_anexos for update to authenticated
  using (private.biblioteca_can_manage_publicacao(publicacao_id))
  with check (private.biblioteca_can_manage_publicacao(publicacao_id));

drop policy if exists biblioteca_anexos_delete on public.biblioteca_anexos;
create policy biblioteca_anexos_delete
  on public.biblioteca_anexos for delete to authenticated
  using (private.biblioteca_can_manage_publicacao(publicacao_id));

grant select, insert, update, delete on public.biblioteca_publicacoes to authenticated;
grant select, insert, delete on public.biblioteca_publicacao_turmas to authenticated;
grant select, insert, update, delete on public.biblioteca_anexos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'biblioteca-media',
  'biblioteca-media',
  false,
  26214400,
  array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists biblioteca_storage_insert on storage.objects;
create policy biblioteca_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'biblioteca-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.perfis
      where id = (select auth.uid()) and role = 'teacher'
    )
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
