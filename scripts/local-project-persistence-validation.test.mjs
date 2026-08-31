import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storeSource = readFileSync(new URL('../src/services/localProjectStore.ts', import.meta.url), 'utf8');
const ideSource = readFileSync(new URL('../src/screens/IdeScreen.tsx', import.meta.url), 'utf8');
const welcomeSource = readFileSync(new URL('../src/screens/WelcomeScreen.tsx', import.meta.url), 'utf8');

function fnBody(source, exportedName) {
  const marker = `export async function ${exportedName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Função ausente: ${exportedName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 1;
  for (let index = bodyStart + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }
  assert.fail(`Função sem fechamento: ${exportedName}`);
}

test('"Abrir arquivo JSON" e "Criar novo projeto" abrem a mesma aba local-file, sem um segundo caminho de importação', () => {
  // A diferença entre os dois fluxos é só a origem do filePath (dentro ou
  // fora da pasta gerenciada); ambos usam source: 'local-file' e passam
  // pelo mesmo openProject/openParsedProject — não existe um tipo de aba
  // "importado" paralelo.
  assert.match(welcomeSource, /createLocalProject\('Meu projeto', null\)/u);
  assert.match(welcomeSource, /openProject\(\{ title: file\.project\.name, source: 'local-file', filePath, board: null \}\)/u);
  assert.match(welcomeSource, /const openParsedProject = \(contents: string, filePath: string\) => \{/u);
  const openParsedProjectBody = welcomeSource.slice(welcomeSource.indexOf('const openParsedProject ='));
  assert.match(openParsedProjectBody.slice(0, 400), /source: 'local-file'/u);
});

test('isPersistedProjectPath reconhece um projeto pela pasta gerenciada de projetos locais', () => {
  const body = fnBody(storeSource, 'isPersistedProjectPath');
  assert.match(body, /getProjectsDir\(\)/u);
  assert.match(body, /dirname\(filePath\)/u);
  assert.match(body, /parent === dir/u);
});

test('persistLocalProject faz UPDATE em projetos já persistidos e INSERT (mesmo mecanismo de createLocalProject) nos ainda não persistidos', () => {
  const body = fnBody(storeSource, 'persistLocalProject');

  // Já persistido (dentro da pasta gerenciada) -> grava no mesmo arquivo, sem novo id.
  assert.match(body, /isPersistedProjectPath\(filePath\)/u);
  assert.match(body, /await writeLocalProject\(filePath, file\);\s*\n\s*return filePath;/u);

  // Ainda não persistido (ex.: aberto via "Abrir arquivo JSON") -> cria um
  // novo registro na mesma pasta usada por createLocalProject, com um id
  // próprio e estável (crypto.randomUUID), nunca reaproveitando o
  // filePath externo original.
  assert.match(body, /getProjectsDir\(\)/u);
  assert.match(body, /crypto\.randomUUID\(\)\}\.json/u);
  assert.match(body, /writeLocalProject\(newFilePath, file\)/u);

  // createLocalProject (usado por "Criar novo projeto") e duplicateLocalProject
  // (usado por "Duplicar") montam o caminho exatamente da mesma forma —
  // mesma construção de id, reaproveitada, não duplicada em um mecanismo à parte.
  const idPathOccurrences = storeSource.match(/await join\(dir, `\$\{crypto\.randomUUID\(\)\}\.json`\)/gu) ?? [];
  assert.equal(
    idPathOccurrences.length,
    3,
    'createLocalProject, persistLocalProject e duplicateLocalProject devem gerar o path da mesma forma',
  );
});

test('"Salvar" em um projeto local promove o arquivo à pasta gerenciada sem diálogo; "Salvar como" preserva o diálogo do sistema', () => {
  const saveStart = ideSource.indexOf('const handleSaveProject = async (saveAs = false)');
  assert.notEqual(saveStart, -1, 'handleSaveProject não encontrado');
  const saveBody = ideSource.slice(saveStart, saveStart + 2000);

  assert.match(
    saveBody,
    /!saveAs && isTauriRuntime\(\)\s*\n\s*\? await persistLocalProject\(activeTab\.filePath, file\)\s*\n\s*: await saveLocalProjectFile\(/u,
    'Salvar (sem saveAs) deve persistir via persistLocalProject; Salvar como deve continuar usando saveLocalProjectFile',
  );

  // Nenhum estado de "salvo" é aplicado antes de a escrita real terminar
  // com sucesso — erro de persistência não deve marcar o projeto como
  // persistido nem descartar o conteúdo aberto.
  const filePathAssignment = saveBody.indexOf('if (!filePath) return false;');
  assert.ok(filePathAssignment > saveBody.indexOf('const filePath ='));
  assert.match(saveBody.slice(filePathAssignment), /updateTab\(activeTab\.id, \{/u);
});

test('autosave e a escrita de saída da aba usam um ref sincronizado com activeTab.filePath, não o valor travado no fechamento do efeito', () => {
  assert.match(ideSource, /const filePathRef = useRef\(activeTab\.filePath\);/u);
  assert.match(
    ideSource,
    /useEffect\(\(\) => \{\s*\n\s*filePathRef\.current = activeTab\.filePath;\s*\n\s*\}, \[activeTab\.filePath\]\);/u,
    'filePathRef precisa ser resincronizado sempre que activeTab.filePath mudar (ex.: após a primeira persistência de um JSON importado)',
  );

  // O listener de autosave (registrado uma única vez por aba) e a limpeza
  // no unmount não podem ler activeTab.filePath diretamente: se o Salvar
  // trocar o filePath da aba (promovendo um projeto importado), esse
  // fechamento continuaria com o caminho externo antigo.
  assert.doesNotMatch(
    ideSource,
    /activeTab\.source === 'local-file' && activeTab\.filePath/u,
    'condição de autosave/cleanup não deve mais depender do activeTab.filePath travado no fechamento',
  );
  const localFileGuards = ideSource.match(/activeTab\.source === 'local-file' && filePathRef\.current/gu) ?? [];
  assert.equal(localFileGuards.length, 2, 'autosave e cleanup devem checar filePathRef.current');
});
