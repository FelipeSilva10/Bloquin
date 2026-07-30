# Lote 1 — baseline e segurança de perfis/sessões

## Estratégia adotada

O histórico remoto possui 15 versões, mas o working tree começava por uma
migration que alterava tabelas nunca criadas localmente. A primeira tentativa
de `supabase start` confirmou a falha em `public.projetos`.

A reconciliação usa um baseline compatível com o histórico:

1. O dump remoto de `public/private` foi colocado, sem alteração de DDL, em
   `20260727144628_add_audit_query_indexes.sql`, a primeira versão registrada
   remotamente.
2. `supabase/roles.sql` remove, antes da criação dos objetos, grants herdados
   do banco local. O próprio dump reaplica os grants finais comprovados.
3. As 14 versões remotas seguintes continuam no diretório ativo como
   marcadores. Assim, um banco novo registra as mesmas versões sem reaplicar
   operações já consolidadas no snapshot.
4. Os 18 SQLs incrementais originais foram preservados integralmente em
   `supabase/migration-history/original`.
5. Migrations ausentes do histórico remoto não permanecem na cadeia ativa.
6. `20260730144836_harden_profiles_and_sessions.sql` é a primeira alteração
   nova e incremental do lote.
7. `20260730154141_drop_obsolete_delete_student_user.sql` remove, sem
   `CASCADE`, a RPC quebrada `delete_student_user(uuid)` depois da auditoria
   de consumidores e dependências.

O dump recebido tem SHA-256
`360fdc73d3947fc73b83cc2a9930441a005073f761527aae16715d160be54523`.
O baseline ativo tem SHA-256
`743ff8b1a954a8eab4551d1adf52116b253ff07a9caf0eea2a2531a8a195ccbd`.
O diff contém apenas normalização de whitespace em linhas vazias; todos os
comandos SQL são idênticos.

O `roles.sql` é necessário porque um schema-only dump registra os grants
finais, mas não revoga privilégios herdados dos defaults do banco de destino.
Sem essa pré-condição, o mesmo DDL produz ACLs diferentes em um reset novo.

Esse baseline serve para criar ambientes novos. Ele não deve ser executado
contra o projeto existente: a versão `20260727144628` já está registrada como
aplicada no remoto.

## Classificação das migrations encontradas

“Superseded” abaixo significa que o SQL incremental foi substituído por uma
versão posterior. O arquivo continua válido como evidência histórica, mas não
deve ser reaplicado depois do snapshot.

| Migration | Classificação principal | Evidência e classificação secundária |
| --- | --- | --- |
| `20260727000000_project_management` | Aplicada manualmente fora do histórico | `shared_from`, RPCs, índice e publicação Realtime existem; a versão não aparece em `schema_migrations`. |
| `20260727144628_add_audit_query_indexes` | Aplicada e representada no histórico | Os três índices existem; agora é também a versão portadora do baseline. |
| `20260727151053_harden_project_rpc_privileges_and_search_paths` | Aplicada e representada no histórico | `search_path` e grants das RPCs aparecem no dump. |
| `20260727151317_tighten_project_ownership_policies` | Aplicada e representada no histórico | As expressões finais das policies de projetos estão no dump. |
| `20260727151415_optimize_app_rls_auth_checks` | Aplicada e representada no histórico | As policies usam os `initplan` de `auth.uid()`; a parte de sessões é superseded pelo Lote 1. |
| `20260728005251_create_library` | Aplicada e representada no histórico | Tabelas, FKs e objetos `public/private` existem. O estado atual de Storage não foi incluído no dump fornecido. |
| `20260728014634_library_archive_restore` | Aplicada e representada no histórico | Helpers foram posteriormente superseded. |
| `20260728014958_library_payload_hardening` | Aplicada e representada no histórico | Constraints e checks endurecidos aparecem no schema final. |
| `20260728015220_library_metadata_limits` | Aplicada e representada no histórico | Limites de metadados aparecem no constraint atual. |
| `20260728020815_harden_legacy_security` | Aplicada e representada no histórico | RLS, views e policies legadas aparecem no dump. |
| `20260728020931_finalize_legacy_security` | Aplicada e representada no histórico | Policies deny, views invoker e RPCs invoker estão presentes. |
| `20260728021256_fix_rls_policy_recursion` | Aplicada e representada no histórico | Helpers privados e policies de turma existem; o helper de role foi depois substituído. |
| `20260728021442_add_library_cover_index` | Aplicada e representada no histórico | O índice de `capa_anexo_id` existe. |
| `20260728023217_fix_library_class_access` | Aplicada e representada no histórico | Correção presente, mas o helper foi superseded por consolidação posterior. |
| `20260728025447_harden_library_publish_identity` | Aplicada e representada no histórico | A checagem `teacher`/`auth.uid()` aparece no remoto; helpers foram reescritos depois. |
| `20260728030130_restore_archived_library_permissions` | Aplicada e representada no histórico | O helper remoto permite gerenciar publicação arquivada. |
| `20260729120000_fix_library_publish_authorization` | Aplicada manualmente fora do histórico | As definições `public/private` são idênticas ao remoto, mas a versão não está no histórico. Também é duplicada/consolidadora de várias correções anteriores. Storage não pôde ser comprovado. |
| `20260729160000_repair_library_publication_insert_rls` | Apenas local | Divergente e obsoleta: `private.library_current_teacher_id()` não existe no remoto e as policies não a usam. |

## Segurança implementada

`20260730144836_harden_profiles_and_sessions.sql`:

- mantém RLS habilitada;
- substitui duas policies permissivas de perfil por uma policy
  `authenticated`, sem sobreposição;
- exige `private.current_profile_role() = 'teacher'`, turma correspondente e
  `turmas.professor_id = auth.uid()` para leitura de perfis com role
  `student`;
- permite ao Data API ler de `perfis` somente `id`, `nome`, `role` e
  `turma_id`;
- remove toda escrita de perfil de `anon/authenticated`;
- remove `user_sessions_teacher_read`;
- separa SELECT, INSERT, UPDATE e DELETE de sessão, sempre com
  `user_id = auth.uid()`;
- impede atualização de `user_sessions.user_id`;
- mantém `user_sessions` na publicação Realtime;
- restringe `encerrar_escola` a `service_role`;
- deixa `set_updated_at` executável apenas pelo proprietário, sem quebrar
  triggers;
- remove os default grants legados para `PUBLIC`, `anon` e `authenticated`.

`20260730154141_drop_obsolete_delete_student_user.sql`:

- remove uma RPC destrutiva sem consumidor local ou dependência PostgreSQL;
- elimina referências a `projects`, `classroom_students` e `profiles`, nomes
  que não existem no schema atual;
- preserva `apagar_utilizador(uuid)`, o caminho administrativo atual restrito
  a `service_role`;
- não usa `CASCADE`, de modo que qualquer dependência inesperada interrompe a
  migration.

## Escopo comprovado e diferenças restantes

O baseline reproduz somente os schemas fornecidos: `public` e `private`.

Não foram inventados nem inferidos:

- dados de produção;
- schema e policies atuais de `storage`;
- conteúdo do bucket `biblioteca-media`;
- roles customizadas;
- configuração de Auth;
- demais publicações Realtime.

O inventário de referência comprovou `projetos` e `user_sessions` em
`supabase_realtime`. O Lote 1 garante explicitamente `user_sessions`;
alterações no contrato Realtime de projetos continuam fora do escopo.

O advisor do ambiente de referência ainda recomenda habilitar proteção contra
senhas vazadas no Auth. Essa configuração não é representável pelas migrations
SQL deste lote e fica registrada como hardening futuro.

## Validação local

Executada em 30 de julho de 2026:

| Verificação | Resultado |
| --- | --- |
| `supabase db reset --local --no-seed` | Passou; baseline + 14 marcadores + 2 migrations do Lote 1. |
| `supabase test db --local supabase/tests/database` | Passou; 52 testes pgTAP. |
| Advisor de segurança local | Passou; zero issues. |
| Advisor de desempenho local | 35 `WARN` fora de `perfis/user_sessions`; no escopo do lote há somente um `INFO` de índice de `perfis` ainda não usado após reset. |
| `supabase db lint --local --level warning` | Passou; zero erros de schema. |
| `npm run build` | Passou; apenas warning de tamanho de chunks. |
| `npm run test:sessions` | Passou; 5/5. |
| `npm run test:library` | Passou; 4/4. |
| `npm run audit:blocks` | Passou; 69/69 blocos, 3 placas e geradores críticos. |
| `cargo check` | Passou. |
| `cargo test` | Passou; 1/1. |
| `cargo clippy --all-targets --all-features -- -D warnings` | Passou. |
| `git diff --cached --check` | Dois avisos intencionais de EOF nos originais byte a byte; nenhum aviso na cadeia executável. |

## Estado de encerramento

Por decisão de produto de 30 de julho de 2026, o Bloquin mantém nesta fase um
único ambiente de desenvolvimento controlado. Staging, preview environments e
procedimentos de promoção não são critérios de conclusão deste lote.

O estado local é reproduzível e passou por reset completo. Não houve operação
remota mutável. A cadeia, os testes e os relatórios foram incluídos no commit
seletivo do Lote 1, sem incorporar alterações de Biblioteca ou UI.

## Rollback

Em um futuro ambiente compartilhado, o rollback preferido continua sendo
roll-forward:

1. preservar RLS e a remoção da leitura global de sessões;
2. se uma consulta legítima precisar de outra coluna de perfil, conceder
   apenas essa coluna em uma migration corretiva;
3. se uma policy bloquear um caso legítimo, ampliar apenas a expressão
   necessária, com teste positivo e negativo;
4. restaurar um backup validado apenas diante de incidente com perda de
   disponibilidade ou integridade.

Reaplicar os grants e policies inseguros do dump não é um rollback aceitável.
Uma restauração integral do backup só deve ocorrer em incidente crítico e com
autorização explícita.
