import { toolboxConfig } from './toolbox';

/**
 * Cores das categorias da toolbox, pré-computadas offline com
 * Blockly.utils.colour.hueToHex a partir dos hues declarados em
 * toolbox.ts (ver categorias abaixo) — garante que a miniatura do card use
 * exatamente as mesmas cores dos blocos reais na IDE, sem importar o
 * pacote Blockly (pesado) na tela inicial, que hoje só carrega a IDE sob
 * demanda (App.tsx: `IdeScreen = lazy(...)`).
 */
const CATEGORY_HEX_BY_HUE: Record<string, string> = {
  '210': '#5b80a5', // Lógica
  '120': '#5ba55b', // Controle, Tempo, Motor DC
  '255': '#6d5ba5', // Matemática
  '330': '#a55b80', // Variáveis
  '270': '#805ba5', // Funções
  '165': '#5ba593', // Entradas e Saídas
  '30': '#a5805b', // Sensor de Distância
  '310': '#a55b99', // MPU6050
  '170': '#5ba599', // Servo
  '75': '#93a55b', // Buzzer
  '160': '#5ba58c', // Comunicação
  '300': '#a55ba5', // ESP-NOW
  '200': '#5b8ca5', // Wi-Fi
  '230': '#5b67a5', // Bluetooth
};

interface ToolboxBlockEntry { kind: string; type?: string }
interface ToolboxCategoryEntry { kind: string; colour?: string; contents?: ToolboxBlockEntry[] }

let cachedTypeColours: Map<string, string> | null = null;

function getBlockTypeColours(): Map<string, string> {
  if (cachedTypeColours) return cachedTypeColours;
  const map = new Map<string, string>();
  for (const category of toolboxConfig.contents as ToolboxCategoryEntry[]) {
    if (category.kind !== 'category' || !category.colour) continue;
    const hex = CATEGORY_HEX_BY_HUE[category.colour];
    if (!hex) continue;
    for (const entry of category.contents ?? []) {
      if (entry.kind === 'block' && entry.type && !map.has(entry.type)) map.set(entry.type, hex);
    }
  }
  cachedTypeColours = map;
  return map;
}

// Bloco_setup/bloco_loop (sempre presentes, auto-inseridos fora da
// toolbox) simplesmente não aparecem neste mapa e são ignorados sozinhos —
// não precisam de uma lista de exclusão manual.
function countBlockTypes(node: unknown, counts: Map<string, number>): void {
  if (Array.isArray(node)) {
    for (const item of node) countBlockTypes(item, counts);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string' && record.type.length > 0) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') countBlockTypes(value, counts);
  }
}

const MAX_THUMBNAIL_COLOURS = 6;

/**
 * Deriva uma pequena assinatura de cores a partir dos blocos realmente
 * usados no workspace salvo (mesmas cores de categoria da toolbox), sem
 * renderizar Blockly — usada como miniatura dos cards de "Seus projetos".
 * Projetos vazios ou sem blocos reconhecíveis retornam uma lista vazia; o
 * componente que consome isso decide o fallback visual.
 */
export function getProjectThumbnailColours(workspace: unknown): string[] {
  const topBlocks = (workspace as { blocks?: { blocks?: unknown } } | null | undefined)?.blocks?.blocks;
  if (!Array.isArray(topBlocks) || topBlocks.length === 0) return [];

  const counts = new Map<string, number>();
  for (const block of topBlocks) countBlockTypes(block, counts);

  const typeColours = getBlockTypeColours();
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  const colours: string[] = [];
  const seen = new Set<string>();
  for (const [type] of ranked) {
    const colour = typeColours.get(type);
    if (!colour || seen.has(colour)) continue;
    seen.add(colour);
    colours.push(colour);
    if (colours.length >= MAX_THUMBNAIL_COLOURS) break;
  }
  return colours;
}
