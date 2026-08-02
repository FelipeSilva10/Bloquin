import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOQUIN_PROJECT_FORMAT,
  BLOQUIN_PROJECT_SCHEMA_VERSION,
  MAX_PROJECT_FILE_BYTES,
  makeUniqueProjectName,
  parseProjectFileContents,
} from '../src/types/project.ts';

function validFile(overrides = {}) {
  return {
    format: BLOQUIN_PROJECT_FORMAT,
    schemaVersion: BLOQUIN_PROJECT_SCHEMA_VERSION,
    project: { name: 'Semáforo', description: '', targetBoard: 'uno' },
    workspace: { blocks: { languageVersion: 0, blocks: [] } },
    ...overrides,
  };
}

test('aceita um projeto Bloquin válido', () => {
  const parsed = parseProjectFileContents(JSON.stringify(validFile()), 'semaforo.json');
  assert.equal(parsed.project.name, 'Semáforo');
  assert.equal(parsed.project.targetBoard, 'uno');
});

test('usa o nome do arquivo quando o projeto não traz nome válido', () => {
  const parsed = parseProjectFileContents(JSON.stringify(validFile({
    project: { name: '   ', targetBoard: 'esp32' },
  })), 'Robo explorador.json');
  assert.equal(parsed.project.name, 'Robo explorador');
});

test('rejeita JSON corrompido, formato estranho e workspace inválido', () => {
  assert.throws(() => parseProjectFileContents('{', 'quebrado.json'), /corrompido/i);
  assert.throws(() => parseProjectFileContents(JSON.stringify({ ...validFile(), format: 'outro' })), /não é um projeto/i);
  assert.throws(() => parseProjectFileContents(JSON.stringify(validFile({ workspace: { blocks: [] } }))), /lista de blocos/i);
});

test('rejeita propriedades perigosas e arquivos acima do limite', () => {
  const dangerous = `{"format":"bloquin-project","schemaVersion":1,"project":{"name":"X","targetBoard":"uno"},"workspace":{"__proto__":{}}}`;
  assert.throws(() => parseProjectFileContents(dangerous), /propriedade não permitida/i);
  assert.throws(() => parseProjectFileContents('x'.repeat(MAX_PROJECT_FILE_BYTES + 1)), /8 MB/i);
});

test('gera nomes alternativos sem substituir projetos existentes', () => {
  assert.equal(makeUniqueProjectName('Robô', ['Outro']), 'Robô');
  assert.equal(makeUniqueProjectName('Robô', ['robô']), 'Robô (importado)');
  assert.equal(makeUniqueProjectName('Robô', ['Robô', 'Robô (importado)']), 'Robô (importado 2)');
});
