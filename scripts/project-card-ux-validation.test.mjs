import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const welcomeSource = readFileSync(new URL('../src/screens/WelcomeScreen.tsx', import.meta.url), 'utf8');
const welcomeCss = readFileSync(new URL('../src/screens/WelcomeScreen.css', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../src/services/localProjectStore.ts', import.meta.url), 'utf8');
const thumbnailSource = readFileSync(new URL('../src/blockly/blockThumbnail.ts', import.meta.url), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Marcador de início ausente: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Marcador de fim ausente: ${endMarker}`);
  return source.slice(start, end);
}

const cardSource = sliceBetween(welcomeSource, 'function LocalProjectCard(', 'export function WelcomeScreen(');

test('miniatura do card é derivada dos blocos do projeto, não uma imagem estática por projeto', () => {
  assert.match(welcomeSource, /function ProjectThumbnail\(\{ colours \}: \{ colours: string\[\] \}\)/u);
  // Sem import de imagem/arquivo específico de projeto — só as cores computadas.
  assert.doesNotMatch(sliceBetween(welcomeSource, 'function ProjectThumbnail', 'function LocalProjectCard'), /\.(png|jpg|jpeg|svg)/iu);
  assert.match(cardSource, /<ProjectThumbnail colours=\{project\.thumbnailColours\} \/>/u);

  // Fallback para projeto sem blocos reconhecíveis (miniatura vazia).
  assert.match(welcomeSource, /if \(colours\.length === 0\)/u);
});

test('thumbnailColours vem de blockThumbnail.ts, sem renderizar Blockly na tela inicial', () => {
  assert.match(storeSource, /import \{ getProjectThumbnailColours \} from '\.\.\/blockly\/blockThumbnail';/u);
  assert.match(storeSource, /thumbnailColours: getProjectThumbnailColours\(parsed\.workspace\)/u);
  // blockThumbnail.ts não pode importar o pacote Blockly (pesado) — a tela
  // inicial carrega esse módulo sempre, diferente da IDE (lazy em App.tsx).
  assert.doesNotMatch(thumbnailSource, /from ['"]blockly/u);
  assert.match(thumbnailSource, /import \{ toolboxConfig \} from '\.\/toolbox';/u);
});

test('data do card usa formatProjectUpdatedAt (Intl nativo), não mais toLocaleDateString solto', () => {
  assert.match(welcomeSource, /import \{ formatProjectUpdatedAt \} from '\.\.\/lib\/projectDate';/u);
  assert.match(cardSource, /formatProjectUpdatedAt\(project\.updatedAt\)/u);
  assert.doesNotMatch(cardSource, /toLocaleDateString/u);
});

test('menu de três pontos tem as cinco ações mínimas, cada uma reaproveitando uma função existente', () => {
  assert.match(cardSource, /Abrir\s*<\/button>/u);
  assert.match(cardSource, /Renomear\s*<\/button>/u);
  assert.match(cardSource, /Duplicar\s*<\/button>/u);
  assert.match(cardSource, /Exportar JSON\s*<\/button>/u);
  assert.match(cardSource, /confirmingDelete \? `Excluir "\$\{project\.name\}"\?` : 'Excluir'/u);

  assert.match(cardSource, /onClick=\{\(\) => \{ onCloseMenu\(\); onOpen\(project\); \}\}/u);
  assert.match(cardSource, /onClick=\{\(\) => void runMenuAction\(\(\) => onDuplicate\(project\)\)\}/u);
  assert.match(cardSource, /onClick=\{\(\) => void runMenuAction\(\(\) => onExport\(project\)\)\}/u);
});

test('duplicar e exportar reaproveitam a persistência e o exportador locais já existentes', () => {
  assert.match(storeSource, /export async function duplicateLocalProject/u);
  assert.match(storeSource, /makeUniqueProjectName\(source\.project\.name, projects\.map\(\(project\) => project\.name\), 'cópia'\)/u);
  // Mesmo mecanismo de identidade de createLocalProject/persistLocalProject (checado também em local-project-persistence-validation).
  assert.match(storeSource, /await join\(dir, `\$\{crypto\.randomUUID\(\)\}\.json`\)/u);

  assert.match(welcomeSource, /import \{ exportLocalProjectFile, isTauriRuntime, openLocalProjectFile \} from '\.\.\/services\/localProjectService';/u);
  assert.match(welcomeSource, /await exportLocalProjectFile\(JSON\.stringify\(file, null, 2\), projectFileSlug\(file\.project\.name\)\)/u);
});

test('renomear, duplicar e excluir recarregam a lista a partir da persistência (sem patch manual que possa divergir do arquivo)', () => {
  const renameHandler = sliceBetween(welcomeSource, 'const handleRenameProject', 'const handleDuplicateProject');
  const duplicateHandler = sliceBetween(welcomeSource, 'const handleDuplicateProject', 'const handleExportProject');
  const deleteHandler = sliceBetween(welcomeSource, 'const handleDeleteProject', 'const sessionProjects');

  for (const handler of [renameHandler, duplicateHandler, deleteHandler]) {
    assert.match(handler, /await refreshProjects\(\);/u);
  }
});

test('apenas um menu de projeto fica aberto por vez — estado é do pai (WelcomeScreen), não duplicado por card', () => {
  assert.match(welcomeSource, /const \[openMenuFilePath, setOpenMenuFilePath\] = useState<string \| null>\(null\);/u);
  assert.match(welcomeSource, /menuOpen=\{openMenuFilePath === project\.filePath\}/u);
  assert.match(
    welcomeSource,
    /onToggleMenu=\{\(\) => setOpenMenuFilePath\(\(current\) => \(current === project\.filePath \? null : project\.filePath\)\)\}/u,
  );
  // LocalProjectCard não tem seu próprio useState para menuOpen.
  assert.doesNotMatch(cardSource, /const \[menuOpen, setMenuOpen\]/u);
});

test('clique fora fecha o menu, Escape fecha e devolve o foco ao gatilho', () => {
  assert.match(cardSource, /const closeOnOutsideClick = \(event: MouseEvent\) => \{/u);
  assert.match(cardSource, /if \(menuRef\.current && !menuRef\.current\.contains\(event\.target as Node\)\) onCloseMenu\(\);/u);
  assert.match(cardSource, /if \(event\.key !== 'Escape'\) return;/u);
  assert.match(cardSource, /onCloseMenu\(\);\s*\n\s*triggerRef\.current\?\.focus\(\);/u);
});

test('menu mede a viewport antes de pintar para nunca abrir cortado pela borda da janela', () => {
  assert.match(cardSource, /useLayoutEffect\(\(\) => \{/u);
  assert.match(cardSource, /setOpenUpward\(list\.getBoundingClientRect\(\)\.bottom > window\.innerHeight\)/u);
  assert.match(welcomeCss, /\.project-card-menu-list--up \{ top: auto; bottom: 32px; \}/u);
});
