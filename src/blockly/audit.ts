import type * as Blockly from 'blockly/core';
import { BOARDS, type BoardKey } from './boards';
import { toCppIdentifier } from './identifiers';

export interface WorkspaceAuditIssue {
  blockId: string;
  blockType: string;
  message: string;
}

const LOOP_TYPES = new Set(['repetir_vezes', 'enquanto_verdadeiro']);
const ULTRASONIC_TYPES = new Set([
  'configurar_ultrassonico',
  'ler_distancia_cm',
  'mostrar_distancia',
  'objeto_esta_perto',
  'distancia_entre',
]);
const SETUP_ONLY_TYPES = new Set([
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
const ESP_NOW_TYPES = new Set([
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

type PinCapability = 'all' | 'output' | 'pwm' | 'analog' | 'i2cSda' | 'i2cScl';

const PIN_RULES: Array<{
  types: string[];
  field: string;
  capability: PinCapability;
}> = [
  { types: ['configurar_pino', 'ler_pino_digital'], field: 'PIN', capability: 'all' },
  { types: ['escrever_pino', 'servo_configurar', 'servo_mover', 'servo_ler', 'buzzer_tocar', 'buzzer_tocar_tempo', 'buzzer_parar', 'buzzer_tocar_musica'], field: 'PIN', capability: 'output' },
  { types: ['escrever_pino_pwm'], field: 'PIN', capability: 'pwm' },
  { types: ['ler_pino_analogico'], field: 'PIN', capability: 'analog' },
  { types: ['configurar_ultrassonico', 'ler_distancia_cm', 'mostrar_distancia', 'objeto_esta_perto', 'distancia_entre'], field: 'TRIG', capability: 'output' },
  { types: ['configurar_ultrassonico', 'ler_distancia_cm', 'mostrar_distancia', 'objeto_esta_perto', 'distancia_entre'], field: 'ECHO', capability: 'all' },
  { types: ['mpu_iniciar'], field: 'SDA', capability: 'i2cSda' },
  { types: ['mpu_iniciar'], field: 'SCL', capability: 'i2cScl' },
  { types: ['l298n_configurar_simples'], field: 'ENA', capability: 'pwm' },
  { types: ['l298n_configurar_simples'], field: 'ENB', capability: 'pwm' },
  { types: ['l298n_configurar_simples'], field: 'IN1', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN2', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN3', capability: 'output' },
  { types: ['l298n_configurar_simples'], field: 'IN4', capability: 'output' },
];

function getPinSets(board: BoardKey): Record<PinCapability, Set<string>> {
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

export function auditSerializedWorkspace(
  value: unknown,
  board: BoardKey,
): string[] {
  const pinSets = getPinSets(board);
  const issues: string[] = [];
  const seen = new Set<unknown>();

  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    const record = candidate as Record<string, unknown>;
    if (typeof record.type === 'string') {
      if (board !== 'esp32' && ESP_NOW_TYPES.has(record.type)) {
        issues.push(`O bloco ${record.type} exige uma placa ESP32.`);
      }
      if (record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields)) {
        const fields = record.fields as Record<string, unknown>;
        for (const rule of PIN_RULES.filter((item) => item.types.includes(record.type as string))) {
          const pin = fields[rule.field];
          if (pin !== undefined && !pinSets[rule.capability].has(String(pin))) {
            issues.push(`O pino ${String(pin)} do bloco ${record.type} não é válido para ${BOARDS[board].name}.`);
          }
        }
        if (
          record.type === 'mpu_iniciar'
          && fields.SDA !== undefined
          && fields.SCL !== undefined
          && String(fields.SDA) === String(fields.SCL)
        ) {
          issues.push('Os pinos SDA e SCL do acelerômetro precisam ser diferentes.');
        }
        if (
          record.type === 'configurar_pino'
          && board === 'esp32'
          && ['34', '35', '36', '39'].includes(String(fields.PIN))
          && fields.MODE !== 'INPUT'
        ) {
          issues.push(`O GPIO ${String(fields.PIN)} do ESP32 aceita somente entrada.`);
        }
        if (
          ULTRASONIC_TYPES.has(record.type)
          && fields.TRIG !== undefined
          && fields.ECHO !== undefined
          && String(fields.TRIG) === String(fields.ECHO)
        ) {
          issues.push('Os pinos Trigger e Echo do ultrassônico precisam ser diferentes.');
        }
        if (record.type === 'l298n_configurar_simples') {
          const motorPins = ['ENA', 'IN1', 'IN2', 'ENB', 'IN3', 'IN4']
            .map((field) => fields[field])
            .filter((pin) => pin !== undefined)
            .map(String);
          if (motorPins.length === 6 && new Set(motorPins).size !== motorPins.length) {
            issues.push('ENA, ENB e IN1–IN4 precisam usar seis pinos diferentes no controlador L298N.');
          }
        }
      }
    }

    Object.values(record).forEach(visit);
  };

  visit(value);
  return [...new Set(issues)];
}

function variableIdentifier(block: Blockly.Block): string {
  return toCppIdentifier(
    block.getFieldValue('NOME'),
    block.type === 'incrementar_variavel' ? 'contador' : 'minha_var',
    'var',
  );
}

function functionIdentifier(block: Blockly.Block): string {
  return toCppIdentifier(
    block.getFieldValue('NOME'),
    block.type === 'definir_funcao_retorno' || block.type === 'chamar_funcao_retorno'
      ? 'calcular'
      : 'minhaFuncao',
    'fn',
  );
}

function isInsideLoop(block: Blockly.Block): boolean {
  let parent = block.getSurroundParent();
  while (parent) {
    if (LOOP_TYPES.has(parent.type)) return true;
    parent = parent.getSurroundParent();
  }
  return false;
}

function isInsideSetup(block: Blockly.Block): boolean {
  let parent = block.getSurroundParent();
  while (parent) {
    if (parent.type === 'bloco_setup') return true;
    parent = parent.getSurroundParent();
  }
  return false;
}

export function auditWorkspace(
  workspace: Blockly.Workspace,
  board: BoardKey,
): WorkspaceAuditIssue[] {
  const blocks = workspace.getAllBlocks(false);
  const types = new Set(blocks.map((block) => block.type));
  const issues: WorkspaceAuditIssue[] = [];

  const add = (block: Blockly.Block, message: string) => {
    issues.push({ blockId: block.id, blockType: block.type, message });
  };
  const requireBlock = (
    usedTypes: string[],
    requiredType: string,
    message: string,
  ) => {
    const used = blocks.find((block) => usedTypes.includes(block.type));
    if (used && !types.has(requiredType)) add(used, message);
  };

  for (const rootType of ['bloco_setup', 'bloco_loop']) {
    const roots = workspace.getTopBlocks(false).filter((block) => block.type === rootType);
    if (roots.length > 1) {
      add(roots[1], `Existe mais de um bloco ${rootType === 'bloco_setup' ? 'PREPARAR' : 'AGIR'}.`);
    }
  }

  for (const block of blocks) {
    if (SETUP_ONLY_TYPES.has(block.type) && !isInsideSetup(block)) {
      add(block, 'Este bloco de configuração precisa ficar dentro de PREPARAR.');
    }
    if (block.type === 'parar_repeticao' && !isInsideLoop(block)) {
      add(block, '“Parar repetição” precisa ficar dentro de “Repetir” ou “Enquanto”.');
    }
    if (board !== 'esp32' && ESP_NOW_TYPES.has(block.type)) {
      add(block, 'Comunicação ESP-NOW só está disponível para a placa ESP32.');
    }
    if (
      block.type === 'espnow_adicionar_receptor'
      && !/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(String(block.getFieldValue('MAC')))
    ) {
      add(block, 'O código MAC precisa seguir o formato AA:BB:CC:DD:EE:FF.');
    }
    if (
      block.type === 'configurar_pino'
      && board === 'esp32'
      && ['34', '35', '36', '39'].includes(String(block.getFieldValue('PIN')))
      && block.getFieldValue('MODE') !== 'INPUT'
    ) {
      add(block, 'Os GPIO 34, 35, 36 e 39 do ESP32 aceitam somente entrada.');
    }
    if (
      (block.type === 'mapear_valor' || block.type === 'util_map_float')
      && Number(block.getFieldValue('DE_MIN')) === Number(block.getFieldValue('DE_MAX'))
    ) {
      add(block, 'A escala de entrada precisa ter valores inicial e final diferentes.');
    }
    if (
      block.type === 'distancia_entre'
      && Number(block.getFieldValue('MIN')) >= Number(block.getFieldValue('MAX'))
    ) {
      add(block, 'Na faixa de distância, o valor mínimo precisa ser menor que o máximo.');
    }
    if (
      block.type === 'random_valor'
      && Number(block.getFieldValue('MIN')) > Number(block.getFieldValue('MAX'))
    ) {
      add(block, 'No número aleatório, o valor mínimo não pode ser maior que o máximo.');
    }
    if (
      block.type === 'mpu_iniciar'
      && String(block.getFieldValue('SDA')) === String(block.getFieldValue('SCL'))
    ) {
      add(block, 'Os pinos SDA e SCL do acelerômetro precisam ser diferentes.');
    }
    if (
      ULTRASONIC_TYPES.has(block.type)
      && String(block.getFieldValue('TRIG')) === String(block.getFieldValue('ECHO'))
    ) {
      add(block, 'Os pinos Trigger e Echo do ultrassônico precisam ser diferentes.');
    }
    if (block.type === 'l298n_configurar_simples') {
      const motorPins = ['ENA', 'IN1', 'IN2', 'ENB', 'IN3', 'IN4']
        .map((field) => String(block.getFieldValue(field)));
      if (new Set(motorPins).size !== motorPins.length) {
        add(block, 'ENA, ENB e IN1–IN4 precisam usar seis pinos diferentes no controlador L298N.');
      }
    }
  }

  const declaredVariables = new Map<string, Blockly.Block>();
  for (const declaration of blocks.filter((block) => block.type === 'declarar_variavel_global')) {
    const name = variableIdentifier(declaration);
    const previous = declaredVariables.get(name);
    if (previous) add(declaration, 'Há duas variáveis declaradas com o mesmo nome.');
    else declaredVariables.set(name, declaration);
  }
  for (const use of blocks.filter((block) => [
    'atribuir_variavel',
    'ler_variavel',
    'incrementar_variavel',
  ].includes(block.type))) {
    if (!declaredVariables.has(variableIdentifier(use))) {
      add(use, `A variável “${use.getFieldValue('NOME')}” não foi declarada.`);
    }
  }

  const declaredFunctions = new Map<string, Blockly.Block>();
  for (const declaration of blocks.filter((block) => [
    'definir_funcao',
    'definir_funcao_retorno',
  ].includes(block.type))) {
    const name = functionIdentifier(declaration);
    const previous = declaredFunctions.get(name);
    if (previous) add(declaration, 'Há duas funções declaradas com o mesmo nome.');
    else declaredFunctions.set(name, declaration);
  }
  for (const call of blocks.filter((block) => [
    'chamar_funcao',
    'chamar_funcao_retorno',
  ].includes(block.type))) {
    const declaration = declaredFunctions.get(functionIdentifier(call));
    if (!declaration) {
      add(call, `A função “${call.getFieldValue('NOME')}” não foi definida.`);
    } else if (
      call.type === 'chamar_funcao_retorno'
      && declaration.type !== 'definir_funcao_retorno'
    ) {
      add(call, `A função “${call.getFieldValue('NOME')}” precisa ser definida com resposta.`);
    }
  }

  requireBlock(
    ['servo_mover', 'servo_ler'],
    'servo_configurar',
    'Configure o servo no bloco PREPARAR antes de usá-lo.',
  );

  const configuredServoPins = new Set(
    blocks
      .filter((block) => block.type === 'servo_configurar')
      .map((block) => String(block.getFieldValue('PIN'))),
  );
  for (const use of blocks.filter((block) => ['servo_mover', 'servo_ler'].includes(block.type))) {
    if (
      configuredServoPins.size > 0
      && !configuredServoPins.has(String(use.getFieldValue('PIN')))
    ) {
      add(use, 'Este pino do servo não foi configurado no bloco PREPARAR.');
    }
  }

  const configuredUltrasonicPairs = new Set(
    blocks
      .filter((block) => block.type === 'configurar_ultrassonico')
      .map((block) => `${block.getFieldValue('TRIG')}:${block.getFieldValue('ECHO')}`),
  );
  for (const use of blocks.filter((block) => [
    'ler_distancia_cm',
    'mostrar_distancia',
    'objeto_esta_perto',
    'distancia_entre',
  ].includes(block.type))) {
    const pair = `${use.getFieldValue('TRIG')}:${use.getFieldValue('ECHO')}`;
    if (configuredUltrasonicPairs.size > 0 && !configuredUltrasonicPairs.has(pair)) {
      add(use, 'Este par Trigger/Echo não foi configurado no bloco PREPARAR.');
    }
  }
  requireBlock(
    ['ler_distancia_cm', 'mostrar_distancia', 'objeto_esta_perto', 'distancia_entre'],
    'configurar_ultrassonico',
    'Configure o sensor ultrassônico no bloco PREPARAR antes de usá-lo.',
  );
  requireBlock(
    ['mpu_ler_pitch', 'mpu_ler_roll'],
    'mpu_iniciar',
    'Inicie o acelerômetro no bloco PREPARAR antes de ler sua inclinação.',
  );
  requireBlock(
    ['l298n_mover_robo', 'l298n_parar', 'l298n_mover_motor', 'l298n_velocidade_por_pitch_roll'],
    'l298n_configurar_simples',
    'Configure os motores no bloco PREPARAR antes de movimentá-los.',
  );

  const espNowBlock = blocks.find((block) => ESP_NOW_TYPES.has(block.type));
  if (espNowBlock && !types.has('espnow_iniciar_wifi')) {
    add(espNowBlock, 'Prepare a comunicação sem fio no bloco PREPARAR.');
  }
  requireBlock(
    ['espnow_adicionar_receptor', 'espnow_enviar_pacote'],
    'espnow_transmissor_init',
    'Prepare o transmissor ESP-NOW antes de conectar ou enviar dados.',
  );
  requireBlock(
    ['espnow_enviar_pacote'],
    'espnow_adicionar_receptor',
    'Conecte ao código MAC do receptor antes de enviar dados.',
  );
  requireBlock(
    [
      'espnow_tem_dados_novos',
      'espnow_ler_pitch',
      'espnow_ler_roll',
      'espnow_ler_flag_parar',
      'espnow_timeout_ms',
      'espnow_marcar_lido',
    ],
    'espnow_receptor_init',
    'Prepare o receptor ESP-NOW antes de ler mensagens.',
  );

  const setupRoot = workspace.getTopBlocks(false).find((block) => block.type === 'bloco_setup');
  if (setupRoot) {
    const setupOrder = setupRoot.getDescendants(true);
    const requireBefore = (beforeType: string, afterType: string, message: string) => {
      const beforeIndex = setupOrder.findIndex((block) => block.type === beforeType);
      const afterIndex = setupOrder.findIndex((block) => block.type === afterType);
      if (beforeIndex >= 0 && afterIndex >= 0 && beforeIndex > afterIndex) {
        add(setupOrder[afterIndex], message);
      }
    };
    requireBefore(
      'espnow_iniciar_wifi',
      'espnow_transmissor_init',
      'Prepare o Wi-Fi antes de iniciar o transmissor ESP-NOW.',
    );
    requireBefore(
      'espnow_transmissor_init',
      'espnow_adicionar_receptor',
      'Inicie o transmissor antes de conectar ao código MAC do receptor.',
    );
    requireBefore(
      'espnow_iniciar_wifi',
      'espnow_receptor_init',
      'Prepare o Wi-Fi antes de iniciar o receptor ESP-NOW.',
    );
  }

  const boardConfig = BOARDS[board];
  const pinSets = getPinSets(board);

  for (const rule of PIN_RULES) {
    for (const block of blocks.filter((candidate) => rule.types.includes(candidate.type))) {
      const value = String(block.getFieldValue(rule.field));
      if (!pinSets[rule.capability].has(value)) {
        add(block, `O pino selecionado em ${rule.field} não é compatível com esta função na placa ${boardConfig.name}.`);
      }
    }
  }

  const messagesByBlock = new Map<string, string[]>();
  for (const issue of issues) {
    const messages = messagesByBlock.get(issue.blockId) ?? [];
    if (!messages.includes(issue.message)) messages.push(issue.message);
    messagesByBlock.set(issue.blockId, messages);
  }
  for (const block of blocks) {
    const messages = messagesByBlock.get(block.id);
    block.setWarningText(messages?.join('\n') ?? null, 'bloquin-audit');
  }

  return issues;
}
