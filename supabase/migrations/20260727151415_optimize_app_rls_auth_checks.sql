-- Mantém o mesmo conjunto de linhas autorizado, mas inicializa auth.uid()
-- uma vez por consulta em vez de uma vez por linha.
alter policy "Professor lê perfis da sua turma"
  on public.perfis
  using (
    turma_id in (
      select turmas.id
      from public.turmas
      where turmas.professor_id = (select auth.uid())
    )
  );

alter policy "Usuário lê seu próprio perfil"
  on public.perfis
  using ((select auth.uid()) = id);

alter policy "Professor lê projetos da sua turma"
  on public.projetos
  using (
    turma_id in (
      select turmas.id
      from public.turmas
      where turmas.professor_id = (select auth.uid())
    )
  );

alter policy "Professor lê suas turmas"
  on public.turmas
  using (professor_id = (select auth.uid()));

alter policy "user_sessions_self"
  on public.user_sessions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "user_sessions_teacher_read"
  on public.user_sessions
  using (
    exists (
      select 1
      from public.perfis
      where perfis.id = (select auth.uid())
        and perfis.role = 'teacher'
    )
  );
