import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const catalog = source('../src/features/components/catalog.ts');
const types = source('../src/features/components/types.ts');
const screen = source('../src/screens/ComponentsScreen.tsx');
const tabs = source('../src/state/tabsStore.tsx');
const app = source('../src/App.tsx');
const studentDashboard = source('../src/screens/StudentDashboard.tsx');
const teacherDashboard = source('../src/screens/TeacherDashboard.tsx');

test('catálogo centralizado cobre os componentes iniciais e IDs estáveis', () => {
  for (const id of [
    'esp32-devkit-v1',
    'arduino-uno',
    'led-5mm',
    'resistor',
    'push-button',
    'passive-buzzer',
    'ldr',
    'hc-sr04',
    'mpu6050',
    'l298n',
    'dc-motor',
  ]) {
    assert.match(catalog, new RegExp(`id: '${id}'`));
  }

  for (const category of [
    'microcontrollers',
    'sensors',
    'actuators',
    'modules',
    'motors',
    'electronic-components',
    'power',
    'communication',
    'tools',
  ]) {
    assert.match(catalog, new RegExp(`id: '${category}'`));
  }

  assert.match(types, /export type ComponentId/u);
  assert.match(types, /relatedComponentIds: readonly ComponentId\[\]/u);
  assert.match(types, /relatedBlocks: readonly ComponentBlockLink\[\]/u);
});

test('hub permite explorar, buscar, abrir detalhes e recuar sem outra aba', () => {
  assert.match(screen, /type="search"/u);
  assert.match(screen, /getComponentsByCategory/u);
  assert.match(screen, /getComponentById/u);
  assert.match(screen, /function ComponentDetail/u);
  assert.match(screen, /onBack/u);
  assert.match(screen, /onError=\{\(\) => setImageFailed\(true\)\}/u);
  assert.match(screen, /<ComponentIllustration kind=\{item\.illustration\} \/>/u);
});

test('Componentes é uma página interna comum, acionável nas duas dashboards', () => {
  assert.match(tabs, /InternalPageType = 'library' \| 'components' \| 'sag'/u);
  assert.match(tabs, /const openInternalPage = useCallback\(\(type: InternalPageType\)/u);
  assert.match(app, /openInternalPage\('components'\)/u);
  assert.match(app, /path="\/componentes"/u);
  assert.match(studentDashboard, /onOpenComponents/u);
  assert.match(teacherDashboard, /onOpenComponents/u);
});

test('ficha do aluno declara espaços de mídia e revela detalhes técnicos depois do essencial', () => {
  assert.match(types, /export type ComponentMediaRole = 'main' \| 'pinout' \| 'connection';/u);
  assert.match(types, /export interface ComponentStudentContent/u);
  assert.match(types, /readonly student: ComponentStudentContent;/u);
  assert.match(types, /src\/assets\/components\/<id>\/<role>\.webp\|svg/u);
  assert.match(screen, /function ComponentMediaSlot/u);
  assert.match(screen, /role="main"/u);
  assert.match(screen, /role="pinout"/u);
  assert.match(screen, /role="connection"/u);
  assert.match(screen, /Imagem em preparação/u);
  assert.match(screen, /data-asset-path=\{`src\/assets\/components\/\$\{component\.id\}\/\$\{role\}\.webp`\}/u);
  assert.match(screen, /component\.student\.whatIs/u);
  assert.match(screen, /component\.student\.usefulFor/u);
  assert.match(screen, /component\.student\.howToConnect/u);
  assert.match(screen, /component\.student\.attention/u);
  assert.match(screen, /COMPONENT_CATEGORIES\.filter\(\(category\) => getComponentsByCategory\(category\.id\)\.length > 0\)/u);
});
