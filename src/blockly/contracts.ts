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
  'bt_iniciar',
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
  // Mensagem genérica (tipo + valorA/B/C + sinal). Os blocos "pitch/roll/
  // parar" acima leem/escrevem os MESMOS campos (valorA/valorB/sinal) — um
  // alias legado sobre o mesmo protocolo, não um segundo formato concorrente.
  'espnow_enviar_mensagem',
  'espnow_mensagem_tipo',
  'espnow_mensagem_valor_a',
  'espnow_mensagem_valor_b',
  'espnow_mensagem_valor_c',
  'espnow_mensagem_sinal',
  'espnow_mensagem_remetente',
  // Diagnóstico, usável em qualquer papel (transmissor ou receptor).
  'espnow_iniciou_com_sucesso',
  // Diagnóstico específico de papel — ver ESP_NOW_TRANSMITTER_TYPES/RECEIVER_TYPES.
  'espnow_envio_confirmado',
  'espnow_contagem_invalidas',
]);

export const ESP_NOW_TRANSMITTER_TYPES = new Set([
  'espnow_transmissor_init',
  'espnow_adicionar_receptor',
  'espnow_enviar_pacote',
  'espnow_enviar_mensagem',
  'espnow_envio_confirmado',
]);

export const ESP_NOW_RECEIVER_TYPES = new Set([
  'espnow_receptor_init',
  'espnow_tem_dados_novos',
  'espnow_ler_pitch',
  'espnow_ler_roll',
  'espnow_ler_flag_parar',
  'espnow_timeout_ms',
  'espnow_marcar_lido',
  'espnow_mensagem_tipo',
  'espnow_mensagem_valor_a',
  'espnow_mensagem_valor_b',
  'espnow_mensagem_valor_c',
  'espnow_mensagem_sinal',
  'espnow_mensagem_remetente',
  'espnow_contagem_invalidas',
]);

/**
 * Diferente dos outros blocos de "iniciar" (MPU, ESP-NOW, Bluetooth),
 * `wifi_conectar` NÃO está em SETUP_ONLY_TYPES nem em SINGLETON_BLOCKS: uma
 * rede Wi-Fi pode cair, então o projeto precisa poder chamá-lo de novo a
 * partir de AGIR (ex.: "SE NÃO estiver conectado ENTÃO conectar de novo").
 */
export const WIFI_TYPES = new Set([
  'wifi_conectar',
  'wifi_esta_conectado',
  'wifi_endereco_ip',
  'wifi_desconectar',
]);

export const BLUETOOTH_TYPES = new Set([
  'bt_iniciar',
  'bt_disponivel',
  'bt_ler_texto',
  'bt_enviar_texto',
  'bt_conectado',
]);

/**
 * União de todos os blocos que exigem um ESP32 (rádio Wi-Fi/Bluetooth). Use
 * este conjunto para o "portão" genérico de placa (auditoria, toolbox,
 * documentação). `ESP_NOW_TYPES` continua existindo à parte para as regras
 * específicas de papel/ordem do ESP-NOW, que não se aplicam a Wi-Fi/Bluetooth.
 */
export const ESP32_ONLY_TYPES = new Set([
  ...ESP_NOW_TYPES,
  ...WIFI_TYPES,
  ...BLUETOOTH_TYPES,
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
  {
    type: 'bt_iniciar',
    message: 'Inicie o Bluetooth apenas uma vez.',
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
