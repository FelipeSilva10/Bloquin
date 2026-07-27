-- Operações de projetos executadas no banco para que exclusão e
-- compartilhamento sejam atômicos e não dependam de políticas RLS do cliente.

alter table public.projetos
  add column if not exists shared_from uuid references public.projetos(id) on delete set null;

create index if not exists projetos_shared_from_idx
  on public.projetos(shared_from);

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'projetos'
  ) then
    alter publication supabase_realtime add table public.projetos;
  end if;
end;
$$;

create or replace function public.delete_project(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  project_owner_id uuid;
  deleted_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sessão não encontrada.' using errcode = '42501';
  end if;

  select dono_id
    into project_owner_id
    from public.projetos
   where id = p_project_id;

  if project_owner_id is null then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;

  if project_owner_id <> current_user_id and not exists (
    select 1
      from public.perfis student_profile
      join public.turmas classroom on classroom.id = student_profile.turma_id
     where student_profile.id = project_owner_id
       and student_profile.role = 'student'
       and classroom.professor_id = current_user_id
  ) then
    raise exception 'Você não tem permissão para excluir este projeto.' using errcode = '42501';
  end if;

  delete from public.projetos
   where id = p_project_id
  returning id into deleted_project_id;

  if deleted_project_id is null then
    raise exception 'O projeto não pôde ser excluído.' using errcode = 'P0001';
  end if;

  return deleted_project_id;
end;
$$;

create or replace function public.share_project(
  p_source_project_id uuid,
  p_target_user_ids uuid[],
  p_target_turma_id uuid,
  p_new_name text default null
)
returns setof public.projetos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  source_project public.projetos%rowtype;
  unique_target_ids uuid[];
  student_count integer;
  copy_name text;
  now_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Sessão não encontrada.' using errcode = '42501';
  end if;

  if p_target_user_ids is null or cardinality(p_target_user_ids) = 0 then
    raise exception 'Selecione pelo menos um aluno.' using errcode = '22023';
  end if;

  select array_agg(distinct target_id)
    into unique_target_ids
    from unnest(p_target_user_ids) as targets(target_id);

  if not exists (
    select 1
      from public.perfis teacher_profile
     where teacher_profile.id = current_user_id
       and teacher_profile.role = 'teacher'
  ) then
    raise exception 'Apenas professores podem compartilhar projetos.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.turmas classroom
     where classroom.id = p_target_turma_id
       and classroom.professor_id = current_user_id
  ) then
    raise exception 'A turma selecionada não pertence ao professor.' using errcode = '42501';
  end if;

  select project.*
    into source_project
    from public.projetos project
   where project.id = p_source_project_id
     and project.dono_id = current_user_id;

  if not found then
    raise exception 'Projeto de origem não encontrado.' using errcode = 'P0002';
  end if;

  select count(*)
    into student_count
    from public.perfis student_profile
   where student_profile.id = any(unique_target_ids)
     and student_profile.turma_id = p_target_turma_id
     and student_profile.role = 'student';

  if student_count <> cardinality(unique_target_ids) then
    raise exception 'Um ou mais alunos não pertencem à turma selecionada.' using errcode = '42501';
  end if;

  copy_name := coalesce(nullif(trim(p_new_name), ''), '[Compartilhado] ' || source_project.nome);

  return query
  insert into public.projetos (
    dono_id,
    turma_id,
    nome,
    descricao,
    target_board,
    workspace_data,
    shared_from,
    created_at,
    updated_at
  )
  select
    target_id,
    p_target_turma_id,
    copy_name,
    coalesce(source_project.descricao, ''),
    source_project.target_board,
    source_project.workspace_data,
    p_source_project_id,
    now_at,
    now_at
    from unnest(unique_target_ids) as targets(target_id)
  returning *;
end;
$$;

revoke all on function public.delete_project(uuid) from public;
revoke all on function public.share_project(uuid, uuid[], uuid, text) from public;
grant execute on function public.delete_project(uuid) to authenticated;
grant execute on function public.share_project(uuid, uuid[], uuid, text) to authenticated;
