import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Leitura de texto puro (sem importar os módulos de verdade) para não
// arrastar dependências de asset/Vite (ex. `features/components/catalog.ts`
// importa imagens) para dentro do Node puro que roda esta suíte.
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const blocksSource = source('../src/blockly/blocks.ts');
const registrySource = source('../src/features/blockDocs/registry.ts');
const examplesSource = source('../src/features/blockDocs/examples.ts');
const toolboxSource = source('../src/blockly/toolbox.ts');

const FIELD_KEYWORDS = new Set([
  'input_statement', 'field_dropdown', 'input_value', 'field_number', 'input_dummy', 'field_input',
]);

function extractRegisteredBlockTypes(src) {
  const jsonTypes = [...src.matchAll(/\{ type: '([a-z0-9_]+)'/g)]
    .map((match) => match[1])
    .filter((type) => !FIELD_KEYWORDS.has(type));
  const imperativeTypes = [...src.matchAll(/Blockly\.Blocks\['([a-z0-9_]+)'\]/g)].map((match) => match[1]);
  return new Set([...jsonTypes, ...imperativeTypes]);
}

function extractRegistryKeys(src) {
  return new Set([...src.matchAll(/^\s{2}([a-z0-9_]+): \{/gm)].map((match) => match[1]));
}

test('todo bloco registrado em Blockly.Blocks tem uma entrada de documentação, e vice-versa', () => {
  const registeredTypes = extractRegisteredBlockTypes(blocksSource);
  const registryKeys = extractRegistryKeys(registrySource);

  assert.ok(registeredTypes.size >= 78, `esperava pelo menos 78 blocos registrados, encontrei ${registeredTypes.size}`);

  const missingFromRegistry = [...registeredTypes].filter((type) => !registryKeys.has(type));
  const staleInRegistry = [...registryKeys].filter((type) => !registeredTypes.has(type));

  assert.deepEqual(missingFromRegistry, [], 'blocos sem entrada em src/features/blockDocs/registry.ts');
  assert.deepEqual(staleInRegistry, [], 'entradas em registry.ts que não correspondem a nenhum bloco registrado');
});

test('todo exampleId citado no registro existe de fato em examples.ts', () => {
  const exampleIdMatches = [...examplesSource.matchAll(/^\s+'([a-z0-9-]+)',\n\s+'[^']*',\n\s+'(?:uno|nano|esp32)',/gm)]
    .map((match) => match[1]);
  const declaredExampleIds = new Set(exampleIdMatches);
  assert.ok(declaredExampleIds.size >= 15, `esperava vários exemplos declarados, encontrei ${declaredExampleIds.size}`);

  const referencedExampleIds = [...registrySource.matchAll(/exampleIds: \[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((inner) => inner[1]));

  const unknownReferences = referencedExampleIds.filter((id) => !declaredExampleIds.has(id));
  assert.deepEqual(unknownReferences, [], 'registry.ts referencia exampleIds que não existem em examples.ts');
});

test('categorias usadas pela documentação existem na toolbox real', () => {
  const toolboxCategoryNames = new Set([...toolboxSource.matchAll(/kind: 'category', name: '([^']+)'/g)].map((match) => match[1]));
  assert.ok(toolboxCategoryNames.size === 14, `esperava 14 categorias na toolbox, encontrei ${toolboxCategoryNames.size}`);
});
