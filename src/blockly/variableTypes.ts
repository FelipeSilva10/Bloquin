import * as Blockly from 'blockly/core';
import { variableValueType, type BlocklyValueType } from './contracts';
import { toCppIdentifier } from './identifiers';

function checksOverlap(
  first: string[] | null | undefined,
  second: string[] | null | undefined,
): boolean {
  if (!first || !second) return true;
  return first.some((type) => second.includes(type));
}

function setInputCheckWithoutBreakingLegacyConnection(
  block: Blockly.Block,
  inputName: string,
  type: BlocklyValueType | null,
) {
  const connection = block.getInput(inputName)?.connection;
  if (!connection) return;
  const target = connection.targetConnection;
  if (target && type && !checksOverlap(target.getCheck(), [type])) {
    // Projetos antigos aceitavam qualquer valor nas variáveis. Mantemos uma
    // conexão antiga incompatível para que o projeto abra e a auditoria possa
    // indicar a correção, mas novas conexões passam a obedecer ao contrato.
    connection.setCheck(null);
    return;
  }
  connection.setCheck(type);
}

function setOutputCheckWithoutBreakingLegacyConnection(
  block: Blockly.Block,
  type: BlocklyValueType | null,
) {
  const connection = block.outputConnection;
  if (!connection) return;
  const target = connection.targetConnection;
  if (target && type && !checksOverlap(target.getCheck(), [type])) {
    connection.setCheck(null);
    return;
  }
  connection.setCheck(type);
}

/**
 * Sincroniza o contrato visual das variáveis com o tipo de sua declaração.
 * É chamada após carregar projetos antigos e antes de auditar/gerar código,
 * cobrindo também workspaces headless usados nos testes.
 */
export function synchronizeVariableTypes(workspace: Blockly.Workspace) {
  const blocks = workspace.getAllBlocks(false);
  const declarations = new Map<string, BlocklyValueType>();

  for (const block of blocks) {
    if (block.type !== 'declarar_variavel_global') continue;
    const name = toCppIdentifier(block.getFieldValue('NOME'), 'minha_var', 'var');
    if (!declarations.has(name)) {
      declarations.set(name, variableValueType(block.getFieldValue('TIPO')));
    }
  }

  for (const block of blocks) {
    if (block.type === 'declarar_variavel_global') {
      setInputCheckWithoutBreakingLegacyConnection(
        block,
        'VALOR',
        variableValueType(block.getFieldValue('TIPO')),
      );
      continue;
    }

    const name = toCppIdentifier(
      block.getFieldValue('NOME'),
      block.type === 'incrementar_variavel' ? 'contador' : 'minha_var',
      'var',
    );
    const type = declarations.get(name) ?? null;
    if (block.type === 'atribuir_variavel') {
      setInputCheckWithoutBreakingLegacyConnection(block, 'VALOR', type);
    } else if (block.type === 'ler_variavel') {
      setOutputCheckWithoutBreakingLegacyConnection(block, type);
    }
  }
}
