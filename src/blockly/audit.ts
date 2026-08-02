import type * as Blockly from 'blockly/core';
import { BOARDS, type BoardKey } from './boards';
import {
  ESP32_ADC2_PINS,
  ESP32_INPUT_ONLY_PINS,
  ESP_NOW_RECEIVER_TYPES,
  ESP_NOW_TRANSMITTER_TYPES,
  ESP_NOW_TYPES,
  LOOP_TYPES,
  PIN_RULES,
  SETUP_ONLY_TYPES,
  SINGLETON_BLOCKS,
  ULTRASONIC_TYPES,
  getPinSets,
  variableValueType,
  type BlocklyValueType,
} from './contracts';
import { toCppIdentifier } from './identifiers';
import { synchronizeVariableTypes } from './variableTypes';

export interface WorkspaceAuditIssue {
  blockId: string;
  blockType: string;
  message: string;
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
          && ESP32_INPUT_ONLY_PINS.has(String(fields.PIN))
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

function isDirectlyInsideSetup(block: Blockly.Block): boolean {
  return block.getSurroundParent()?.type === 'bloco_setup';
}

function outputValueTypes(
  block: Blockly.Block | null,
  declaredTypes: Map<string, BlocklyValueType>,
): BlocklyValueType[] | null {
  if (!block) return null;
  if (block.type === 'ler_variavel') {
    const declaredType = declaredTypes.get(variableIdentifier(block));
    return declaredType ? [declaredType] : null;
  }
  return block.outputConnection?.getCheck() as BlocklyValueType[] | null;
}

function valueTypesOverlap(
  expected: BlocklyValueType[],
  actual: BlocklyValueType[] | null,
): boolean {
  return !actual || actual.some((type) => expected.includes(type));
}

export function auditWorkspace(
  workspace: Blockly.Workspace,
  board: BoardKey,
): WorkspaceAuditIssue[] {
  synchronizeVariableTypes(workspace);
  const blocks = workspace.getAllBlocks(false);
  const types = new Set(blocks.map((block) => block.type));
  const issues: WorkspaceAuditIssue[] = [];
  const issueKeys = new Set<string>();
  const declaredVariableTypes = new Map<string, BlocklyValueType>();
  for (const declaration of blocks.filter((block) => block.type === 'declarar_variavel_global')) {
    const name = variableIdentifier(declaration);
    if (!declaredVariableTypes.has(name)) {
      declaredVariableTypes.set(name, variableValueType(declaration.getFieldValue('TIPO')));
    }
  }

  const add = (block: Blockly.Block, message: string) => {
    const key = `${block.id}\u0000${message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
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

  for (const singleton of SINGLETON_BLOCKS) {
    const occurrences = blocks.filter((block) => block.type === singleton.type);
    for (const duplicate of occurrences.slice(1)) add(duplicate, singleton.message);
  }

  const transmitterBlock = blocks.find((block) => ESP_NOW_TRANSMITTER_TYPES.has(block.type));
  const receiverBlock = blocks.find((block) => ESP_NOW_RECEIVER_TYPES.has(block.type));
  if (transmitterBlock && receiverBlock) {
    add(
      receiverBlock,
      'Escolha um papel para este projeto: transmissor ou receptor ESP-NOW, não os dois ao mesmo tempo.',
    );
  }

  const configuredServoPinsSeen = new Set<string>();
  for (const configuration of blocks.filter((block) => block.type === 'servo_configurar')) {
    const pin = String(configuration.getFieldValue('PIN'));
    if (configuredServoPinsSeen.has(pin)) {
      add(configuration, `O servo do pino ${pin} já foi configurado.`);
    }
    configuredServoPinsSeen.add(pin);
  }

  const configuredUltrasonicPairsSeen = new Set<string>();
  for (const configuration of blocks.filter((block) => block.type === 'configurar_ultrassonico')) {
    const pair = `${configuration.getFieldValue('TRIG')}:${configuration.getFieldValue('ECHO')}`;
    if (configuredUltrasonicPairsSeen.has(pair)) {
      add(configuration, 'Este par Trigger/Echo já foi configurado para o sensor ultrassônico.');
    }
    configuredUltrasonicPairsSeen.add(pair);
  }

  for (const block of blocks) {
    if (SETUP_ONLY_TYPES.has(block.type) && !isInsideSetup(block)) {
      add(block, 'Este bloco de configuração precisa ficar dentro de PREPARAR.');
    } else if (SETUP_ONLY_TYPES.has(block.type) && !isDirectlyInsideSetup(block)) {
      add(
        block,
        'Este bloco precisa ficar diretamente em PREPARAR, fora de condições e repetições.',
      );
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
      && ESP32_INPUT_ONLY_PINS.has(String(block.getFieldValue('PIN')))
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
      block.type === 'constrain_valor'
      && Number(block.getFieldValue('MIN')) > Number(block.getFieldValue('MAX'))
    ) {
      add(block, 'Ao limitar um valor, o mínimo não pode ser maior que o máximo.');
    }
    if (
      block.type === 'operacao_matematica'
      && ['/','%'].includes(String(block.getFieldValue('OP')))
    ) {
      const divisor = block.getInputTargetBlock('B');
      if (divisor?.type === 'numero_fixo' && Number(divisor.getFieldValue('VALOR')) === 0) {
        add(block, 'Divisão e resto por zero não são definidos. Use outro divisor.');
      }
    }
    if (
      block.type === 'funcao_matematica'
      && block.getFieldValue('OP') === 'SQRT'
    ) {
      const value = block.getInputTargetBlock('VALOR');
      if (value?.type === 'numero_fixo' && Number(value.getFieldValue('VALOR')) < 0) {
        add(block, 'A raiz quadrada precisa receber um número maior ou igual a zero.');
      }
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

    const expected = variableValueType(declaration.getFieldValue('TIPO'));
    const actual = outputValueTypes(
      declaration.getInputTargetBlock('VALOR'),
      declaredVariableTypes,
    );
    if (!valueTypesOverlap([expected], actual)) {
      add(
        declaration,
        expected === 'Boolean'
          ? 'Uma variável Verdadeiro/Falso precisa começar com um valor lógico.'
          : 'Uma variável numérica precisa começar com um número.',
      );
    }
  }

  const initializerDependencies = new Map<string, Set<string>>();
  for (const [name, declaration] of declaredVariables) {
    const valueBlock = declaration.getInputTargetBlock('VALOR');
    const dependencies = new Set(
      (valueBlock?.getDescendants(false) ?? [])
        .filter((block) => block.type === 'ler_variavel')
        .map(variableIdentifier),
    );
    initializerDependencies.set(name, dependencies);
  }
  const dependencyState = new Map<string, 'visiting' | 'visited'>();
  const dependencyStack: string[] = [];
  const cyclicVariables = new Set<string>();
  const visitVariable = (name: string) => {
    const state = dependencyState.get(name);
    if (state === 'visited') return;
    if (state === 'visiting') {
      const cycleStart = dependencyStack.indexOf(name);
      for (const cycleName of dependencyStack.slice(Math.max(0, cycleStart))) {
        cyclicVariables.add(cycleName);
      }
      cyclicVariables.add(name);
      return;
    }
    dependencyState.set(name, 'visiting');
    dependencyStack.push(name);
    for (const dependency of initializerDependencies.get(name) ?? []) {
      if (initializerDependencies.has(dependency)) visitVariable(dependency);
    }
    dependencyStack.pop();
    dependencyState.set(name, 'visited');
  };
  for (const name of initializerDependencies.keys()) visitVariable(name);
  for (const name of cyclicVariables) {
    const declaration = declaredVariables.get(name);
    if (declaration) {
      add(declaration, 'Esta variável faz parte de uma dependência circular de inicialização.');
    }
  }

  for (const use of blocks.filter((block) => [
    'atribuir_variavel',
    'ler_variavel',
    'incrementar_variavel',
  ].includes(block.type))) {
    const identifier = variableIdentifier(use);
    const declaration = declaredVariables.get(identifier);
    if (!declaration) {
      add(use, `A variável “${use.getFieldValue('NOME')}” não foi declarada.`);
      continue;
    }

    const expected = declaredVariableTypes.get(identifier) ?? 'Number';
    if (use.type === 'atribuir_variavel') {
      const actual = outputValueTypes(use.getInputTargetBlock('VALOR'), declaredVariableTypes);
      if (!valueTypesOverlap([expected], actual)) {
        add(
          use,
          expected === 'Boolean'
            ? 'Esta variável aceita apenas valores Verdadeiro/Falso.'
            : 'Esta variável aceita apenas valores numéricos.',
        );
      }
    } else if (use.type === 'incrementar_variavel' && expected === 'Boolean') {
      add(use, 'Uma variável Verdadeiro/Falso não pode ser aumentada numericamente.');
    } else if (use.type === 'ler_variavel') {
      const acceptedByParent = use.outputConnection?.targetConnection?.getCheck() as
        | BlocklyValueType[]
        | null
        | undefined;
      if (acceptedByParent && !valueTypesOverlap(acceptedByParent, [expected])) {
        add(
          use,
          expected === 'Boolean'
            ? 'Esta leitura lógica só pode ser usada onde se espera Verdadeiro/Falso.'
            : 'Esta leitura numérica só pode ser usada onde se espera um número.',
        );
      }
    }
  }

  // Verificação defensiva para conexões antigas criadas antes dos contratos de
  // tipo. Novas conexões incompatíveis já são recusadas pelo Blockly.
  for (const valueBlock of blocks.filter((block) => block.outputConnection?.isConnected())) {
    const actual = outputValueTypes(valueBlock, declaredVariableTypes);
    const expected = valueBlock.outputConnection?.targetConnection?.getCheck() as
      | BlocklyValueType[]
      | null
      | undefined;
    if (expected && !valueTypesOverlap(expected, actual)) {
      add(valueBlock, 'Este valor não é compatível com o encaixe onde foi colocado.');
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
    requireBefore(
      'espnow_iniciar_wifi',
      'espnow_mac_serial',
      'Prepare o Wi-Fi antes de mostrar o código MAC deste dispositivo.',
    );
    requireBefore(
      'espnow_transmissor_init',
      'espnow_enviar_pacote',
      'Inicie o transmissor antes de enviar dados.',
    );
    requireBefore(
      'espnow_adicionar_receptor',
      'espnow_enviar_pacote',
      'Conecte ao receptor antes de enviar dados.',
    );
    for (const receiverUse of [
      'espnow_tem_dados_novos',
      'espnow_ler_pitch',
      'espnow_ler_roll',
      'espnow_ler_flag_parar',
      'espnow_timeout_ms',
      'espnow_marcar_lido',
    ]) {
      requireBefore(
        'espnow_receptor_init',
        receiverUse,
        'Inicie o receptor antes de consultar os dados recebidos.',
      );
    }
    for (const mpuUse of ['mpu_ler_pitch', 'mpu_ler_roll']) {
      requireBefore(
        'mpu_iniciar',
        mpuUse,
        'Inicie o acelerômetro antes de ler sua inclinação.',
      );
    }
    for (const motorUse of [
      'l298n_mover_robo',
      'l298n_parar',
      'l298n_mover_motor',
      'l298n_velocidade_por_pitch_roll',
    ]) {
      requireBefore(
        'l298n_configurar_simples',
        motorUse,
        'Configure o controlador L298N antes de movimentar os motores.',
      );
    }

    const setupPosition = new Map(
      setupOrder.map((block, index) => [block.id, index]),
    );
    for (const use of setupOrder.filter((block) => ['servo_mover', 'servo_ler'].includes(block.type))) {
      const configuration = setupOrder.find((block) => (
        block.type === 'servo_configurar'
        && String(block.getFieldValue('PIN')) === String(use.getFieldValue('PIN'))
      ));
      if (
        configuration
        && (setupPosition.get(configuration.id) ?? 0) > (setupPosition.get(use.id) ?? 0)
      ) {
        add(use, 'Conecte este servo antes de movê-lo ou consultar sua posição.');
      }
    }
    for (const use of setupOrder.filter((block) => [
      'ler_distancia_cm',
      'mostrar_distancia',
      'objeto_esta_perto',
      'distancia_entre',
    ].includes(block.type))) {
      const configuration = setupOrder.find((block) => (
        block.type === 'configurar_ultrassonico'
        && String(block.getFieldValue('TRIG')) === String(use.getFieldValue('TRIG'))
        && String(block.getFieldValue('ECHO')) === String(use.getFieldValue('ECHO'))
      ));
      if (
        configuration
        && (setupPosition.get(configuration.id) ?? 0) > (setupPosition.get(use.id) ?? 0)
      ) {
        add(use, 'Configure este sensor ultrassônico antes de fazer a leitura.');
      }
    }
    for (const use of setupOrder.filter((block) => [
      'escrever_pino',
      'escrever_pino_booleano',
      'escrever_pino_pwm',
    ].includes(block.type))) {
      const configuration = setupOrder.find((block) => (
        block.type === 'configurar_pino'
        && String(block.getFieldValue('PIN')) === String(use.getFieldValue('PIN'))
      ));
      if (
        configuration
        && (setupPosition.get(configuration.id) ?? 0) > (setupPosition.get(use.id) ?? 0)
      ) {
        add(use, 'Configure este pino antes de escrever nele.');
      }
    }
  }

  if (board === 'esp32' && espNowBlock) {
    for (const analogRead of blocks.filter((block) => (
      block.type === 'ler_pino_analogico'
      && ESP32_ADC2_PINS.has(String(block.getFieldValue('PIN')))
    ))) {
      add(
        analogRead,
        `O GPIO ${analogRead.getFieldValue('PIN')} usa ADC2 e não pode fazer leitura analógica enquanto o Wi-Fi/ESP-NOW está ativo. Use um pino ADC1 disponível (32, 33, 34, 35, 36 ou 39).`,
      );
    }
  }

  const pinConfigurations = new Map<string, Blockly.Block[]>();
  for (const configuration of blocks.filter((block) => block.type === 'configurar_pino')) {
    const pin = String(configuration.getFieldValue('PIN'));
    const configurations = pinConfigurations.get(pin) ?? [];
    configurations.push(configuration);
    pinConfigurations.set(pin, configurations);
    if (configurations.length > 1) {
      add(configuration, `O pino ${pin} já possui uma configuração em PREPARAR.`);
    }
  }

  for (const write of blocks.filter((block) => [
    'escrever_pino',
    'escrever_pino_booleano',
    'escrever_pino_pwm',
  ].includes(block.type))) {
    const pin = String(write.getFieldValue('PIN'));
    const incompatibleConfiguration = pinConfigurations
      .get(pin)
      ?.find((configuration) => configuration.getFieldValue('MODE') !== 'OUTPUT');
    if (incompatibleConfiguration) {
      add(write, `O pino ${pin} foi configurado como entrada, mas este bloco precisa de uma saída.`);
      add(incompatibleConfiguration, `Configure o pino ${pin} como Saída para poder escrever nele.`);
    }
  }

  type PinClaim = { owner: string; label: string; block: Blockly.Block };
  const claimsByPin = new Map<string, PinClaim[]>();
  const claimPin = (pin: unknown, owner: string, label: string, block: Blockly.Block) => {
    const key = String(pin);
    const claims = claimsByPin.get(key) ?? [];
    if (!claims.some((claim) => claim.owner === owner && claim.block.id === block.id)) {
      claims.push({ owner, label, block });
      claimsByPin.set(key, claims);
    }
  };

  for (const block of blocks) {
    const pin = String(block.getFieldValue('PIN'));
    if ([
      'escrever_pino',
      'escrever_pino_booleano',
      'escrever_pino_pwm',
      'ler_pino_digital',
      'ler_pino_analogico',
    ].includes(block.type)) {
      claimPin(pin, `io:${pin}`, 'entrada/saída genérica', block);
    } else if (block.type.startsWith('servo_')) {
      claimPin(pin, `servo:${pin}`, 'servo', block);
    } else if (block.type.startsWith('buzzer_')) {
      claimPin(pin, `buzzer:${pin}`, 'buzzer', block);
    }

    if (ULTRASONIC_TYPES.has(block.type)) {
      const trigger = String(block.getFieldValue('TRIG'));
      const echo = String(block.getFieldValue('ECHO'));
      const owner = `ultrassonico:${trigger}:${echo}`;
      const label = `sensor ultrassônico (${trigger}/${echo})`;
      claimPin(trigger, owner, label, block);
      claimPin(echo, owner, label, block);
    } else if (block.type === 'mpu_iniciar') {
      const sda = String(block.getFieldValue('SDA'));
      const scl = String(block.getFieldValue('SCL'));
      const owner = `mpu:${sda}:${scl}`;
      claimPin(sda, owner, 'barramento I²C do acelerômetro', block);
      claimPin(scl, owner, 'barramento I²C do acelerômetro', block);
    } else if (block.type === 'l298n_configurar_simples') {
      for (const field of ['ENA', 'IN1', 'IN2', 'ENB', 'IN3', 'IN4']) {
        claimPin(block.getFieldValue(field), 'l298n', 'controlador de motores L298N', block);
      }
    }
  }

  for (const [pin, claims] of claimsByPin) {
    const owners = new Map<string, PinClaim>();
    for (const claim of claims) {
      if (!owners.has(claim.owner)) owners.set(claim.owner, claim);
    }
    if (owners.size < 2) continue;
    const labels = [...new Set([...owners.values()].map((claim) => claim.label))];
    const message = `O pino ${pin} está sendo compartilhado por ${labels.join(' e ')}. Escolha pinos diferentes.`;
    for (const claim of owners.values()) add(claim.block, message);
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
