/**
 * Contratos do catálogo de Componentes.
 *
 * Os IDs são estáveis para que favoritos, links de projetos e navegação por
 * aba possam persistir somente o ID, sem depender do texto exibido na UI.
 */
export const COMPONENT_CATEGORY_IDS = [
  'microcontrollers',
  'sensors',
  'actuators',
  'modules',
  'motors',
  'electronic-components',
  'power',
  'communication',
  'tools',
] as const;

export type ComponentCategoryId = (typeof COMPONENT_CATEGORY_IDS)[number];

export const COMPONENT_IDS = [
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
] as const;

export type ComponentId = (typeof COMPONENT_IDS)[number];

export type ComponentIllustrationId =
  | 'board'
  | 'led'
  | 'resistor'
  | 'button'
  | 'buzzer'
  | 'ldr'
  | 'ultrasonic'
  | 'imu'
  | 'driver'
  | 'motor';

export type ComponentCategoryAccent = 'blue' | 'violet' | 'orange' | 'green' | 'pink' | 'slate';

export interface ComponentCategory {
  readonly id: ComponentCategoryId;
  readonly label: string;
  readonly description: string;
  readonly accent: ComponentCategoryAccent;
}

/** Posição em que um asset deve aparecer na ficha do aluno. */
export type ComponentMediaRole = 'main' | 'pinout' | 'connection';

export interface ComponentMediaImage {
  readonly kind: 'image';
  readonly role: ComponentMediaRole;
  readonly src: string;
  readonly alt: string;
  readonly caption?: string;
}

/** Reservado para conteúdo complementar futuro, sem acoplar a tela a ele hoje. */
export interface ComponentMediaExternal {
  readonly kind: 'external';
  readonly role?: ComponentMediaRole;
  readonly url: string;
  readonly label: string;
}

export type ComponentMedia = ComponentMediaImage | ComponentMediaExternal;

export interface ComponentPin {
  readonly label: string;
  readonly role: 'power' | 'ground' | 'signal' | 'analog' | 'digital' | 'i2c' | 'motor';
  readonly description: string;
}

export interface ComponentConnection {
  readonly title: string;
  readonly description: string;
}

/** Texto curto para a primeira leitura do aluno. Detalhes ficam nos blocos abaixo. */
export interface ComponentStudentContent {
  readonly whatIs: string;
  readonly usefulFor: string;
  readonly howToConnect: string;
  readonly attention: string;
  readonly bloquinExample: string;
}

/**
 * Referência declarativa a um bloco já existente no Blockly. Não importa o
 * Blockly aqui: isso preserva o catálogo como uma fonte de dados reutilizável.
 */
export interface ComponentBlockLink {
  readonly blockType: string;
  readonly label: string;
  readonly toolboxCategory: string;
  readonly description?: string;
}

export interface ComponentCatalogItem {
  readonly id: ComponentId;
  readonly name: string;
  readonly categoryId: ComponentCategoryId;
  readonly illustration: ComponentIllustrationId;
  readonly summary: string;
  readonly purpose: string;
  readonly student: ComponentStudentContent;
  readonly tags: readonly string[];
  readonly specifications: readonly string[];
  readonly pins: readonly ComponentPin[];
  readonly connections: readonly ComponentConnection[];
  readonly cautions: readonly string[];
  readonly relatedBlocks: readonly ComponentBlockLink[];
  readonly relatedComponentIds: readonly ComponentId[];
  /**
   * Slots esperados: `main`, `pinout` e `connection`. Quando um asset ainda
   * não existe, a ficha mantém o espaço com um fallback identificado; novos
   * arquivos seguem `src/assets/components/<id>/<role>.webp|svg`.
   */
  readonly media: readonly ComponentMedia[];
}
