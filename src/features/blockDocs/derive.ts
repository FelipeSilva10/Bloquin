import * as Blockly from 'blockly/core';
import { getToolboxConfig, toolboxConfig, BLOCK_NAMES } from '../../blockly/toolbox';
import {
  ESP_NOW_TYPES,
  SETUP_ONLY_TYPES,
  SINGLETON_BLOCKS,
  PIN_RULES,
} from '../../blockly/contracts';
import type { BoardKey } from '../../blockly/boards';
import { COMPONENT_CATALOG } from '../components/catalog';
import { BLOCK_DOC_REGISTRY } from './registry';
import { getPrerequisitesFor } from './prerequisites';
import { getExamplesForBlockType } from './examples';
import type { BlockPort, BlockPortType, ResolvedBlockDoc } from './types';

/** Os dois aliases legados nunca aparecem no manual visual — não dá para arrastá-los da paleta. */
const HIDDEN_FROM_DOCS = new Set(['util_map_float', 'util_fabsf']);

interface ToolboxBlockEntry {
  kind: string;
  type?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: { type: string } }>;
}

interface ToolboxCategoryEntry {
  kind: string;
  name?: string;
  colour?: string;
  contents: ToolboxBlockEntry[];
}

function flattenToolboxCategories(board: BoardKey): ToolboxCategoryEntry[] {
  return getToolboxConfig(board).contents as ToolboxCategoryEntry[];
}

function findToolboxEntry(type: string, board: BoardKey): { category: ToolboxCategoryEntry; entry: ToolboxBlockEntry } | null {
  for (const category of flattenToolboxCategories(board)) {
    for (const entry of category.contents) {
      if (entry.kind === 'block' && entry.type === type) return { category, entry };
    }
  }
  return null;
}

/** Categoria/cor de um bloco a partir do toolbox "canônico" (não depende de placa, exceto ESP-NOW). */
function findCategoryInfo(type: string): { name: string; colour: string } | null {
  const board: BoardKey = ESP_NOW_TYPES.has(type) ? 'esp32' : 'uno';
  const found = findToolboxEntry(type, board);
  if (found) return { name: found.category.name ?? '', colour: found.category.colour ?? '' };
  return null;
}

function portTypeFromCheck(check: unknown): BlockPortType {
  const value = Array.isArray(check) ? check[0] : check;
  if (value === 'Number' || value === 'Boolean' || value === 'String') return value;
  return 'Any';
}

/** Lê entradas/saída direto do bloco já registrado em `Blockly.Blocks` (única fonte de verdade). */
function readPortsFromBlock(type: string): { inputs: BlockPort[]; output: BlockPort | null; isStatement: boolean } {
  const definition = (Blockly.Blocks as Record<string, { init?: () => void } | undefined>)[type];
  const inputs: BlockPort[] = [];
  let output: BlockPort | null = null;
  let isStatement = false;
  if (!definition?.init) return { inputs, output, isStatement };

  // Instancia um bloco temporário sem workspace só para consultar sua forma
  // (mesma técnica seria arriscada num workspace real; aqui é isolado e descartado).
  const scratchWorkspace = new Blockly.Workspace();
  try {
    const block = scratchWorkspace.newBlock(type);
    for (const input of block.inputList) {
      if (input.type === Blockly.inputs.inputTypes.VALUE && input.connection) {
        inputs.push({ name: input.name, type: portTypeFromCheck(input.connection.getCheck()) });
      }
    }
    if (block.outputConnection) {
      output = { name: 'OUTPUT', type: portTypeFromCheck(block.outputConnection.getCheck()) };
    }
    isStatement = Boolean(block.previousConnection || block.nextConnection);
  } finally {
    scratchWorkspace.dispose();
  }
  return { inputs, output, isStatement };
}

const COMPONENT_NAMES_BY_BLOCK: Map<string, string[]> = (() => {
  const index = new Map<string, string[]>();
  for (const component of COMPONENT_CATALOG) {
    for (const link of component.relatedBlocks) {
      const names = index.get(link.blockType) ?? [];
      names.push(component.name);
      index.set(link.blockType, names);
    }
  }
  return index;
})();

function getUsedWith(type: string): string[] {
  const found = findToolboxEntry(type, ESP_NOW_TYPES.has(type) ? 'esp32' : 'uno');
  const shadowSiblings = found
    ? Object.values(found.entry.inputs ?? {}).map((input) => input.block?.type).filter((value): value is string => Boolean(value))
    : [];

  const coOccurring = getExamplesForBlockType(type)
    .flatMap((example) => example.blockTypes)
    .filter((candidate) => candidate !== type);

  return [...new Set([...shadowSiblings, ...coOccurring])];
}

export function getBlockDoc(type: string): ResolvedBlockDoc | null {
  const entry = BLOCK_DOC_REGISTRY[type];
  if (!entry) return null;

  const categoryInfo = findCategoryInfo(type);
  const { inputs, output, isStatement } = readPortsFromBlock(type);
  const singleton = SINGLETON_BLOCKS.find((rule) => rule.type === type);

  return {
    type,
    displayName: BLOCK_NAMES[type] ?? type,
    category: categoryInfo?.name ?? (type === 'bloco_setup' || type === 'bloco_loop' ? 'Estrutura' : 'Outros'),
    colour: categoryInfo?.colour ?? '0',
    summary: entry.summary,
    whatItDoes: entry.whatItDoes,
    whenToUse: entry.whenToUse,
    dependencyNotes: entry.dependencyNotes ?? [],
    inputs,
    output,
    isStatement,
    boardOnly: ESP_NOW_TYPES.has(type) ? 'esp32' : null,
    setupOnly: SETUP_ONLY_TYPES.has(type),
    singletonMessage: singleton?.message ?? null,
    pinRequirements: PIN_RULES.filter((rule) => rule.types.includes(type)).map((rule) => ({ field: rule.field, capability: rule.capability })),
    requires: getPrerequisitesFor(type),
    usedWith: getUsedWith(type),
    relatedComponentNames: COMPONENT_NAMES_BY_BLOCK.get(type) ?? [],
    exampleIds: entry.exampleIds ?? [],
  };
}

export function getAllBlockDocs(): ResolvedBlockDoc[] {
  return Object.keys(BLOCK_DOC_REGISTRY)
    .filter((type) => !HIDDEN_FROM_DOCS.has(type))
    .map((type) => getBlockDoc(type))
    .filter((doc): doc is ResolvedBlockDoc => doc !== null);
}

export function getDocCategories(): string[] {
  const names = toolboxConfig.contents.map((category) => category.name);
  return ['Estrutura', ...names];
}

/** Resolve o estado (fields/inputs) "canônico" do bloco para renderização — os mesmos valores-padrão da toolbox. */
export function getCanonicalBlockState(type: string, board: BoardKey): Record<string, unknown> {
  const resolvedBoard: BoardKey = ESP_NOW_TYPES.has(type) ? 'esp32' : board;
  const found = findToolboxEntry(type, resolvedBoard);
  if (!found) return { type };
  const { entry } = found;
  const state: Record<string, unknown> = { type };
  if (entry.fields) state.fields = entry.fields;
  if (entry.inputs) state.inputs = entry.inputs;
  return state;
}
