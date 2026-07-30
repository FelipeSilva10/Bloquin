# Relatório final — Lote 1

**Status:** fechado

**Data:** 30 de julho de 2026

**Escopo:** baseline reproduzível e segurança de perfis/sessões

## Objetivo

Transformar o schema recebido em uma cadeia local reproduzível e aplicar
menor privilégio aos dados de perfil e às sessões do Bloquin, sem alterar os
domínios de Biblioteca, autosave, intervenção, painel administrativo ou
Arduino CLI.

## Alterações realizadas

### Baseline e histórico

- O dump comprovado de `public/private` passou a ser o baseline da primeira
  versão já conhecida pelo histórico:
  `20260727144628_add_audit_query_indexes.sql`.
- As 14 versões remotas seguintes foram mantidas como marcadores históricos.
- As 18 migrations incrementais originais foram preservadas, com hashes, em
  `supabase/migration-history/original`.
- `supabase/roles.sql` normaliza privilégios padrão antes da restauração.
- `supabase/config.toml` fixa PostgreSQL 17 e defaults seguros para novos
  objetos; a versão da CLI fica fixada pelo `package-lock.json`.
- A auditoria automatizada verifica hashes, histórico, marcadores, arquivos
  arquivados e contratos de segurança.

### Perfis

- `perfis` permanece com RLS habilitada.
- Existe uma única policy de leitura para `authenticated`.
- O usuário lê o próprio perfil.
- Professor lê somente alunos de turma realmente vinculada ao seu
  `auth.uid()`, e somente quando seu perfil possui role `teacher`.
- O cliente autenticado recebe apenas `id`, `nome`, `role` e `turma_id`.
- Escrita direta de perfis por `anon/authenticated` foi removida.
- Role em metadata do JWT não concede privilégios.

### Sessões

- A leitura global de sessões por professor foi removida.
- SELECT, INSERT, UPDATE e DELETE são limitados a
  `user_sessions.user_id = auth.uid()`.
- O cliente não pode trocar `user_id`.
- `user_sessions` permanece no Realtime para notificar substituições.
- O cliente Supabase principal explicita persistência e refresh da sessão; o
  cliente auxiliar não persiste autenticação.
- Login valida o usuário do Auth, carrega somente o perfil correspondente,
  aceita apenas `teacher/student` e só então registra a sessão.
- Heartbeat não ressuscita sessão expirada; indisponibilidade de rede não é
  confundida com substituição de sessão.
- Logout local remove o estado persistido mesmo quando o backend está
  indisponível.
- UPDATE e DELETE recebidos por Realtime invalidam a instância anterior.

### Funções e privilégios

- `encerrar_escola(uuid,text,text)` ficou restrita a `service_role`.
- `set_updated_at()` ficou restrita ao proprietário/triggers.
- Default grants de novos objetos para `PUBLIC`, `anon` e `authenticated`
  foram removidos.
- A RPC quebrada `delete_student_user(uuid)` foi removida em migration
  separada e sem `CASCADE`, após auditoria de código, histórico, bundles e
  dependências PostgreSQL.

## Migrations do lote

1. `20260730144836_harden_profiles_and_sessions.sql`
   - policies e grants de `perfis`;
   - policies e grants de `user_sessions`;
   - Realtime de sessões;
   - grants de funções;
   - default privileges.
2. `20260730154141_drop_obsolete_delete_student_user.sql`
   - remoção segura da RPC legada e inválida.

Além delas, a cadeia ativa foi reorganizada em um baseline e 14 marcadores. O
SQL incremental anterior permanece integralmente arquivado.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `supabase db reset --local --no-seed` | Passou; 17 migrations aplicadas. |
| `supabase migration list --local` | 17 versões locais registradas no banco local. |
| `supabase test db --local supabase/tests/database` | Passou; 2 arquivos e 52 testes pgTAP. |
| `supabase db lint --local --level warning` | Passou; zero erros de schema. |
| Advisor de segurança local | Passou; zero issues. |
| Advisor de desempenho local | 40 `INFO` e 35 `WARN`; nenhum `WARN` em `perfis/user_sessions`. |
| `npm run audit:supabase-baseline` | Passou; hashes, histórico e contratos válidos. |
| `npm run test:sessions` | Passou; 5/5. |
| `npm run test:library` | Passou; 4/4, como teste de não regressão. |
| `npm run audit:blocks` | Passou; 69/69 blocos, 3 placas, presets e geradores críticos. |
| `npm run build` | Passou; TypeScript e Vite. |
| `cargo check` | Passou. |
| `cargo test` | Passou; 1/1. |
| `cargo clippy --all-targets --all-features -- -D warnings` | Passou. |
| `git diff --cached --check` | Dois avisos intencionais de linha vazia no EOF em originais arquivados byte a byte; nenhum aviso em código executável. |

Os casos pgTAP incluem professor, aluno, usuário sem perfil, `anon`,
`service_role`, leitura própria, leitura da turma, role falsa em metadata,
acesso a colunas sensíveis, escrita de perfil e tentativas cruzadas de
SELECT/INSERT/UPDATE/DELETE em sessões.

## Arquivos do Lote 1

### Aplicação e testes

- `.gitignore`
- `package.json` e `package-lock.json` — arquivos compartilhados com o
  trabalho já existente da Biblioteca
- `src/lib/supabase.ts`
- `src/screens/LoginScreen.tsx`
- `src/services/sessionPolicy.ts`
- `src/services/sessionService.ts`
- `scripts/session-policy.test.mjs`
- `scripts/supabase-baseline-audit.mjs`
- `scripts/validate-lot1-dry-run.mjs` — preservado apenas como utilitário
  histórico; não é gate do lote

### Supabase

- `SUPABASE_SECURITY_AUDIT.md` — marcado como snapshot histórico
- `supabase/.gitignore`
- `supabase/config.toml`
- `supabase/roles.sql`
- `supabase/LOT1_BASELINE.md`
- `supabase/LOT1_REMOTE_VALIDATION.md` — registro histórico arquivado
- `supabase/LOT1_FINAL_REPORT.md`
- `supabase/audits/lot1_remote_evidence.json`
- `supabase/audits/lot1_remote_inventory.sql`
- `supabase/audits/lot1_delete_student_user_inventory.sql`
- `supabase/audits/lot1_staging_environment_gate.json` — evidência histórica
- `supabase/migration-history/README.md`
- os 18 arquivos de `supabase/migration-history/original`
- os 17 arquivos da cadeia ativa em `supabase/migrations`
- os 2 arquivos de `supabase/tests/database`

As 17 migrations ativas, os 18 originais arquivados, os testes, o baseline e
os relatórios foram incluídos no commit seletivo do Lote 1. As duas linhas
vazias finais preservadas nos originais
`20260728014634_library_archive_restore.sql` e
`20260728015220_library_metadata_limits.sql` são parte dos arquivos de
proveniência e dos hashes auditados; não pertencem à cadeia executável.

## Riscos conhecidos

- Não existe teste E2E automatizado dirigindo duas instâncias reais do
  aplicativo; substituição e expiração são cobertas por pgTAP e testes de
  política/TTL.
- O token de coordenação de `user_sessions` ainda é armazenado em texto no
  cliente e na tabela, embora esteja protegido por RLS própria.
- A proteção do Supabase Auth contra senhas vazadas depende de configuração
  do projeto, não de migration SQL.
- O advisor de desempenho aponta 35 avisos em outros domínios. Eles não
  atingem `perfis/user_sessions` e devem ser tratados por domínio, com dados
  representativos.
- O fluxo atual do painel administrativo ainda injeta access/refresh tokens
  em uma webview externa. Ele estava explicitamente fora do Lote 1 e é o
  primeiro alvo do Lote 2.
- O build mantém warnings de chunks grandes, principalmente Blockly e PDF.

## Hardening futuro não bloqueante

- Hash do token de coordenação de sessão e rotação adicional.
- Teste E2E com duas instâncias, perda de Realtime, reconexão e relógio
  controlado.
- Proteção contra senhas vazadas, senha mínima maior, MFA para operações
  administrativas e revisão de rate limits.
- Métricas e trilha de auditoria de login, substituição e expiração, sem
  registrar tokens.
- Limpeza periódica de sessões expiradas.
- Revisão dos índices e policies indicados pelo advisor, domínio por domínio.
- Geração de tipos do banco e contratos de schema no CI.
- Gate automatizado de reset, pgTAP, lint e advisors quando o projeto adotar
  integração contínua.

## Impacto esperado

- Perfis deixam de expor e-mail, credenciais temporárias e campos
  administrativos ao cliente comum.
- Professores não conseguem mais enumerar sessões de outros usuários.
- Um usuário autenticado só manipula a própria sessão.
- A leitura da turma depende simultaneamente de identidade, role e vínculo
  acadêmico real.
- O schema pode ser reconstruído localmente de forma determinística.
- Falhas futuras de grants, policies, referências legadas e histórico são
  detectadas automaticamente.

## Encerramento

Não há pendência técnica local bloqueante dentro do escopo definido. O
baseline foi reconstruído do zero, os contratos de segurança passaram e a
documentação está alinhada à estratégia de ambiente único de desenvolvimento.
O Lote 1 está oficialmente fechado.
