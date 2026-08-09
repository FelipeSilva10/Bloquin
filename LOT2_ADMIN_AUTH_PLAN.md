# SAG — decisão de integração

> Arquivo atualizado em 08/08/2026. O plano de handoff automático descrito em
> versões anteriores foi descontinuado e não deve ser reativado.

## Estado atual

O Bloquin oferece o **SAG** como uma aba interna de orientação e status. Essa
aba verifica a disponibilidade do serviço e permite que o professor abra,
explicitamente, a página de login do próprio SAG no navegador padrão.

- não há troca de token, código de uso único ou sessão entre Bloquin e SAG;
- não há iframe para uma origem que possui sessão própria `SameSite=Strict`;
- não há segunda janela Tauri nem comando nativo para painel administrativo;
- a autenticação continua pertencendo exclusivamente ao SAG.

Essa escolha evita que uma conta Bloquin seja usada para autenticar o SAG sem
consentimento e preserva as proteções de cookie do domínio institucional.

## Limite técnico conhecido

O SAG não pode ser exibido como uma página remota dentro da aba atual sem um
contrato do próprio SAG para incorporação segura. Além das restrições de cookie
e CSP, a versão atual do Tauri não expõe um webview filho estável para esse
caso. Por isso, a aba interna não simula uma autenticação embutida.

Uma futura integração embutida exige, antes de qualquer mudança no Bloquin:

1. contrato de autenticação e embeddability definido pelo SAG;
2. revisão de segurança de cookies, CSP e isolamento entre origens;
3. prova de funcionamento no WebView2 (Windows) e WebKitGTK (Linux);
4. testes de login, logout, expiração e indisponibilidade sem compartilhar
   credenciais entre aplicações.

## Legado de infraestrutura

A migration histórica de handoff permanece intocada porque migrations já
aplicadas não são reescritas neste repositório. O cliente, os comandos Tauri,
as Edge Functions locais e os testes desse fluxo foram removidos. Caso ainda
existam Edge Functions implantadas remotamente, sua desativação deve ser feita
pela equipe responsável pelo ambiente após confirmar que nenhum consumidor
externo depende delas; esta alteração não executa operação remota mutável.
