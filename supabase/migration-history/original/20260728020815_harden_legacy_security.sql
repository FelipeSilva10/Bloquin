-- Endurece objetos legados expostos pelo Data API.
--
-- O Bloquin atual usa Supabase Auth e auth.uid(). O fluxo antigo de
-- backoffice baseado em app.backoffice_token_hash não é utilizado pelo
-- frontend deste repositório. As tabelas que guardam credenciais, sessões e
-- auditoria passam a ser acessíveis somente por service_role/postgres.

-- As políticas abaixo dependiam de funções SECURITY DEFINER públicas do
-- backoffice legado. Removê-las evita que o cliente comum precise executar
-- funções administrativas para consultar as tabelas ativas do aplicativo.
drop policy if exists bp_aval_admin on public.avaliacoes_submissao;
drop policy if exists bp_aval_teacher on public.avaliacoes_submissao;
drop policy if exists bp_desafios_admin on public.desafios;
drop policy if exists bp_desafios_teacher on public.desafios;
drop policy if exists bp_escola_prof_admin on public.escola_professores;
drop policy if exists bp_escola_prof_teacher on public.escola_professores;
drop policy if exists bp_membros_admin on public.membros_turma;
drop policy if exists bp_membros_teacher on public.membros_turma;
drop policy if exists bp_perfis_admin on public.perfis;
drop policy if exists bp_perfis_teacher on public.perfis;
drop policy if exists bp_projetos_admin on public.projetos;
drop policy if exists bp_projetos_teacher on public.projetos;
drop policy if exists bp_turmas_admin on public.turmas;
drop policy if exists bp_turmas_teacher on public.turmas;

-- Funções com capacidade de ler sessões, apagar usuários ou acessar auth.users
-- não devem ser chamadas via anon/authenticated. O serviço de backend, quando
-- necessário, continua podendo executá-las com service_role.
revoke all on function public.apagar_utilizador(uuid) from public, anon, authenticated;
revoke all on function public.backoffice_actor_id() from public, anon, authenticated;
revoke all on function public.backoffice_actor_type() from public, anon, authenticated;
revoke all on function public.cleanup_backoffice_sessions() from public, anon, authenticated;
revoke all on function public.delete_student_user(uuid) from public, anon, authenticated;
revoke all on function public.is_backoffice_admin() from public, anon, authenticated;
revoke all on function public.professor_turma_ids() from public, anon, authenticated;

grant execute on function public.apagar_utilizador(uuid) to service_role;
grant execute on function public.backoffice_actor_id() to service_role;
grant execute on function public.backoffice_actor_type() to service_role;
grant execute on function public.cleanup_backoffice_sessions() to service_role;
grant execute on function public.delete_student_user(uuid) to service_role;
grant execute on function public.is_backoffice_admin() to service_role;
grant execute on function public.professor_turma_ids() to service_role;

-- Views públicas antigas executavam como SECURITY DEFINER e ignoravam RLS.
-- security_invoker faz a view respeitar as políticas do usuário que consulta.
alter view public.v_alunos set (security_invoker = true);
alter view public.v_turmas_backoffice set (security_invoker = true);
alter view public.v_registro_horas set (security_invoker = true);
alter view public.v_horas_por_professor set (security_invoker = true);

-- A view antiga carregava a senha armazenada no perfil. Mantemos a assinatura
-- legada para não quebrar consumidores internos, mas nunca expomos o valor.
create or replace view public.v_alunos as
select
  p.id,
  p.nome,
  p.email,
  null::text as senha,
  p.role,
  p.turma_id,
  p.entity_status,
  p.access_status,
  p.blocked_at,
  p.blocked_reason,
  p.must_change_senha,
  p.temp_senha_expiry,
  p.created_at,
  p.updated_at,
  coalesce(t.nome, 'Sem Turma'::text) as turma_nome,
  coalesce(e.nome, 'Sem Escola'::text) as escola_nome,
  t.entity_status as turma_status,
  e.entity_status as escola_status
from public.perfis p
left join public.turmas t on p.turma_id = t.id
left join public.escolas e on t.escola_id = e.id
where p.role = 'student'::text;

-- Views administrativas não são consumidas pelo frontend atual. Acesso por
-- REST fica fechado; jobs/Edge Functions com service_role continuam podendo
-- consultá-las.
revoke all on table public.v_alunos from public, anon, authenticated;
revoke all on table public.v_turmas_backoffice from public, anon, authenticated;
revoke all on table public.v_registro_horas from public, anon, authenticated;
revoke all on table public.v_horas_por_professor from public, anon, authenticated;

grant select on table public.v_alunos to service_role;
grant select on table public.v_turmas_backoffice to service_role;
grant select on table public.v_registro_horas to service_role;
grant select on table public.v_horas_por_professor to service_role;

-- Tabelas de credenciais, sessões de backoffice, auditoria e colaboração
-- legada ficam fora do Data API. RLS permanece habilitado como segunda camada.
alter table public.backoffice_admins enable row level security;
alter table public.backoffice_sessions enable row level security;
alter table public.audit_log enable row level security;
alter table public.projeto_colaboradores enable row level security;

revoke all on table public.backoffice_admins from public, anon, authenticated;
revoke all on table public.backoffice_sessions from public, anon, authenticated;
revoke all on table public.audit_log from public, anon, authenticated;
revoke all on table public.projeto_colaboradores from public, anon, authenticated;

grant all on table public.backoffice_admins to service_role;
grant all on table public.backoffice_sessions to service_role;
grant all on table public.audit_log to service_role;
grant all on table public.projeto_colaboradores to service_role;

-- Tabelas acadêmicas que ainda podem ser usadas por uma futura área de
-- presença/diário passam a ter escopo explícito por papel e turma.
alter table public.escolas enable row level security;
alter table public.cronograma_aulas enable row level security;
alter table public.chamadas enable row level security;
alter table public.chamada_presencas enable row level security;
alter table public.diario_aulas enable row level security;

revoke all on table public.escolas from public, anon, authenticated;
revoke all on table public.cronograma_aulas from public, anon, authenticated;
revoke all on table public.chamadas from public, anon, authenticated;
revoke all on table public.chamada_presencas from public, anon, authenticated;
revoke all on table public.diario_aulas from public, anon, authenticated;

grant select, insert, update, delete on table public.escolas to authenticated;
grant select, insert, update, delete on table public.cronograma_aulas to authenticated;
grant select, insert, update, delete on table public.chamadas to authenticated;
grant select, insert, update, delete on table public.chamada_presencas to authenticated;
grant select, insert, update, delete on table public.diario_aulas to authenticated;

grant all on table public.escolas to service_role;
grant all on table public.cronograma_aulas to service_role;
grant all on table public.chamadas to service_role;
grant all on table public.chamada_presencas to service_role;
grant all on table public.diario_aulas to service_role;

-- Permite ao aluno consultar apenas o registro da própria turma. Isso é
-- necessário para as políticas de escola, cronograma, chamadas e diário.
drop policy if exists turmas_student_select on public.turmas;
create policy turmas_student_select
  on public.turmas
  for select
  to authenticated
  using (
    id = (
      select p.turma_id
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'student'
    )
  );

drop policy if exists turmas_app_admin on public.turmas;
create policy turmas_app_admin
  on public.turmas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists escolas_member_select on public.escolas;
create policy escolas_member_select
  on public.escolas
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and (
          p.role = 'admin'
          or exists (
            select 1
            from public.turmas t
            where t.id = p.turma_id
              and t.escola_id = escolas.id
          )
          or exists (
            select 1
            from public.turmas t
            where t.professor_id = (select auth.uid())
              and t.escola_id = escolas.id
          )
        )
    )
  );

drop policy if exists escolas_app_admin on public.escolas;
create policy escolas_app_admin
  on public.escolas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists cronograma_teacher_manage on public.cronograma_aulas;
create policy cronograma_teacher_manage
  on public.cronograma_aulas
  for all
  to authenticated
  using (professor_id = (select auth.uid()))
  with check (professor_id = (select auth.uid()));

drop policy if exists cronograma_student_select on public.cronograma_aulas;
create policy cronograma_student_select
  on public.cronograma_aulas
  for select
  to authenticated
  using (
    turma_id = (
      select p.turma_id
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'student'
    )
  );

drop policy if exists cronograma_app_admin on public.cronograma_aulas;
create policy cronograma_app_admin
  on public.cronograma_aulas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists chamadas_teacher_manage on public.chamadas;
create policy chamadas_teacher_manage
  on public.chamadas
  for all
  to authenticated
  using (professor_id = (select auth.uid()))
  with check (professor_id = (select auth.uid()));

drop policy if exists chamadas_student_select on public.chamadas;
create policy chamadas_student_select
  on public.chamadas
  for select
  to authenticated
  using (
    turma_id = (
      select p.turma_id
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'student'
    )
  );

drop policy if exists chamadas_app_admin on public.chamadas;
create policy chamadas_app_admin
  on public.chamadas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists chamada_presencas_teacher_manage on public.chamada_presencas;
create policy chamada_presencas_teacher_manage
  on public.chamada_presencas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.chamadas c
      where c.id = chamada_presencas.chamada_id
        and c.professor_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.chamadas c
      where c.id = chamada_presencas.chamada_id
        and c.professor_id = (select auth.uid())
    )
  );

drop policy if exists chamada_presencas_student_select on public.chamada_presencas;
create policy chamada_presencas_student_select
  on public.chamada_presencas
  for select
  to authenticated
  using (aluno_id = (select auth.uid()));

drop policy if exists chamada_presencas_app_admin on public.chamada_presencas;
create policy chamada_presencas_app_admin
  on public.chamada_presencas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

drop policy if exists diario_teacher_manage on public.diario_aulas;
create policy diario_teacher_manage
  on public.diario_aulas
  for all
  to authenticated
  using (professor_id = (select auth.uid()))
  with check (professor_id = (select auth.uid()));

drop policy if exists diario_student_select on public.diario_aulas;
create policy diario_student_select
  on public.diario_aulas
  for select
  to authenticated
  using (
    turma_id = (
      select p.turma_id
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'student'
    )
  );

drop policy if exists diario_app_admin on public.diario_aulas;
create policy diario_app_admin
  on public.diario_aulas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
