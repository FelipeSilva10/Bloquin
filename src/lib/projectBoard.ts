import { BOARDS, BOARD_UNSET, type BoardKey } from '../blockly/boards';

export type ProjectBoardState = 'selected' | 'unselected' | 'unknown';

export interface ProjectBoardStatus {
  state: ProjectBoardState;
  key?: BoardKey;
  label: string;
  accessibleLabel: string;
}

function isBoardKey(value: string): value is BoardKey {
  return Object.prototype.hasOwnProperty.call(BOARDS, value);
}

/**
 * Turns the persisted board value into a display-safe status. Older projects
 * may have null, an empty value, or BOARD_UNSET; none of them should be shown
 * as a default Arduino board.
 */
export function getProjectBoardStatus(targetBoard?: string | null): ProjectBoardStatus {
  const normalized = typeof targetBoard === 'string' ? targetBoard.trim().toLowerCase() : '';

  if (!normalized || normalized === BOARD_UNSET) {
    return {
      state: 'unselected',
      label: 'Sem placa selecionada',
      accessibleLabel: 'Placa não selecionada. Escolha uma placa ao abrir a IDE.',
    };
  }

  if (isBoardKey(normalized)) {
    const name = BOARDS[normalized].name;
    return {
      state: 'selected',
      key: normalized,
      label: name,
      accessibleLabel: `Placa selecionada: ${name}.`,
    };
  }

  return {
    state: 'unknown',
    label: 'Placa não reconhecida',
    accessibleLabel: `A placa salva no projeto não é reconhecida: ${targetBoard?.trim() || 'valor vazio'}. Abra a IDE para revisar a configuração.`,
  };
}
