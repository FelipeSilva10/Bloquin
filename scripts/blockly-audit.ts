import * as Blockly from 'blockly/core';
import {
  initBlocks,
  syncBoardPins,
} from '../src/blockly/blocks';
import { cppGenerator, generateCode, initGenerators } from '../src/blockly/generators';
import { BOARDS, type BoardKey } from '../src/blockly/boards';
import { auditSerializedWorkspace, auditWorkspace } from '../src/blockly/audit';
import { BLOCK_NAMES, getToolboxConfig, toolboxConfig } from '../src/blockly/toolbox';
import { synchronizeVariableTypes } from '../src/blockly/variableTypes';
import { BLOCK_EXAMPLES } from '../src/features/blockDocs/examples';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function connectStatement(parent: Blockly.Block, input: string, child: Blockly.Block) {
  parent.getInput(input)?.connection?.connect(child.previousConnection);
}

function connectValue(parent: Blockly.Block, input: string, child: Blockly.Block) {
  parent.getInput(input)?.connection?.connect(child.outputConnection);
}

function connectChain(parent: Blockly.Block, input: string, children: Blockly.Block[]) {
  if (children.length === 0) return;
  connectStatement(parent, input, children[0]);
  for (let index = 0; index < children.length - 1; index += 1) {
    children[index].nextConnection?.connect(children[index + 1].previousConnection);
  }
}

function makeRoots(workspace: Blockly.Workspace) {
  const setup = workspace.newBlock('bloco_setup');
  const loop = workspace.newBlock('bloco_loop');
  return { setup, loop };
}

function toolboxBlockTypes(): string[] {
  return toolboxConfig.contents.flatMap((category) =>
    category.contents
      .filter((item) => item.kind === 'block')
      .map((item) => item.type as string),
  );
}

function testIsolatedDependency(
  board: BoardKey,
  blockType: string,
  expectedCode: string,
  asValue = false,
) {
  syncBoardPins(board);
  const workspace = new Blockly.Workspace();
  const { setup, loop } = makeRoots(workspace);
  const testedBlock = workspace.newBlock(blockType);

  if (asValue) {
    const printer = workspace.newBlock('escrever_serial_valor');
    connectValue(printer, 'VALOR', testedBlock);
    connectStatement(loop, 'DO', printer);
  } else {
    connectStatement(setup, 'DO', testedBlock);
  }

  const code = generateCode(workspace as Blockly.WorkspaceSvg, board);
  assert(code.includes(expectedCode), `${blockType} não incluiu ${expectedCode}`);
  workspace.dispose();
}

export async function runBlockAudit() {
  initBlocks();
  initGenerators();

  const customTypes = Object.keys(Blockly.Blocks);
  assert(customTypes.length === 137, `Esperava 137 blocos; encontrei ${customTypes.length}.`);

  const toolboxTypes = toolboxBlockTypes();
  assert(new Set(toolboxTypes).size === 133, 'A toolbox deve expor 133 blocos sem duplicatas.');
  assert(
    !toolboxTypes.includes('util_map_float') && !toolboxTypes.includes('util_fabsf'),
    'Aliases decimais legados devem continuar definidos, mas não duplicar opções na toolbox.',
  );
  assert(
    toolboxConfig.contents.map((category) => category.name).join('|')
      === 'Lógica|Controle|Matemática|Variáveis|Listas|Armazenamento|Funções|Tempo|Entradas e Saídas|Sensor de Distância|Sensor de Temperatura e Umidade|Receptor Infravermelho|MPU6050|Servo|Buzzer|Display LCD|LED Endereçável|Motor DC|Texto|Serial|ESP-NOW|Wi-Fi|Bluetooth',
    'A ordem da toolbox deve priorizar fundamentos antes de hardware e comunicação.',
  );
  for (const type of toolboxTypes) {
    assert(customTypes.includes(type), `Bloco ${type} está na toolbox, mas não foi definido.`);
    assert(Boolean(cppGenerator.forBlock[type]), `Bloco ${type} não possui gerador C++.`);
    assert(Boolean(BLOCK_NAMES[type]), `Bloco ${type} não possui nome amigável.`);
  }
  for (const type of customTypes) {
    assert(Boolean(cppGenerator.forBlock[type]), `Definição ${type} não possui gerador C++.`);
  }
  assert(
    BOARDS.nano.analogPins.some(([, pin]) => pin === 'A7')
      && !BOARDS.nano.outputPins.some(([, pin]) => pin === 'A7'),
    'A6/A7 do Nano devem aparecer somente como entradas analógicas.',
  );

  const avrToolboxJson = JSON.stringify(getToolboxConfig('uno'));
  assert(
    !avrToolboxJson.includes('"type":"espnow_')
      && !avrToolboxJson.includes('"type":"wifi_')
      && !avrToolboxJson.includes('"type":"bt_'),
    'A toolbox AVR não pode criar blocos ESP-NOW/Wi-Fi/Bluetooth, nem dentro de presets.',
  );
  assert(
    avrToolboxJson.includes(
      '"type":"l298n_velocidade_por_pitch_roll","inputs":{"PITCH":{"block":{"type":"numero_fixo"',
    ),
    'O preset L298N do AVR deve usar números no lugar de leitores ESP-NOW.',
  );
  for (const [board, ultrasonicFields, motorFields, servoFields] of [
    [
      'uno',
      { TRIG: '12', ECHO: '13' },
      { ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8' },
      { PIN: '9' },
    ],
    [
      'esp32',
      { TRIG: '18', ECHO: '19' },
      { ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14' },
      { PIN: '13' },
    ],
  ] as const) {
    const config = JSON.parse(JSON.stringify(getToolboxConfig(board))) as {
      contents: Array<{
        contents: Array<{ type?: string; fields?: Record<string, string> }>;
      }>;
    };
    const fieldsFor = (type: string) => config.contents
      .flatMap((category) => category.contents)
      .find((item) => item.type === type)?.fields;
    for (const type of [
      'configurar_ultrassonico',
      'ler_distancia_cm',
      'mostrar_distancia',
      'objeto_esta_perto',
      'distancia_entre',
    ]) {
      assert(
        JSON.stringify(fieldsFor(type)) === JSON.stringify(ultrasonicFields),
        `O bloco ${type} de ${board} não possui Trigger/Echo distintos.`,
      );
    }
    assert(
      JSON.stringify(fieldsFor('l298n_configurar_simples')) === JSON.stringify(motorFields),
      `O preset L298N de ${board} não possui seis pinos distintos.`,
    );
    for (const type of ['servo_configurar', 'servo_mover', 'servo_ler']) {
      assert(
        JSON.stringify(fieldsFor(type)) === JSON.stringify(servoFields),
        `O bloco ${type} de ${board} não possui um pino inicial seguro.`,
      );
    }
  }
  const unoToolboxJson = JSON.stringify(getToolboxConfig('uno'));
  const esp32ToolboxJson = JSON.stringify(getToolboxConfig('esp32'));
  assert(
    unoToolboxJson.includes('"type":"mapear_valor","inputs":{"VALOR":{"block":{"type":"numero_fixo","fields":{"VALOR":512}}}},"fields":{"DE_MAX":1023}')
      && esp32ToolboxJson.includes('"type":"mapear_valor","inputs":{"VALOR":{"block":{"type":"numero_fixo","fields":{"VALOR":2048}}}},"fields":{"DE_MAX":4095}'),
    'A escala analógica inicial deve respeitar 0–1023 no AVR e 0–4095 no ESP32.',
  );

  for (const board of Object.keys(BOARDS) as BoardKey[]) {
    syncBoardPins(board);
    for (const type of customTypes) {
      const workspace = new Blockly.Workspace();
      const block = workspace.newBlock(type);
      generateCode(workspace as Blockly.WorkspaceSvg, board);
      cppGenerator.blockToCode(block);

      const serialized = Blockly.serialization.workspaces.save(workspace);
      const restored = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(serialized, restored);
      assert(restored.getAllBlocks(false).length === 1, `${type} falhou no round-trip em ${board}.`);
      restored.dispose();
      workspace.dispose();
    }
  }

  const deterministicWorkspace = new Blockly.Workspace();
  const { setup } = makeRoots(deterministicWorkspace);
  const repeat = deterministicWorkspace.newBlock('repetir_vezes');
  const timer = deterministicWorkspace.newBlock('a_cada_x_ms');
  connectStatement(setup, 'DO', repeat);
  connectStatement(repeat, 'DO', timer);
  const firstCode = generateCode(deterministicWorkspace as Blockly.WorkspaceSvg, 'uno');
  const secondCode = generateCode(deterministicWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(firstCode === secondCode, 'A geração C++ não é determinística entre execuções.');
  deterministicWorkspace.dispose();

  const dynamicBreakWorkspace = new Blockly.Workspace();
  const dynamicBreakRoots = makeRoots(dynamicBreakWorkspace);
  const dynamicBreakRepeat = dynamicBreakWorkspace.newBlock('repetir_quantidade');
  connectValue(dynamicBreakRepeat, 'TIMES', dynamicBreakWorkspace.newBlock('numero_fixo'));
  const dynamicBreak = dynamicBreakWorkspace.newBlock('parar_repeticao');
  connectStatement(dynamicBreakRepeat, 'DO', dynamicBreak);
  connectStatement(dynamicBreakRoots.loop, 'DO', dynamicBreakRepeat);
  assert(
    !auditWorkspace(dynamicBreakWorkspace, 'uno')
      .some((issue) => issue.blockId === dynamicBreak.id)
      && generateCode(dynamicBreakWorkspace as Blockly.WorkspaceSvg, 'uno').includes('break;'),
    '“Parar repetição” não reconheceu a repetição com quantidade calculada.',
  );
  dynamicBreakWorkspace.dispose();

  const decimalWorkspace = new Blockly.Workspace();
  const decimal = decimalWorkspace.newBlock('distancia_entre');
  decimal.setFieldValue(1.5, 'MIN');
  decimal.setFieldValue(20.25, 'MAX');
  generateCode(decimalWorkspace as Blockly.WorkspaceSvg, 'uno');
  const decimalCode = cppGenerator.blockToCode(decimal);
  assert(Array.isArray(decimalCode) && !decimalCode[0].includes('.0f'), 'Distância gerou literal decimal inválido.');
  decimalWorkspace.dispose();

  const serialWorkspace = new Blockly.Workspace();
  const serial = serialWorkspace.newBlock('escrever_serial');
  serial.setFieldValue('Olá "robô"\\linha\nnova', 'TEXT');
  generateCode(serialWorkspace as Blockly.WorkspaceSvg, 'uno');
  const serialCode = cppGenerator.blockToCode(serial);
  assert(typeof serialCode === 'string' && serialCode.includes('\\"robô\\"\\\\linha\\nnova'), 'Texto serial não foi escapado.');
  serialWorkspace.dispose();

  const connectionWorkspace = new Blockly.Workspace();
  const numberValue = connectionWorkspace.newBlock('numero_fixo');
  const booleanValue = connectionWorkspace.newBlock('valor_booleano_fixo');
  const math = connectionWorkspace.newBlock('operacao_matematica');
  const logical = connectionWorkspace.newBlock('e_ou_logico');
  const digitalRead = connectionWorkspace.newBlock('ler_pino_digital');
  assert(
    !connectionWorkspace.connectionChecker.canConnect(
      booleanValue.outputConnection,
      math.getInput('A')?.connection ?? null,
      false,
    ),
    'Uma expressão booleana não pode encaixar em uma entrada matemática.',
  );
  assert(
    !connectionWorkspace.connectionChecker.canConnect(
      numberValue.outputConnection,
      logical.getInput('A')?.connection ?? null,
      false,
    ),
    'Um número não pode encaixar diretamente em uma entrada lógica.',
  );
  assert(
    connectionWorkspace.connectionChecker.canConnect(
      digitalRead.outputConnection,
      math.getInput('A')?.connection ?? null,
      false,
    ) && connectionWorkspace.connectionChecker.canConnect(
      digitalRead.outputConnection,
      logical.getInput('A')?.connection ?? null,
      false,
    ),
    'A leitura digital deve poder representar 0/1 e falso/verdadeiro.',
  );
  connectionWorkspace.dispose();

  const typedVariableWorkspace = new Blockly.Workspace();
  const boolDeclaration = typedVariableWorkspace.newBlock('declarar_variavel_global');
  boolDeclaration.setFieldValue('bool', 'TIPO');
  boolDeclaration.setFieldValue('ativo', 'NOME');
  const boolReader = typedVariableWorkspace.newBlock('ler_variavel');
  boolReader.setFieldValue('ativo', 'NOME');
  const boolAssignment = typedVariableWorkspace.newBlock('atribuir_variavel');
  boolAssignment.setFieldValue('ativo', 'NOME');
  const boolIncrement = typedVariableWorkspace.newBlock('incrementar_variavel');
  boolIncrement.setFieldValue('ativo', 'NOME');
  synchronizeVariableTypes(typedVariableWorkspace);
  assert(
    boolDeclaration.getInput('VALOR')?.connection?.getCheck()?.includes('Boolean')
      && boolReader.outputConnection?.getCheck()?.includes('Boolean')
      && boolAssignment.getInput('VALOR')?.connection?.getCheck()?.includes('Boolean'),
    'Declaração, leitura e atribuição não herdaram o tipo lógico da variável.',
  );
  assert(
    auditWorkspace(typedVariableWorkspace, 'uno')
      .some((issue) => issue.blockId === boolIncrement.id && issue.message.includes('não pode ser aumentada')),
    'A auditoria aceitou incremento numérico em uma variável lógica.',
  );
  typedVariableWorkspace.dispose();

  // Compatibilidade: antes desta revisão, o input de variável não tinha tipo.
  const legacyVariableWorkspace = new Blockly.Workspace();
  const legacyDeclaration = legacyVariableWorkspace.newBlock('declarar_variavel_global');
  legacyDeclaration.setFieldValue('bool', 'TIPO');
  legacyDeclaration.setFieldValue('legado', 'NOME');
  const legacyNumber = legacyVariableWorkspace.newBlock('numero_fixo');
  legacyDeclaration.getInput('VALOR')?.connection?.setCheck(null);
  connectValue(legacyDeclaration, 'VALOR', legacyNumber);
  synchronizeVariableTypes(legacyVariableWorkspace);
  assert(
    legacyDeclaration.getInputTargetBlock('VALOR')?.id === legacyNumber.id,
    'A sincronização removeu uma conexão de variável criada por projeto legado.',
  );
  assert(
    auditWorkspace(legacyVariableWorkspace, 'uno')
      .some((issue) => issue.blockId === legacyDeclaration.id && issue.message.includes('valor lógico')),
    'Uma conexão legada incompatível foi preservada sem orientação de correção.',
  );
  const legacyState = Blockly.serialization.workspaces.save(legacyVariableWorkspace);
  const restoredLegacyWorkspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(legacyState, restoredLegacyWorkspace);
  synchronizeVariableTypes(restoredLegacyWorkspace);
  assert(
    restoredLegacyWorkspace.getBlocksByType('declarar_variavel_global', false)[0]
      ?.getInputTargetBlock('VALOR')?.type === 'numero_fixo',
    'O round-trip de um projeto legado desconectou seu valor incompatível.',
  );
  restoredLegacyWorkspace.dispose();
  legacyVariableWorkspace.dispose();

  const mathWorkspace = new Blockly.Workspace();
  const mathRoots = makeRoots(mathWorkspace);
  const mathPrint = mathWorkspace.newBlock('escrever_serial_valor');
  const mapValue = mathWorkspace.newBlock('mapear_valor');
  const division = mathWorkspace.newBlock('operacao_matematica');
  division.setFieldValue('/', 'OP');
  connectValue(division, 'A', mathWorkspace.newBlock('numero_fixo'));
  const divisor = mathWorkspace.newBlock('numero_fixo');
  divisor.setFieldValue(2, 'VALOR');
  connectValue(division, 'B', divisor);
  connectValue(mapValue, 'VALOR', division);
  connectValue(mathPrint, 'VALOR', mapValue);
  connectStatement(mathRoots.loop, 'DO', mathPrint);
  const generatedMath = generateCode(mathWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    generatedMath.includes('_bloquin_dividir((float)')
      && generatedMath.includes('_bloquin_mapFloat((float)')
      && !generatedMath.includes('map('),
    'Divisão/mapeamento ainda estão sujeitos a truncamento inteiro.',
  );
  assert(
    (generatedMath.match(/float _bloquin_mapFloat\(/g) ?? []).length === 1
      && (generatedMath.match(/#include <math\.h>/g) ?? []).length === 1,
    'Helpers matemáticos compartilhados não foram deduplicados.',
  );
  mathWorkspace.dispose();

  syncBoardPins('uno');
  const runtimeInitializerWorkspace = new Blockly.Workspace();
  const runtimeRoots = makeRoots(runtimeInitializerWorkspace);
  const outputConfiguration = runtimeInitializerWorkspace.newBlock('configurar_pino');
  outputConfiguration.setFieldValue('13', 'PIN');
  outputConfiguration.setFieldValue('OUTPUT', 'MODE');
  connectStatement(runtimeRoots.setup, 'DO', outputConfiguration);
  const runtimeDeclaration = runtimeInitializerWorkspace.newBlock('declarar_variavel_global');
  runtimeDeclaration.setFieldValue('leitura', 'NOME');
  const analogRead = runtimeInitializerWorkspace.newBlock('ler_pino_analogico');
  analogRead.setFieldValue('A0', 'PIN');
  connectValue(runtimeDeclaration, 'VALOR', analogRead);
  const runtimePrint = runtimeInitializerWorkspace.newBlock('escrever_serial_valor');
  const runtimeReader = runtimeInitializerWorkspace.newBlock('ler_variavel');
  runtimeReader.setFieldValue('leitura', 'NOME');
  connectValue(runtimePrint, 'VALOR', runtimeReader);
  outputConfiguration.nextConnection?.connect(runtimePrint.previousConnection);
  const runtimeCode = generateCode(runtimeInitializerWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    runtimeCode.includes('int bloquin_user_var_leitura = 0;')
      && runtimeCode.indexOf('pinMode(13, OUTPUT);')
        < runtimeCode.indexOf('bloquin_user_var_leitura = analogRead(A0);')
      && runtimeCode.indexOf('bloquin_user_var_leitura = analogRead(A0);')
        < runtimeCode.indexOf('Serial.println(bloquin_user_var_leitura);'),
    'Uma leitura de hardware foi executada fora da fase correta do setup do Arduino.',
  );
  runtimeInitializerWorkspace.dispose();

  const dependencyWorkspace = new Blockly.Workspace();
  makeRoots(dependencyWorkspace);
  const dependentDeclaration = dependencyWorkspace.newBlock('declarar_variavel_global');
  dependentDeclaration.setFieldValue('resultado', 'NOME');
  const sourceReader = dependencyWorkspace.newBlock('ler_variavel');
  sourceReader.setFieldValue('origem', 'NOME');
  connectValue(dependentDeclaration, 'VALOR', sourceReader);
  const sourceDeclaration = dependencyWorkspace.newBlock('declarar_variavel_global');
  sourceDeclaration.setFieldValue('origem', 'NOME');
  const dependencyAnalogRead = dependencyWorkspace.newBlock('ler_pino_analogico');
  dependencyAnalogRead.setFieldValue('A0', 'PIN');
  connectValue(sourceDeclaration, 'VALOR', dependencyAnalogRead);
  const dependencyCode = generateCode(dependencyWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    dependencyCode.indexOf('bloquin_user_var_origem = analogRead(A0);')
      < dependencyCode.indexOf('bloquin_user_var_resultado = bloquin_user_var_origem;'),
    'Inicializadores dependentes não foram ordenados antes da execução do setup.',
  );
  dependencyWorkspace.dispose();

  const cyclicVariableWorkspace = new Blockly.Workspace();
  const cyclicA = cyclicVariableWorkspace.newBlock('declarar_variavel_global');
  cyclicA.setFieldValue('a', 'NOME');
  const readB = cyclicVariableWorkspace.newBlock('ler_variavel');
  readB.setFieldValue('b', 'NOME');
  connectValue(cyclicA, 'VALOR', readB);
  const cyclicB = cyclicVariableWorkspace.newBlock('declarar_variavel_global');
  cyclicB.setFieldValue('b', 'NOME');
  const readA = cyclicVariableWorkspace.newBlock('ler_variavel');
  readA.setFieldValue('a', 'NOME');
  connectValue(cyclicB, 'VALOR', readA);
  synchronizeVariableTypes(cyclicVariableWorkspace);
  assert(
    auditWorkspace(cyclicVariableWorkspace, 'uno')
      .filter((issue) => issue.message.includes('dependência circular')).length === 2,
    'A auditoria não detectou um ciclo entre inicializadores de variáveis.',
  );
  cyclicVariableWorkspace.dispose();

  const safeOutputWorkspace = new Blockly.Workspace();
  const safeRoots = makeRoots(safeOutputWorkspace);
  const pwm = safeOutputWorkspace.newBlock('escrever_pino_pwm');
  pwm.setFieldValue('3', 'PIN');
  connectValue(pwm, 'VALOR', safeOutputWorkspace.newBlock('numero_fixo'));
  const servoSetup = safeOutputWorkspace.newBlock('servo_configurar');
  servoSetup.setFieldValue('9', 'PIN');
  connectStatement(safeRoots.setup, 'DO', servoSetup);
  const servoMove = safeOutputWorkspace.newBlock('servo_mover');
  servoMove.setFieldValue('9', 'PIN');
  connectValue(servoMove, 'ANGULO', safeOutputWorkspace.newBlock('numero_fixo'));
  connectChain(safeRoots.loop, 'DO', [pwm, servoMove]);
  const safeOutputCode = generateCode(safeOutputWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    safeOutputCode.includes('analogWrite(3, (int)_bloquin_limitar((float)')
      && safeOutputCode.includes('.write((int)_bloquin_limitar((float)')
      && (safeOutputCode.match(/float _bloquin_limitar\(/g) ?? []).length === 1
      && (safeOutputCode.match(/pinMode\(3, OUTPUT\)/g) ?? []).length === 1,
    'PWM/servo não foram limitados ou a saída genérica não recebeu configuração automática.',
  );
  safeOutputWorkspace.dispose();

  syncBoardPins('uno');
  const setupOrderWorkspace = new Blockly.Workspace();
  const setupOrderRoots = makeRoots(setupOrderWorkspace);
  const earlyWrite = setupOrderWorkspace.newBlock('escrever_pino');
  earlyWrite.setFieldValue('13', 'PIN');
  const lateConfiguration = setupOrderWorkspace.newBlock('configurar_pino');
  lateConfiguration.setFieldValue('13', 'PIN');
  lateConfiguration.setFieldValue('OUTPUT', 'MODE');
  connectChain(setupOrderRoots.setup, 'DO', [earlyWrite, lateConfiguration]);
  assert(
    auditWorkspace(setupOrderWorkspace, 'uno')
      .some((issue) => issue.blockId === earlyWrite.id && issue.message.includes('antes de escrever')),
    'A auditoria não detectou configuração de pino executada tarde demais no setup.',
  );
  setupOrderWorkspace.dispose();

  const nestedSetupWorkspace = new Blockly.Workspace();
  const nestedSetupRoots = makeRoots(nestedSetupWorkspace);
  const setupCondition = nestedSetupWorkspace.newBlock('se_entao');
  connectValue(setupCondition, 'CONDICAO', nestedSetupWorkspace.newBlock('valor_booleano_fixo'));
  const nestedConfiguration = nestedSetupWorkspace.newBlock('configurar_pino');
  connectStatement(setupCondition, 'ENTAO', nestedConfiguration);
  connectStatement(nestedSetupRoots.setup, 'DO', setupCondition);
  assert(
    auditWorkspace(nestedSetupWorkspace, 'uno')
      .some((issue) => issue.blockId === nestedConfiguration.id && issue.message.includes('diretamente')),
    'A auditoria aceitou uma configuração condicional dentro de PREPARAR.',
  );
  nestedSetupWorkspace.dispose();

  const singletonWorkspace = new Blockly.Workspace();
  const singletonRoots = makeRoots(singletonWorkspace);
  const firstMotorSetup = singletonWorkspace.newBlock('l298n_configurar_simples');
  const duplicateMotorSetup = singletonWorkspace.newBlock('l298n_configurar_simples');
  connectChain(singletonRoots.setup, 'DO', [firstMotorSetup, duplicateMotorSetup]);
  assert(
    auditWorkspace(singletonWorkspace, 'uno')
      .some((issue) => issue.blockId === duplicateMotorSetup.id && issue.message.includes('apenas uma configuração')),
    'A auditoria aceitou duas configurações para o singleton L298N.',
  );
  singletonWorkspace.dispose();

  syncBoardPins('esp32');
  const conflictWorkspace = new Blockly.Workspace();
  const conflictRoots = makeRoots(conflictWorkspace);
  const conflictWifi = conflictWorkspace.newBlock('espnow_iniciar_wifi');
  const conflictServo = conflictWorkspace.newBlock('servo_configurar');
  conflictServo.setFieldValue('13', 'PIN');
  connectChain(conflictRoots.setup, 'DO', [conflictWifi, conflictServo]);
  const conflictAnalog = conflictWorkspace.newBlock('ler_pino_analogico');
  conflictAnalog.setFieldValue('25', 'PIN');
  const conflictPrint = conflictWorkspace.newBlock('escrever_serial_valor');
  connectValue(conflictPrint, 'VALOR', conflictAnalog);
  const conflictBuzzer = conflictWorkspace.newBlock('buzzer_tocar');
  conflictBuzzer.setFieldValue('13', 'PIN');
  connectChain(conflictRoots.loop, 'DO', [conflictPrint, conflictBuzzer]);
  const conflictIssues = auditWorkspace(conflictWorkspace, 'esp32');
  assert(
    conflictIssues.some((issue) => issue.message.includes('ADC2'))
      && conflictIssues.some((issue) => issue.message.includes('compartilhado')),
    'A auditoria não detectou ADC2 com Wi-Fi ou colisão entre componentes.',
  );
  conflictWorkspace.dispose();

  const espRoleWorkspace = new Blockly.Workspace();
  const espRoleRoots = makeRoots(espRoleWorkspace);
  connectChain(espRoleRoots.setup, 'DO', [
    espRoleWorkspace.newBlock('espnow_iniciar_wifi'),
    espRoleWorkspace.newBlock('espnow_transmissor_init'),
    espRoleWorkspace.newBlock('espnow_receptor_init'),
  ]);
  assert(
    auditWorkspace(espRoleWorkspace, 'esp32')
      .some((issue) => issue.message.includes('transmissor ou receptor')),
    'A auditoria aceitou dois papéis ESP-NOW incompatíveis no mesmo projeto.',
  );
  espRoleWorkspace.dispose();

  testIsolatedDependency('esp32', 'espnow_mac_serial', '#include <WiFi.h>');
  testIsolatedDependency('esp32', 'espnow_tem_dados_novos', '_bloquin_OnDataRecv', true);
  testIsolatedDependency('esp32', 'espnow_ler_pitch', '_bloquin_lerEspnowPitch()', true);
  testIsolatedDependency('esp32', 'espnow_ler_roll', '_bloquin_obterSnapshotEspnow()', true);
  testIsolatedDependency(
    'esp32',
    'espnow_timeout_ms',
    'return recebeu ? (millis() - ultimo > limite) : (millis() > limite);',
    true,
  );
  testIsolatedDependency('uno', 'mpu_iniciar', '#include <Wire.h>');
  testIsolatedDependency('esp32', 'l298n_velocidade_por_pitch_roll', '_bloquin_aplicarControle');
  testIsolatedDependency('uno', 'servo_configurar', '#include <Servo.h>');
  testIsolatedDependency('esp32', 'servo_configurar', '#include <ESP32Servo.h>');

  // MPU-6050: acelerômetro, giroscópio e temperatura têm fórmulas distintas
  // (não são "a mesma coisa"), lidas num único burst de 14 bytes.
  testIsolatedDependency('uno', 'mpu_ler_aceleracao_x', '_mpu_accelX = ax / 16384.0f;');
  testIsolatedDependency('uno', 'mpu_ler_giro_z', '_mpu_gyroZ = gz / 131.0f;');
  testIsolatedDependency('uno', 'mpu_ler_temperatura', '_mpu_tempC = rawTemp / 340.0f + 36.53f;');

  // ESP-NOW — mensagem genérica: envio/leitura usam o mesmo envelope
  // (_BloquinMensagem) que os blocos legados de pitch/roll/parar.
  testIsolatedDependency('esp32', 'espnow_enviar_mensagem', 'esp_now_send(_espnow_peer_mac, (uint8_t*)&_msg, sizeof(_msg));');
  testIsolatedDependency('esp32', 'espnow_mensagem_valor_c', '_bloquin_lerEspnowValorC()', true);
  testIsolatedDependency('esp32', 'espnow_mensagem_remetente', '_bloquin_espnowRemetente()', true);
  testIsolatedDependency('esp32', 'espnow_iniciou_com_sucesso', '_espnow_ok', true);
  testIsolatedDependency('esp32', 'espnow_envio_confirmado', '_espnow_ultimoEnvioOk', true);
  testIsolatedDependency('esp32', 'espnow_contagem_invalidas', '_espnow_invalidas', true);

  // Wi-Fi/Bluetooth seguem a mesma filosofia iniciar/status/enviar/receber.
  testIsolatedDependency('esp32', 'wifi_conectar', 'WiFi.begin(');
  testIsolatedDependency('esp32', 'wifi_esta_conectado', 'WL_CONNECTED', true);
  testIsolatedDependency('esp32', 'bt_iniciar', '_bloquinBT.begin(');
  testIsolatedDependency('esp32', 'bt_ler_texto', '_bloquin_lerBluetooth()', true);

  // Falha de inicialização do ESP-NOW não pode mais travar o sketch para
  // sempre: o usuário decide o que fazer consultando "iniciou com sucesso?".
  syncBoardPins('esp32');
  const noHaltWorkspace = new Blockly.Workspace();
  const noHaltRoots = makeRoots(noHaltWorkspace);
  connectChain(noHaltRoots.setup, 'DO', [
    noHaltWorkspace.newBlock('espnow_iniciar_wifi'),
    noHaltWorkspace.newBlock('espnow_transmissor_init'),
    noHaltWorkspace.newBlock('espnow_adicionar_receptor'),
  ]);
  const noHaltCode = generateCode(noHaltWorkspace as Blockly.WorkspaceSvg, 'esp32');
  assert(
    !noHaltCode.includes('while(true)') && !noHaltCode.includes('while (true)'),
    'Falha de inicialização do ESP-NOW ainda trava o sketch com um laço infinito.',
  );
  assert(
    noHaltCode.includes('_espnow_ok = (esp_now_init() == ESP_OK);'),
    'Inicialização do transmissor ESP-NOW não expõe mais o estado de sucesso em _espnow_ok.',
  );
  noHaltWorkspace.dispose();

  // A inclinação calculada não pode mais depender de uma correção de eixo
  // específica de um projeto (a antiga troca "luva rotacionada 90°"): pitch
  // e roll devem vir direto da fórmula padrão do acelerômetro.
  syncBoardPins('uno');
  const mpuFormulaWorkspace = new Blockly.Workspace();
  const mpuFormulaRoots = makeRoots(mpuFormulaWorkspace);
  connectStatement(mpuFormulaRoots.setup, 'DO', mpuFormulaWorkspace.newBlock('mpu_iniciar'));
  const mpuFormulaPrint = mpuFormulaWorkspace.newBlock('escrever_serial_valor');
  connectValue(mpuFormulaPrint, 'VALOR', mpuFormulaWorkspace.newBlock('mpu_ler_pitch'));
  connectStatement(mpuFormulaRoots.loop, 'DO', mpuFormulaPrint);
  const mpuFormulaCode = generateCode(mpuFormulaWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    mpuFormulaCode.includes('_mpu_pitchCache = atan2f(-_mpu_accelX, sqrtf(_mpu_accelY*_mpu_accelY + _mpu_accelZ*_mpu_accelZ)) * 180.0f / PI;')
      && mpuFormulaCode.includes('_mpu_rollCache  = atan2f(_mpu_accelY, _mpu_accelZ) * 180.0f / PI;')
      && !mpuFormulaCode.includes('_mpu_pitchCache = sensorRoll'),
    'O cálculo de inclinação ainda contém a correção de eixo específica de um projeto.',
  );
  mpuFormulaWorkspace.dispose();

  for (const [board, expectedSda, expectedScl] of [
    ['uno', 'A4', 'A5'],
    ['nano', 'A4', 'A5'],
    ['esp32', '21', '22'],
  ] as const) {
    syncBoardPins(board);
    const workspace = new Blockly.Workspace();
    const mpu = workspace.newBlock('mpu_iniciar');
    assert(
      mpu.getFieldValue('SDA') === expectedSda && mpu.getFieldValue('SCL') === expectedScl,
      `${BOARDS[board].name} iniciou o I²C em ${mpu.getFieldValue('SDA')}/${mpu.getFieldValue('SCL')}, esperado ${expectedSda}/${expectedScl}.`,
    );
    workspace.dispose();
  }

  syncBoardPins('esp32');
  const i2cWorkspace = new Blockly.Workspace();
  const i2cRoots = makeRoots(i2cWorkspace);
  const invalidI2c = i2cWorkspace.newBlock('mpu_iniciar');
  invalidI2c.setFieldValue('21', 'SCL');
  connectStatement(i2cRoots.setup, 'DO', invalidI2c);
  let i2cIssues = auditWorkspace(i2cWorkspace, 'esp32');
  assert(
    i2cIssues.some((issue) => issue.message.includes('SDA e SCL')),
    'A auditoria não detectou SDA e SCL iguais.',
  );
  invalidI2c.setFieldValue('22', 'SCL');
  i2cIssues = auditWorkspace(i2cWorkspace, 'esp32');
  assert(
    !i2cIssues.some((issue) => issue.message.includes('SDA e SCL')),
    'A auditoria manteve o aviso após corrigir SDA e SCL.',
  );
  i2cWorkspace.dispose();

  syncBoardPins('uno');
  const distinctPinsWorkspace = new Blockly.Workspace();
  const distinctRoots = makeRoots(distinctPinsWorkspace);
  const invalidUltrasonic = distinctPinsWorkspace.newBlock('configurar_ultrassonico');
  const invalidMotorPins = distinctPinsWorkspace.newBlock('l298n_configurar_simples');
  connectChain(distinctRoots.setup, 'DO', [invalidUltrasonic, invalidMotorPins]);
  let distinctPinIssues = auditWorkspace(distinctPinsWorkspace, 'uno');
  assert(
    distinctPinIssues.some((issue) => issue.message.includes('Trigger e Echo'))
      && distinctPinIssues.some((issue) => issue.message.includes('seis pinos diferentes')),
    'A auditoria não detectou pinos repetidos no ultrassônico e no L298N.',
  );
  invalidUltrasonic.setFieldValue('12', 'TRIG');
  invalidUltrasonic.setFieldValue('13', 'ECHO');
  for (const [field, pin] of Object.entries({
    ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8',
  })) {
    invalidMotorPins.setFieldValue(pin, field);
  }
  distinctPinIssues = auditWorkspace(distinctPinsWorkspace, 'uno');
  assert(
    !distinctPinIssues.some((issue) => (
      issue.message.includes('Trigger e Echo')
      || issue.message.includes('seis pinos diferentes')
    )),
    'A auditoria manteve avisos de pinos repetidos após a correção.',
  );
  distinctPinsWorkspace.dispose();

  const serializedI2cIssues = auditSerializedWorkspace({
    blocks: {
      blocks: [{ type: 'mpu_iniciar', fields: { SDA: '21', SCL: '21' } }],
    },
  }, 'esp32');
  assert(
    serializedI2cIssues.some((message) => message.includes('SDA e SCL')),
    'A auditoria serializada não detectou SDA e SCL iguais.',
  );
  const serializedInputOnlyIssues = auditSerializedWorkspace({
    blocks: {
      blocks: [{
        type: 'configurar_pino',
        fields: { PIN: '34', MODE: 'OUTPUT' },
      }],
    },
  }, 'esp32');
  assert(
    serializedInputOnlyIssues.some((message) => message.includes('somente entrada')),
    'A auditoria serializada aceitou saída em um GPIO somente de entrada do ESP32.',
  );

  const identifierWorkspace = new Blockly.Workspace();
  for (const name of ['int', 'bloquin_int', 'Foo', 'foo']) {
    const declaration = identifierWorkspace.newBlock('declarar_variavel_global');
    declaration.setFieldValue(name, 'NOME');
  }
  const sameNameFunction = identifierWorkspace.newBlock('definir_funcao');
  sameNameFunction.setFieldValue('foo', 'NOME');
  const identifierIssues = auditWorkspace(identifierWorkspace, 'uno');
  assert(
    !identifierIssues.some((issue) => issue.message.includes('duas variáveis')),
    'A auditoria confundiu nomes C++ reservados/prefixados ou diferenças de maiúsculas.',
  );
  const identifierCode = generateCode(identifierWorkspace as Blockly.WorkspaceSvg, 'uno');
  assert(
    identifierCode.includes('bloquin_user_var_int')
      && identifierCode.includes('bloquin_user_var_bloquin_int')
      && identifierCode.includes('bloquin_user_var_Foo')
      && identifierCode.includes('bloquin_user_var_foo')
      && identifierCode.includes('bloquin_user_fn_foo'),
    'O gerador não preservou identificadores distintos e case-sensitive.',
  );
  identifierWorkspace.dispose();

  const collidingIdentifierWorkspace = new Blockly.Workspace();
  for (const name of ['a-b', 'a_b']) {
    const declaration = collidingIdentifierWorkspace.newBlock('declarar_variavel_global');
    declaration.setFieldValue(name, 'NOME');
  }
  assert(
    auditWorkspace(collidingIdentifierWorkspace, 'uno')
      .some((issue) => issue.message.includes('duas variáveis')),
    'A auditoria não detectou nomes que colidem após a normalização C++.',
  );
  collidingIdentifierWorkspace.dispose();

  const reservedFunctionWorkspace = new Blockly.Workspace();
  for (const name of ['setup', 'loop', 'main']) {
    const definition = reservedFunctionWorkspace.newBlock('definir_funcao');
    definition.setFieldValue(name, 'NOME');
  }
  const reservedFunctionCode = generateCode(
    reservedFunctionWorkspace as Blockly.WorkspaceSvg,
    'uno',
  );
  for (const name of ['setup', 'loop', 'main']) {
    assert(
      reservedFunctionCode.includes(`void bloquin_user_fn_${name}()`),
      `A função reservada ${name} não foi isolada no namespace do usuário.`,
    );
  }
  assert(
    (reservedFunctionCode.match(/void setup\(\)/g) ?? []).length === 1
      && (reservedFunctionCode.match(/void loop\(\)/g) ?? []).length === 1,
    'Funções do usuário colidiram com setup/loop gerados pelo Arduino.',
  );
  reservedFunctionWorkspace.dispose();

  const returnFunctionWorkspace = new Blockly.Workspace();
  const voidDefinition = returnFunctionWorkspace.newBlock('definir_funcao');
  voidDefinition.setFieldValue('calcular', 'NOME');
  const returnCall = returnFunctionWorkspace.newBlock('chamar_funcao_retorno');
  returnCall.setFieldValue('calcular', 'NOME');
  assert(
    auditWorkspace(returnFunctionWorkspace, 'uno')
      .some((issue) => issue.blockId === returnCall.id && issue.message.includes('com resposta')),
    'A auditoria aceitou uma função sem resposta dentro de uma expressão.',
  );
  returnFunctionWorkspace.dispose();

  for (const board of ['uno', 'esp32'] as BoardKey[]) {
    syncBoardPins(board);
    const workspace = new Blockly.Workspace();
    const { setup, loop } = makeRoots(workspace);
    connectStatement(setup, 'DO', workspace.newBlock('l298n_configurar_simples'));
    connectStatement(loop, 'DO', workspace.newBlock('l298n_mover_robo'));
    const code = generateCode(workspace as Blockly.WorkspaceSvg, board);
    if (board === 'esp32') assert(code.includes('_LEDC_ATTACH'), 'ESP32 não gerou controle LEDC.');
    else {
      assert(code.includes('analogWrite(_l298n_ENA'), 'Arduino AVR não gerou analogWrite para o motor.');
      assert(!code.includes('#define _LEDC_ATTACH'), 'Arduino AVR recebeu código LEDC do ESP32.');
    }
    workspace.dispose();
  }

  const fixtureNames = Object.keys(createCompilationFixtures());
  assert(
    fixtureNames.join('|')
      === 'uno-fundamentals|uno-hardware|uno-texto-serial|uno-lcd-dht|uno-led-ir|uno-listas-armazenamento|nano-io|esp32-io|esp32-transmitter|esp32-receiver'
        + '|esp32-generic-transmitter|esp32-generic-receiver|esp32-wifi|esp32-http|esp32-bluetooth',
    'A matriz de compilação representativa está incompleta.',
  );

  // Todo exemplo da Documentação de Blocos precisa carregar de verdade num
  // workspace Blockly (mesmo contrato de Blockly.serialization.workspaces
  // .load() que o próprio arquivo de exemplos documenta) — não só "parecer"
  // certo como texto. Isto pegou um bug real: `declarar_variavel_global`
  // (sem previousStatement/nextStatement) estava aninhado dentro do DO de
  // PREPARAR num exemplo, o que lança ao carregar de verdade.
  for (const example of BLOCK_EXAMPLES) {
    syncBoardPins(example.board);
    const exampleWorkspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(example.workspace as never, exampleWorkspace);
      const loadedTypes = new Set(exampleWorkspace.getAllBlocks(false).map((block) => block.type));
      const missing = example.blockTypes.filter((type) => !loadedTypes.has(type));
      const extra = [...loadedTypes].filter((type) => !example.blockTypes.includes(type));
      assert(
        missing.length === 0 && extra.length === 0,
        `Exemplo "${example.id}" tem blockTypes divergente do workspace real ` +
          `(faltando: ${missing.join(', ') || 'nenhum'}; sobrando: ${extra.join(', ') || 'nenhum'}).`,
      );
    } catch (error) {
      throw new Error(`Exemplo "${example.id}" não carrega como workspace Blockly válido: ${(error as Error).message}`);
    } finally {
      exampleWorkspace.dispose();
    }
  }

  console.log(
    `Auditoria Blockly: ${customTypes.length}/${customTypes.length} blocos, 3 placas, `
      + `${fixtureNames.length} cenários de compilação e ${BLOCK_EXAMPLES.length} exemplos de documentação validados.`,
  );
}

export interface CompilationFixture {
  board: BoardKey;
  fqbn: string;
  code: string;
}

const COMPILATION_FQBNS: Record<BoardKey, string> = {
  uno: 'arduino:avr:uno',
  nano: 'arduino:avr:nano',
  esp32: 'esp32:esp32:esp32',
};

function finishFixture(
  name: string,
  workspace: Blockly.Workspace,
  board: BoardKey,
): CompilationFixture {
  const issues = auditWorkspace(workspace, board);
  assert(
    issues.length === 0,
    `A fixture ${name} viola contratos: ${issues.map((issue) => issue.message).join(' | ')}`,
  );
  const code = generateCode(workspace as Blockly.WorkspaceSvg, board);
  workspace.dispose();
  return { board, fqbn: COMPILATION_FQBNS[board], code };
}

export function createCompilationFixtures(): Record<string, CompilationFixture> {
  const fixtures: Record<string, CompilationFixture> = {};

  // Fundamentos: variáveis tipadas, inicialização em runtime, composição
  // matemática/lógica, repetição dinâmica e I/O genérico.
  syncBoardPins('uno');
  const unoFundamentals = new Blockly.Workspace();
  const unoFundamentalRoots = makeRoots(unoFundamentals);
  const sensorDeclaration = unoFundamentals.newBlock('declarar_variavel_global');
  sensorDeclaration.setFieldValue('float', 'TIPO');
  sensorDeclaration.setFieldValue('sensor', 'NOME');
  const initialSensorRead = unoFundamentals.newBlock('ler_pino_analogico');
  initialSensorRead.setFieldValue('A0', 'PIN');
  connectValue(sensorDeclaration, 'VALOR', initialSensorRead);

  const sensorAssignment = unoFundamentals.newBlock('atribuir_variavel');
  sensorAssignment.setFieldValue('sensor', 'NOME');
  const loopSensorRead = unoFundamentals.newBlock('ler_pino_analogico');
  loopSensorRead.setFieldValue('A0', 'PIN');
  connectValue(sensorAssignment, 'VALOR', loopSensorRead);

  const ledByCondition = unoFundamentals.newBlock('escrever_pino_booleano');
  ledByCondition.setFieldValue('13', 'PIN');
  const threshold = unoFundamentals.newBlock('comparar_valores');
  threshold.setFieldValue('>', 'OP');
  const sensorReaderForCondition = unoFundamentals.newBlock('ler_variavel');
  sensorReaderForCondition.setFieldValue('sensor', 'NOME');
  connectValue(threshold, 'A', sensorReaderForCondition);
  const thresholdValue = unoFundamentals.newBlock('numero_fixo');
  thresholdValue.setFieldValue(500, 'VALOR');
  connectValue(threshold, 'B', thresholdValue);
  const combinedCondition = unoFundamentals.newBlock('e_ou_logico');
  combinedCondition.setFieldValue('&&', 'OP');
  connectValue(combinedCondition, 'A', threshold);
  const numberToBoolean = unoFundamentals.newBlock('numero_para_booleano');
  const booleanToNumber = unoFundamentals.newBlock('booleano_para_numero');
  connectValue(booleanToNumber, 'VALOR', unoFundamentals.newBlock('valor_booleano_fixo'));
  connectValue(numberToBoolean, 'VALOR', booleanToNumber);
  connectValue(combinedCondition, 'B', numberToBoolean);
  connectValue(ledByCondition, 'STATE', combinedCondition);
  const ledFunction = unoFundamentals.newBlock('definir_funcao');
  ledFunction.setFieldValue('atualizarLed', 'NOME');
  connectStatement(ledFunction, 'DO', ledByCondition);
  const ledFunctionCall = unoFundamentals.newBlock('chamar_funcao');
  ledFunctionCall.setFieldValue('atualizarLed', 'NOME');

  const pwmBySensor = unoFundamentals.newBlock('escrever_pino_pwm');
  pwmBySensor.setFieldValue('3', 'PIN');
  const mappedSensor = unoFundamentals.newBlock('mapear_valor');
  const sensorReaderForPwm = unoFundamentals.newBlock('ler_variavel');
  sensorReaderForPwm.setFieldValue('sensor', 'NOME');
  connectValue(mappedSensor, 'VALOR', sensorReaderForPwm);
  connectValue(pwmBySensor, 'VALOR', mappedSensor);

  const dynamicRepeat = unoFundamentals.newBlock('repetir_quantidade');
  const repeatCount = unoFundamentals.newBlock('numero_fixo');
  repeatCount.setFieldValue(2, 'VALOR');
  connectValue(dynamicRepeat, 'TIMES', repeatCount);
  const textPrint = unoFundamentals.newBlock('escrever_serial_valor');
  const text = unoFundamentals.newBlock('texto_fixo');
  text.setFieldValue('Bloquin pronto', 'TEXT');
  connectValue(textPrint, 'VALOR', text);
  const calculatedPrint = unoFundamentals.newBlock('escrever_serial_valor');
  const roundedPower = unoFundamentals.newBlock('funcao_matematica');
  roundedPower.setFieldValue('ROUND', 'OP');
  const power = unoFundamentals.newBlock('potencia');
  const powerBase = unoFundamentals.newBlock('numero_fixo');
  powerBase.setFieldValue(2, 'VALOR');
  const powerExponent = unoFundamentals.newBlock('numero_fixo');
  powerExponent.setFieldValue(3, 'VALOR');
  connectValue(power, 'BASE', powerBase);
  connectValue(power, 'EXPOENTE', powerExponent);
  connectValue(roundedPower, 'VALOR', power);
  connectValue(calculatedPrint, 'VALOR', roundedPower);
  connectChain(dynamicRepeat, 'DO', [textPrint, calculatedPrint]);

  const dynamicWait = unoFundamentals.newBlock('esperar_duracao');
  const waitDuration = unoFundamentals.newBlock('numero_fixo');
  waitDuration.setFieldValue(20, 'VALOR');
  connectValue(dynamicWait, 'TIME', waitDuration);
  connectChain(unoFundamentalRoots.loop, 'DO', [
    sensorAssignment,
    ledFunctionCall,
    pwmBySensor,
    dynamicRepeat,
    dynamicWait,
  ]);
  fixtures['uno-fundamentals'] = finishFixture(
    'uno-fundamentals',
    unoFundamentals,
    'uno',
  );

  // Hardware combinado no AVR: bibliotecas, helpers, múltiplos componentes e
  // seis pinos do L298N sem colisões.
  syncBoardPins('uno');
  const unoHardware = new Blockly.Workspace();
  const unoHardwareRoots = makeRoots(unoHardware);
  const unoUltrasonic = unoHardware.newBlock('configurar_ultrassonico');
  unoUltrasonic.setFieldValue('12', 'TRIG');
  unoUltrasonic.setFieldValue('13', 'ECHO');
  const unoMotorConfig = unoHardware.newBlock('l298n_configurar_simples');
  for (const [field, pin] of Object.entries({
    ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8',
  })) {
    unoMotorConfig.setFieldValue(pin, field);
  }
  const unoServoConfig = unoHardware.newBlock('servo_configurar');
  unoServoConfig.setFieldValue('9', 'PIN');
  connectChain(unoHardwareRoots.setup, 'DO', [
    unoUltrasonic,
    unoHardware.newBlock('mpu_iniciar'),
    unoMotorConfig,
    unoServoConfig,
  ]);
  const unoMove = unoHardware.newBlock('l298n_mover_robo');
  const unoPower = unoHardware.newBlock('numero_fixo');
  unoPower.setFieldValue(180, 'VALOR');
  connectValue(unoMove, 'FORCA', unoPower);
  const unoDistance = unoHardware.newBlock('mostrar_distancia');
  unoDistance.setFieldValue('12', 'TRIG');
  unoDistance.setFieldValue('13', 'ECHO');
  const unoServoMove = unoHardware.newBlock('servo_mover');
  unoServoMove.setFieldValue('9', 'PIN');
  connectValue(unoServoMove, 'ANGULO', unoHardware.newBlock('numero_fixo'));
  const unoBuzzer = unoHardware.newBlock('buzzer_tocar_tempo');
  unoBuzzer.setFieldValue('6', 'PIN');
  connectChain(unoHardwareRoots.loop, 'DO', [
    unoMove,
    unoDistance,
    unoServoMove,
    unoBuzzer,
  ]);
  fixtures['uno-hardware'] = finishFixture('uno-hardware', unoHardware, 'uno');

  // Fase 1 da auditoria de blocos: variável de texto, comparar/concatenar/
  // medir/conter texto, conversão número<->texto, leitura de Serial e
  // detecção de borda — tudo isolado no AVR (avr-gcc é mais estrito que o
  // toolchain do ESP32 para overloads de String, então é o teste mais forte).
  syncBoardPins('uno');
  const unoTexto = new Blockly.Workspace();
  const unoTextoRoots = makeRoots(unoTexto);

  const comandoDecl = unoTexto.newBlock('declarar_variavel_global');
  comandoDecl.setFieldValue('string', 'TIPO');
  comandoDecl.setFieldValue('comando', 'NOME');
  connectValue(comandoDecl, 'VALOR', unoTexto.newBlock('texto_fixo'));

  const ledPin = unoTexto.newBlock('configurar_pino');
  ledPin.setFieldValue('13', 'PIN');
  ledPin.setFieldValue('OUTPUT', 'MODE');
  const buttonPin = unoTexto.newBlock('configurar_pino');
  buttonPin.setFieldValue('2', 'PIN');
  buttonPin.setFieldValue('INPUT_PULLUP', 'MODE');
  connectChain(unoTextoRoots.setup, 'DO', [ledPin, buttonPin]);

  const serialCheck = unoTexto.newBlock('se_entao');
  connectValue(serialCheck, 'CONDICAO', unoTexto.newBlock('serial_disponivel'));
  const comandoAssign = unoTexto.newBlock('atribuir_variavel');
  comandoAssign.setFieldValue('comando', 'NOME');
  connectValue(comandoAssign, 'VALOR', unoTexto.newBlock('serial_ler_texto'));
  connectStatement(serialCheck, 'ENTAO', comandoAssign);

  const comandoIsLigar = unoTexto.newBlock('se_entao');
  const comparar = unoTexto.newBlock('comparar_texto');
  comparar.setFieldValue('==', 'OP');
  const comandoReadForCompare = unoTexto.newBlock('ler_variavel');
  comandoReadForCompare.setFieldValue('comando', 'NOME');
  connectValue(comparar, 'A', comandoReadForCompare);
  const ligarTexto = unoTexto.newBlock('texto_fixo');
  ligarTexto.setFieldValue('ligar', 'TEXT');
  connectValue(comparar, 'B', ligarTexto);
  connectValue(comandoIsLigar, 'CONDICAO', comparar);
  const acender = unoTexto.newBlock('escrever_pino');
  acender.setFieldValue('13', 'PIN');
  acender.setFieldValue('HIGH', 'STATE');
  connectStatement(comandoIsLigar, 'ENTAO', acender);

  const mensagem = unoTexto.newBlock('escrever_serial_valor');
  const concat = unoTexto.newBlock('concatenar_texto');
  const prefixText = unoTexto.newBlock('texto_fixo');
  prefixText.setFieldValue('Comando: ', 'TEXT');
  connectValue(concat, 'A', prefixText);
  const comandoReadForConcat = unoTexto.newBlock('ler_variavel');
  comandoReadForConcat.setFieldValue('comando', 'NOME');
  connectValue(concat, 'B', comandoReadForConcat);
  connectValue(mensagem, 'VALOR', concat);

  const tamanhoMsg = unoTexto.newBlock('escrever_serial_valor');
  const tamanho = unoTexto.newBlock('comprimento_texto');
  const comandoReadForLength = unoTexto.newBlock('ler_variavel');
  comandoReadForLength.setFieldValue('comando', 'NOME');
  connectValue(tamanho, 'VALOR', comandoReadForLength);
  connectValue(tamanhoMsg, 'VALOR', tamanho);

  const contemMsg = unoTexto.newBlock('escrever_serial_valor');
  const contem = unoTexto.newBlock('texto_contem');
  const comandoReadForContains = unoTexto.newBlock('ler_variavel');
  comandoReadForContains.setFieldValue('comando', 'NOME');
  connectValue(contem, 'A', comandoReadForContains);
  const ligarSub = unoTexto.newBlock('texto_fixo');
  ligarSub.setFieldValue('lig', 'TEXT');
  connectValue(contem, 'B', ligarSub);
  connectValue(contemMsg, 'VALOR', contem);

  const numeroMsg = unoTexto.newBlock('escrever_serial_valor');
  const numero = unoTexto.newBlock('texto_para_numero');
  const textoNumero = unoTexto.newBlock('texto_fixo');
  textoNumero.setFieldValue('42', 'TEXT');
  connectValue(numero, 'VALOR', textoNumero);
  connectValue(numeroMsg, 'VALOR', numero);

  const textoMsg = unoTexto.newBlock('escrever_serial_valor');
  const textoConvertido = unoTexto.newBlock('numero_para_texto');
  const numeroFixo42 = unoTexto.newBlock('numero_fixo');
  numeroFixo42.setFieldValue(42, 'VALOR');
  connectValue(textoConvertido, 'VALOR', numeroFixo42);
  connectValue(textoMsg, 'VALOR', textoConvertido);

  const edgeCheck = unoTexto.newBlock('se_entao');
  const edge = unoTexto.newBlock('mudou_para_verdadeiro');
  const notRead = unoTexto.newBlock('nao_logico');
  const digitalReadButton = unoTexto.newBlock('ler_pino_digital');
  digitalReadButton.setFieldValue('2', 'PIN');
  connectValue(notRead, 'VALOR', digitalReadButton);
  connectValue(edge, 'VALOR', notRead);
  connectValue(edgeCheck, 'CONDICAO', edge);
  const edgeMsg = unoTexto.newBlock('escrever_serial');
  edgeMsg.setFieldValue('Clique!', 'TEXT');
  connectStatement(edgeCheck, 'ENTAO', edgeMsg);

  connectChain(unoTextoRoots.loop, 'DO', [
    serialCheck,
    comandoIsLigar,
    mensagem,
    tamanhoMsg,
    contemMsg,
    numeroMsg,
    textoMsg,
    edgeCheck,
  ]);
  fixtures['uno-texto-serial'] = finishFixture('uno-texto-serial', unoTexto, 'uno');

  // Fase 2 da auditoria de blocos: Display LCD (protocolo HD44780 4 bits à
  // mão sobre Wire.h) e sensor DHT11/DHT22 (protocolo de 1 fio à mão sobre
  // pulseIn()) juntos no AVR — o toolchain mais estrito para os dois
  // helpers escritos na mão nesta fase.
  syncBoardPins('uno');
  const unoLcdDht = new Blockly.Workspace();
  const unoLcdDhtRoots = makeRoots(unoLcdDht);

  const lcdInit = unoLcdDht.newBlock('lcd_iniciar');
  lcdInit.setFieldValue('A4', 'SDA');
  lcdInit.setFieldValue('A5', 'SCL');
  lcdInit.setFieldValue('0x27', 'ADDR');
  lcdInit.setFieldValue(16, 'COLUNAS');
  lcdInit.setFieldValue(2, 'LINHAS');
  const dhtInit = unoLcdDht.newBlock('dht_iniciar');
  dhtInit.setFieldValue('2', 'PIN');
  dhtInit.setFieldValue('DHT22', 'TIPO');
  connectChain(unoLcdDhtRoots.setup, 'DO', [lcdInit, dhtInit]);

  const lcdClear = unoLcdDht.newBlock('lcd_limpar');
  const lcdCursorTemp = unoLcdDht.newBlock('lcd_posicionar_cursor');
  const colTemp = unoLcdDht.newBlock('numero_fixo');
  colTemp.setFieldValue(0, 'VALOR');
  const rowTemp = unoLcdDht.newBlock('numero_fixo');
  rowTemp.setFieldValue(0, 'VALOR');
  connectValue(lcdCursorTemp, 'COLUNA', colTemp);
  connectValue(lcdCursorTemp, 'LINHA', rowTemp);
  const lcdLabelTemp = unoLcdDht.newBlock('lcd_escrever_texto');
  lcdLabelTemp.setFieldValue('T:', 'TEXT');
  const lcdValueTemp = unoLcdDht.newBlock('lcd_escrever_valor');
  connectValue(lcdValueTemp, 'VALOR', unoLcdDht.newBlock('dht_ler_temperatura'));
  const lcdCursorUmid = unoLcdDht.newBlock('lcd_posicionar_cursor');
  const colUmid = unoLcdDht.newBlock('numero_fixo');
  colUmid.setFieldValue(0, 'VALOR');
  const rowUmid = unoLcdDht.newBlock('numero_fixo');
  rowUmid.setFieldValue(1, 'VALOR');
  connectValue(lcdCursorUmid, 'COLUNA', colUmid);
  connectValue(lcdCursorUmid, 'LINHA', rowUmid);
  const lcdLabelUmid = unoLcdDht.newBlock('lcd_escrever_texto');
  lcdLabelUmid.setFieldValue('U:', 'TEXT');
  const lcdValueUmid = unoLcdDht.newBlock('lcd_escrever_valor');
  connectValue(lcdValueUmid, 'VALOR', unoLcdDht.newBlock('dht_ler_umidade'));

  connectChain(unoLcdDhtRoots.loop, 'DO', [
    lcdClear,
    lcdCursorTemp,
    lcdLabelTemp,
    lcdValueTemp,
    lcdCursorUmid,
    lcdLabelUmid,
    lcdValueUmid,
    unoLcdDht.newBlock('esperar'),
  ]);
  fixtures['uno-lcd-dht'] = finishFixture('uno-lcd-dht', unoLcdDht, 'uno');

  // Fase 3 da auditoria de blocos: LED endereçável (única família que
  // depende de biblioteca externa, Adafruit_NeoPixel — protocolo com
  // timing nanossegundo, inviável de reimplementar à mão) e receptor
  // infravermelho (protocolo NEC à mão sobre pulseIn, mesmo espírito do
  // DHT) juntos no AVR, o toolchain mais estrito para os dois.
  syncBoardPins('uno');
  const unoLedIr = new Blockly.Workspace();
  const unoLedIrRoots = makeRoots(unoLedIr);

  const irInit = unoLedIr.newBlock('ir_iniciar');
  irInit.setFieldValue('2', 'PIN');
  const neopixelInit = unoLedIr.newBlock('neopixel_iniciar');
  neopixelInit.setFieldValue('6', 'PIN');
  neopixelInit.setFieldValue(8, 'QUANTIDADE');
  connectChain(unoLedIrRoots.setup, 'DO', [irInit, neopixelInit]);

  const outerCheck = unoLedIr.newBlock('se_entao');
  connectValue(outerCheck, 'CONDICAO', unoLedIr.newBlock('ir_disponivel'));

  const innerCheck = unoLedIr.newBlock('se_entao_senao');
  const compareCode = unoLedIr.newBlock('comparar_valores');
  compareCode.setFieldValue('==', 'OP');
  connectValue(compareCode, 'A', unoLedIr.newBlock('ir_ler_codigo'));
  const codeLiteral = unoLedIr.newBlock('numero_fixo');
  codeLiteral.setFieldValue(16724175, 'VALOR');
  connectValue(compareCode, 'B', codeLiteral);
  connectValue(innerCheck, 'CONDICAO', compareCode);

  const setRed = unoLedIr.newBlock('neopixel_definir_cor');
  const redIndice = unoLedIr.newBlock('numero_fixo');
  redIndice.setFieldValue(0, 'VALOR');
  const redR = unoLedIr.newBlock('numero_fixo');
  redR.setFieldValue(255, 'VALOR');
  const redG = unoLedIr.newBlock('numero_fixo');
  redG.setFieldValue(0, 'VALOR');
  const redB = unoLedIr.newBlock('numero_fixo');
  redB.setFieldValue(0, 'VALOR');
  connectValue(setRed, 'INDICE', redIndice);
  connectValue(setRed, 'R', redR);
  connectValue(setRed, 'G', redG);
  connectValue(setRed, 'B', redB);
  connectChain(innerCheck, 'ENTAO', [setRed, unoLedIr.newBlock('neopixel_mostrar')]);

  const setBlue = unoLedIr.newBlock('neopixel_definir_cor');
  const blueIndice = unoLedIr.newBlock('numero_fixo');
  blueIndice.setFieldValue(0, 'VALOR');
  const blueR = unoLedIr.newBlock('numero_fixo');
  blueR.setFieldValue(0, 'VALOR');
  const blueG = unoLedIr.newBlock('numero_fixo');
  blueG.setFieldValue(0, 'VALOR');
  const blueB = unoLedIr.newBlock('numero_fixo');
  blueB.setFieldValue(255, 'VALOR');
  connectValue(setBlue, 'INDICE', blueIndice);
  connectValue(setBlue, 'R', blueR);
  connectValue(setBlue, 'G', blueG);
  connectValue(setBlue, 'B', blueB);
  connectChain(innerCheck, 'SENAO', [setBlue, unoLedIr.newBlock('neopixel_mostrar')]);

  connectStatement(outerCheck, 'ENTAO', innerCheck);
  connectChain(unoLedIrRoots.loop, 'DO', [unoLedIr.newBlock('neopixel_limpar'), outerCheck]);
  fixtures['uno-led-ir'] = finishFixture('uno-led-ir', unoLedIr, 'uno');

  // Fase 4 da auditoria de blocos: listas de tamanho fixo (índice sempre
  // protegido via sizeof) e armazenamento permanente (tabela de chaves do
  // EEPROM) juntos no AVR, o toolchain mais estrito para os dois.
  syncBoardPins('uno');
  const unoListasArmazenamento = new Blockly.Workspace();
  const unoListasRoots = makeRoots(unoListasArmazenamento);

  const listaDecl = unoListasArmazenamento.newBlock('declarar_lista_global');
  listaDecl.setFieldValue('float', 'TIPO');
  listaDecl.setFieldValue('leituras', 'NOME');
  listaDecl.setFieldValue(5, 'TAMANHO');
  const indiceDecl = unoListasArmazenamento.newBlock('declarar_variavel_global');
  indiceDecl.setFieldValue('int', 'TIPO');
  indiceDecl.setFieldValue('indice', 'NOME');
  const indiceInicial = unoListasArmazenamento.newBlock('numero_fixo');
  indiceInicial.setFieldValue(0, 'VALOR');
  connectValue(indiceDecl, 'VALOR', indiceInicial);

  const readPin = unoListasArmazenamento.newBlock('configurar_pino');
  readPin.setFieldValue('A0', 'PIN');
  readPin.setFieldValue('INPUT', 'MODE');
  connectStatement(unoListasRoots.setup, 'DO', readPin);

  const fillCheck = unoListasArmazenamento.newBlock('se_entao_senao');
  const compareIdx = unoListasArmazenamento.newBlock('comparar_valores');
  compareIdx.setFieldValue('<', 'OP');
  const idxReadForCompare = unoListasArmazenamento.newBlock('ler_variavel');
  idxReadForCompare.setFieldValue('indice', 'NOME');
  connectValue(compareIdx, 'A', idxReadForCompare);
  const tamanhoBlock = unoListasArmazenamento.newBlock('lista_tamanho');
  tamanhoBlock.setFieldValue('leituras', 'NOME');
  connectValue(compareIdx, 'B', tamanhoBlock);
  connectValue(fillCheck, 'CONDICAO', compareIdx);

  const setItem = unoListasArmazenamento.newBlock('lista_definir_item');
  setItem.setFieldValue('leituras', 'NOME');
  const idxReadForSet = unoListasArmazenamento.newBlock('ler_variavel');
  idxReadForSet.setFieldValue('indice', 'NOME');
  connectValue(setItem, 'INDICE', idxReadForSet);
  connectValue(setItem, 'VALOR', unoListasArmazenamento.newBlock('ler_pino_analogico'));
  const incIdx = unoListasArmazenamento.newBlock('incrementar_variavel');
  incIdx.setFieldValue('indice', 'NOME');
  const incAmount = unoListasArmazenamento.newBlock('numero_fixo');
  incAmount.setFieldValue(1, 'VALOR');
  connectValue(incIdx, 'VALOR', incAmount);
  connectChain(fillCheck, 'ENTAO', [setItem, incIdx]);

  const readFirst = unoListasArmazenamento.newBlock('escrever_serial_valor');
  const listReadFirst = unoListasArmazenamento.newBlock('lista_ler_item');
  listReadFirst.setFieldValue('leituras', 'NOME');
  const indiceZeroForRead = unoListasArmazenamento.newBlock('numero_fixo');
  indiceZeroForRead.setFieldValue(0, 'VALOR');
  connectValue(listReadFirst, 'INDICE', indiceZeroForRead);
  connectValue(readFirst, 'VALOR', listReadFirst);

  const saveCheck = unoListasArmazenamento.newBlock('se_entao');
  const compareSave = unoListasArmazenamento.newBlock('comparar_valores');
  compareSave.setFieldValue('>', 'OP');
  const listReadForCompare = unoListasArmazenamento.newBlock('lista_ler_item');
  listReadForCompare.setFieldValue('leituras', 'NOME');
  const indiceZeroForCompare = unoListasArmazenamento.newBlock('numero_fixo');
  indiceZeroForCompare.setFieldValue(0, 'VALOR');
  connectValue(listReadForCompare, 'INDICE', indiceZeroForCompare);
  connectValue(compareSave, 'A', listReadForCompare);
  const armLer = unoListasArmazenamento.newBlock('armazenamento_ler');
  armLer.setFieldValue('recorde', 'CHAVE');
  const padraoLer = unoListasArmazenamento.newBlock('numero_fixo');
  padraoLer.setFieldValue(0, 'VALOR');
  connectValue(armLer, 'PADRAO', padraoLer);
  connectValue(compareSave, 'B', armLer);
  connectValue(saveCheck, 'CONDICAO', compareSave);

  const armSalvar = unoListasArmazenamento.newBlock('armazenamento_salvar');
  armSalvar.setFieldValue('recorde', 'CHAVE');
  const listReadForSave = unoListasArmazenamento.newBlock('lista_ler_item');
  listReadForSave.setFieldValue('leituras', 'NOME');
  const indiceZeroForSave = unoListasArmazenamento.newBlock('numero_fixo');
  indiceZeroForSave.setFieldValue(0, 'VALOR');
  connectValue(listReadForSave, 'INDICE', indiceZeroForSave);
  connectValue(armSalvar, 'VALOR', listReadForSave);
  connectStatement(saveCheck, 'ENTAO', armSalvar);

  connectChain(fillCheck, 'SENAO', [readFirst, saveCheck]);
  connectChain(unoListasRoots.loop, 'DO', [fillCheck]);
  fixtures['uno-listas-armazenamento'] = finishFixture('uno-listas-armazenamento', unoListasArmazenamento, 'uno');

  syncBoardPins('nano');
  const nanoIo = new Blockly.Workspace();
  const nanoRoots = makeRoots(nanoIo);
  const nanoPrint = nanoIo.newBlock('escrever_serial_valor');
  const nanoAnalogRead = nanoIo.newBlock('ler_pino_analogico');
  nanoAnalogRead.setFieldValue('A7', 'PIN');
  connectValue(nanoPrint, 'VALOR', nanoAnalogRead);
  const nanoPwm = nanoIo.newBlock('escrever_pino_pwm');
  nanoPwm.setFieldValue('3', 'PIN');
  const nanoPwmValue = nanoIo.newBlock('numero_fixo');
  nanoPwmValue.setFieldValue(128, 'VALOR');
  connectValue(nanoPwm, 'VALOR', nanoPwmValue);
  connectChain(nanoRoots.loop, 'DO', [nanoPrint, nanoPwm]);
  fixtures['nano-io'] = finishFixture('nano-io', nanoIo, 'nano');

  syncBoardPins('esp32');
  const esp32Io = new Blockly.Workspace();
  const esp32IoRoots = makeRoots(esp32Io);
  const espServoConfig = esp32Io.newBlock('servo_configurar');
  espServoConfig.setFieldValue('13', 'PIN');
  connectStatement(esp32IoRoots.setup, 'DO', espServoConfig);
  const espLed = esp32Io.newBlock('escrever_pino_booleano');
  espLed.setFieldValue('2', 'PIN');
  connectValue(espLed, 'STATE', esp32Io.newBlock('valor_booleano_fixo'));
  const espPwm = esp32Io.newBlock('escrever_pino_pwm');
  espPwm.setFieldValue('4', 'PIN');
  const espMap = esp32Io.newBlock('mapear_valor');
  espMap.setFieldValue(4095, 'DE_MAX');
  const espAnalogRead = esp32Io.newBlock('ler_pino_analogico');
  espAnalogRead.setFieldValue('32', 'PIN');
  connectValue(espMap, 'VALOR', espAnalogRead);
  connectValue(espPwm, 'VALOR', espMap);
  const espServoMove = esp32Io.newBlock('servo_mover');
  espServoMove.setFieldValue('13', 'PIN');
  const espServoAngle = esp32Io.newBlock('minimo_maximo');
  connectValue(espServoAngle, 'A', esp32Io.newBlock('numero_fixo'));
  connectValue(espServoAngle, 'B', esp32Io.newBlock('numero_fixo'));
  connectValue(espServoMove, 'ANGULO', espServoAngle);
  connectChain(esp32IoRoots.loop, 'DO', [espLed, espPwm, espServoMove]);
  fixtures['esp32-io'] = finishFixture('esp32-io', esp32Io, 'esp32');

  syncBoardPins('esp32');
  const esp32Transmitter = new Blockly.Workspace();
  const transmitterRoots = makeRoots(esp32Transmitter);
  connectChain(transmitterRoots.setup, 'DO', [
    esp32Transmitter.newBlock('espnow_iniciar_wifi'),
    esp32Transmitter.newBlock('espnow_transmissor_init'),
    esp32Transmitter.newBlock('espnow_adicionar_receptor'),
    esp32Transmitter.newBlock('mpu_iniciar'),
  ]);
  const send = esp32Transmitter.newBlock('espnow_enviar_pacote');
  connectValue(send, 'PITCH', esp32Transmitter.newBlock('mpu_ler_pitch'));
  connectValue(send, 'ROLL', esp32Transmitter.newBlock('mpu_ler_roll'));
  connectValue(send, 'PARAR', esp32Transmitter.newBlock('valor_booleano_fixo'));
  connectStatement(transmitterRoots.loop, 'DO', send);
  fixtures['esp32-transmitter'] = finishFixture(
    'esp32-transmitter',
    esp32Transmitter,
    'esp32',
  );

  syncBoardPins('esp32');
  const esp32Receiver = new Blockly.Workspace();
  const receiverRoots = makeRoots(esp32Receiver);
  const espMotorConfig = esp32Receiver.newBlock('l298n_configurar_simples');
  for (const [field, pin] of Object.entries({
    ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14',
  })) {
    espMotorConfig.setFieldValue(pin, field);
  }
  connectChain(receiverRoots.setup, 'DO', [
    esp32Receiver.newBlock('espnow_iniciar_wifi'),
    esp32Receiver.newBlock('espnow_receptor_init'),
    espMotorConfig,
  ]);
  const hasData = esp32Receiver.newBlock('se_entao');
  connectValue(hasData, 'CONDICAO', esp32Receiver.newBlock('espnow_tem_dados_novos'));
  const markRead = esp32Receiver.newBlock('espnow_marcar_lido');
  const tiltMotor = esp32Receiver.newBlock('l298n_velocidade_por_pitch_roll');
  connectValue(tiltMotor, 'PITCH', esp32Receiver.newBlock('espnow_ler_pitch'));
  connectValue(tiltMotor, 'ROLL', esp32Receiver.newBlock('espnow_ler_roll'));
  connectChain(hasData, 'ENTAO', [markRead, tiltMotor]);
  connectStatement(receiverRoots.loop, 'DO', hasData);
  fixtures['esp32-receiver'] = finishFixture(
    'esp32-receiver',
    esp32Receiver,
    'esp32',
  );

  // ── Composição SEM bloco monolítico ──────────────────────────────────────
  // Mesmo cenário funcional de esp32-transmitter/esp32-receiver acima (MPU6050
  // → lógica → ESP-NOW → motor, com fail-safe), mas montado só com blocos
  // genéricos: a direção vem de um SE...SENÃO comum (não de um bloco
  // "controlar robô por inclinação"), e o transporte é a mensagem
  // tipo/A/B/C/sinal, que serve para qualquer projeto, não só este.
  syncBoardPins('esp32');
  const esp32GenericTransmitter = new Blockly.Workspace();
  const genericTxRoots = makeRoots(esp32GenericTransmitter);
  connectChain(genericTxRoots.setup, 'DO', [
    esp32GenericTransmitter.newBlock('espnow_iniciar_wifi'),
    esp32GenericTransmitter.newBlock('espnow_transmissor_init'),
    esp32GenericTransmitter.newBlock('espnow_adicionar_receptor'),
    esp32GenericTransmitter.newBlock('mpu_iniciar'),
  ]);
  const genericTxDecision = esp32GenericTransmitter.newBlock('se_entao_senao');
  const genericTxCompare = esp32GenericTransmitter.newBlock('comparar_valores');
  genericTxCompare.setFieldValue('>', 'OP');
  connectValue(genericTxCompare, 'A', esp32GenericTransmitter.newBlock('mpu_ler_pitch'));
  const genericTxThreshold = esp32GenericTransmitter.newBlock('numero_fixo');
  genericTxThreshold.setFieldValue(15, 'VALOR');
  connectValue(genericTxCompare, 'B', genericTxThreshold);
  connectValue(genericTxDecision, 'CONDICAO', genericTxCompare);
  const genericTxSendForward = esp32GenericTransmitter.newBlock('espnow_enviar_mensagem');
  genericTxSendForward.setFieldValue(1, 'TIPO');
  connectValue(genericTxSendForward, 'A', esp32GenericTransmitter.newBlock('mpu_ler_pitch'));
  connectValue(genericTxSendForward, 'B', esp32GenericTransmitter.newBlock('mpu_ler_roll'));
  connectValue(genericTxSendForward, 'C', esp32GenericTransmitter.newBlock('numero_fixo'));
  connectValue(genericTxSendForward, 'SINAL', esp32GenericTransmitter.newBlock('valor_booleano_fixo'));
  connectStatement(genericTxDecision, 'ENTAO', genericTxSendForward);
  const genericTxSendStop = esp32GenericTransmitter.newBlock('espnow_enviar_mensagem');
  connectValue(genericTxSendStop, 'A', esp32GenericTransmitter.newBlock('mpu_ler_pitch'));
  connectValue(genericTxSendStop, 'B', esp32GenericTransmitter.newBlock('mpu_ler_roll'));
  connectValue(genericTxSendStop, 'C', esp32GenericTransmitter.newBlock('numero_fixo'));
  connectValue(genericTxSendStop, 'SINAL', esp32GenericTransmitter.newBlock('valor_booleano_fixo'));
  connectStatement(genericTxDecision, 'SENAO', genericTxSendStop);
  const genericTxStatus = esp32GenericTransmitter.newBlock('escrever_serial_valor');
  connectValue(genericTxStatus, 'VALOR', esp32GenericTransmitter.newBlock('espnow_envio_confirmado'));
  connectChain(genericTxRoots.loop, 'DO', [genericTxDecision, genericTxStatus]);
  fixtures['esp32-generic-transmitter'] = finishFixture(
    'esp32-generic-transmitter',
    esp32GenericTransmitter,
    'esp32',
  );

  syncBoardPins('esp32');
  const esp32GenericReceiver = new Blockly.Workspace();
  const genericRxRoots = makeRoots(esp32GenericReceiver);
  const genericRxMotorConfig = esp32GenericReceiver.newBlock('l298n_configurar_simples');
  for (const [field, pin] of Object.entries({
    ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14',
  })) {
    genericRxMotorConfig.setFieldValue(pin, field);
  }
  connectChain(genericRxRoots.setup, 'DO', [
    esp32GenericReceiver.newBlock('espnow_iniciar_wifi'),
    esp32GenericReceiver.newBlock('espnow_receptor_init'),
    genericRxMotorConfig,
  ]);
  const genericRxHasData = esp32GenericReceiver.newBlock('se_entao');
  connectValue(genericRxHasData, 'CONDICAO', esp32GenericReceiver.newBlock('espnow_tem_dados_novos'));
  const genericRxDispatch = esp32GenericReceiver.newBlock('se_entao_senao');
  const genericRxTypeCompare = esp32GenericReceiver.newBlock('comparar_valores');
  genericRxTypeCompare.setFieldValue('==', 'OP');
  connectValue(genericRxTypeCompare, 'A', esp32GenericReceiver.newBlock('espnow_mensagem_tipo'));
  const genericRxTypeValue = esp32GenericReceiver.newBlock('numero_fixo');
  genericRxTypeValue.setFieldValue(1, 'VALOR');
  connectValue(genericRxTypeCompare, 'B', genericRxTypeValue);
  connectValue(genericRxDispatch, 'CONDICAO', genericRxTypeCompare);
  const genericRxMoveForward = esp32GenericReceiver.newBlock('l298n_mover_robo');
  genericRxMoveForward.setFieldValue('FRENTE', 'DIRECAO');
  const genericRxForce = esp32GenericReceiver.newBlock('numero_fixo');
  genericRxForce.setFieldValue(180, 'VALOR');
  connectValue(genericRxMoveForward, 'FORCA', genericRxForce);
  connectStatement(genericRxDispatch, 'ENTAO', genericRxMoveForward);
  connectStatement(genericRxDispatch, 'SENAO', esp32GenericReceiver.newBlock('l298n_parar'));
  connectChain(genericRxHasData, 'ENTAO', [
    esp32GenericReceiver.newBlock('espnow_marcar_lido'),
    genericRxDispatch,
  ]);
  const genericRxTimeoutCheck = esp32GenericReceiver.newBlock('se_entao');
  const genericRxTimeout = esp32GenericReceiver.newBlock('espnow_timeout_ms');
  genericRxTimeout.setFieldValue(800, 'MS');
  connectValue(genericRxTimeoutCheck, 'CONDICAO', genericRxTimeout);
  connectStatement(genericRxTimeoutCheck, 'ENTAO', esp32GenericReceiver.newBlock('l298n_parar'));
  connectChain(genericRxRoots.loop, 'DO', [genericRxHasData, genericRxTimeoutCheck]);
  fixtures['esp32-generic-receiver'] = finishFixture(
    'esp32-generic-receiver',
    esp32GenericReceiver,
    'esp32',
  );

  // ── Wi-Fi (rede comum) ────────────────────────────────────────────────────
  syncBoardPins('esp32');
  const esp32Wifi = new Blockly.Workspace();
  const wifiRoots = makeRoots(esp32Wifi);
  connectStatement(wifiRoots.setup, 'DO', esp32Wifi.newBlock('wifi_conectar'));
  const wifiStatus = esp32Wifi.newBlock('se_entao_senao');
  connectValue(wifiStatus, 'CONDICAO', esp32Wifi.newBlock('wifi_esta_conectado'));
  const wifiPrintIp = esp32Wifi.newBlock('escrever_serial_valor');
  connectValue(wifiPrintIp, 'VALOR', esp32Wifi.newBlock('wifi_endereco_ip'));
  connectStatement(wifiStatus, 'ENTAO', wifiPrintIp);
  const wifiPrintDown = esp32Wifi.newBlock('escrever_serial');
  wifiPrintDown.setFieldValue('Sem Wi-Fi', 'TEXT');
  connectStatement(wifiStatus, 'SENAO', wifiPrintDown);
  connectStatement(wifiRoots.loop, 'DO', wifiStatus);
  fixtures['esp32-wifi'] = finishFixture('esp32-wifi', esp32Wifi, 'esp32');

  // ── Wi-Fi: cliente HTTP — compõe com concatenar_texto (Fase 1) para
  // montar a URL a partir de uma leitura de sensor.
  syncBoardPins('esp32');
  const esp32Http = new Blockly.Workspace();
  const httpRoots = makeRoots(esp32Http);
  connectStatement(httpRoots.setup, 'DO', esp32Http.newBlock('wifi_conectar'));

  const httpGet = esp32Http.newBlock('wifi_http_get');
  const urlConcat = esp32Http.newBlock('concatenar_texto');
  const urlPrefix = esp32Http.newBlock('texto_fixo');
  urlPrefix.setFieldValue('http://exemplo.com/sensor?valor=', 'TEXT');
  const sensorRead = esp32Http.newBlock('ler_pino_analogico');
  sensorRead.setFieldValue('34', 'PIN');
  connectValue(urlConcat, 'A', urlPrefix);
  connectValue(urlConcat, 'B', sensorRead);
  connectValue(httpGet, 'URL', urlConcat);

  const httpCheck = esp32Http.newBlock('se_entao');
  connectValue(httpCheck, 'CONDICAO', esp32Http.newBlock('wifi_http_sucesso'));
  const httpPrint = esp32Http.newBlock('escrever_serial_valor');
  connectValue(httpPrint, 'VALOR', esp32Http.newBlock('wifi_http_resposta'));
  connectStatement(httpCheck, 'ENTAO', httpPrint);

  // Armazenamento permanente no ESP32 usa Preferences.h, um caminho de
  // código completamente diferente do EEPROM (ver uno-listas-armazenamento)
  // — reaproveita esta fixture em vez de criar uma nova só para isso.
  const armazenamentoCheck = esp32Http.newBlock('se_entao');
  const compareRecorde = esp32Http.newBlock('comparar_valores');
  compareRecorde.setFieldValue('>', 'OP');
  const sensorReadForRecorde = esp32Http.newBlock('ler_pino_analogico');
  sensorReadForRecorde.setFieldValue('34', 'PIN');
  connectValue(compareRecorde, 'A', sensorReadForRecorde);
  const armLerEsp32 = esp32Http.newBlock('armazenamento_ler');
  armLerEsp32.setFieldValue('recorde', 'CHAVE');
  connectValue(armLerEsp32, 'PADRAO', esp32Http.newBlock('numero_fixo'));
  connectValue(compareRecorde, 'B', armLerEsp32);
  connectValue(armazenamentoCheck, 'CONDICAO', compareRecorde);
  const armSalvarEsp32 = esp32Http.newBlock('armazenamento_salvar');
  armSalvarEsp32.setFieldValue('recorde', 'CHAVE');
  const sensorReadForSalvar = esp32Http.newBlock('ler_pino_analogico');
  sensorReadForSalvar.setFieldValue('34', 'PIN');
  connectValue(armSalvarEsp32, 'VALOR', sensorReadForSalvar);
  connectStatement(armazenamentoCheck, 'ENTAO', armSalvarEsp32);

  connectChain(httpRoots.loop, 'DO', [httpGet, httpCheck, armazenamentoCheck, esp32Http.newBlock('esperar')]);
  fixtures['esp32-http'] = finishFixture('esp32-http', esp32Http, 'esp32');

  // ── Bluetooth clássico ────────────────────────────────────────────────────
  // Sozinho (sem Wi-Fi/ESP-NOW no mesmo sketch): o stack Bluetooth clássico
  // (Bluedroid) já usa boa parte do espaço de programa padrão da placa —
  // combiná-lo com Wi-Fi/ESP-NOW pode ultrapassar o espaço disponível
  // dependendo do restante do projeto. Ver docs/blockly-system.md.
  syncBoardPins('esp32');
  const esp32Bluetooth = new Blockly.Workspace();
  const btRoots = makeRoots(esp32Bluetooth);
  connectStatement(btRoots.setup, 'DO', esp32Bluetooth.newBlock('bt_iniciar'));
  const btEcho = esp32Bluetooth.newBlock('se_entao');
  connectValue(btEcho, 'CONDICAO', esp32Bluetooth.newBlock('bt_disponivel'));
  const btSend = esp32Bluetooth.newBlock('bt_enviar_texto');
  connectValue(btSend, 'TEXTO', esp32Bluetooth.newBlock('bt_ler_texto'));
  connectStatement(btEcho, 'ENTAO', btSend);
  connectStatement(btRoots.loop, 'DO', btEcho);
  fixtures['esp32-bluetooth'] = finishFixture('esp32-bluetooth', esp32Bluetooth, 'esp32');

  return fixtures;
}
