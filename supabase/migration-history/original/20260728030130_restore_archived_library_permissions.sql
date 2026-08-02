-- Proprietários professores também precisam gerenciar publicações arquivadas
-- para que restauração e exclusão definitiva funcionem com o mesmo RLS.
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
