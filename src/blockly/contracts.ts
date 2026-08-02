import { BOARDS, type BoardKey } from './boards';

/**
 * Contratos compartilhados pelas definições, auditoria e geração de código.
 * Manter estes grupos centralizados evita que um bloco seja aceito pela
 * toolbox, mas esquecido por alguma validação específica de placa/contexto.
 */
export const LOOP_TYPES = new Set([
  'repetir_vezes',
  'repetir_quantidade',
  'enquanto_verdadeiro',
]);

export const ULTRASONIC_TYPES = new Set([
  'configurar_ultrassonico',
  'ler_distancia_cm',
  'mostrar_distancia',
  'objeto_esta_perto',
  'distancia_entre',
]);

export const SETUP_ONLY_TYPES = new Set([
  'configurar_pino',
  'configurar_ultrassonico',
  'servo_configurar',
  'espnow_iniciar_wifi',
  'espnow_transmissor_init',
  'espnow_adicionar_receptor',
  'espnow_receptor_init',
  'mpu_iniciar',
  'l298n_configurar_simples',
]);

export const ESP_NOW_TYPES = new Set([
  'espnow_iniciar_wifi',
  'espnow_mac_serial',
  'espnow_transmissor_init',
  'espnow_adicionar_receptor',
  'espnow_enviar_pacote',
  'espnow_receptor_init',
  'espnow_tem_dados_novos',
  'espnow_ler_pitch',
  'espnow_ler_roll',
  'espnow_ler_flag_parar',
  'espnow_timeout_ms',
  'espnow_marcar_lido',
]);

export const ESP_NOW_TRANSMITTER_TYPES = new Set([
  'espnow_transmissor_init',
  'espnow_adicionar_receptor',
  'espnow_enviar_pacote',
]);

export const ESP_NOW_RECEIVER_TYPES = new Set([
  'espnow_receptor_init',
  'espnow_tem_dados_novos',
  'espnow_ler_pitch',
  'espnow_ler_roll',
  'espnow_ler_flag_parar',
  'espnow_timeout_ms',
  'espnow_marcar_lido',
]);

export const ESP32_INPUT_ONLY_PINS = new Set(['34', '35', '36', '39']);

// No ESP32 clássico, o ADC2 não pode ser usado enquanto o rádio Wi-Fi está ativo.
export const ESP32_ADC2_PINS = new Set([
  '0', '2', '4', '12', '13', '14', '15', '25', '26', '27',
]);

export const SINGLETON_BLOCKS: ReadonlyArray<{
  type: string;
  message: string;
}> = [
  {
    type: 'mpu_iniciar',
    message: 'Use apenas um bloco para iniciar o acelerômetro.',
  },
  {
    type: 'l298n_configurar_simples',
    message: 'Use apenas uma configuração do controlador L298N neste programa.',
  },
  {
    type: 'espnow_iniciar_wifi',
    message: 'Prepare a comunicação sem fio apenas uma vez.',
  },
  {
    type: 'espnow_transmissor_init',
    message: 'Prepare o transmissor ESP-NOW apenas uma vez.',
  },
  {
    type: 'espnow_adicionar_receptor',
    message: 'Este projeto aceita um receptor ESP-NOW por vez.',
  },
  {
    type: 'espnow_receptor_init',
    message: 'Prepare o receptor ESP-NOW apenas uma vez.',
  },
];

export type PinCapability = 'all' | 'output' | 'pwm' | 'analog' | 'i2cSda' | 'i2cScl';

export const PIN_RULES: ReadonlyArray<{
  types: readonly string[];
  field: string;
  capability: PinCapability;
}> = [
  { types: ['configurar_pino', 'ler_pino_digital'], field: 'PIN', capability: 'all' },
  {
    types: [
      'escrever_pino',
      'escrever_pino_booleano',
      'servo_configurar',
      'servo_mover',
      'servo_ler',
      'buzzer_tocar',
      'buzzer_tocar_tempo',
      'buzzer_parar',
      'buzzer_tocar_musica',
    ],
    field: 'PIN',
    capability: 'output',
  },
  { types: ['escrever_pino_pwm'], field: 'PIN', capability: 'pwm' },
  { types: ['ler_pino_analogico'], field: 'PIN', capability: 'analog' },
  { types: [...ULTRASONIC_TYPES], field: 'TRIG', capability: 'output' },
  { types: [...ULTRASONIC_TYPES], field: 'ECHO', capability: 'all' },
  { types: ['mpu_iniciar'], field: 'SDA', capability: 'i2cSda' },
  { types: ['mpu_iniciar'], field: 'SCL', capability: 'i2cScl' },
  { types: ['l298n_configurar_simples'], field: 'ENA', capability: 'pwm' },
  { types: ['l298n_configurar_simples'], field: 'ENB', capability: 'pwm' },
  { types: ['l298n_configurar_simples'], field: 'IN1', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN2', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN3', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN4', capability: 'output' },
];

export function getPinSets(board: BoardKey): Record<PinCapability, Set<string>> {
  const config = BOARDS[board];
  return {
    all: new Set(config.pins.map(([, value]) => value)),
    output: new Set(config.outputPins.map(([, value]) => value)),
    pwm: new Set(config.pwmPins.map(([, value]) => value)),
    analog: new Set(config.analogPins.map(([, value]) => value)),
    i2cSda: new Set(config.i2cSdaPins.map(([, value]) => value)),
    i2cScl: new Set(config.i2cSclPins.map(([, value]) => value)),
  };
}

export type BlocklyValueType = 'Number' | 'Boolean' | 'String';
export type VariableCppType = 'int' | 'float' | 'bool';

export const VARIABLE_VALUE_TYPES: Record<VariableCppType, BlocklyValueType> = {
  int: 'Number',
  float: 'Number',
  bool: 'Boolean',
};

export function variableValueType(value: unknown): BlocklyValueType {
  return VARIABLE_VALUE_TYPES[value as VariableCppType] ?? 'Number';
}
