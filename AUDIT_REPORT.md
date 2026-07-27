# Auditoria de desempenho, estabilidade e arquitetura — Bloquin

Data: 27/07/2026

## Resumo executivo

O Bloquin tem uma arquitetura coerente para o estágio atual: React/Vite no frontend, Tauri 2/Rust para hardware local e Supabase para autenticação, persistência e Realtime. O banco ainda é pequeno, portanto não há pressão de volume neste momento; os principais riscos encontrados estão em segurança do schema legado, no fluxo de inicialização das ferramentas Arduino e em pequenas fontes de trabalho redundante no cliente.

Foram implementadas correções incrementais no frontend, no Rust, no CI e no banco. Nenhuma tabela, política ou função de produção foi removida ou alterada de forma potencialmente incompatível.

## Arquitetura e fluxos auditados

- `src/App.tsx`: composição de providers, roteamento, splash, sessão e aviso de atualização.
- `src/screens/LoginScreen.tsx`: autenticação Supabase, perfil e registro de sessão.
- `src/screens/StudentDashboard.tsx` e `TeacherDashboard.tsx`: consultas de turmas/projetos, criação, exclusão, compartilhamento e Realtime.
- `src/screens/IdeScreen.tsx` e `src/blockly/*`: workspace Blockly, serialização, geração C++ e upload.
- `src-tauri/src/lib.rs`: setup do `arduino-cli`, compilação/upload e monitor serial.
- Supabase: tabelas públicas, RLS, views, funções RPC, índices, logs, `pg_stat_statements` e advisors.

## Alterações implementadas

### Frontend

- O `user.id` obtido no login agora é propagado para dashboards e IDE. Foram removidas chamadas redundantes a `supabase.auth.getUser()` no login, carregamento inicial dos dashboards e watcher de intervenção.
- A geração de C++ do Blockly foi agrupada por `requestAnimationFrame`, evitando uma geração síncrona para cada evento de arraste/conexão.
- O splash não aguarda mais a instalação/verificação do Arduino. O setup continua em segundo plano e o backend Rust mantém a barreira `setup_done` antes de permitir upload.
- O watcher de intervenção recebe o usuário por propriedade e os canais efêmeros de bloquear/desbloquear são removidos após o envio.

### Rust/Tauri

- Threads antigas do monitor serial agora são invalidadas por geração; iniciar/parar rapidamente não deixa leitores concorrentes ativos.
- Sketches temporários recebem limpeza RAII em sucesso e erro.
- `arduino-cli` em PATH, bundle, variável de ambiente e cache é validado com `version` e `status.success()` antes de ser usado.
- O download de fallback tem timeout de conexão de 10 s, timeout total de 120 s e duas tentativas.
- Upload rejeita placa desconhecida e código acima de 2 MB.
- `cargo clippy -- -D warnings` deixou de ser ignorado no CI.

### Banco

Aplicada e registrada no Supabase a migração `20260727144628_add_audit_query_indexes`, com três índices aditivos:

- `projetos(dono_id, updated_at desc)`
- índice parcial de alunos `perfis(turma_id, nome) where role = 'student'`
- `turmas(professor_id, created_at desc)`

Os três índices foram verificados em `pg_indexes` após a aplicação.

### Releases

O novo `scripts/sync-version.mjs` sincroniza a versão da tag em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`. O workflow de release passou a usar esse script, reduzindo o risco de artefatos com versões divergentes.

## Evidências coletadas

### Frontend e bundle

- Build Vite: `171 modules transformed`, `dist` com aproximadamente 4,4 MB.
- `vendor-blockly`: 666,45 kB (174,32 kB gzip); é o único chunk acima do limite de 500 kB.
- `IdeScreen`: 105,67 kB (27,70 kB gzip).
- A auditoria Blockly validou `69/69` blocos, `3` placas, presets e geradores críticos.

### Consultas observadas

No `pg_stat_statements`, as consultas de projetos por dono/data, turmas por professor/data e alunos por turma/role/nome foram as mais repetidas entre os fluxos analisados. Antes dos índices, os planos pequenos ainda faziam `Seq Scan`/`Sort` em turmas e alunos e `Sort` após índice simples em projetos. O tamanho atual do banco é baixo, mas o padrão justificava índices compostos preventivos.

### Advisors Supabase

O estado atual ainda possui 41 alertas de segurança e 97 de performance:

- Segurança: 4 views `SECURITY DEFINER`, 9 tabelas públicas sem RLS, 9 funções `SECURITY DEFINER` executáveis por `anon`, 9 também executáveis por `authenticated`, 9 funções com `search_path` mutável e proteção de senha comprometida desativada.
- Performance: 55 conjuntos de políticas permissivas sobrepostas, 8 políticas com avaliação repetida de `auth.*`, 14 foreign keys sem índice de cobertura, 1 índice duplicado e 19 índices sem uso registrado.

## Riscos prioritários ainda pendentes

### P0 — segurança do banco

O schema legado expõe views `SECURITY DEFINER`; uma delas, `public.v_alunos`, inclui campo de senha em sua definição. Também há funções públicas como `apagar_utilizador(uuid)` e `delete_student_user(uuid)` com superfície de execução sensível. Nove tabelas do schema `public` estão sem RLS. Não alterei isso automaticamente porque o painel externo `sagsite.vercel.app` usa parte desse conjunto de views, funções e sessões de backoffice; uma correção sem homologação pode quebrar o painel ou bloquear operações administrativas.

Plano recomendado: criar ambiente de staging/branch, mapear consumidores do backoffice, remover campos de credencial das views, restringir `EXECUTE` a roles necessárias, definir `search_path` imutável e ativar RLS com políticas explícitas. Depois, repetir os advisors até zerar os erros externos.

### P1 — drift de migrações

O histórico remoto inicialmente não continha a migração de gerenciamento de projetos, embora seus objetos já existissem porque o SQL foi executado manualmente no SQL Editor. A nova migração de índices está registrada, mas o baseline do schema ainda precisa ser reconciliado antes de usar `db push`/deploy automatizado para evitar conflitos.

### P1 — logs e contrato de inserção

Foram encontrados erros recentes de RLS em inserções de `projetos`. É necessário correlacionar esses eventos com o painel externo e confirmar se o fluxo correto é insert direto autenticado ou RPC. A aplicação atual usa insert direto para criação e RPC para exclusão/compartilhamento.

### P2 — performance futura

O chunk de Blockly pode ser dividido ou carregado somente após entrar na IDE. Também vale consolidar políticas permissivas, trocar `auth.uid()` por `(select auth.uid())` nas políticas aplicáveis, adicionar índices de foreign key guiados por consultas reais e remover índices duplicados apenas após confirmar dependências e uso.

### P2 — observabilidade

O CI não possui ESLint configurado; `npm run lint --if-present` atualmente não executa uma verificação. O próximo passo é adicionar uma configuração de lint e testes de componentes/integração. O monitoramento deve acompanhar duração das consultas, falhas de upload, tempo de setup e conexões Realtime.

## Validação executada

- `./node_modules/.bin/tsc --noEmit` — passou.
- `node_modules/.bin/vite build` — passou; somente alerta de chunk grande do Blockly.
- `cargo check --manifest-path src-tauri/Cargo.toml -q` — passou.
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` — passou.
- `node scripts/run-blockly-audit.mjs` — passou, 69/69 blocos.
- `git diff --check` — passou.
- Migração Supabase — aplicada, registrada e índices verificados.

## Próxima sequência recomendada

1. Homologar o backoffice em staging e corrigir o P0 de views, funções e RLS.
2. Reconciliar o baseline de migrações manuais com o histórico remoto.
3. Instrumentar tempo de startup/setup, geração Blockly, upload e Realtime.
4. Criar lint e testes automatizados para login, sessão, CRUD de projetos e serialização Blockly.
5. Só então otimizar o chunk Blockly e revisar índices não utilizados com dados de produção.
