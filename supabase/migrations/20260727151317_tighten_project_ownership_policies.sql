-- Impede que clientes autenticados troquem o dono ou a turma de projetos
-- para fora do escopo da sua função atual.
alter policy "Aluno gerencia seus projetos"
  on public.projetos
  using (
    (select auth.uid()) = dono_id
    and exists (
      select 1
      from public.perfis owner_profile
      where owner_profile.id = (select auth.uid())
        and owner_profile.role = 'student'
    )
  )
  with check (
    (select auth.uid()) = dono_id
    and exists (
      select 1
      from public.perfis owner_profile
      where owner_profile.id = (select auth.uid())
        and owner_profile.role = 'student'
        and owner_profile.turma_id = projetos.turma_id
    )
  );

alter policy "teacher_manages_class_projects"
  on public.projetos
  using (
    (select auth.uid()) = dono_id
    or exists (
      select 1
      from public.turmas classroom
      join public.perfis student_profile
        on student_profile.turma_id = classroom.id
      where classroom.professor_id = (select auth.uid())
        and student_profile.id = projetos.dono_id
    )
  )
  with check (
    exists (
      select 1
      from public.turmas classroom
      where classroom.id = projetos.turma_id
        and classroom.professor_id = (select auth.uid())
    )
    and (
      (select auth.uid()) = dono_id
      or exists (
        select 1
        from public.turmas classroom
        join public.perfis student_profile
          on student_profile.turma_id = classroom.id
        where classroom.professor_id = (select auth.uid())
          and student_profile.id = projetos.dono_id
      )
    )
  );
