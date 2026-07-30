-- O Bloquin atual mantém o vínculo do aluno com a turma em perfis.turma_id.
-- A checagem anterior dependia de membros_turma, uma estrutura legada que não
-- é atualizada pelo fluxo atual de cadastro de alunos.
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
