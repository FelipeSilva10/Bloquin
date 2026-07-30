# Auditoria de Supabase, segurança e arquitetura do Bloquin

> **Documento histórico.** Este relatório retrata o estado de 27/07/2026,
> anterior à reconciliação do baseline e ao hardening do Lote 1. Para o estado
> vigente de perfis, sessões, grants, migrations e da RPC
> `delete_student_user`, consulte
> `supabase/LOT1_FINAL_REPORT.md` e `supabase/LOT1_BASELINE.md`.

**Data:** 27/07/2026
**Escopo:** schema, views, RPCs, funções, triggers, índices, constraints, foreign keys, policies, RLS, permissões, storage, migrations e fluxos de persistência.
**Projeto:** iabajqkkodldjwcgvpiz

Esta auditoria não removeu objetos, não executou reset e não alterou o painel administrativo sem confirmação de seus consumidores.

## Estado geral

O banco possui uma arquitetura híbrida:

- autenticação do aplicativo pelo Supabase Auth, com auth.uid();
- perfis de aluno/professor em public.perfis;
- RLS nas tabelas principais do aplicativo;
- backoffice legado baseado em app.backoffice_token_hash e helpers SECURITY DEFINER;
- tabelas e views administrativas ainda expostas no schema public;
- histórico remoto de migrations incompleto em relação aos objetos existentes.

Inventário: **17 tabelas públicas**, **8 com RLS**, **9 sem RLS**, **4 views públicas**, **11 funções públicas**, extensões padrão do Supabase e nenhum bucket de Storage utilizado pela aplicação.

O risco arquitetural central é a coexistência de duas superfícies de autorização: o aplicativo usa JWT/RLS e o painel administrativo usa token em GUC. Essa coexistência precisa ser preservada durante a migração, mas hoje deixa objetos legados acessíveis diretamente pela API REST.

## Tabelas, constraints, FKs e índices

| Tabela | RLS | Observação | Prioridade |
|---|---:|---|---:|
| public.perfis | Sim | Perfis, dados de login legados e status de bloqueio | P0 |
| public.projetos | Sim | Projetos do IDE e compartilhamento | P1 |
| public.turmas | Sim | Turmas do professor | P1 |
| public.membros_turma | Sim | Associação usuário/turma | P1 |
| public.desafios | Sim | Desafios por turma | P1 |
| public.avaliacoes_submissao | Sim | Avaliações | P1 |
| public.escola_professores | Sim | Relação escola/professor | P1 |
| public.user_sessions | Sim | Sessão e heartbeat | P1 |
| public.audit_log | Não | Auditoria administrativa, payload JSONB | P0 |
| public.backoffice_admins | Não | Administradores legados, coluna senha | P0 |
| public.backoffice_sessions | Não | Sessões por hash de token | P0 |
| public.chamada_presencas | Não | Presença | P0 |
| public.chamadas | Não | Aulas/chamadas | P0 |
| public.cronograma_aulas | Não | Cronograma | P0 |
| public.diario_aulas | Não | Diário de aulas | P0 |
| public.escolas | Não | Escolas e status administrativos | P0 |
| public.projeto_colaboradores | Não | Colaboradores de projetos | P0 |

As 9 tabelas sem RLS têm grants diretos para anon e authenticated, portanto o Data API não fornece isolamento efetivo entre professor, aluno e administrador. Não habilitei RLS nelas sem conhecer as consultas do painel.

As FKs principais são coerentes: perfis.id -> auth.users.id em cascata, projetos ligados a dono/turma, turmas ligadas a professor/escola e projeto_original_id com SET NULL. A checagem dos projetos atuais encontrou **0 registros inconsistentes**.

O advisor encontrou 14 FKs sem índice de cobertura: avaliacoes_submissao.avaliador_id, avaliacoes_submissao.desafio_id, avaliacoes_submissao.projeto_submetido_id, chamada_presencas.aluno_id, chamadas.cronograma_id, chamadas.turma_id, desafios.criador_id, desafios.turma_id, escola_professores.escola_id, membros_turma.utilizador_id, projeto_colaboradores.utilizador_id, projetos.projeto_original_id, projetos.turma_id e turmas.escola_id. Também há 16 índices não utilizados e um índice único duplicado em chamada_presencas: chamada_presencas_chamada_aluno_unique e chamada_presencas_unico.

Não removi índices/constraints: isso é mutável e precisa de métricas e homologação.

Triggers de atualização encontrados: trg_diario_updated_at, trg_escolas_updated, trg_perfis_updated e trg_turmas_updated, todos usando set_updated_at(). Os demais triggers são do sistema Supabase.

Schemas não sistêmicos encontrados: auth, extensions, graphql, graphql_public, public, realtime, storage, supabase_migrations e vault. Extensões: pg_stat_statements, pgcrypto, plpgsql, supabase_vault e uuid-ossp.

## Views

As quatro views públicas são owned by postgres, possuem leitura para anon e authenticated e estão no comportamento padrão de view SECURITY DEFINER; portanto podem ignorar o RLS das tabelas subjacentes.

| View | Definição/tabelas | Consumidores locais | Risco/recomendação |
|---|---|---|---|
| public.v_alunos | perfis p filtrado por role = student, com LEFT JOIN em turmas t e escolas e; retorna identidade, turma, escola e status | Nenhum encontrado; painel externo é possível consumidor | **P0:** retorna email, senha, temp_senha_expiry, must_change_senha, blocked_at, blocked_reason, entity_status e access_status. Remover credenciais da resposta e limitar a leitura após confirmar o painel |
| public.v_turmas_backoffice | Junta turmas, perfis, escolas, membros_turma e conta alunos | Nenhum encontrado; provável backoffice | **P1:** dados escolares sem isolamento por ator; migrar para endpoint/view administrativa |
| public.v_registro_horas | Junta chamadas, perfis, turmas, escolas, cronograma_aulas e chamada_presencas | Nenhum encontrado; provável relatório externo | **P1:** bypass de RLS; usar security_invoker ou RPC administrativa |
| public.v_horas_por_professor | Agrega v_registro_horas por professor | Nenhum encontrado | **P1:** herda o bypass; revisar junto com v_registro_horas |

v_alunos é o caso mais grave: a view é consultável por cliente anônimo e expõe credenciais/status de autenticação que não são necessários para listar alunos. Não alterei automaticamente o nome ou os campos para não quebrar o painel. A correção compatível deve criar uma resposta mínima sem senha/senha temporária, confirmar os campos usados pelo painel e só então retirar a view legada.

## Funções RPC

Todas as funções públicas são owned by postgres. O search_path foi fixado para impedir resolução de objetos controlada pelo chamador.

| Assinatura | Segurança/search_path/roles | Validações e tabelas | Risco/recomendação |
|---|---|---|---|
| apagar_utilizador(uuid) | Definer; pg_catalog, public; anon/authenticated | Deleta diretamente de auth.users; sem validação do chamador | **P0:** exclusão arbitrária. Exigir admin derivado da sessão e retirar do schema público |
| backoffice_actor_id() | Stable definer; pg_catalog, public; anon/authenticated | Lê backoffice_sessions pelo hash GUC e validade | Helper legado necessário, mas exposto; mover/restringir |
| backoffice_actor_type() | Stable definer; pg_catalog, public; anon/authenticated | Deriva tipo pelo helper anterior | Mesmo risco; mover/restringir |
| cleanup_backoffice_sessions() | Definer; pg_catalog, public; anon/authenticated | Deleta sessões expiradas | **P0/P1:** mutação administrativa sem autorização interna; usar cron/service role ou validar admin |
| delete_project(uuid) | Definer; pg_catalog, public; anon revogado, authenticated mantido | Valida auth.uid(), dono/professor e deleta projetos | Corrigida; manter testes negativos |
| delete_student_user(uuid) | Definer; pg_catalog, public; anon/authenticated | Referencia projects, classroom_students e profiles, inexistentes | **P1:** função destrutiva quebrada; não chamar, confirmar consumidor e substituir/revogar |
| encerrar_escola(uuid,text,text) | Invoker; public, pg_catalog; anon/authenticated | Atualiza perfis, turmas, escolas, audit_log; confia nos parâmetros de ator | **P0:** sem autorização interna; validar sessão/admin |
| is_backoffice_admin() | Stable definer; pg_catalog, public; anon/authenticated | Compara tipo do ator com admin; usada em policies | Helper de policy; restringir após separar backoffice |
| professor_turma_ids() | Stable definer; pg_catalog, public; anon/authenticated | Lista turmas do ator; usada em policies | Restringir ao backoffice |
| share_project(uuid,uuid[],uuid,text) | Definer; pg_catalog, public; anon revogado, authenticated mantido | Valida sessão, professor, turma, projeto fonte e alunos; insere cópias em projetos | Corrigida; manter testes de escopo |
| set_updated_at() | Invoker; pg_catalog, public; execução direta sem utilidade de negócio | Trigger de timestamps | Baixo risco; revogar execução de API durante normalização de grants |

Professor, student e admin não são roles PostgreSQL: são valores de perfis.role ou tipos derivados do token de backoffice. O isolamento precisa ser feito por auth.uid(), policies e validações internas, não por GRANT nesses nomes.

## Matriz de permissões

| Objeto/superfície | SELECT | INSERT/UPDATE/DELETE | EXECUTE | anon | authenticated | professor/aluno/admin | service_role |
|---|---|---|---|---|---|---|---|
| 8 tabelas com RLS | Grant existe, filtrado por policy | Grants existem, filtrados por USING/WITH CHECK | — | Sem JWT; caminho legado só se GUC reconhecer | JWT + policies do app | Role de negócio filtrada por perfis.role; admin via token | Bypass RLS |
| 9 tabelas sem RLS | Permitido por grant | Permitido por grant | — | Acesso direto via API | Acesso direto via API | Sem isolamento efetivo | Bypass RLS |
| Views públicas | SELECT concedido | ACL amplo, sujeito a updatability | — | Consulta pública, inclusive v_alunos | Consulta autenticada | Nenhuma separação confiável | Acesso total |
| delete_project/share_project | — | — | Sim | Revogado | Sim, com validações internas | Professor autenticado no RPC | Sim |
| RPCs administrativas legadas | — | — | Sim | 7 definers ainda executáveis | 9 definers executáveis | Depende da validação interna; algumas ausentes | Sim |
| Storage | Nenhum bucket/objeto/policy | Sem uso | — | Sem dados | Sem dados | Sem dados | Administração |

Todos os 17 objetos de tabela têm grants de API amplos; nas tabelas RLS isso não equivale a acesso a linhas, mas nas demais equivale. service_role é confiável apenas em servidor/automação e nunca deve ser embutido no Desktop.

## RLS e policies

As 8 tabelas protegidas possuem policies, porém todas aparecem com roles = {public}. Isso acomoda o backoffice por GUC, mas gera 55 grupos de policies permissivas sobrepostas no advisor. Não consolidei as policies porque misturar app JWT e backoffice poderia bloquear o painel.

As policies do aplicativo foram endurecidas:

- aluno só gerencia projeto cujo dono seja ele e cuja turma seja a sua;
- professor só gerencia projetos de turmas em que turmas.professor_id = auth.uid();
- a policy não depende mais de perfis.turma_id do professor;
- auth.uid() foi convertido para (select auth.uid()) nas policies do app.

O advisor não reporta mais auth_rls_initplan. As policies de backoffice e as 9 tabelas sem RLS permanecem como trabalho de migração.

## Storage, Realtime e dependências externas

Storage está habilitado com limite de 50 MiB, mas não há buckets, objetos nem policies. O aplicativo não usa Storage.

A publicação supabase_realtime contém public.projetos e public.user_sessions, coerente com projetos e heartbeat de sessão.

O único consumidor externo identificado no código é o painel aberto pelo Tauri em https://sagsite.vercel.app/login?next=/, que recebe tokens Supabase. Como seu código não está no repositório, views/RPCs de backoffice foram tratadas como potencialmente consumidas e não removidas.

## Fluxos de persistência

- **Login:** signInWithPassword, upsert em user_sessions, leitura de perfis e decisão por role. Consistente.
- **Sessão:** heartbeat periódico, token local, validação e Realtime em user_sessions. Consistente.
- **Perfil/turma:** dashboards consultam perfis/turmas com usuário autenticado e RLS.
- **Projetos:** leitura/edição direta com RLS; exclusão via delete_project.
- **Criação:** insert em projetos, sujeito a vínculo aluno/turma.
- **Compartilhamento:** share_project autenticado pelo professor.
- **IDE/sincronização/upload:** carrega/atualiza workspace e passa pela barreira de setup do backend antes do upload.
- **Logout:** limpa estado local e a sessão do aplicativo.

Não há chamadas locais às views de backoffice. Também não foram encontrados consumidores locais de supabaseHelper, ProjectService.getClassroomStudents ou ProjectService.getStudentProjects; eles não foram removidos por possível uso externo.

## Migrations

Histórico remoto atual:

1. 20260727144628_add_audit_query_indexes
2. 20260727151053_harden_project_rpc_privileges_and_search_paths
3. 20260727151317_tighten_project_ownership_policies
4. 20260727151415_optimize_app_rls_auth_checks

O repositório também contém 20260727000000_project_management.sql, que criou/aplicou manualmente objetos de projetos/Realtime/RPCs, mas essa migration inicial não aparece no histórico remoto. Não há supabase/config.toml, supabase/schemas nem CLI instalada. Portanto há drift de governança e não é seguro executar supabase db push agora.

Plano sem reset:

1. instalar CLI suportada e executar supabase init sem sobrescrever migrations;
2. supabase link --project-ref iabajqkkodldjwcgvpiz;
3. gerar/revisar baseline com supabase db pull;
4. reconciliar a baseline com a migration manual, preservando dados e evitando drops automáticos;
5. homologar em branch/staging;
6. usar somente migrations versionadas no futuro.

## Problemas por prioridade

### P0

- v_alunos expõe senha e dados de senha/status para clientes API.
- 9 tabelas públicas sem RLS permitem acesso direto conforme grants.
- apagar_utilizador(uuid) pode apagar qualquer usuário sem autorização.
- encerrar_escola(...) altera dados administrativos sem autorização interna e confia em parâmetros do cliente.

### P1

- Quatro views públicas SECURITY DEFINER não isolam atores.
- cleanup_backoffice_sessions() é mutação administrativa executável por roles de API.
- delete_student_user(uuid) é destrutiva, quebrada e exposta.
- Helpers de backoffice são executáveis por anon/authenticated.
- Histórico remoto não representa a criação inicial do schema.
- Grants/default privileges de public são amplos demais para evolução segura.

### P2

- 55 grupos de policies sobrepostas.
- 14 FKs sem índices de cobertura.
- 16 índices não utilizados e índice único duplicado em chamada_presencas.
- Código local sem consumidores encontrados, ainda não removido.

### P3

- Ativar proteção contra senhas vazadas no Auth.
- Documentar papéis de negócio e contrato do painel.
- Criar testes negativos para cada RPC/tabela exposta.
- Monitorar advisors e registrar todas as alterações.

## Alterações implementadas

Migrations aplicadas remotamente e registradas localmente:

- 20260727144628_add_audit_query_indexes.sql: índices seguros para auditoria e consultas principais.
- 20260727151053_harden_project_rpc_privileges_and_search_paths.sql: search_path explícito nas funções e revogação de anon em delete_project/share_project.
- 20260727151317_tighten_project_ownership_policies.sql: impede troca de dono/turma fora do escopo do aluno/professor.
- 20260727151415_optimize_app_rls_auth_checks.sql: inicializa auth.uid() uma vez por consulta nas policies do app.

Verificações:

- projetos inconsistentes: 0;
- delete_project: anon = false, authenticated = true;
- share_project: anon = false, authenticated = true;
- migration remota mais recente: 20260727151415;
- advisor não reporta mais auth_rls_initplan.

## Alterações recomendadas, não aplicadas

Não foram aplicadas sem homologação: habilitar RLS nas 9 tabelas legadas; alterar/remover as 4 views; revogar globalmente RPCs administrativas; ajustar default privileges; remover funções/views/índices aparentemente legados; ativar proteção contra senhas vazadas; consolidar policies.

Essas mudanças podem quebrar o painel, relatórios ou integrações externas. A primeira etapa é capturar o contrato real do painel e criar uma migration por domínio.

## Compatibilidade e próximos passos

As alterações implementadas preservam Desktop, autenticação, projetos, compartilhamento, sincronização e upload. As RPCs de projeto continuam disponíveis para usuários autenticados; somente o caminho anônimo foi fechado.

Próximas ações prioritárias:

1. confirmar quais views/RPCs/tabelas o painel externo consome;
2. remover credenciais de v_alunos em alteração compatível;
3. corrigir apagar_utilizador e encerrar_escola com autorização derivada da sessão;
4. isolar o backoffice em schema/papel próprios e habilitar RLS por etapas;
5. normalizar a baseline de migrations;
6. ativar proteção contra senhas vazadas no dashboard do Supabase.
