# Lote 2 — autenticação segura do painel administrativo

**Estado:** implementação local concluída; rollout remoto não executado.

## Objetivo e descoberta

O backend de `sagsite.vercel.app` foi localizado no repositório local
`/home/felipe/Desktop/Bloquin/SAG`, cujo remote é
`FelipeSilva10/oficina-admin-web`.

O fluxo anterior:

- lia `access_token` e `refresh_token` no Bloquin;
- entregava ambos ao comando Tauri;
- injetava os tokens em uma página externa por JavaScript;
- apenas focalizava uma janela antiga;
- aceitava no SAG um cookie JSON sem assinatura e um estado persistido no
  `localStorage`.

Todo esse caminho foi removido na implementação local.

## Arquitetura implementada

```text
Bloquin autenticado
  │ JWT atual + session_token local, somente para backend próprio
  ▼
Edge Function admin-handoff-request
  │ valida Auth, auth.sessions, role, status e user_sessions
  │ persiste apenas SHA-256; TTL = 60 s
  ▼
Tauri abre /auto-login#code=<256 bits>
  │ destrói qualquer janela administrativa anterior
  ▼
POST sagsite.vercel.app/api/auth/handoff
  │ consumo atômico, único e com revalidação
  ▼
Cookie __Host-sag_session
  HttpOnly; Secure; SameSite=Strict; token opaco
  │ banco armazena somente SHA-256
  ▼
Middleware/API do SAG revalidam sessão, role e sessão de origem
```

O fragmento `#code` não é enviado no request HTTP. A página o remove do
histórico antes de fazer o `POST`.

## Banco e RPCs

Migration:

- `supabase/migrations/20260730161828_secure_admin_panel_handoff.sql`

Objetos:

- `private.admin_panel_handoffs`: hash do código, ator, hash da sessão de
  origem, `auth.sessions.id`, finalidade, audiência, expiração, consumo e
  invalidação;
- evolução de `public.backoffice_sessions`: hash de origem, handoff,
  `last_seen_at`, revogação e motivo;
- `issue_admin_panel_handoff`;
- `consume_admin_panel_handoff`;
- `create_backoffice_session`;
- `validate_backoffice_session`;
- `revoke_backoffice_session`;
- `revoke_admin_panel_access`.

As funções usam `SECURITY DEFINER`, `search_path` vazio e grants exclusivos
para `service_role`. A tabela privada não recebe acesso direto nem mesmo do
`service_role`; o acesso ocorre somente pelas funções delimitadas.

## Contrato HTTP

### Emissão — Supabase Edge Function

`POST /functions/v1/admin-handoff-request`

Headers:

- `Authorization: Bearer <JWT atual do Bloquin>`;
- `apikey: <publishable key>`;
- `Content-Type: application/json`.

Body:

```json
{ "sessionToken": "<token local de public.user_sessions>" }
```

Resposta `200`:

```json
{
  "code": "<Base64URL de 43 caracteres>",
  "actorId": "<UUID do Auth>",
  "expiresAt": "<timestamp ISO>"
}
```

Falhas: `400` payload inválido, `401` sessão Auth inválida, `403` perfil ou
sessão de origem sem autorização, `500` falha interna sem detalhes sensíveis.

### Troca — SAG

`POST /api/auth/handoff`

Body:

```json
{ "code": "<Base64URL de 43 caracteres>" }
```

Resposta `200` contém apenas dados públicos do ator e define
`__Host-sag_session`. O código nunca é devolvido. Código ausente é `400`;
expirado, consumido ou inválido é `401`.

### Introspecção e logout

- `GET /api/auth/session`: revalida o cookie no banco e devolve somente o ator;
- `DELETE /api/auth/login`: revoga a sessão server-side e remove cookies novo e
  legado;
- `POST /functions/v1/admin-session-revoke`: o Bloquin revoga sessões ligadas
  ao hash da sessão de origem antes de apagar `user_sessions`.

## Revogação

- novo handoff revoga a sessão administrativa anterior do professor;
- logout do Bloquin revoga pelo hash da sessão de origem;
- substituição de `user_sessions.session_token` invalida a sessão na próxima
  requisição;
- remoção da linha de `auth.sessions` elimina imediatamente os handoffs e
  sessões derivadas por `ON DELETE CASCADE`;
- heartbeat vencido há mais de 12 minutos invalida a sessão;
- mudança de role/status invalida a sessão;
- logout do SAG revoga o token do cookie;
- sessão própria possui expiração absoluta de oito horas;
- Tauri fecha a janela em logout, substituição e evento `SIGNED_OUT`.

## Modelo de ameaças

- replay: `SELECT ... FOR UPDATE` e `consumed_at`;
- vazamento do banco: código, sessão de origem e cookie existem apenas como
  SHA-256;
- URL, logs e Referer: código fica em fragmento e nenhum token é logado;
- cookie forjado: valor opaco precisa existir no banco;
- localStorage adulterado: estado do ator deixou de ser persistente e não
  autoriza o backend;
- professor tentando agir como outro: rotas GET ignoram o `professorId`
  controlado pelo cliente e operações mutáveis usam a identidade server-side;
- role revogada ou sessão principal substituída: revalidação em cada request;
- janela antiga: sempre destruída e recriada.

## Testes locais

- pgTAP com emissão positiva, aluno e roles negativas, hash-only, finalidade,
  TTL, consumo único, replay, expiração, substituição e revogação;
- integração real das duas Edge Functions contra Supabase local com usuários
  Auth de professor e aluno;
- integração HTTP completa Edge → endpoint Next do SAG → cookie → middleware,
  incluindo replay e revogação;
- testes puros dos geradores e hashes;
- testes do SAG para token, cookie e remoção dos tokens antigos;
- testes Rust para o formato do código;
- builds e verificações dos dois repositórios.

Resultado desta execução:

- `supabase test db`: 3 arquivos, 91 testes, todos aprovados;
- integração das Edge Functions com Auth local: aprovada;
- integração HTTP Edge → SAG → cookie → middleware: aprovada;
- advisor de segurança local: nenhum problema;
- lint do schema: nenhum erro;
- testes do Bloquin: handoff 5/5, sessões 5/5, Biblioteca 4/4 e Blockly
  69/69;
- Rust: `cargo check`, 2/2 testes e Clippy sem warnings;
- SAG: 7/7 testes, build Next e TypeScript aprovados;
- Bloquin: build de produção aprovado.

O advisor de desempenho mantém avisos preexistentes de políticas permissivas
duplicadas e um índice duplicado em domínios fora deste lote. Nenhum aviso
aponta para os objetos do handoff.

## Dependências de rollout

Nenhuma alteração remota foi executada. Para disponibilizar o fluxo:

1. revisar e aplicar a migration no projeto de desenvolvimento;
2. configurar `BLOQUIN_ALLOWED_ORIGINS` nas secrets das Edge Functions;
3. publicar `admin-handoff-request` e `admin-session-revoke`;
4. garantir no Vercel do SAG:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` e credenciais de banco já usadas pelo backend;
5. publicar o SAG;
6. publicar o Bloquin somente depois dos backends, evitando uma versão que peça
   handoff antes dos endpoints existirem;
7. executar o roteiro autenticado com professor, aluno, replay, logout e troca
   de sessão.

## Risco futuro fora do handoff

O login direto legado do SAG ainda consulta credenciais históricas em
`backoffice_admins`/`perfis`. Ele agora cria uma sessão opaca e não pode mais
forjar cookie, mas o armazenamento e a rotação dessas senhas devem ganhar uma
migration própria de hashing em uma fase de hardening, após inventário de todos
os consumidores legados.
