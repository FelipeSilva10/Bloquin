# Lote 1 — registro histórico da preparação remota

> **Arquivado em 30/07/2026.** O projeto adotou um único ambiente de
> desenvolvimento controlado para esta fase. Este roteiro não é requisito de
> conclusão do Lote 1 e não deve ser seguido automaticamente. Ele permanece
> versionado apenas como evidência das verificações que antecederam essa
> decisão.

Nenhum comando remoto mutável descrito neste documento foi executado.

## Estado real da execução em 30/07/2026

A autenticação da CLI funcionou, mas o gate de ambiente interrompeu o rollout
antes de qualquer conexão com o banco:

- a conta autenticada expôs somente um projeto, chamado `Bloquin`;
- esse projeto estava marcado como vinculado e `ACTIVE_HEALTHY`;
- o project ref vinculado é o mesmo configurado no `.env` da aplicação;
- o projeto não possui preview branches;
- nenhum projeto ou branch identificado como staging estava disponível.

Esse conjunto de evidências classifica o vínculo atual como produção ou, no
mínimo, como ambiente ativo cuja condição de staging não pode ser comprovada.
Por isso, não foram executados contra ele `migration list`, `db push
--dry-run`, dumps, inventários SQL, advisors, testes autenticados ou migrations.

A evidência sanitizada está em
`supabase/audits/lot1_staging_environment_gate.json`. A ausência de staging
deixou de ser bloqueio após a decisão de trabalhar somente no ambiente local
controlado.

## Limites de segurança

- confirmar visualmente que o projeto vinculado é staging antes de conectar;
- não usar `db push` sem `--dry-run` nesta etapa;
- não usar `--include-all`, `--include-roles` ou `--include-seed`;
- não executar `migration repair`, `db pull`, SQL mutável ou comandos de
  restauração;
- nunca colocar access token, refresh token, service role ou senha do banco em
  logs e artefatos;
- interromper ao primeiro resultado diferente dos gates abaixo.

A CLI fixada no repositório é a `2.110.0`.

## 1. Pré-condições

O arquivo local de vínculo existe, mas a preparação não imprimiu o project ref.
As variáveis `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` não estavam
presentes no processo auditado.

Defina explicitamente o project ref de staging e compare-o com o vínculo local:

```sh
LOT1_STAGING_PROJECT_REF='COLE_AQUI_O_PROJECT_REF_DE_STAGING'
test -n "$LOT1_STAGING_PROJECT_REF"
test -s supabase/.temp/project-ref
test "$(tr -d '\r\n' < supabase/.temp/project-ref)" = "$LOT1_STAGING_PROJECT_REF"
npx supabase --version
```

Resultado obrigatório:

- todos os `test` retornam código `0`;
- `npx supabase --version` retorna `2.110.0`;
- o projeto foi confirmado no Dashboard como staging.

Se o vínculo apontar para outro projeto, parar. O re-link deve ser uma ação
manual e explícita; o roteiro não o faz automaticamente.

## 2. Histórico remoto e dry-run — procedimento arquivado

Crie apenas o diretório local de evidências e preserve o código de saída dos
comandos:

```sh
set -o pipefail
LOT1_EVIDENCE_DIR='.tmp/lot1-remote-validation'
mkdir -p "$LOT1_EVIDENCE_DIR"

npx supabase migration list --linked \
  2>&1 | tee "$LOT1_EVIDENCE_DIR/migration-list.txt"

npx supabase db push --linked --dry-run \
  2>&1 | tee "$LOT1_EVIDENCE_DIR/db-push-dry-run.txt"

node scripts/validate-lot1-dry-run.mjs \
  "$LOT1_EVIDENCE_DIR/db-push-dry-run.txt"
```

Não acrescentar flags ao `db push`.

### Resultado obrigatório de `migration list`

As versões abaixo devem aparecer dos dois lados, local e remoto:

```text
20260727144628
20260727151053
20260727151317
20260727151415
20260728005251
20260728014634
20260728014958
20260728015220
20260728020815
20260728020931
20260728021256
20260728021442
20260728023217
20260728025447
20260728030130
```

Na época da preparação, somente esta versão podia aparecer como local e ainda
ausente no remoto:

```text
20260730144836
```

Não podia haver versão somente remota, marcador histórico pendente,
`20260727000000`, `20260729120000` ou `20260729160000` na cadeia ativa.

### Resultado que era obrigatório no dry-run

O validador deve retornar:

```text
DRY-RUN ACEITO: somente 20260730144836_harden_profiles_and_sessions.sql está pendente.
```

Qualquer outra migration, nenhuma migration, pedido de `migration repair`,
pedido de `--include-all` ou erro de sincronização encerra o rollout.

## 3. Backup imediatamente anterior ao rollout — procedimento arquivado

Esses comandos são somente leitura no banco e gravam os dumps apenas na
máquina local. Devem ser executados depois de o dry-run passar e antes de uma
autorização de aplicação:

```sh
set -o pipefail
LOT1_BACKUP_DIR='.tmp/lot1-rollout/pre-20260730144836'
mkdir -p "$LOT1_BACKUP_DIR"

npx supabase db dump --linked --role-only \
  --file "$LOT1_BACKUP_DIR/roles.sql"

npx supabase db dump --linked \
  --file "$LOT1_BACKUP_DIR/schema.sql"

npx supabase db dump --linked --data-only --use-copy \
  --exclude 'storage.buckets_vectors' \
  --exclude 'storage.vector_indexes' \
  --file "$LOT1_BACKUP_DIR/data.sql"

npx supabase db dump --linked --schema supabase_migrations \
  --file "$LOT1_BACKUP_DIR/history-schema.sql"

npx supabase db dump --linked --data-only --use-copy \
  --schema supabase_migrations \
  --file "$LOT1_BACKUP_DIR/history-data.sql"

test -s "$LOT1_BACKUP_DIR/roles.sql"
test -s "$LOT1_BACKUP_DIR/schema.sql"
test -s "$LOT1_BACKUP_DIR/data.sql"
test -s "$LOT1_BACKUP_DIR/history-schema.sql"
test -s "$LOT1_BACKUP_DIR/history-data.sql"

sha256sum "$LOT1_BACKUP_DIR"/*.sql \
  > "$LOT1_BACKUP_DIR/SHA256SUMS"
sha256sum --check "$LOT1_BACKUP_DIR/SHA256SUMS"
```

Também é obrigatório confirmar no Dashboard um backup físico recente ou um
ponto PITR anterior à janela. O dump lógico da CLI exclui schemas gerenciados
como `auth` e `storage`; isso é suficiente para revisar e recuperar os objetos
`public/private` do Lote 1, mas não substitui um backup integral da plataforma.
Objetos binários do Storage não fazem parte do backup do banco.

## 4. Advisors posteriores — procedimento arquivado

Depois de uma aplicação autorizada em staging:

```sh
LOT1_POST_DIR='.tmp/lot1-rollout/post-20260730144836'
mkdir -p "$LOT1_POST_DIR"

npx supabase db advisors --linked \
  --type security \
  --level info \
  --fail-on none \
  --output-format json \
  > "$LOT1_POST_DIR/security-advisors.json"

npx supabase db advisors --linked \
  --type performance \
  --level info \
  --fail-on none \
  --output-format json \
  > "$LOT1_POST_DIR/performance-advisors.json"

test -s "$LOT1_POST_DIR/security-advisors.json"
test -s "$LOT1_POST_DIR/performance-advisors.json"
```

Gates:

- nenhum novo advisor de segurança;
- o único advisor de segurança remoto já conhecido pode continuar sendo
  `auth_leaked_password_protection`, pois é uma configuração de Auth fora da
  migration;
- nenhum `WARN` ou `ERROR` novo para `public.perfis` ou
  `public.user_sessions`;
- avisos de desempenho dependentes de estatísticas devem ser comparados por
  categoria e objeto, não apenas pelo total;
- qualquer ampliação de grants, RLS desabilitada, policy permissiva extra ou
  função `SECURITY DEFINER` exposta a `anon/authenticated` interrompe a
  promoção.

## 5. Auditoria de `public.delete_student_user`

### Definição e grants

O dump remoto e o baseline local possuem a mesma definição, exceto por espaços
em linhas vazias:

```sql
create or replace function public.delete_student_user(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  delete from public.projects where student_id = p_student_id;
  delete from public.classroom_students where student_id = p_student_id;
  delete from public.profiles where id = p_student_id;
  delete from auth.users where id = p_student_id;
end;
$$;
```

Privilégios efetivos:

| Papel | Privilégio |
| --- | --- |
| `postgres` | `EXECUTE`, implícito ao proprietário e concedível |
| `service_role` | `EXECUTE`, não concedível |
| `PUBLIC` | nenhum |
| `anon` | nenhum |
| `authenticated` | nenhum |

`GRANT ALL ON FUNCTION` equivale, neste objeto, ao privilégio `EXECUTE`.

### Consumidores

- código atual: nenhuma chamada em `src`, `src-tauri` ou `scripts`;
- RPCs atuais do frontend: apenas `delete_project` e `share_project`;
- objetos PostgreSQL dependentes: nenhum registro em `pg_depend`;
- histórico: `src/screens/TeacherDashboard.tsx` chamou a RPC no commit
  `6f9ccdae7b32fa0534d3b315cc75465b719de51a` e a chamada foi removida no commit
  `a14cfceedf9eb50e934c5212b0e551f94bc9a03f`, no dia seguinte;
- bundle público do painel externo: nove arquivos JavaScript servidos por
  `sagsite.vercel.app` foram inspecionados em 30/07/2026 e não continham
  `delete_student_user` nem `apagar_utilizador`;
- consumidor externo: não pode ser descartado pelo repositório, porque o
  painel administrativo externo pode chamar um backend próprio que usa
  `service_role`, sem deixar a assinatura no bundle do navegador.

A consulta somente leitura
`supabase/audits/lot1_delete_student_user_inventory.sql` reproduz o inventário
no projeto vinculado sem executar a função nem acessar dados de usuários.

### Estado funcional e equivalente atual

As três primeiras relações usadas pela função não existem:

- `public.projects`;
- `public.classroom_students`;
- `public.profiles`.

As relações atuais são `public.projetos`, `public.membros_turma` e
`public.perfis`. Por isso, uma chamada falha no primeiro `DELETE` com
`42P01`, antes de alcançar `auth.users`.

`public.apagar_utilizador(uuid)` é o equivalente atual mais próximo: ela
remove de `auth.users`, e `public.perfis.id -> auth.users.id ON DELETE CASCADE`
propaga a exclusão para projetos, associações e demais FKs atuais. Ela também é
`SECURITY DEFINER`, tem `search_path` fixo e só pode ser executada por
`service_role`.

Não há equivalente autorizado para chamada direta por professor, e não deve
ser criado neste lote.

### Decisão de remoção

A análise posterior confirmou que a função podia ser removida:

- a única chamada histórica do aplicativo já havia sido retirada;
- não existe consumidor no código atual, no Tauri ou nos bundles públicos
  inspecionados;
- não existe dependência em `pg_depend`;
- a função falhava antes de produzir efeitos;
- `apagar_utilizador(uuid)` cobre o caminho administrativo atual.

A remoção foi isolada em
`20260730154141_drop_obsolete_delete_student_user.sql`, sem `CASCADE`. O
contrato também é verificado por pgTAP e pelo lint do banco.

## 6. Roteiro autenticado de staging

Usar contas controladas já existentes:

- `T1`: professor responsável pela turma `C1`;
- `T2`: professor sem vínculo com `C1`;
- `S1`: aluno de `C1`;
- `S2`: aluno de outra turma.

Registrar, sem tokens: horário UTC, build, ator, `session.user.id`, role,
turma, operação, status HTTP/PostgREST, SQLSTATE e contagem de linhas.

### Professor T1

1. Entrar como `T1`.
2. Confirmar que o perfil próprio retorna somente `id`, `nome`, `role` e
   `turma_id`, com role `teacher`.
3. Confirmar criação/substituição de uma única linha própria em
   `user_sessions`.
4. Listar perfis: devem aparecer `T1` e somente alunos de turmas realmente
   pertencentes a `T1`.
5. Consultar `email` em `perfis`: deve falhar por privilégio de coluna.
6. Consultar `S2`: deve retornar zero linhas.
7. Consultar `user_sessions` sem filtro: deve retornar somente a sessão de
   `T1`.
8. Tentar inserir, atualizar ou excluir a sessão de `S1`: deve falhar por RLS
   ou privilégio com `42501`.

### Professor T2

1. Entrar como `T2`.
2. Consultar `S1`: deve retornar zero linhas.
3. Confirmar que não consegue inferir `S1` por consultas à turma de `T1`.
4. Tentar alterar role, turma ou nome de qualquer perfil: deve falhar com
   `42501`.

### Aluno S1

1. Entrar como `S1`.
2. Ler o próprio perfil: uma linha e somente as quatro colunas permitidas.
3. Consultar `T1` e `S2`: zero linhas.
4. Consultar sessões: somente a própria linha.
5. Tentar alterar o próprio `role`/`turma_id`: falha com `42501`.
6. Tentar criar sessão com `user_id = S2`: falha com `42501`.
7. Tentar alterar `user_sessions.user_id`: falha por privilégio de coluna,
   mesmo partindo da própria linha.

### Sessão de aplicação expirada

1. Em uma instância de teste sem heartbeat concorrente, autenticar `S1`.
2. Pela própria sessão autenticada, ajustar apenas a própria `updated_at` para
   mais de 12 minutos no passado.
3. Reabrir ou reconectar a instância.
4. O probe autoritativo deve classificar a sessão como inválida; um heartbeat
   tardio não pode ressuscitá-la.
5. O aplicativo deve encerrar a sessão com segurança e voltar ao login.

Restaurar o estado entrando novamente; o login gera um novo token de sessão.

### Substituição de sessão

1. Entrar como `S1` na instância A e mantê-la aberta.
2. Entrar como `S1` na instância B.
3. A instância B deve substituir a única linha de `user_sessions` de `S1`.
4. A deve receber o evento Realtime e encerrar a sessão.
5. Desconectar A da rede antes de repetir o login em B e depois reconectar A.
6. Mesmo sem o evento, o probe no banco deve invalidar A.
7. B deve continuar ativa e o banco deve conter exatamente uma sessão de S1.

### Sessão Supabase Auth ausente/expirada

1. Em uma conta de staging, executar logout global ou invalidar a sessão pelo
   fluxo de Auth controlado.
2. Forçar refresh/recarregar depois da expiração do access token.
3. Confirmar que não há perfil nem sessão utilizável sem usuário autenticado.
4. Chamadas a `perfis` e `user_sessions` como `anon` devem ser negadas, não
   retornar dados.
5. A aplicação deve voltar ao login sem apagar silenciosamente estado local.

### Aprovação de staging

O teste passa somente se todos os casos positivos funcionarem, todas as
tentativas negativas forem bloqueadas pelo banco, a substituição também
funcionar após perda de evento Realtime e nenhum token aparecer nos logs.

## 7. Critérios objetivos de interrupção

Interromper sem aplicar a migration se ocorrer qualquer um:

- project ref não confirmado como staging;
- CLI diferente da versão fixada sem revisão do changelog/help;
- histórico local/remoto diferente da matriz esperada;
- dry-run diferente de uma única migration;
- menção a `repair`, `include-all`, baseline ou marcador no dry-run;
- backup incompleto, vazio ou com checksum inválido;
- ausência de backup/PITR verificável;
- lock ativo, timeout ou erro de conexão que torne o estado remoto ambíguo;
- mudança remota ocorrida entre `migration list`, backup e janela de rollout.

Depois de uma aplicação autorizada, interromper a promoção para produção se:

- login de aluno ou professor falhar;
- leitura legítima de perfil/turma for bloqueada;
- sessão alheia ficar visível;
- escrita de perfil ou sessão alheia for aceita;
- sessão substituída continuar válida após reconexão;
- aparecer advisor novo relacionado ao Lote 1.

## 8. Estado final deste roteiro

Não há próxima autorização de staging associada ao Lote 1. Se o projeto adotar
ambientes separados no futuro, este material poderá servir de referência, mas
o procedimento deverá ser refeito para o histórico vigente e para todas as
migrations então pendentes.
