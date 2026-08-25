import type { PinCapability } from '../../blockly/contracts';

/**
 * Conteúdo autorado à mão para um bloco. Tudo que pode ser derivado de outro
 * módulo já existente (categoria, cor, nome amigável, tipos de entrada/saída,
 * restrições de placa, singleton, pinos) NÃO mora aqui — ver `derive.ts`.
 */
export interface BlockDocEntry {
  /** Explicação curta (1-2 frases), usada como tooltip nativo do Blockly e como texto do card. */
  summary: string;
  /** O que o bloco faz, em detalhe, para a tela de documentação. */
  whatItDoes: string;
  /** Quando faz sentido usar esse bloco. */
  whenToUse: string;
  /** Notas de dependência que não são derivadas de outro módulo (ex. hardware físico necessário). */
  dependencyNotes?: string[];
  /** IDs de `examples.ts` que mostram este bloco em uso. */
  exampleIds?: string[];
}

export type BlockPortType = 'Number' | 'Boolean' | 'String' | 'Any';

export interface BlockPort {
  name: string;
  type: BlockPortType;
}

export interface BlockPinRequirement {
  field: string;
  capability: PinCapability;
}

export interface BlockRequirement {
  requiresType: string;
  message: string;
}

/** Visão completa de um bloco: o que foi autorado + tudo que foi derivado ao vivo dos módulos do Blockly. */
export interface ResolvedBlockDoc {
  type: string;
  displayName: string;
  category: string;
  colour: string;
  summary: string;
  whatItDoes: string;
  whenToUse: string;
  dependencyNotes: string[];
  inputs: BlockPort[];
  output: BlockPort | null;
  isStatement: boolean;
  boardOnly: 'esp32' | null;
  setupOnly: boolean;
  singletonMessage: string | null;
  pinRequirements: BlockPinRequirement[];
  requires: BlockRequirement[];
  usedWith: string[];
  relatedComponentNames: string[];
  exampleIds: string[];
}

export interface BlockExample {
  id: string;
  title: string;
  board: 'uno' | 'nano' | 'esp32';
  caption: string;
  /** Formato `Blockly.serialization.workspaces.save()` — carregável direto via `.load()`. */
  workspace: { blocks: { languageVersion: number; blocks: Record<string, unknown>[] } };
  /** Todos os tipos de bloco mostrados nesse exemplo (para o cálculo de "usado com"). */
  blockTypes: string[];
}
