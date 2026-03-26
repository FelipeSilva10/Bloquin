import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as PtBr from 'blockly/msg/pt-br';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import LZString from 'lz-string';

Blockly.setLocale(PtBr as any);
const cppGenerator = new Blockly.Generator('CPP');

cppGenerator.scrub_ = function (block, code, opt_thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = opt_thisOnly ? '' : cppGenerator.blockToCode(nextBlock);
  return code + nextCode;
};

// ─────────────────────────────────────────────────────────────────────────────
// Definição das placas
// ─────────────────────────────────────────────────────────────────────────────

const BOARDS = {
  uno: {
    name: 'Arduino Uno',
    pins: [
      ['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'],
      ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'],
      ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'],
      ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5'],
    ],
  },
  nano: {
    name: 'Arduino Nano',
    pins: [
      ['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'],
      ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'],
      ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'],
      ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5'],
    ],
  },
  esp32: {
    name: 'ESP32 DevKit V1',
    pins: [
      ['GPIO 0  ⚠️ boot', '0'],   ['GPIO 2  (LED)', '2'],
      ['GPIO 4',          '4'],   ['GPIO 5  ⚠️ boot', '5'],
      ['GPIO 12 ⚠️ boot', '12'],  ['GPIO 13', '13'],
      ['GPIO 14',         '14'],  ['GPIO 15 ⚠️ boot', '15'],
      ['GPIO 16',         '16'],  ['GPIO 17', '17'],
      ['GPIO 18',         '18'],  ['GPIO 19', '19'],
      ['GPIO 21',         '21'],  ['GPIO 22', '22'],
      ['GPIO 23',         '23'],  ['GPIO 25', '25'],
      ['GPIO 26',         '26'],  ['GPIO 27', '27'],
      ['GPIO 32',         '32'],  ['GPIO 33', '33'],
      ['GPIO 34 (leitura)', '34'], ['GPIO 35 (leitura)', '35'],
      ['GPIO 36 (leitura)', '36'], ['GPIO 39 (leitura)', '39'],
    ],
  },
};

type BoardKey = keyof typeof BOARDS;

// ─────────────────────────────────────────────────────────────────────────────
// currentBoardPins — variável de módulo usada pelos callbacks de blocos.
//
// REGRA CRÍTICA: sempre atualize esta variável de forma SÍNCRONA antes de
// qualquer chamada a Blockly.serialization.workspaces.load() ou
// workspace.newBlock(). Nunca confie apenas em setBoard() para isso, pois
// setState é assíncrono e não garante a atualização antes do próximo render.
// ─────────────────────────────────────────────────────────────────────────────
let currentBoardPins = BOARDS.uno.pins;

/** Atualiza currentBoardPins de forma síncrona a partir de uma chave de placa. */
function syncBoardPins(boardKey: BoardKey) {
  currentBoardPins = BOARDS[boardKey]?.pins ?? BOARDS.uno.pins;
}

// ─────────────────────────────────────────────────────────────────────────────
// Definição dos blocos personalizados
// ─────────────────────────────────────────────────────────────────────────────

const customBlocks = [
  // ── Estrutura ──────────────────────────────────────────────────────────────
  {
    type: 'bloco_setup', colour: 290, helpUrl: '',
    message0: 'PREPARAR (Roda 1 vez) %1',
    args0: [{ type: 'input_statement', name: 'DO' }],
    tooltip: 'Código que roda apenas uma vez, na inicialização.',
  },
  {
    type: 'bloco_loop', colour: 260, helpUrl: '',
    message0: 'AGIR (Roda para sempre) %1',
    args0: [{ type: 'input_statement', name: 'DO' }],
    tooltip: 'Código que fica se repetindo enquanto o robô estiver ligado.',
  },

  // ── Pinos digitais ─────────────────────────────────────────────────────────
  {
    type: 'configurar_pino', colour: 230,
    message0: 'Configurar pino %1 como %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins },
      {
        type: 'field_dropdown', name: 'MODE',
        options: [
          ['Saída (Enviar sinal)', 'OUTPUT'],
          ['Entrada (Ler sensor)', 'INPUT'],
          ['Entrada com resistor', 'INPUT_PULLUP'],
        ],
      },
    ],
    previousStatement: null, nextStatement: null,
    tooltip: 'Define se o pino vai enviar ou receber sinal.',
  },
  {
    type: 'escrever_pino', colour: 230,
    message0: 'Colocar pino %1 em estado %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins },
      {
        type: 'field_dropdown', name: 'STATE',
        options: [['Ligado (HIGH)', 'HIGH'], ['Desligado (LOW)', 'LOW']],
      },
    ],
    previousStatement: null, nextStatement: null,
    tooltip: 'Liga ou desliga um pino digital.',
  },
  {
    type: 'ler_pino_digital', colour: 230,
    message0: 'Ler pino digital %1',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }],
    output: null,
    tooltip: 'Lê o estado (HIGH ou LOW) de um pino digital.',
  },

  // ── PWM e analógico ────────────────────────────────────────────────────────
  {
    type: 'escrever_pino_pwm', colour: 230,
    message0: 'Intensidade do pino %1 → %2 (0 a 255)',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins },
      { type: 'input_value', name: 'VALOR' },
    ],
    inputsInline: true,
    previousStatement: null, nextStatement: null,
    tooltip: 'Controla a intensidade via PWM (0 = desligado, 255 = máximo). Use pinos com ~ ou (PWM).',
  },
  {
    type: 'ler_pino_analogico', colour: 230,
    message0: 'Ler sensor analógico no pino %1',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }],
    output: null,
    tooltip: 'Lê um sensor analógico. Retorna valor de 0 a 1023.',
  },

  // ── Controle ───────────────────────────────────────────────────────────────
  {
    type: 'esperar', colour: 120,
    message0: 'Esperar %1 milissegundos',
    args0: [{ type: 'field_number', name: 'TIME', value: 1000, min: 0 }],
    previousStatement: null, nextStatement: null,
    tooltip: '1000 ms = 1 segundo.',
  },
  {
    type: 'repetir_vezes', colour: 120,
    message0: 'Repetir %1 vezes %2 %3',
    args0: [
      { type: 'field_number', name: 'TIMES', value: 5, min: 1 },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DO' },
    ],
    previousStatement: null, nextStatement: null,
  },

  // ── Condições ──────────────────────────────────────────────────────────────
  {
    type: 'se_entao', colour: 210,
    message0: 'SE %1 ENTÃO %2 %3',
    args0: [
      { type: 'input_value', name: 'CONDICAO', check: 'Boolean' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'ENTAO' },
    ],
    previousStatement: null, nextStatement: null,
  },
  {
    type: 'se_entao_senao', colour: 210,
    message0: 'SE %1 ENTÃO %2 %3 SENÃO %4 %5',
    args0: [
      { type: 'input_value', name: 'CONDICAO', check: 'Boolean' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'ENTAO' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'SENAO' },
    ],
    previousStatement: null, nextStatement: null,
  },
  {
    type: 'comparar_valores', colour: 210,
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A' },
      {
        type: 'field_dropdown', name: 'OP',
        options: [
          ['é maior que', '>'], ['é menor que', '<'], ['é igual a', '=='],
          ['é maior ou igual a', '>='], ['é menor ou igual a', '<='], ['é diferente de', '!='],
        ],
      },
      { type: 'input_value', name: 'B' },
    ],
    inputsInline: true, output: 'Boolean',
  },
  {
    type: 'numero_fixo', colour: 210,
    message0: '%1',
    args0: [{ type: 'field_number', name: 'VALOR', value: 10 }],
    output: null,
  },
  {
    type: 'e_ou_logico', colour: 210,
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A', check: 'Boolean' },
      { type: 'field_dropdown', name: 'OP', options: [['E', '&&'], ['OU', '||']] },
      { type: 'input_value', name: 'B', check: 'Boolean' },
    ],
    inputsInline: true, output: 'Boolean',
  },
  {
    type: 'nao_logico', colour: 210,
    message0: 'NÃO %1',
    args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }],
    inputsInline: true, output: 'Boolean',
    tooltip: 'Inverte a condição: NÃO verdadeiro = falso.',
  },
  {
    type: 'mapear_valor', colour: 210,
    message0: 'Converter %1 de %2-%3 para %4-%5',
    args0: [
      { type: 'input_value', name: 'VALOR' },
      { type: 'field_number', name: 'DE_MIN',   value: 0 },
      { type: 'field_number', name: 'DE_MAX',   value: 1023 },
      { type: 'field_number', name: 'PARA_MIN', value: 0 },
      { type: 'field_number', name: 'PARA_MAX', value: 255 },
    ],
    inputsInline: true, output: null,
    tooltip: 'Converte um valor de uma escala para outra. Ex: sensor 0-1023 → PWM 0-255.',
  },

  // ── Ultrassônico ───────────────────────────────────────────────────────────
  {
    type: 'configurar_ultrassonico', colour: 40,
    message0: 'Configurar sensor de distância: Trigger %1 Echo %2',
    args0: [
      { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins },
      { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins },
    ],
    previousStatement: null, nextStatement: null,
    tooltip: 'Coloque este bloco dentro de PREPARAR para configurar os pinos do sensor.',
  },
  {
    type: 'ler_distancia_cm', colour: 40,
    message0: 'Distância em cm (Trigger %1 Echo %2)',
    args0: [
      { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins },
      { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins },
    ],
    output: null,
    tooltip: 'Retorna a distância em centímetros medida pelo sensor.',
  },
  {
    type: 'mostrar_distancia', colour: 40,
    message0: 'O robô diz a distância em cm (Trigger %1 Echo %2)',
    args0: [
      { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins },
      { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins },
    ],
    previousStatement: null, nextStatement: null,
  },
  {
    type: 'objeto_esta_perto', colour: 40,
    message0: 'Tem objeto a menos de %1 cm? (Trigger %2 Echo %3)',
    args0: [
      { type: 'field_number', name: 'CM', value: 20, min: 1 },
      { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins },
      { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins },
    ],
    output: 'Boolean',
    tooltip: 'Retorna verdadeiro se houver um objeto mais próximo que a distância indicada.',
  },
  {
    type: 'distancia_entre', colour: 40,
    message0: 'Distância entre %1 e %2 cm? (Trigger %3 Echo %4)',
    args0: [
      { type: 'field_number', name: 'MIN', value: 10, min: 0 },
      { type: 'field_number', name: 'MAX', value: 20, min: 0 },
      { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins },
      { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins },
    ],
    output: 'Boolean',
    tooltip: 'Verifica se a distância está em uma faixa. Lê o sensor uma única vez!',
  },

  // ── Comunicação ────────────────────────────────────────────────────────────
  {
    type: 'escrever_serial', colour: 160,
    message0: 'O robô diz o texto: %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá, mundo!' }],
    previousStatement: null, nextStatement: null,
  },
  {
    type: 'escrever_serial_valor', colour: 160,
    message0: 'O robô diz a leitura de: %1',
    args0: [{ type: 'input_value', name: 'VALOR' }],
    previousStatement: null, nextStatement: null,
  },
];

Blockly.defineBlocksWithJsonArray(customBlocks);

// ─────────────────────────────────────────────────────────────────────────────
// Geradores de código C++
// ─────────────────────────────────────────────────────────────────────────────

cppGenerator.forBlock['bloco_setup'] = (b: Blockly.Block) =>
  `void setup() {\n  Serial.begin(9600);\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas configurações entrarão aqui...\n'}}\n\n`;

cppGenerator.forBlock['bloco_loop'] = (b: Blockly.Block) =>
  `void loop() {\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`;

cppGenerator.forBlock['configurar_pino'] = (b: Blockly.Block) =>
  `  pinMode(${b.getFieldValue('PIN')}, ${b.getFieldValue('MODE')});\n`;

cppGenerator.forBlock['escrever_pino'] = (b: Blockly.Block) =>
  `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`;

cppGenerator.forBlock['ler_pino_digital'] = (b: Blockly.Block) =>
  [`digitalRead(${b.getFieldValue('PIN')})`, 0];

cppGenerator.forBlock['escrever_pino_pwm'] = (b: Blockly.Block) =>
  `  analogWrite(${b.getFieldValue('PIN')}, ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;

cppGenerator.forBlock['ler_pino_analogico'] = (b: Blockly.Block) =>
  [`analogRead(${b.getFieldValue('PIN')})`, 0];

cppGenerator.forBlock['esperar'] = (b: Blockly.Block) =>
  `  delay(${b.getFieldValue('TIME')});\n`;

cppGenerator.forBlock['repetir_vezes'] = (b: Blockly.Block) =>
  `  for (int i = 0; i < ${b.getFieldValue('TIMES')}; i++) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;

cppGenerator.forBlock['se_entao'] = (b: Blockly.Block) =>
  `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  }\n`;

cppGenerator.forBlock['se_entao_senao'] = (b: Blockly.Block) =>
  `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  } else {\n${cppGenerator.statementToCode(b, 'SENAO') || ''}  }\n`;

cppGenerator.forBlock['comparar_valores'] = (b: Blockly.Block) =>
  [`(${cppGenerator.valueToCode(b, 'A', 0) || '0'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || '0'})`, 0];

cppGenerator.forBlock['numero_fixo'] = (b: Blockly.Block) =>
  [b.getFieldValue('VALOR'), 0];

cppGenerator.forBlock['e_ou_logico'] = (b: Blockly.Block) =>
  [`(${cppGenerator.valueToCode(b, 'A', 0) || 'false'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || 'false'})`, 0];

cppGenerator.forBlock['nao_logico'] = (b: Blockly.Block) =>
  [`!(${cppGenerator.valueToCode(b, 'VALOR', 0) || 'false'})`, 0];

cppGenerator.forBlock['mapear_valor'] = (b: Blockly.Block) =>
  [`map(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}, ${b.getFieldValue('DE_MIN')}, ${b.getFieldValue('DE_MAX')}, ${b.getFieldValue('PARA_MIN')}, ${b.getFieldValue('PARA_MAX')})`, 0];

cppGenerator.forBlock['configurar_ultrassonico'] = (b: Blockly.Block) =>
  `  pinMode(${b.getFieldValue('TRIG')}, OUTPUT);\n  pinMode(${b.getFieldValue('ECHO')}, INPUT);\n`;

cppGenerator.forBlock['ler_distancia_cm'] = (b: Blockly.Block) => {
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return [`_lerDistancia(${t}, ${e})`, 0];
};

cppGenerator.forBlock['mostrar_distancia'] = (b: Blockly.Block) => {
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return `  Serial.println(_lerDistancia(${t}, ${e}));\n`;
};

cppGenerator.forBlock['objeto_esta_perto'] = (b: Blockly.Block) => {
  const cm = b.getFieldValue('CM');
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return [`(_lerDistancia(${t}, ${e}) < ${cm})`, 0];
};

cppGenerator.forBlock['distancia_entre'] = (b: Blockly.Block) => {
  const min = b.getFieldValue('MIN'), max = b.getFieldValue('MAX');
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return [`_distanciaEntre(${t}, ${e}, ${min}.0f, ${max}.0f)`, 0];
};

cppGenerator.forBlock['escrever_serial'] = (b: Blockly.Block) =>
  `  Serial.println("${b.getFieldValue('TEXT')}");\n`;

cppGenerator.forBlock['escrever_serial_valor'] = (b: Blockly.Block) =>
  `  Serial.println(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;

// ─────────────────────────────────────────────────────────────────────────────
// generateCode: injeta funções helper quando necessário
// ─────────────────────────────────────────────────────────────────────────────

const generateCode = (ws: Blockly.WorkspaceSvg): string => {
  const raw = cppGenerator.workspaceToCode(ws) || '';

  const needsEntre   = raw.includes('_distanciaEntre(');
  const needsUltrass = raw.includes('_lerDistancia(') || needsEntre;

  if (!needsUltrass) return raw;

  const helperLer =
    'float _lerDistancia(int trig, int echo) {\n' +
    '  digitalWrite(trig, LOW);\n' +
    '  delayMicroseconds(2);\n' +
    '  digitalWrite(trig, HIGH);\n' +
    '  delayMicroseconds(10);\n' +
    '  digitalWrite(trig, LOW);\n' +
    '  long dur = pulseIn(echo, HIGH, 38000);\n' +
    '  return dur > 0 ? dur * 0.034f / 2.0f : 0.0f;\n' +
    '}\n';

  const helperEntre = needsEntre
    ? '\nbool _distanciaEntre(int trig, int echo, float minCm, float maxCm) {\n' +
      '  float d = _lerDistancia(trig, echo);\n' +
      '  return d > 0.0f && d >= minCm && d < maxCm;\n' +
      '}\n'
    : '';

  return helperLer + helperEntre + '\n' + raw;
};

// ─────────────────────────────────────────────────────────────────────────────
// Toolbox
// ─────────────────────────────────────────────────────────────────────────────

const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: '⚡ Pinos', colour: '230',
      contents: [
        { kind: 'block', type: 'configurar_pino' },
        { kind: 'block', type: 'escrever_pino' },
        { kind: 'block', type: 'ler_pino_digital' },
        {
          kind: 'block', type: 'escrever_pino_pwm',
          inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 128 } } } },
        },
        { kind: 'block', type: 'ler_pino_analogico' },
      ],
    },
    {
      kind: 'category', name: '⏱️ Controle', colour: '120',
      contents: [
        { kind: 'block', type: 'esperar' },
        { kind: 'block', type: 'repetir_vezes' },
      ],
    },
    {
      kind: 'category', name: '🔀 Condições', colour: '210',
      contents: [
        { kind: 'block', type: 'se_entao' },
        { kind: 'block', type: 'se_entao_senao' },
        {
          kind: 'block', type: 'comparar_valores',
          inputs: {
            A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } },
          },
        },
        { kind: 'block', type: 'numero_fixo' },
        { kind: 'block', type: 'e_ou_logico' },
        { kind: 'block', type: 'nao_logico' },
        {
          kind: 'block', type: 'mapear_valor',
          inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 512 } } } },
        },
      ],
    },
    {
      kind: 'category', name: '📡 Ultrassônico', colour: '40',
      contents: [
        { kind: 'block', type: 'configurar_ultrassonico' },
        { kind: 'block', type: 'ler_distancia_cm' },
        { kind: 'block', type: 'mostrar_distancia' },
        { kind: 'block', type: 'objeto_esta_perto' },
        { kind: 'block', type: 'distancia_entre' },
      ],
    },
    {
      kind: 'category', name: '💬 Comunicação', colour: '160',
      contents: [
        { kind: 'block', type: 'escrever_serial' },
        { kind: 'block', type: 'escrever_serial_valor' },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Nomes amigáveis dos blocos (para modal de blocos órfãos)
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_NAMES: Record<string, string> = {
  configurar_pino:       'Configurar Pino',
  escrever_pino:         'Ligar/Desligar Pino',
  ler_pino_digital:      'Ler Pino Digital',
  escrever_pino_pwm:     'Intensidade (PWM)',
  ler_pino_analogico:    'Ler Sensor Analógico',
  esperar:               'Esperar',
  repetir_vezes:         'Repetir Vezes',
  escrever_serial:       'O Robô Diz (texto)',
  escrever_serial_valor: 'O Robô Diz (valor)',
  se_entao:              'Se... Então',
  se_entao_senao:        'Se... Então... Senão',
  comparar_valores:      'Comparar Valores',
  numero_fixo:           'Número',
  e_ou_logico:           'E / Ou',
  nao_logico:            'NÃO',
  mapear_valor:          'Converter Valor',
  configurar_ultrassonico: 'Configurar Sensor HC-SR04',
  ler_distancia_cm:      'Ler Distância (cm)',
  mostrar_distancia:     'Mostrar Distância',
  objeto_esta_perto:     'Objeto Está Perto?',
  distancia_entre:       'Distância Entre... e...?',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de erro amigável
// ─────────────────────────────────────────────────────────────────────────────

type FriendlyError = { emoji: string; title: string; message: string; tip: string; rawError: string };

function getFriendlyError(raw: string): FriendlyError {
  const e = raw.toLowerCase();
  const base = { rawError: raw };

  if (e.includes('falha ao baixar') || e.includes('erro ao executar curl') || e.includes('tar') || e.includes('plano b'))
    return { ...base, emoji: '🌐', title: 'Problema na Internet!', message: 'Não consegui baixar as ferramentas necessárias.', tip: 'Dica: Verifique a conexão com a internet e tente novamente.' };

  if (e.includes('falha ao atualizar o index') || e.includes('update-index') || e.includes('erro ao instalar core'))
    return { ...base, emoji: '📦', title: 'Faltam os pacotes da placa!', message: 'O computador precisa baixar informações da placa pela primeira vez, mas a internet falhou.', tip: 'Dica: Verifique a conexão. Essa etapa só acontece uma vez!' };

  if (e.includes('esp32 no yaml') || e.includes('espressif') || e.includes('injeção da url'))
    return { ...base, emoji: '🛠️', title: 'Erro ao configurar a placa ESP32!', message: 'Ocorreu um problema ao adicionar as configurações da placa ESP32.', tip: 'Dica: Chame o professor! Pode ser necessário checar as permissões do computador.' };

  if (e.includes('busy') || e.includes('em uso') || e.includes('acesso negado') || e.includes('access is denied') || e.includes('permission denied'))
    return { ...base, emoji: '🚧', title: 'A porta USB está ocupada!', message: 'Outro programa (ou o Monitor Serial) está usando esta porta.', tip: 'Dica: Feche o Chat/Monitor clicando em "🛑 Parar" ou desconecte e reconecte o cabo USB!' };

  if (e.includes('erro na porta') || e.includes('erro upload') || e.includes('could not open port') || e.includes('não foi possível abrir') || e.includes('no such file'))
    return { ...base, emoji: '🔌', title: 'Cabo USB não encontrado!', message: 'O computador não conseguiu encontrar o Arduino.', tip: 'Dica: Verifique o cabo USB e clique em 🔄 para atualizar as portas!' };

  if (e.includes('erro compilador') || e.includes('not found'))
    return { ...base, emoji: '⚙️', title: 'Ferramenta ausente!', message: 'O programa que compila o código não foi encontrado.', tip: 'Dica: Reinstale o OficinaCode ou chame o professor!' };

  if (e.includes('erro no código') || e.includes('error:') || e.includes('syntax error') || e.includes('expected') || e.includes('undeclared'))
    return { ...base, emoji: '🧩', title: 'Hmm… algo está errado nas peças!', message: 'O código gerado pelos blocos tem um probleminha.', tip: 'Dica: Tente remover a última peça que você colocou e montar de novo. Se não resolver, chame o professor!' };

  if (e.includes('avrdude') || e.includes('programmer') || e.includes('not in sync') || e.includes('stk500'))
    return { ...base, emoji: '😵', title: 'Não consegui falar com o Arduino!', message: 'A placa não respondeu. O modelo pode estar errado.', tip: 'Dica: Verifique se você escolheu a placa certa (Uno, Nano ou ESP32)!' };

  if (e.includes('timeout') || e.includes('timed out'))
    return { ...base, emoji: '⏰', title: 'Demorou demais…', message: 'O Arduino não respondeu a tempo.', tip: 'Dica: Desconecte e reconecte o cabo USB e tente novamente!' };

  return { ...base, emoji: '😕', title: 'Algo deu errado por aqui...', message: 'Ocorreu um erro inesperado. Não se preocupe, isso acontece às vezes!', tip: 'Dica: Tente de novo. Se continuar, chame o professor!' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload stages
// ─────────────────────────────────────────────────────────────────────────────

type UploadStage = 'validating' | 'compiling' | 'sending' | 'success';

const UPLOAD_STAGES: { id: UploadStage; label: string; emoji: string; tip: string }[] = [
  { id: 'validating', label: 'Verificando as peças…',  emoji: '🔍', tip: 'Checando se tudo está no lugar certo!' },
  { id: 'compiling',  label: 'Compilando o código…',   emoji: '⚙️', tip: 'Transformando os blocos em linguagem de robô!' },
  { id: 'sending',    label: 'Enviando para o robô…',  emoji: '📡', tip: 'O código está viajando pelo cabo USB agora!' },
  { id: 'success',    label: 'Robô pronto para agir!', emoji: '🤖', tip: 'Seu robô já está executando as instruções!' },
];

// ─────────────────────────────────────────────────────────────────────────────
// BoardSelectionModal — etapa obrigatória para novos projetos
// ─────────────────────────────────────────────────────────────────────────────

interface BoardSelectionModalProps {
  onSelect: (board: BoardKey) => void;
}

function BoardSelectionModal({ onSelect }: BoardSelectionModalProps) {
  const [hovered, setHovered] = useState<BoardKey | null>(null);

  const boards: { key: BoardKey; title: string; color: string; img: string }[] = [
    {
      key: 'uno',
      title: 'Arduino Uno',
      color: '#0984e3',
      img: 'public/arduino_uno.jpg',
    },
    {
      key: 'nano',
      title: 'Arduino Nano',
      color: '#6c5ce7',
      img: 'public/arduino_nano.jpg',
    },
    {
      key: 'esp32',
      title: 'ESP32 DevKit',
      color: '#e17055',
      img: 'public/esp32_devkit_v1.jpg',
    },
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 999999 }}>
      <div style={{
        background: '#fff',
        borderRadius: 32,
        padding: '44px 40px 36px',
        maxWidth: 680,
        width: '95%',
        boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
        animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        borderTop: '6px solid #00a8ff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 28,
        textAlign: 'center',
      }}>
        {/* Título */}
        <div>
          <h2 style={{ color: '#2f3542', fontSize: '1.7rem', fontWeight: 900, marginBottom: 8 }}>
            Qual placa vamos usar?
          </h2>
          <p style={{ color: '#7f8c8d', fontSize: '1rem', fontWeight: 700, lineHeight: 1.5 }}>
            Escolha antes de começar. Os pinos disponíveis vão mudar dependendo da placa.
            <br />
            <strong style={{ color: '#e17055' }}>Essa escolha não pode ser alterada depois de salvar.</strong>
          </p>
        </div>

        {/* Cards horizontais */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 16,
          width: '100%',
          justifyContent: 'center',
        }}>
          {boards.map(({ key, title, color, img }) => (
            <button
              key={key}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(key)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '18px 16px 14px',
                borderRadius: 20,
                border: `3px solid ${hovered === key ? color : '#e0e6ed'}`,
                background: hovered === key ? `${color}11` : '#f8fafd',
                cursor: 'pointer',
                boxShadow: hovered === key
                  ? `0 8px 24px ${color}44`
                  : '0 2px 8px rgba(0,0,0,0.06)',
                transform: hovered === key ? 'translateY(-4px) scale(1.03)' : 'none',
                transition: 'all 0.18s ease',
                flex: 1,
                minWidth: 0,
                outline: 'none',
              }}
            >
              {/* Foto da placa */}
              <div style={{
                width: '100%',
                aspectRatio: '4/3',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#eef2f7',
                border: `2px solid ${hovered === key ? color + '55' : '#e0e6ed'}`,
                transition: 'border-color 0.18s ease',
                flexShrink: 0,
              }}>
                <img
                  src={img}
                  alt={title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    transition: 'transform 0.25s ease',
                    transform: hovered === key ? 'scale(1.06)' : 'scale(1)',
                  }}
                />
              </div>

              {/* Nome */}
              <span style={{
                color: hovered === key ? color : '#2f3542',
                fontWeight: 900,
                fontSize: '1rem',
                transition: 'color 0.18s ease',
                lineHeight: 1.2,
              }}>
                {title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente IdeScreen
// ─────────────────────────────────────────────────────────────────────────────

interface IdeScreenProps {
  role: 'student' | 'teacher' | 'visitor';
  readOnly?: boolean;
  onBack: () => void;
  projectId?: string;
}

export function IdeScreen({ role, readOnly = false, onBack, projectId }: IdeScreenProps) {
  const blocklyDiv  = useRef<HTMLDivElement>(null);
  const workspace   = useRef<Blockly.WorkspaceSvg | null>(null);

  const [board, setBoard]                       = useState<BoardKey>('uno');
  const [port, setPort]                         = useState('');
  const [availablePorts, setAvailablePorts]     = useState<string[]>([]);
  const [generatedCode, setGeneratedCode]       = useState('// O código C++ aparecerá aqui...');
  const [isSaving, setIsSaving]                 = useState(false);
  const [projectName, setProjectName]           = useState('Projeto');
  const [saveStatus, setSaveStatus]             = useState<'success' | 'error' | null>(null);
  const [isSerialOpen, setIsSerialOpen]         = useState(false);
  const [serialMessages, setSerialMessages]     = useState<string[]>([]);
  const messagesEndRef                          = useRef<HTMLDivElement>(null);
  const [isCodeVisible, setIsCodeVisible]       = useState(false);
  const [isFullscreenCode, setIsFullscreenCode] = useState(false);

  const [uploadStage, setUploadStage]           = useState<UploadStage | null>(null);
  const [friendlyError, setFriendlyError]       = useState<FriendlyError | null>(null);
  const [showTechDetails, setShowTechDetails]   = useState(false);
  const [orphanWarning, setOrphanWarning]       = useState<string[]>([]);
  const isUploadingRef                          = useRef(false);

  // ── Controle de seleção de placa ─────────────────────────────────────────
  // Para NOVOS projetos: exibe o modal de seleção antes de inicializar o workspace.
  // Para projetos EXISTENTES: carrega a placa do DB de forma síncrona antes do load.
  // showBoardModal só é true em projetos novos (sem projectId) e não-readOnly.
  const [showBoardModal, setShowBoardModal]     = useState(!projectId && !readOnly);
  // ideReady garante que o Blockly só é injetado após a placa ser determinada.
  const [ideReady, setIdeReady]                 = useState(!!projectId || readOnly);

  // ── Tema ────────────────────────────────────────────────────────────────────

  const oficinaTheme = Blockly.Theme.defineTheme('oficinaTheme', {
    name: 'oficinaTheme',
    base: Blockly.Themes.Classic,
    blockStyles: {
      colour_blocks:    { colourPrimary: '#ef9f4b', colourSecondary: '#d4891f', colourTertiary: '#b87219' },
      list_blocks:      { colourPrimary: '#4cd137', colourSecondary: '#3bac29', colourTertiary: '#2e8a1f' },
      logic_blocks:     { colourPrimary: '#6c5ce7', colourSecondary: '#5a4ed4', colourTertiary: '#473dbf' },
      loop_blocks:      { colourPrimary: '#00b894', colourSecondary: '#00a381', colourTertiary: '#008068' },
      math_blocks:      { colourPrimary: '#0984e3', colourSecondary: '#0773c9', colourTertiary: '#0562af' },
      procedure_blocks: { colourPrimary: '#fd79a8', colourSecondary: '#e46d96', colourTertiary: '#cc6284' },
      text_blocks:      { colourPrimary: '#fdcb6e', colourSecondary: '#e4b55b', colourTertiary: '#cb9e48' },
      variable_blocks:  { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' },
      variable_dynamic_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' },
      hat_blocks:       { colourPrimary: '#a29bfe', colourSecondary: '#9085e3', colourTertiary: '#7e71c8' },
    },
    componentStyles: {
      workspaceBackgroundColour: '#eef2f7',
      toolboxBackgroundColour: '#1a2035',
      toolboxForegroundColour: '#ffffff',
      flyoutBackgroundColour: '#242c42',
      flyoutForegroundColour: '#ffffff',
      flyoutOpacity: 0.98,
      scrollbarColour: '#00a8ff',
      scrollbarOpacity: 0.5,
      insertionMarkerColour: '#00a8ff',
      insertionMarkerOpacity: 0.6,
      markerColour: '#ffffff',
      cursorColour: '#d0d0d0',
    },
  });

  // ── Utilitários ─────────────────────────────────────────────────────────────

  const fetchPorts = async () => {
    try {
      const ports = await invoke<string[]>('get_available_ports');
      setAvailablePorts(ports);
      if (ports.length > 0 && !ports.includes(port)) setPort(ports[0]);
    } catch (error) {
      console.error('Erro ao buscar portas:', error);
    }
  };

  const getOrphanedBlocks = (): string[] => {
    if (!workspace.current) return [];
    return workspace.current
      .getTopBlocks(false)
      .filter(b => b.type !== 'bloco_setup' && b.type !== 'bloco_loop')
      .map(b => BLOCK_NAMES[b.type] ?? b.type);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ── Handler: seleção de placa para novos projetos ─────────────────────────
  // Chamado pelo BoardSelectionModal. Atualiza currentBoardPins de forma
  // síncrona ANTES de liberar a inicialização do workspace.
  const handleBoardSelected = (selectedBoard: BoardKey) => {
    syncBoardPins(selectedBoard);   // ← síncrono, antes do inject
    setBoard(selectedBoard);
    setShowBoardModal(false);
    setIdeReady(true);              // ← libera o useEffect do Blockly
  };

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { fetchPorts(); }, []);

  // Escuta resultado do upload vindo do backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<string>('upload-result', (event) => {
        const payload = event.payload;
        if (payload === 'ok') {
          setUploadStage('success');
        } else if (payload.startsWith('err:')) {
          setUploadStage(null);
          setFriendlyError(getFriendlyError(payload.slice(4)));
        }
        isUploadingRef.current = false;
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Inicialização do Blockly
  // IMPORTANTE: só roda quando ideReady === true, garantindo que currentBoardPins
  // já foi atualizado de forma síncrona antes do inject e do workspace load.
  useEffect(() => {
    if (!ideReady || !blocklyDiv.current || workspace.current) return;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: toolboxConfig,
      grid: { spacing: 24, length: 4, colour: '#d8e0ec', snap: true },
      readOnly,
      move: { scrollbars: true, drag: true, wheel: true },
      theme: oficinaTheme,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      trashcan: true,
      sounds: false,
    });

    workspace.current.addChangeListener((event) => {
      if (event.isUiEvent) return;
      try {
        setGeneratedCode(
          generateCode(workspace.current!) ||
          '// Arraste blocos para dentro de PREPARAR e AGIR!'
        );
      } catch (e) {
        console.error('Erro ao gerar código:', e);
      }
    });

    const ensureRootBlocks = () => {
      if (!workspace.current) return;
      let s = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_setup');
      if (!s) {
        s = workspace.current.newBlock('bloco_setup');
        s.moveBy(50, 50);
        s.initSvg();
        s.render();
      }
      s.setDeletable(false);

      let l = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_loop');
      if (!l) {
        l = workspace.current.newBlock('bloco_loop');
        l.moveBy(450, 50);
        l.initSvg();
        l.render();
      }
      l.setDeletable(false);
    };

    if (projectId) {
      (async () => {
        const { data, error } = await supabase
          .from('projetos')
          .select('*')
          .eq('id', projectId)
          .single();

        if (error || !data) {
          ensureRootBlocks();
          return;
        }

        setProjectName(data.nome);

        // ── CORREÇÃO CRÍTICA ───────────────────────────────────────────────
        // Atualiza currentBoardPins de forma SÍNCRONA antes de qualquer
        // operação no workspace. Não depender apenas de setBoard() aqui,
        // pois setState é assíncrono e o workspace.load() abaixo rodaria
        // com os pinos errados se apenas setBoard fosse chamado.
        const savedBoard = (data.target_board as BoardKey) ?? 'uno';
        if (!BOARDS[savedBoard]) {
          setFriendlyError({
            emoji: '⚠️',
            title: 'Placa desconhecida no projeto!',
            message: `O projeto foi salvo com a placa "${data.target_board}", que não é reconhecida.`,
            tip: 'Contate o suporte ou o professor. O projeto não foi carregado para evitar corrupção.',
            rawError: `target_board="${data.target_board}" não existe em BOARDS.`,
          });
          return;
        }

        syncBoardPins(savedBoard);  // ← síncrono, garante pinos corretos no load
        setBoard(savedBoard);

        // Agora é seguro carregar o workspace — currentBoardPins já está correto
        try {
          if (data.workspace_data) {
            const raw =
              typeof data.workspace_data === 'string'
                ? JSON.parse(LZString.decompressFromBase64(data.workspace_data) || '{}')
                : data.workspace_data;
            if (raw && Object.keys(raw).length > 0)
              Blockly.serialization.workspaces.load(raw, workspace.current!);
          }
        } catch (_) {
          // workspace corrompido — começa vazio
        }

        ensureRootBlocks();
      })();
    } else {
      // Projeto novo: currentBoardPins já foi atualizado por handleBoardSelected
      // antes de ideReady ser setado para true.
      ensureRootBlocks();
    }

    return () => {
      if (workspace.current) {
        workspace.current.dispose();
        workspace.current = null;
      }
    };
  }, [ideReady, projectId, readOnly]);

  useEffect(() => {
    if (workspace.current) Blockly.svgResize(workspace.current);
  }, [role, isCodeVisible, isFullscreenCode, ideReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialMessages, isSerialOpen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<string>('serial-message', (e) => {
        setSerialMessages(prev => {
          const next = [...prev, e.payload];
          return next.length > 50 ? next.slice(next.length - 50) : next;
        });
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggleSerial = async () => {
    try {
      if (isSerialOpen) {
        await invoke('stop_serial');
        setIsSerialOpen(false);
      } else {
        setSerialMessages([]);
        await invoke('start_serial', { porta: port });
        setIsSerialOpen(true);
      }
    } catch (error) {
      setFriendlyError(getFriendlyError(String(error)));
    }
  };

  const handleSaveProject = async () => {
    if (!projectId || !workspace.current) return;
    setIsSaving(true);
    const { error } = await supabase.from('projetos').update({
      workspace_data: LZString.compressToBase64(
        JSON.stringify(Blockly.serialization.workspaces.save(workspace.current))
      ),
      target_board: board,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);
    setIsSaving(false);
    if (!error) {
      setSaveStatus('success');
    } else {
      setFriendlyError({
        emoji: '☁️',
        title: 'Não consegui salvar!',
        message: error.message,
        tip: 'Verifique sua conexão com a internet e tente de novo.',
        rawError: error.message,
      });
    }
  };

  const handleUploadCode = async (ignoreOrphans = false) => {
    if (isUploadingRef.current) return;

    if (!ignoreOrphans) {
      const orphans = getOrphanedBlocks();
      if (orphans.length > 0) {
        setOrphanWarning(orphans);
        return;
      }
    }

    if (!generatedCode.includes('void setup()') || !generatedCode.includes('void loop()')) {
      setFriendlyError({
        emoji: '🧩',
        title: 'Faltam peças importantes!',
        message: 'Os blocos PREPARAR e AGIR são obrigatórios para o robô funcionar.',
        tip: 'Dica: Mexa em uma peça e tente de novo para atualizar o código!',
        rawError: 'Missing setup() or loop() in generated code.',
      });
      return;
    }

    if (isSerialOpen) {
      await invoke('stop_serial').catch(() => {});
      setIsSerialOpen(false);
    }

    isUploadingRef.current = true;
    setUploadStage('validating');

    await delay(700);
    if (!isUploadingRef.current) return;
    setUploadStage('compiling');

    invoke('upload_code', { codigo: generatedCode, placa: board, porta: port })
      .catch((e) => {
        setUploadStage(null);
        setFriendlyError(getFriendlyError(String(e)));
        isUploadingRef.current = false;
      });

    await delay(2500);
    if (!isUploadingRef.current) return;
    setUploadStage('sending');
  };

  const handleCloseError = () => {
    setFriendlyError(null);
    setShowTechDetails(false);
  };

  // ── Título do projeto ────────────────────────────────────────────────────────

  const projectTitle = projectId
    ? role === 'student'
      ? `Meu Projeto: ${projectName}`
      : readOnly
        ? `Inspecionando: ${projectName}`
        : `Meu Projeto: ${projectName}`
    : '';

  const stageIndex = uploadStage ? UPLOAD_STAGES.findIndex(s => s.id === uploadStage) : -1;
  const currentStageData = uploadStage ? UPLOAD_STAGES.find(s => s.id === uploadStage) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">

      {/* ── MODAL: SELEÇÃO DE PLACA (novos projetos) ─────────────────────────── */}
      {showBoardModal && <BoardSelectionModal onSelect={handleBoardSelected} />}

      {readOnly && (
        <div className="readonly-banner">
          <span>👁️ Modo Visualização</span>
          <span>Você está vendo o projeto de um aluno. Edição desativada.</span>
        </div>
      )}

      {/* ── TOPBAR ──────────────────────────────────────────────────────────── */}
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '34px' }} />
          {projectTitle && (
            <div className="project-title-badge">
              {readOnly && <span className="read-only-dot" />}
              <span>{projectTitle}</span>
            </div>
          )}
        </div>

        <div className="hardware-controls" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="control-group">
            <span className="control-icon">Placa: </span>
            {/* Placa é exibida mas não pode mais ser editada após projeto criado/aberto */}
            <select
              value={board}
              onChange={(e) => {
                const newBoard = e.target.value as BoardKey;
                syncBoardPins(newBoard);  // ← síncrono
                setBoard(newBoard);
              }}
              disabled={readOnly || !!projectId}
              title={projectId ? 'A placa não pode ser alterada após o projeto ser salvo' : undefined}
            >
              <option value="uno">Uno</option>
              <option value="nano">Nano</option>
              <option value="esp32">ESP32</option>
            </select>
          </div>
          <div className="control-divider" />
          <div className="control-group">
            <span className="control-icon">Porta: </span>
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {availablePorts.length === 0
                ? <option value="">Conecte o cabo…</option>
                : availablePorts.map(p => <option key={p} value={p}>{p}</option>)
              }
            </select>
            <button onClick={fetchPorts} className="btn-icon" title="Atualizar portas">🔄</button>
          </div>
          <div className="control-divider" />
          {!readOnly && (
            <>
              <button
                onClick={() => handleUploadCode()}
                className="btn-action btn-send"
                disabled={isUploadingRef.current}
              >
                🚀 Enviar
              </button>
              <button
                className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`}
                onClick={handleToggleSerial}
              >
                {isSerialOpen ? '🛑 Parar' : '💬 Chat'}
              </button>
            </>
          )}
          {readOnly && (
            <button
              className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`}
              onClick={handleToggleSerial}
            >
              {isSerialOpen ? '🛑 Parar' : '💬 Monitorar'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {role !== 'student' && (
            <button className="btn-secondary topbar-btn" onClick={() => setIsCodeVisible(!isCodeVisible)}>
              {isCodeVisible ? '🙈 Ocultar Código' : 'Ver Código'}
            </button>
          )}
          {(role === 'student' || (role === 'teacher' && !readOnly)) && projectId && (
            <button className="btn-primary topbar-btn" onClick={handleSaveProject} disabled={isSaving}>
              {isSaving ? '⏳ Salvando…' : '💾 Salvar'}
            </button>
          )}
          <button className="btn-danger topbar-btn" onClick={onBack}>Sair</button>
        </div>
      </div>

      {/* ── WORKSPACE ───────────────────────────────────────────────────────── */}
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Código C++</h3>
              <button
                onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                style={{ background: 'transparent', border: '1px solid #485460', color: '#a4b0be', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', margin: 0, boxShadow: 'none' }}
              >
                {isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}
              </button>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* ── MODAL: LOADING DE UPLOAD ─────────────────────────────────────────── */}
      {uploadStage && (
        <div className="modal-overlay">
          <div className="upload-modal">
            {uploadStage === 'success' ? (
              <div className="upload-success-content">
                <div className="success-robot">🤖</div>
                <h2>Robô pronto!</h2>
                <p>O seu robô já está executando as novas instruções. Ele aprendeu tudo que você ensinou!</p>
                <button className="btn-primary upload-close-btn" onClick={() => setUploadStage(null)}>
                  🎉 Continuar programando!
                </button>
              </div>
            ) : (
              <>
                <div className="upload-rocket-wrap">
                  <span>{currentStageData?.emoji}</span>
                </div>
                <h2 className="upload-stage-label">{currentStageData?.label}</h2>
                <p className="upload-stage-tip">{currentStageData?.tip}</p>
                <div className="upload-progress-bar-track">
                  <div
                    className="upload-progress-bar-fill"
                    style={{ width: `${((stageIndex + 1) / (UPLOAD_STAGES.length - 1)) * 100}%` }}
                  />
                </div>
                <div className="upload-steps">
                  {UPLOAD_STAGES.filter(s => s.id !== 'success').map((s, i) => (
                    <div
                      key={s.id}
                      className={`upload-step ${i <= stageIndex ? 'active' : ''} ${i === stageIndex ? 'current' : ''}`}
                    >
                      <div className="upload-step-dot" />
                      <span className="upload-step-label">
                        {s.label.replace('…', '').replace(' o código', '').replace(' as peças', '').replace(' para o robô', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: BLOCOS ÓRFÃOS ─────────────────────────────────────────────── */}
      {orphanWarning.length > 0 && (
        <div className="modal-overlay">
          <div className="orphan-modal">
            <div className="orphan-icon">🧩</div>
            <h2>Tem peças soltas!</h2>
            <p>
              As peças abaixo estão flutuando no espaço e não estão conectadas a nenhuma função.
              Para o robô executar, <strong>todas as peças precisam estar dentro de PREPARAR ou AGIR</strong>.
            </p>
            <div className="orphan-blocks-list">
              {[...new Set(orphanWarning)].map((name, i) => (
                <div key={i} className="orphan-block-chip">
                  <span>🔷</span> {name}
                </div>
              ))}
            </div>
            <div className="orphan-diagram">
              <div className="orphan-diagram-bad">
                <span>❌</span>
                <div className="mini-block floating">Peça Solta</div>
              </div>
              <div className="orphan-diagram-arrow">→</div>
              <div className="orphan-diagram-good">
                <span>✅</span>
                <div className="mini-block-container">
                  <div className="mini-block header">PREPARAR / AGIR</div>
                  <div className="mini-block child">Peça encaixada</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setOrphanWarning([])}>
                Vou corrigir! ✏️
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => { setOrphanWarning([]); handleUploadCode(true); }}
              >
                Enviar assim mesmo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ERRO AMIGÁVEL ─────────────────────────────────────────────── */}
      {friendlyError && (
        <div className="modal-overlay">
          <div className="friendly-error-modal">
            <div className="friendly-error-icon">{friendlyError.emoji}</div>
            <h2>{friendlyError.title}</h2>
            <p className="friendly-error-message">{friendlyError.message}</p>
            <div className="friendly-error-tip">
              <span>💡</span>
              <span>{friendlyError.tip}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleCloseError}>
                Entendi, vou tentar!
              </button>
            </div>
            <div style={{ width: '100%', marginTop: '15px' }}>
              <button
                style={{ fontSize: '0.8rem', padding: '5px 10px', border: 'none', background: 'transparent', textDecoration: 'underline', color: '#636e72', cursor: 'pointer', margin: '0 auto', display: 'block', boxShadow: 'none' }}
                onClick={() => setShowTechDetails(!showTechDetails)}
              >
                {showTechDetails ? 'Ocultar detalhes técnicos' : '🛠️ Ver detalhes técnicos (Professor)'}
              </button>
              {showTechDetails && (
                <pre style={{ textAlign: 'left', backgroundColor: '#2d3436', color: '#ff7675', padding: '10px', borderRadius: '5px', fontSize: '0.75rem', marginTop: '10px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>
                  {friendlyError.rawError}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: SALVO COM SUCESSO ─────────────────────────────────────────── */}
      {saveStatus === 'success' && (
        <div className="modal-overlay">
          <div className="save-success-modal">
            <div className="save-success-icon">☁️</div>
            <h2>Projeto Salvo!</h2>
            <p>Suas peças e progressos foram guardados com segurança na nuvem. Continue programando!</p>
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }}
              onClick={() => setSaveStatus(null)}
            >
              Continuar 🚀
            </button>
          </div>
        </div>
      )}

      {/* ── MONITOR SERIAL ───────────────────────────────────────────────────── */}
      {isSerialOpen && (
        <div className="serial-monitor">
          <div className="serial-monitor-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="serial-status-dot" />
              <span>Robô conectado</span>
            </div>
            <button className="serial-close-btn" onClick={handleToggleSerial}>✕</button>
          </div>
          <div className="serial-monitor-body">
            {serialMessages.length === 0 ? (
              <div className="serial-empty">
                <span>📡</span>
                <p>Aguardando o robô falar…</p>
                <small>As mensagens do robô aparecerão aqui!</small>
              </div>
            ) : (
              serialMessages.map((msg, idx) => (
                <div key={idx} className="serial-message">
                  <span className="serial-timestamp">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="serial-text">{msg}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="serial-monitor-footer">
            <button className="serial-clear-btn" onClick={() => setSerialMessages([])}>🗑️ Limpar</button>
            <span>{serialMessages.length} mensagens</span>
          </div>
        </div>
      )}
    </div>
  );
}