-- Índices alinhados às consultas observadas no frontend.
-- A migração é somente aditiva; não remove índices existentes.
create index if not exists projetos_dono_updated_at_idx
  on public.projetos (dono_id, updated_at desc);

create index if not exists perfis_student_turma_nome_idx
  on public.perfis (turma_id, nome)
  where role = 'student';

create index if not exists turmas_professor_created_at_idx
  on public.turmas (professor_id, created_at desc);
