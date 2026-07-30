-- Permite que o professor proprietário consulte e restaure publicações arquivadas.
-- Alunos continuam vendo somente publicações publicadas e não arquivadas.

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
  );
$$;

