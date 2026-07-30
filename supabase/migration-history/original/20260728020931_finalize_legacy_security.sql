-- Finaliza a remoção dos avisos de segurança dos objetos legados.

-- CREATE OR REPLACE VIEW redefine as opções da view; reaplica a proteção
-- depois de remover a coluna de senha real da definição.
alter view public.v_alunos set (security_invoker = true);

-- Políticas deny explícitas documentam que estes objetos não fazem parte do
-- Data API do aplicativo. service_role/postgres continuam fora deste escopo
-- porque são os papéis de backend e proprietário do banco.
drop policy if exists audit_log_data_api_deny on public.audit_log;
create policy audit_log_data_api_deny
  on public.audit_log
  for all
  to public
  using (false)
  with check (false);

drop policy if exists backoffice_admins_data_api_deny on public.backoffice_admins;
create policy backoffice_admins_data_api_deny
  on public.backoffice_admins
  for all
  to public
  using (false)
  with check (false);

drop policy if exists backoffice_sessions_data_api_deny on public.backoffice_sessions;
create policy backoffice_sessions_data_api_deny
  on public.backoffice_sessions
  for all
  to public
  using (false)
  with check (false);

drop policy if exists projeto_colaboradores_data_api_deny on public.projeto_colaboradores;
create policy projeto_colaboradores_data_api_deny
  on public.projeto_colaboradores
  for all
  to public
  using (false)
  with check (false);

drop policy if exists avaliacoes_submissao_data_api_deny on public.avaliacoes_submissao;
create policy avaliacoes_submissao_data_api_deny
  on public.avaliacoes_submissao
  for all
  to public
  using (false)
  with check (false);

drop policy if exists desafios_data_api_deny on public.desafios;
create policy desafios_data_api_deny
  on public.desafios
  for all
  to public
  using (false)
  with check (false);

drop policy if exists escola_professores_data_api_deny on public.escola_professores;
create policy escola_professores_data_api_deny
  on public.escola_professores
  for all
  to public
  using (false)
  with check (false);

drop policy if exists membros_turma_data_api_deny on public.membros_turma;
create policy membros_turma_data_api_deny
  on public.membros_turma
  for all
  to public
  using (false)
  with check (false);

-- Estas RPCs continuam atômicas, mas não precisam de privilégios elevados:
-- as validações de autoria e as políticas de projetos permitem exatamente as
-- mesmas operações ao usuário autenticado que as chama.
alter function public.delete_project(uuid) security invoker;
alter function public.share_project(uuid, uuid[], uuid, text) security invoker;
