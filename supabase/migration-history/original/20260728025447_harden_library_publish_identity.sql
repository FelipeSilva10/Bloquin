-- Centraliza a autorização da Biblioteca nos helpers privados já usados pelo
-- restante do projeto e evita uma leitura de perfis sujeita a outra policy.
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
    where classroom.id = p_turma_id
      and classroom.professor_id = (select auth.uid())
      and (select private.current_profile_role()) = 'teacher'
  );
$$;

drop policy if exists biblioteca_publicacoes_insert on public.biblioteca_publicacoes;
create policy biblioteca_publicacoes_insert
  on public.biblioteca_publicacoes for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and autor_id = (select auth.uid())
    and (select private.current_profile_role()) = 'teacher'
  );
