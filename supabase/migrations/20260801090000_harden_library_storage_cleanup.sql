-- Mantém o bucket privado da Biblioteca reproduzível em ambientes novos e
-- permite ao professor limpar objetos do próprio diretório depois que o
-- registro do anexo for removido. Alunos continuam acessando apenas arquivos
-- vinculados a publicações liberadas para sua turma.

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

-- As políticas abaixo localizam o anexo pelo caminho do objeto. Índices
-- parciais evitam varreduras completas conforme o mural acumula materiais.
create index if not exists biblioteca_anexos_storage_path_idx
  on public.biblioteca_anexos (storage_path)
  where storage_path is not null;

create index if not exists biblioteca_anexos_thumbnail_path_idx
  on public.biblioteca_anexos (thumbnail_path)
  where thumbnail_path is not null;

create index if not exists biblioteca_anexos_original_path_idx
  on public.biblioteca_anexos (original_path)
  where original_path is not null;

-- O filtro por tipo consulta primeiro os anexos correspondentes e depois as
-- publicações. Manter o id da publicação no mesmo índice reduz I/O e evita uma
-- ordenação/lookup adicional à medida que o mural cresce.
create index if not exists biblioteca_anexos_tipo_publicacao_idx
  on public.biblioteca_anexos (tipo, publicacao_id);

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
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select private.current_profile_role()) = 'teacher'
      )
      or exists (
        select 1
          from public.biblioteca_anexos attachment
         where (
           attachment.storage_path = storage.objects.name
           or attachment.thumbnail_path = storage.objects.name
           or attachment.original_path = storage.objects.name
         )
           and private.biblioteca_can_read_publicacao(attachment.publicacao_id)
      )
    )
  );

drop policy if exists biblioteca_storage_delete on storage.objects;
create policy biblioteca_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'biblioteca-media'
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select private.current_profile_role()) = 'teacher'
      )
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
