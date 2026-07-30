-- Valida payloads de anexos mesmo quando a API é chamada sem o frontend.
alter table public.biblioteca_anexos
  drop constraint if exists biblioteca_anexos_tipo_payload_check;

alter table public.biblioteca_anexos
  add constraint biblioteca_anexos_tipo_payload_check check (
    (tipo in ('image', 'pdf') and storage_path is not null)
    or (
      tipo = 'youtube'
      and provider = 'youtube'
      and external_id ~ '^[A-Za-z0-9_-]{11}$'
      and external_url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
    )
    or (
      tipo = 'link'
      and external_url ~* '^https?://[^[:space:]]+$'
    )
  );

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
