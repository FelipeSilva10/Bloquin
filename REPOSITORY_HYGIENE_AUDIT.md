# Auditoria de arquivos e higiene do repositório público — Bloquin

**Data:** 27/07/2026
**Escopo:** árvore do projeto, Git, segredos, artefatos, dependências, assets, scripts, workflows, releases, documentação e migrations.
**Estado auditado:** worktree local do Bloquin, incluindo alterações existentes de tarefas anteriores.

## Resumo executivo

A árvore rastreada tem 136 arquivos antes das alterações desta auditoria. Os problemas objetivos encontrados foram:

- .env rastreado desde o commit b26bdce; contém URL do Supabase e chave JWT com role anon, não service_role. A chave anon é pública por desenho, mas o arquivo local não deveria ser publicado;
- src-tauri/resources/arduino-cli.exe rastreado com 37,8 MB, embora o CI faça o download do binário e o código tenha fallback local;
- src/assets/LogoSimples.png~ rastreado com 3,8 MB; é um backup sem referências;
- README com caminho de logo quebrado e versão manual desatualizada;
- start-bloquin.sh preso a caminhos absolutos desta máquina;
- caches e builds locais grandes, porém corretamente ignorados: target Rust ultrapassa centenas de MB e o worktree chega a aproximadamente 16 GB por artefatos locais.

As três remoções de versionamento foram preparadas no índice Git, sem apagar .env ou arduino-cli.exe da máquina. O backup de imagem foi removido localmente. Não foram encontrados service_role, chave privada, certificado, JWT de sessão, senha real ou dump de banco no conteúdo auditado. A presença histórica do .env, do executável e do backup permanece nos commits antigos e não foi reescrita.

## Mapa do repositório

| Diretório/arquivo | Finalidade | Uso/evidência | Situação |
|---|---|---|---|
| src | Frontend React/TypeScript, telas, Blockly, serviços e estado | Importações, build Vite e TypeScript | Necessário e versionado |
| src-tauri/src | Backend Rust/Tauri, serial, compilação, upload e painel externo | Referenciado pelo Cargo e comandos da aplicação | Necessário |
| src-tauri/icons | Ícones de desktop e plataformas | Referenciado pelo Tauri e gerado pelo ecossistema Tauri | Necessário; alguns candidatos gerados ficam documentados |
| src-tauri/resources | Dependências locais do runtime | arduino-cli é localizado pelo Rust; CI baixa o binário | Código necessário, binário não deve ser versionado |
| src-tauri/gen | Schemas gerados pelo Tauri | Ignorado por src-tauri/.gitignore | Gerado, não versionado |
| src-tauri/target | Compilação Rust local | Ignorado por src-tauri/.gitignore | Gerado, não versionado |
| src/assets | Logo e imagens das placas | Imports em splash, login, tutorial e seleção de placa | Necessário |
| src/icons | Ícones da IDE | Imports em dashboards e IDE | Necessário |
| scripts | Auditoria Blockly e sincronização de versão | package.json e release.yml | Necessário |
| supabase/migrations | Histórico declarativo de alterações do banco | Estado remoto e auditoria Supabase | Necessário; não remover migrations aplicadas |
| .github | Templates e CI/release | GitHub Actions e configuração do projeto | Necessário |
| .vscode/extensions.json | Recomendações de extensões | Arquivo útil para colaboradores | Mantido; o restante de .vscode continua ignorado |
| dist | Build Vite local | Ignorado pelo .gitignore | Gerado |
| node_modules | Dependências instaladas | Ignorado pelo .gitignore | Gerado |
| AUDIT_REPORT.md e SUPABASE_SECURITY_AUDIT.md | Relatórios técnicos produzidos nesta colaboração | Referência de manutenção e segurança | Mantidos; não contêm segredos |

Não foram encontrados diretórios vazios relevantes nem pastas de dumps, seeds com dados reais, snapshots de banco, IDEs completas ou arquivos de sistema operacional.

## Tabela de achados e ações

| Caminho | Tipo | Situação encontrada | Evidência | Ação tomada | Risco | Prioridade |
|---|---|---|---|---|---|---|
| .env | Configuração local | Rastreado, com URL e chave anon real | git log desde b26bdce; role JWT = anon; sem service_role | Removido do índice, cópia local preservada | Configuração local pública e histórico persistente | P1 |
| env.example | Modelo de ambiente | Placeholders e instrução explícita para não commitar .env | Valores não reais | Mantido | Nenhum relevante | P3 |
| src-tauri/resources/arduino-cli.exe | Binário | 37,8 MB rastreados; CI baixa versão 1.4.1 | release.yml e lib.rs têm download/fallback | Removido do índice, cópia local preservada | Aumenta clone e histórico; não quebra CI | P1 |
| src/assets/LogoSimples.png~ | Backup binário | 3,8 MB, nome de backup, sem referências | Nenhum import ou referência | Removido do worktree e índice | Nenhum; cópia era redundante | P2 |
| README.md | Documentação | Logo apontava para LogoCompleta.pngsrc/assets/ e versão dizia 1.1.0 | Caminho inválido e package/Tauri/Cargo em 1.1.1 | Corrigido logo e removida duplicação manual da versão | Documentação incorreta | P2 |
| start-bloquin.sh | Script local | Usava /home/felipe/Desktop/... e gravava em /home/felipe/Documents | Caminhos exclusivos desta máquina | Tornado relativo ao diretório do script e log em .tmp | Baixo; melhora portabilidade | P2 |
| .gitignore | Configuração Git | Cobrava Node/Vite/Rust/ambiente, mas faltavam caches/artifacts auxiliares | Revisão do worktree e workflows | Adicionados .tmp, coverage, caches de auditoria, temporários e artefatos de release | Evita lixo futuro | P2 |
| dist, node_modules, src-tauri/target, src-tauri/gen | Gerados | Presentes localmente, não rastreados | git status --ignored | Mantidos e ignorados | Ocupam disco local, não o repositório | P3 |
| src/services/appVersionService.ts | Serviço | Novo serviço usado pela implementação de versão/atualização | Importações em App | Mantido | Nenhum | P3 |
| supabase/migrations/*.sql | Migrations | Cinco arquivos, incluindo migration inicial não refletida no histórico remoto | Auditoria remota anterior | Mantidos | Remover causaria perda de reprodutibilidade | P0 |
| .github/workflows/ci.yml | CI | Não há script lint; etapa usa npm run lint --if-present | package.json não define lint | Mantido; documentado como melhoria | Job de lint fica sem efeito | P2 |
| .github/workflows/release.yml | Release | Baixa arduino-cli, assina Windows e publica assets; changelog tem fallback | Todos os caminhos referenciados existem | Mantido | Windows é o único release automatizado atual | P2 |
| .vscode/extensions.json | Configuração IDE | Está rastreado apesar de .vscode/ ser ignorado | Recomenda Tauri e rust-analyzer | Mantido intencionalmente | Nenhum | P3 |
| src-tauri/icons/android e ios | Assets Tauri | Há arquivos gerados, alguns hashes duplicados com sufixo -1 | Tauri icon generator e caminhos de plataforma | Mantidos por possível suporte futuro | Remoção pode quebrar targets móveis futuros | P2 |

## Segredos e dados sensíveis

A busca atual e histórica procurou chaves privadas, service_role, tokens GitHub, tokens Slack, URLs com senha, certificados, JWTs de sessão, dumps e padrões de senha.

Resultado:

- nenhum service_role encontrado;
- nenhuma chave privada ou certificado encontrado;
- nenhum token GitHub/Slack encontrado;
- nenhum dump SQL com dados reais encontrado;
- nenhum usuário, aluno ou professor identificado em arquivos versionados;
- o .env contém apenas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY; o payload da chave informa role anon;
- a chave anon do Supabase é publicável por desenho, mas .env ainda é configuração local e foi removido do índice;
- src/lib/supabase.ts contém somente o cliente com variáveis Vite, sem segredo hardcoded;
- workflows usam secrets do GitHub para certificado, senha do certificado e GITHUB_TOKEN, sem valores embutidos.

Remover .env do commit atual não remove seu conteúdo dos commits antigos. Como a chave encontrada é anon, não há evidência de vazamento de service_role que exija rotação imediata. Ainda assim, se o projeto tiver qualquer dúvida sobre a validade histórica da chave, ela deve ser revisada no dashboard; a rotação deve ser coordenada com o deploy.

## Histórico Git e blobs grandes

Maiores blobs ainda presentes no histórico local incluem:

- src-tauri/resources/arduino-cli.exe: 37.757.440 bytes;
- src/assets/LogoSimples.png~: 3.775.766 bytes;
- versões antigas de LogoSimples.png, LogoCompleta.png e background.png;
- ícones ICNS e imagens de plataforma.

O .env aparece em muitos commits históricos desde b26bdce. Não foi usado git filter-repo, BFG ou force push.

Se a meta for reduzir o tamanho do repositório público e remover artefatos históricos, o procedimento futuro deve ser:

1. criar backup/clonar o repositório;
2. avisar colaboradores e qualquer integração que use SHAs;
3. usar git filter-repo com paths exatos para .env, arduino-cli.exe e LogoSimples.png~;
4. fazer rotação de qualquer segredo que venha a ser encontrado na revisão;
5. force push coordenado e validar releases, tags e clones.

Essa operação é deliberadamente recomendada, não aplicada.

## Dependências e pacotes

Dependências do package.json foram confirmadas:

- @supabase/supabase-js: src/lib/supabase.ts;
- @tauri-apps/plugin-dialog e plugin-fs: localProjectService;
- plugin-opener: appVersionService;
- blockly: IDE e scripts de auditoria;
- lz-string: serialização de workspace no IDE;
- react/react-dom: aplicação;
- react-router-dom: App e chunk vendor;
- uuid: sessionService.

As dependências de desenvolvimento também têm consumidores: Vite, plugin React, TypeScript, tipos de React, uuid e lz-string. npm ls não pôde ser executado porque npm não está disponível no PATH desta sessão, mas package-lock.json é lockfile v3 e node_modules/.bin contém tsc/vite. Não removi dependências por inferência automática.

No Rust, cargo tree confirmou uso de Tauri, plugins, serde, serialport e urlencoding. Cargo.lock permanece versionado para builds reproduzíveis.

## Assets

Assets confirmados como usados:

- LogoCompleta.png: splash e login;
- src/icons/LogoSimples.png: dashboards, IDE e tutorial;
- icon_chat, icon_enviar, icon_sair, icon_salvar, icon_salvar_como, icon_ver_codigo: IDE;
- arduino_nano.jpg, arduino_uno.jpg e esp32_devkit_v1.jpg: seleção de placa e tutorial;
- ícones em src-tauri/icons: bundle Tauri desktop e possíveis targets de plataforma.

Duplicatas exatas encontradas em ícones iOS incluem arquivos com sufixo -1, além de cópias esperadas entre StoreLogo e LogoSimples. Não removi: o conjunto é gerado por ferramenta do Tauri e os consumidores podem ser definidos por target de plataforma.

## Scripts e comandos

- scripts/run-blockly-audit.mjs: executa a auditoria Blockly e remove seu diretório temporário ao final; mantido.
- scripts/blockly-audit.ts: fixtures, round-trip e geração de código; usado pelo script npm; mantido.
- scripts/sync-version.mjs: sincroniza package.json, tauri.conf.json e Cargo.toml; usado pelo release; mantido.
- start-bloquin.sh: mantido e tornado portátil.
- package.json não possui script lint; a etapa CI usa --if-present. Isso deve ser resolvido adicionando ESLint/configuração ou removendo a etapa, após decisão da equipe; não alterei a cadeia de ferramentas agora.

## GitHub Actions e releases

Não há referências a arquivos inexistentes nos workflows auditados.

CI:

- checkout, Node 20, npm ci, TypeScript, lint opcional, cargo check e clippy;
- cache Cargo usa src-tauri/Cargo.lock;
- permissões não foram ampliadas explicitamente.

Release:

- dispara somente por tags semânticas;
- sincroniza versão com scripts/sync-version.mjs;
- baixa arduino-cli no runner, portanto não precisa do binário versionado;
- usa secrets do GitHub para certificado e senha;
- publica instalador Windows e SHA256SUMS;
- usa contents: write, necessário para criar release;
- gera changelog e possui fallback quando git-cliff falha;
- o workflow atualmente publica Windows, enquanto tauri.conf.json também lista appimage; isso é uma decisão de distribuição a confirmar, não um arquivo obsoleto.

## Supabase e arquivos de banco

As cinco migrations foram preservadas. Não há seeds, dumps ou dados reais locais. A migration 20260727000000_project_management.sql é historicamente importante mesmo não estando registrada no histórico remoto, conforme auditoria anterior; não deve ser removida.

O próximo passo continua sendo normalizar a baseline com Supabase CLI/db pull em staging, sem reset e sem db push cego.

## Validações

Executadas após a limpeza:

- TypeScript: passou com node_modules/.bin/tsc --noEmit;
- Vite: build passou, 171 módulos transformados;
- auditoria Blockly: 69/69 blocos, 3 placas e geradores críticos;
- cargo check: passou;
- cargo clippy -- -D warnings: passou;
- cargo test: passou, 1 teste aprovado;
- git diff --check: passou;
- busca de referências: nenhum uso de .env, arduino-cli.exe versionado ou LogoSimples.png~ após a remoção;
- busca de segredos: nenhum service_role, chave privada, token conhecido ou senha real encontrada;
- npm run não foi possível nesta sessão porque o executável npm não está disponível; os equivalentes diretos com Node funcionaram.

O build apresentou apenas o aviso conhecido de chunks acima de 500 kB, sem falha. Isso não foi tratado como limpeza de arquivos porque é otimização de bundle, fora do escopo principal.

## Riscos residuais e recomendações não aplicadas

- Reescrita do histórico para retirar blobs grandes e .env: requer backup, comunicação e force push.
- Rotação da chave anon: não indicada como obrigatória pela evidência atual; revisar se houver dúvida sobre políticas públicas.
- Remoção de ícones Android/iOS e cópias -1: aguardar decisão de targets móveis.
- Remoção de supabaseHelper e métodos de serviço sem consumidores locais: confirmar painel/integradores externos.
- Ajuste da etapa lint da CI: decidir entre adicionar ESLint ou remover a etapa no-op.
- Build Linux/AppImage no release: confirmar estratégia de distribuição antes de alterar workflow.
- Ativação de RLS e correções de views/RPCs administrativas: pertence à auditoria Supabase e exige homologação do painel.
- Remoção física de dist/target/node_modules: não necessária para o repositório e pode forçar rebuilds demorados; continuam ignorados.

## Resultado

A higiene do conteúdo atual foi melhorada sem reescrita de histórico, sem remoções de uso incerto e sem quebrar build, auditoria Blockly ou Rust. As remoções de .env e arduino-cli.exe estão preparadas no índice Git; depois do commit e push elas deixarão de ser entregues no repositório público, mas os blobs antigos somente desaparecerão com uma limpeza histórica coordenada.
