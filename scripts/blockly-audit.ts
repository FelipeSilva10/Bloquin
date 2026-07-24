import * as Blockly from 'blockly/core';
import { initBlocks, syncBoardPins } from '../src/blockly/blocks';
import { cppGenerator, generateCode, initGenerators } from '../src/blockly/generators';
import { BOARDS, type BoardKey } from '../src/blockly/boards';
import { auditSerializedWorkspace, auditWorkspace } from '../src/blockly/audit';
import { BLOCK_NAMES, getToolboxConfig, toolboxConfig } from '../src/blockly/toolbox';

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
  assert(customTypes.length === 69, `Esperava 69 blocos; encontrei ${customTypes.length}.`);

  const toolboxTypes = toolboxBlockTypes();
  assert(new Set(toolboxTypes).size === 67, 'A toolbox deve expor 67 blocos sem duplicatas.');
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
    !avrToolboxJson.includes('"type":"espnow_'),
    'A toolbox AVR não pode criar blocos ESP-NOW, nem dentro de presets.',
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

  testIsolatedDependency('esp32', 'espnow_mac_serial', '#include <WiFi.h>');
  testIsolatedDependency('esp32', 'espnow_tem_dados_novos', '_bloquin_OnDataRecv', true);
  testIsolatedDependency('esp32', 'espnow_ler_pitch', '_bloquin_lerEspnowPitch()', true);
  testIsolatedDependency('esp32', 'espnow_ler_roll', '_bloquin_obterSnapshotEspnow()', true);
  testIsolatedDependency('esp32', 'espnow_timeout_ms', '_bloquin_espnowTimeout', true);
  testIsolatedDependency('uno', 'mpu_iniciar', '#include <Wire.h>');
  testIsolatedDependency('esp32', 'l298n_velocidade_por_pitch_roll', '_bloquin_aplicarControle');
  testIsolatedDependency('uno', 'servo_configurar', '#include <Servo.h>');
  testIsolatedDependency('esp32', 'servo_configurar', '#include <ESP32Servo.h>');

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

  console.log('Auditoria Blockly: 69/69 blocos, 3 placas, presets e geradores críticos validados.');
}

export function createCompilationFixtures(): Record<'uno' | 'nano' | 'esp32', string> {
  const fixtures = {} as Record<'uno' | 'nano' | 'esp32', string>;

  syncBoardPins('uno');
  const uno = new Blockly.Workspace();
  const unoRoots = makeRoots(uno);
  const unoUltrasonic = uno.newBlock('configurar_ultrassonico');
  unoUltrasonic.setFieldValue('12', 'TRIG');
  unoUltrasonic.setFieldValue('13', 'ECHO');
  const unoMotorConfig = uno.newBlock('l298n_configurar_simples');
  for (const [field, pin] of Object.entries({
    ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8',
  })) {
    unoMotorConfig.setFieldValue(pin, field);
  }
  const unoServoConfig = uno.newBlock('servo_configurar');
  unoServoConfig.setFieldValue('9', 'PIN');
  connectChain(unoRoots.setup, 'DO', [
    unoUltrasonic,
    uno.newBlock('mpu_iniciar'),
    unoMotorConfig,
    unoServoConfig,
  ]);
  const unoMove = uno.newBlock('l298n_mover_robo');
  const unoPower = uno.newBlock('numero_fixo');
  unoPower.setFieldValue(180, 'VALOR');
  connectValue(unoMove, 'FORCA', unoPower);
  const unoDistance = uno.newBlock('mostrar_distancia');
  unoDistance.setFieldValue('12', 'TRIG');
  unoDistance.setFieldValue('13', 'ECHO');
  const unoServoMove = uno.newBlock('servo_mover');
  unoServoMove.setFieldValue('9', 'PIN');
  connectValue(unoServoMove, 'ANGULO', uno.newBlock('numero_fixo'));
  connectChain(unoRoots.loop, 'DO', [unoMove, unoDistance, unoServoMove]);
  fixtures.uno = generateCode(uno as Blockly.WorkspaceSvg, 'uno');
  uno.dispose();

  syncBoardPins('nano');
  const nano = new Blockly.Workspace();
  const nanoRoots = makeRoots(nano);
  const nanoPrint = nano.newBlock('escrever_serial_valor');
  const nanoAnalogRead = nano.newBlock('ler_pino_analogico');
  nanoAnalogRead.setFieldValue('A7', 'PIN');
  connectValue(nanoPrint, 'VALOR', nanoAnalogRead);
  connectStatement(nanoRoots.loop, 'DO', nanoPrint);
  fixtures.nano = generateCode(nano as Blockly.WorkspaceSvg, 'nano');
  nano.dispose();

  syncBoardPins('esp32');
  const esp32 = new Blockly.Workspace();
  const espRoots = makeRoots(esp32);
  const espMotorConfig = esp32.newBlock('l298n_configurar_simples');
  for (const [field, pin] of Object.entries({
    ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14',
  })) {
    espMotorConfig.setFieldValue(pin, field);
  }
  const espServoConfig = esp32.newBlock('servo_configurar');
  espServoConfig.setFieldValue('13', 'PIN');
  connectChain(espRoots.setup, 'DO', [
    esp32.newBlock('espnow_iniciar_wifi'),
    esp32.newBlock('espnow_transmissor_init'),
    esp32.newBlock('espnow_adicionar_receptor'),
    esp32.newBlock('espnow_receptor_init'),
    esp32.newBlock('mpu_iniciar'),
    espMotorConfig,
    espServoConfig,
  ]);

  const hasData = esp32.newBlock('se_entao');
  connectValue(hasData, 'CONDICAO', esp32.newBlock('espnow_tem_dados_novos'));
  connectStatement(hasData, 'ENTAO', esp32.newBlock('espnow_marcar_lido'));
  const tiltMotor = esp32.newBlock('l298n_velocidade_por_pitch_roll');
  connectValue(tiltMotor, 'PITCH', esp32.newBlock('espnow_ler_pitch'));
  connectValue(tiltMotor, 'ROLL', esp32.newBlock('espnow_ler_roll'));
  const send = esp32.newBlock('espnow_enviar_pacote');
  connectValue(send, 'PITCH', esp32.newBlock('mpu_ler_pitch'));
  connectValue(send, 'ROLL', esp32.newBlock('mpu_ler_roll'));
  connectValue(send, 'PARAR', esp32.newBlock('valor_booleano_fixo'));
  const espServoMove = esp32.newBlock('servo_mover');
  espServoMove.setFieldValue('13', 'PIN');
  connectValue(espServoMove, 'ANGULO', esp32.newBlock('numero_fixo'));
  connectChain(espRoots.loop, 'DO', [hasData, tiltMotor, send, espServoMove]);
  fixtures.esp32 = generateCode(esp32 as Blockly.WorkspaceSvg, 'esp32');
  esp32.dispose();

  return fixtures;
}
