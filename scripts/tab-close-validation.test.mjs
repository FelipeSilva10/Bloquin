import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

function fnBody(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Trecho ausente: ${marker}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 1;
  for (let index = bodyStart + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }
  assert.fail(`Trecho sem fechamento: ${marker}`);
}

const workspaceTabsBody = fnBody(appSource, 'function WorkspaceTabs()');

test('botão "×" e botão da aba são elementos irmãos independentes, sem clique aninhado', () => {
  // O clique no "×" nunca deveria precisar de stopPropagation/preventDefault
  // para não disparar a ativação da aba: os dois botões são irmãos dentro de
  // .tab-item, cada um com seu próprio onClick — não há um dentro do outro.
  const markup = workspaceTabsBody.slice(workspaceTabsBody.indexOf('return ('));
  assert.match(markup, /className="tab-select" onClick=\{\(\) => handleActivate\(tab\.id\)\}/);
  assert.match(markup, /className="tab-close" aria-label=\{`Fechar \$\{tab\.title\}`\} onClick=\{\(\) => handleClose\(tab\.id, tab\.dirty\)\}/);
  assert.doesNotMatch(markup, /stopPropagation/);
});

test('fechar uma aba não ativa chama closeTab direto, sem navegar nem esperar um efeito', () => {
  const closeFn = fnBody(workspaceTabsBody, 'const closeTabAndNavigate = (id: string)');
  const notActiveBranch = closeFn.slice(0, closeFn.indexOf('const index ='));
  assert.match(notActiveBranch, /if \(!wasActive\)\s*\{[^}]*closeTab\(id\);[^}]*return;/s);
});

test('fechar a aba ativa não fecha antes de a navegação para o fallback ter sido disparada, mas fecha no mesmo clique (sem exigir um segundo clique)', () => {
  const closeFn = fnBody(workspaceTabsBody, 'const closeTabAndNavigate = (id: string)');
  // closeTab(id) não pode ser chamado de forma síncrona e incondicional aqui
  // para a aba ativa — isso é exatamente a causa raiz do bug de precisar
  // clicar duas vezes: closeTab() e o navigate() de fallback não commitam no
  // mesmo ciclo de render (TabsProvider e o router são fontes de estado
  // independentes), e fechar a aba antes da navegação "chegar" deixa
  // location.pathname apontando pra rota da aba recém-fechada por um
  // instante — o efeito de reconciliação de rotas em AppRoutes reabre a aba
  // ao ver essa URL "órfã".
  const activeBranch = closeFn.slice(closeFn.indexOf('const index ='));
  assert.doesNotMatch(activeBranch, /^\s*closeTab\(id\)/m);
  assert.match(activeBranch, /deferredCloseIdRef\.current = id;/);
  assert.match(activeBranch, /navigate\(getWorkspaceTabPath\(fallbackTab\), \{ state: getWorkspaceTabState\(fallbackTab\) \}\);/);
});

test('o fechamento adiado da aba ativa é resolvido por um useLayoutEffect (não useEffect) preso a location.key', () => {
  // useLayoutEffect garante que closeTab() rode e a re-renderização
  // resultante já esteja commitada ANTES do navegador pintar o frame — sem
  // isso (useEffect comum, que roda depois do paint), a barra de abas
  // pisca por um frame mostrando a aba antiga ainda presente enquanto o
  // conteúdo da página já trocou para o fallback.
  assert.match(
    workspaceTabsBody,
    /useLayoutEffect\(\(\) => \{\s*const pendingId = deferredCloseIdRef\.current;\s*if \(!pendingId\) return;\s*deferredCloseIdRef\.current = null;\s*closeTab\(pendingId\);/,
  );
  const effectDeps = workspaceTabsBody.match(/\}, \[location\.key\]\);/);
  assert.ok(effectDeps, 'o efeito de fechamento adiado precisa depender de location.key');
  // location.pathname não serve de dependência sozinho aqui: fechar uma aba
  // de projeto (rota genérica /ide) cujo fallback é outra aba de projeto
  // (também /ide) não muda o pathname, só a location.state/key — um efeito
  // preso só a pathname nunca dispararia nesse caso e a aba nunca fecharia.
  assert.doesNotMatch(workspaceTabsBody, /\}, \[location\.pathname\]\);/);
});

test('useLayoutEffect é importado de "react" (não useEffect sozinho) para o fechamento adiado', () => {
  assert.match(appSource, /import \{[^}]*\buseLayoutEffect\b[^}]*\} from 'react';/);
});
