/**
 * "Bloco X exige que o bloco Y já exista no programa" — hoje isso só existe
 * como chamadas imperativas `requireBlock(...)`/`requireBefore(...)` dentro de
 * `src/blockly/audit.ts` (a auditoria que roda de verdade sobre o workspace).
 * Refatorar aquele arquivo para virar dado declarativo é um risco
 * desproporcional só para alimentar a documentação, então esta tabela
 * pequena e deliberada ESPELHA os mesmos pares e as mesmas mensagens de
 * `audit.ts` — se um novo `requireBlock`/`requireBefore` for adicionado lá,
 * replique aqui também.
 */
export interface BlockPrerequisiteRule {
  types: string[];
  requiresType: string;
  message: string;
}

export const BLOCK_PREREQUISITES: readonly BlockPrerequisiteRule[] = [
  {
    types: ['servo_mover', 'servo_ler'],
    requiresType: 'servo_configurar',
    message: 'Configure o servo no bloco PREPARAR antes de usá-lo.',
  },
  {
    types: ['ler_distancia_cm', 'mostrar_distancia', 'objeto_esta_perto', 'distancia_entre'],
    requiresType: 'configurar_ultrassonico',
    message: 'Configure o sensor ultrassônico no bloco PREPARAR antes de usá-lo.',
  },
  {
    types: ['mpu_ler_pitch', 'mpu_ler_roll'],
    requiresType: 'mpu_iniciar',
    message: 'Inicie o acelerômetro no bloco PREPARAR antes de ler sua inclinação.',
  },
  {
    types: ['l298n_mover_robo', 'l298n_parar', 'l298n_mover_motor', 'l298n_velocidade_por_pitch_roll'],
    requiresType: 'l298n_configurar_simples',
    message: 'Configure os motores no bloco PREPARAR antes de movimentá-los.',
  },
  {
    types: ['espnow_mac_serial', 'espnow_transmissor_init', 'espnow_receptor_init'],
    requiresType: 'espnow_iniciar_wifi',
    message: 'Prepare a comunicação sem fio (Wi-Fi) no bloco PREPARAR antes deste bloco.',
  },
  {
    types: ['espnow_adicionar_receptor', 'espnow_enviar_pacote'],
    requiresType: 'espnow_transmissor_init',
    message: 'Prepare o transmissor ESP-NOW antes de conectar ou enviar dados.',
  },
  {
    types: ['espnow_enviar_pacote'],
    requiresType: 'espnow_adicionar_receptor',
    message: 'Conecte ao código MAC do receptor antes de enviar dados.',
  },
  {
    types: [
      'espnow_tem_dados_novos',
      'espnow_ler_pitch',
      'espnow_ler_roll',
      'espnow_ler_flag_parar',
      'espnow_timeout_ms',
      'espnow_marcar_lido',
    ],
    requiresType: 'espnow_receptor_init',
    message: 'Prepare o receptor ESP-NOW antes de ler mensagens.',
  },
];

export function getPrerequisitesFor(type: string): { requiresType: string; message: string }[] {
  return BLOCK_PREREQUISITES
    .filter((rule) => rule.types.includes(type))
    .map((rule) => ({ requiresType: rule.requiresType, message: rule.message }));
}
