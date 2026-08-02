# Contribuindo com o Bloquin IDE

Obrigado por dedicar seu tempo ao Bloquin! Este guia explica como contribuir de forma eficaz.

---

## Índice

- [Código de Conduta](#código-de-conduta)
- [Como reportar bugs](#como-reportar-bugs)
- [Como sugerir funcionalidades](#como-sugerir-funcionalidades)
- [Configuração do ambiente de desenvolvimento](#configuração-do-ambiente-de-desenvolvimento)
- [Padrões de código](#padrões-de-código)
- [Commits convencionais](#commits-convencionais)
- [Processo de Pull Request](#processo-de-pull-request)
- [Versionamento e releases](#versionamento-e-releases)

---

## Código de Conduta

Este projeto adota o [Contributor Covenant](CODE_OF_CONDUCT.md). Ao contribuir, você concorda em seguir suas diretrizes. Comportamento inadequado pode ser reportado para o e-mail do projeto.

---

## Como reportar bugs

Antes de abrir uma issue, verifique se o bug já foi reportado na [lista de issues abertas](https://github.com/FelipeSilva10/Bloquin/issues).

Use o [template de bug report](https://github.com/FelipeSilva10/Bloquin/issues/new?template=bug_report.yml) e inclua:

- Versão do Bloquin (visível no título da janela ou em "Sobre")
- Sistema operacional e versão
- Placa utilizada (Arduino Uno, ESP32, etc.)
- Passos exatos para reproduzir o problema
- O que aconteceu vs. o que era esperado
- Logs de erro (disponíveis em `Ajuda → Ver logs` ou no terminal)

---

## Como sugerir funcionalidades

Use o [template de feature request](https://github.com/FelipeSilva10/Bloquin/issues/new?template=feature_request.yml). Descreva:

- Qual problema a funcionalidade resolve
- A solução que você imagina
- Alternativas que já considerou
- Se a funcionalidade faz sentido no contexto educacional do projeto

Funcionalidades complexas devem ser discutidas antes de implementadas — abra uma [Discussion](https://github.com/FelipeSilva10/Bloquin/discussions) primeiro.

---

## Configuração do ambiente de desenvolvimento

### Pré-requisitos

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org/) |
| Rust | stable | [rustup.rs](https://rustup.rs/) |
| Dependências do Tauri | — | [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/) |

### Passos

```bash
git clone https://github.com/FelipeSilva10/Bloquin.git
cd bloquin
npm install
```

Coloque o binário `arduino-cli` em `src-tauri/resources/`:
- Linux: extraia de `arduino-cli_*_Linux_64bit.tar.gz` e renomeie para `arduino-cli`
- Windows: extraia de `arduino-cli_*_Windows_64bit.zip` (já vem como `arduino-cli.exe`)

Crie um arquivo `.env` na raiz com as variáveis do Supabase:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Inicie o dev server:

```bash
npm run tauri dev
```

### Comandos úteis

```bash
npm run build          # Build TypeScript + Vite (sem Tauri)
npx tsc --noEmit       # Verificação de tipos
npm run lint           # ESLint
cargo check --manifest-path src-tauri/Cargo.toml   # Verificação Rust
npm run tauri build    # Build completo com Tauri
```

---

## Padrões de código

### TypeScript / React

- **TypeScript strict mode** está ativo. Não desabilite regras via `// @ts-ignore` sem justificativa.
- Componentes funcionais com hooks; sem class components.
- Props tipadas com interfaces explícitas.
- Evite `any`; use tipos genéricos ou `unknown` quando necessário.

### Rust

- Siga o `rustfmt` padrão (`cargo fmt` antes de commitar).
- Erros devem usar `Result<T, E>` — evite `unwrap()` em código de produção.
- Documente funções públicas com comentários `///`.

### CSS / Estilo

- Estilos inline apenas para valores dinâmicos.
- Classes CSS em `App.css` ou arquivos `.module.css` por componente.

---

## Commits convencionais

Este projeto usa [Conventional Commits](https://www.conventionalcommits.org/) para geração automática do CHANGELOG.

### Formato

```
<tipo>[escopo opcional]: <descrição curta>

[corpo opcional]

[rodapé opcional]
```

### Tipos aceitos

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `perf` | Melhoria de performance |
| `refactor` | Refatoração sem mudança de comportamento |
| `docs` | Documentação |
| `style` | Formatação, sem mudança de lógica |
| `test` | Adição ou correção de testes |
| `chore` | Tarefas de manutenção, dependências |
| `ci` | Mudanças em workflows do GitHub Actions |
| `revert` | Reverte um commit anterior |

### Exemplos

```
feat(blocos): adiciona categoria de servo motor com 3 blocos
fix(serial): corrige leitura de porta COM em Windows 11
docs: atualiza guia de instalação no README
chore: atualiza arduino-cli para 1.5.0
feat!: remove suporte ao Arduino UNO R1

BREAKING CHANGE: apenas Arduino UNO R3+ é suportado a partir desta versão.
```

### Escopos comuns

`blocos`, `geradores`, `toolbox`, `serial`, `compilação`, `ui`, `auth`, `dashboard`, `supabase`, `tauri`

---

## Processo de Pull Request

1. Faça um **fork** do repositório e crie uma branch a partir de `main`:
   ```bash
   git checkout -b feat/nome-da-feature
   ```

2. Implemente as mudanças seguindo os padrões acima.

3. Garanta que o CI passa localmente:
   ```bash
   npx tsc --noEmit
   cargo check --manifest-path src-tauri/Cargo.toml
   ```

4. Abra o PR para a branch `main` com:
   - Título no formato de commit convencional
   - Descrição clara do que foi feito e por quê
   - Link para a issue relacionada (`Closes #123`)
   - Prints ou GIFs se houver mudanças visuais

5. Aguarde revisão. PRs sem descrição ou que quebrem o CI não serão mergeados.

### Regras para merge

- CI verde (lint + Rust check)
- Ao menos uma aprovação de um maintainer
- Sem conflitos com `main`

---

## Versionamento e releases

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/):

- `MAJOR`: mudanças incompatíveis com versões anteriores
- `MINOR`: novas funcionalidades compatíveis
- `PATCH`: correções de bugs

Depois de validar a versão localmente, os maintainers criam a release via tag:

```bash
git add -A
git commit -m "chore(release): prepara v1.1.0"
git tag -a v1.1.0 -m "Bloquin IDE v1.1.0"
git push origin main
git push origin v1.1.0
```

O GitHub Actions dispara com a tag, executa o build Windows, gera as notas via
`git-cliff`, calcula os checksums e publica a release automaticamente. Substitua
`v1.1.0` pelo próximo número quando preparar uma versão futura.

Colaboradores externos **não precisam** criar tags — apenas abra PRs.
