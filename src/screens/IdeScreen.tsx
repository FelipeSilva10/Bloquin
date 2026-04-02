import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as PtBr from 'blockly/msg/pt-br';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import arduinoUno from '../assets/arduino_uno.jpg';
import arduinoNano from '../assets/arduino_nano.jpg';
import esp32DevkitV1 from '../assets/esp32_devkit_v1.jpg';
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
      ['GPIO 0  ⚠️ boot', '0'],    ['GPIO 2  (LED)', '2'],
      ['GPIO 4',          '4'],    ['GPIO 5  ⚠️ boot', '5'],
      ['GPIO 12 ⚠️ boot', '12'],   ['GPIO 13', '13'],
      ['GPIO 14',         '14'],   ['GPIO 15 ⚠️ boot', '15'],
      ['GPIO 16',         '16'],   ['GPIO 17', '17'],
      ['GPIO 18',         '18'],   ['GPIO 19', '19'],
      ['GPIO 21',         '21'],   ['GPIO 22', '22'],
      ['GPIO 23',         '23'],   ['GPIO 25', '25'],
      ['GPIO 26',         '26'],   ['GPIO 27', '27'],
      ['GPIO 32',         '32'],   ['GPIO 33', '33'],
      ['GPIO 34 (leitura)', '34'], ['GPIO 35 (leitura)', '35'],
      ['GPIO 36 (leitura)', '36'], ['GPIO 39 (leitura)', '39'],
    ],
  },
} as const;

type BoardKey = keyof typeof BOARDS;

export const BOARD_UNSET = 'unset';

let currentBoardPins: [string, string][] = [...BOARDS.uno.pins] as [string, string][];

function syncBoardPins(boardKey: BoardKey) {
  currentBoardPins = [...BOARDS[boardKey].pins] as [string, string][];
}

// ─────────────────────────────────────────────────────────────────────────────
// Definição dos blocos
// ─────────────────────────────────────────────────────────────────────────────

const customBlocks = [
  // ── ESTRUTURA ──────────────────────────────────────────────────────────────
  { type: 'bloco_setup', colour: 290, helpUrl: '', message0: 'PREPARAR (Roda 1 vez) %1', args0: [{ type: 'input_statement', name: 'DO' }], tooltip: 'Código que roda apenas uma vez, na inicialização.' },
  { type: 'bloco_loop', colour: 260, helpUrl: '', message0: 'AGIR (Roda para sempre) %1', args0: [{ type: 'input_statement', name: 'DO' }], tooltip: 'Código que fica se repetindo enquanto o robô estiver ligado.' },

  // ── PINOS ──────────────────────────────────────────────────────────────────
  { type: 'configurar_pino', colour: 230, message0: 'Configurar pino %1 como %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'MODE', options: [['Saída (Enviar sinal)', 'OUTPUT'], ['Entrada (Ler sensor)', 'INPUT'], ['Entrada com resistor', 'INPUT_PULLUP']] }], previousStatement: null, nextStatement: null, tooltip: 'Define se o pino vai enviar ou receber sinal.' },
  { type: 'escrever_pino', colour: 230, message0: 'Colocar pino %1 em estado %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'STATE', options: [['Ligado (HIGH)', 'HIGH'], ['Desligado (LOW)', 'LOW']] }], previousStatement: null, nextStatement: null, tooltip: 'Liga ou desliga um pino digital.' },
  { type: 'ler_pino_digital', colour: 230, message0: 'Ler pino digital %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: null, tooltip: 'Lê o estado (HIGH ou LOW) de um pino digital.' },
  { type: 'escrever_pino_pwm', colour: 230, message0: 'Intensidade do pino %1 → %2 (0 a 255)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null, tooltip: 'Controla a intensidade via PWM.' },
  { type: 'ler_pino_analogico', colour: 230, message0: 'Ler sensor analógico no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: null, tooltip: 'Lê um sensor analógico. Retorna valor de 0 a 1023.' },

  // ── CONTROLE BÁSICO ────────────────────────────────────────────────────────
  { type: 'esperar', colour: 120, message0: 'Esperar %1 milissegundos', args0: [{ type: 'field_number', name: 'TIME', value: 1000, min: 0 }], previousStatement: null, nextStatement: null, tooltip: '1000 ms = 1 segundo.' },
  { type: 'repetir_vezes', colour: 120, message0: 'Repetir %1 vezes %2 %3', args0: [{ type: 'field_number', name: 'TIMES', value: 5, min: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },

  // ── CONDIÇÕES ──────────────────────────────────────────────────────────────
  { type: 'se_entao', colour: 210, message0: 'SE %1 ENTÃO %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }], previousStatement: null, nextStatement: null },
  { type: 'se_entao_senao', colour: 210, message0: 'SE %1 ENTÃO %2 %3 SENÃO %4 %5', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'SENAO' }], previousStatement: null, nextStatement: null },
  { type: 'comparar_valores', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A' }, { type: 'field_dropdown', name: 'OP', options: [['é maior que', '>'], ['é menor que', '<'], ['é igual a', '=='], ['é maior ou igual a', '>='], ['é menor ou igual a', '<='], ['é diferente de', '!=']] }, { type: 'input_value', name: 'B' }], inputsInline: true, output: 'Boolean' },
  { type: 'numero_fixo', colour: 210, message0: '%1', args0: [{ type: 'field_number', name: 'VALOR', value: 10 }], output: null },
  { type: 'e_ou_logico', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }, { type: 'field_dropdown', name: 'OP', options: [['E', '&&'], ['OU', '||']] }, { type: 'input_value', name: 'B', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },
  { type: 'nao_logico', colour: 210, message0: 'NÃO %1', args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }], inputsInline: true, output: 'Boolean', tooltip: 'Inverte a condição.' },
  { type: 'mapear_valor', colour: 210, message0: 'Converter %1 de %2-%3 para %4-%5', args0: [{ type: 'input_value', name: 'VALOR' }, { type: 'field_number', name: 'DE_MIN', value: 0 }, { type: 'field_number', name: 'DE_MAX', value: 1023 }, { type: 'field_number', name: 'PARA_MIN', value: 0 }, { type: 'field_number', name: 'PARA_MAX', value: 255 }], inputsInline: true, output: null, tooltip: 'Converte um valor de uma escala para outra.' },

  // ── ULTRASSÔNICO ───────────────────────────────────────────────────────────
  { type: 'configurar_ultrassonico', colour: 40, message0: 'Configurar sensor de distância: Trigger %1 Echo %2', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, tooltip: 'Coloque dentro de PREPARAR.' },
  { type: 'ler_distancia_cm', colour: 40, message0: 'Distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: null, tooltip: 'Retorna a distância em centímetros.' },
  { type: 'mostrar_distancia', colour: 40, message0: 'O robô diz a distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null },
  { type: 'objeto_esta_perto', colour: 40, message0: 'Tem objeto a menos de %1 cm? (Trigger %2 Echo %3)', args0: [{ type: 'field_number', name: 'CM', value: 20, min: 1 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean', tooltip: 'Verdadeiro se objeto mais próximo que a distância.' },
  { type: 'distancia_entre', colour: 40, message0: 'Distância entre %1 e %2 cm? (Trigger %3 Echo %4)', args0: [{ type: 'field_number', name: 'MIN', value: 10, min: 0 }, { type: 'field_number', name: 'MAX', value: 20, min: 0 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean', tooltip: 'Verifica se a distância está em uma faixa.' },

  // ── COMUNICAÇÃO ────────────────────────────────────────────────────────────
  { type: 'escrever_serial', colour: 160, message0: 'O robô diz o texto: %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá, mundo!' }], previousStatement: null, nextStatement: null },
  { type: 'escrever_serial_valor', colour: 160, message0: 'O robô diz a leitura de: %1', args0: [{ type: 'input_value', name: 'VALOR' }], previousStatement: null, nextStatement: null },

  // ── CONTROLE AVANÇADO ──────────────────────────────────────────────────────
  { type: 'enquanto_verdadeiro', colour: 120, message0: 'Enquanto %1 fizer %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, tooltip: 'Repete o bloco enquanto a condição for verdadeira.' },
  { type: 'parar_repeticao', colour: 120, message0: '⛔ Parar de repetir (break)', args0: [], previousStatement: null, nextStatement: null, tooltip: 'Sai imediatamente do loop atual (repetir_vezes ou enquanto).' },

  // ── MATEMÁTICA ─────────────────────────────────────────────────────────────
  { type: 'operacao_matematica', colour: 200, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A' }, { type: 'field_dropdown', name: 'OP', options: [['+ soma', '+'], ['− subtração', '-'], ['× multiplicação', '*'], ['÷ divisão', '/'], ['% resto', '%']] }, { type: 'input_value', name: 'B' }], inputsInline: true, output: null, tooltip: 'Operação matemática entre dois valores.' },
  { type: 'valor_absoluto', colour: 200, message0: '|%1| valor absoluto', args0: [{ type: 'input_value', name: 'VALOR' }], output: null, tooltip: 'Retorna o valor sem sinal negativo. Ex: abs(-5) = 5.' },
  { type: 'constrain_valor', colour: 200, message0: 'Limitar %1 entre %2 e %3', args0: [{ type: 'input_value', name: 'VALOR' }, { type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 255 }], inputsInline: true, output: null, tooltip: 'Garante que o valor fique dentro do intervalo dado.' },
  { type: 'random_valor', colour: 200, message0: 'Número aleatório de %1 a %2', args0: [{ type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 100 }], output: null, tooltip: 'Gera um número inteiro aleatório no intervalo.' },
  { type: 'millis_atual', colour: 200, message0: 'Tempo ligado (ms)', args0: [], output: null, tooltip: 'Retorna milissegundos desde o início. Útil para temporização sem travar com delay.' },

  // ── VARIÁVEIS GLOBAIS ──────────────────────────────────────────────────────
  // Sem prev/next — flutua solto no workspace como declaração global
  { type: 'declarar_variavel_global', colour: 330, message0: '📦 Variável %1 %2 = %3', args0: [{ type: 'field_dropdown', name: 'TIPO', options: [['inteiro (int)', 'int'], ['decimal (float)', 'float'], ['bool (true/false)', 'bool']] }, { type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR' }], tooltip: 'Declara uma variável global. Deixe solto no workspace, fora de qualquer bloco.' },
  { type: 'atribuir_variavel', colour: 330, message0: 'Guardar em %1 o valor %2', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null, tooltip: 'Atribui um novo valor à variável. O nome deve ser igual ao da declaração.' },
  { type: 'ler_variavel', colour: 330, message0: 'variável %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }], output: null, tooltip: 'Lê o valor atual de uma variável.' },
  { type: 'incrementar_variavel', colour: 330, message0: 'Aumentar %1 em %2', args0: [{ type: 'field_input', name: 'NOME', text: 'contador' }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null, tooltip: 'Soma um valor à variável (equivale a: contador += 1).' },

  // ── FUNÇÕES ────────────────────────────────────────────────────────────────
  // Sem prev/next — flutua solto no workspace como definição de função
  { type: 'definir_funcao', colour: 270, message0: '⚡ Função %1 %2 %3', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], tooltip: 'Cria uma função reutilizável. Deixe solto no workspace e chame-a com "Executar função".' },
  { type: 'chamar_funcao', colour: 270, message0: 'Executar função %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }], previousStatement: null, nextStatement: null, tooltip: 'Chama e executa uma função definida no workspace.' },

  // ── SERVO MOTOR ────────────────────────────────────────────────────────────
  { type: 'servo_configurar', colour: 170, message0: 'Conectar servo no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, tooltip: 'Inicializa o servo motor. Coloque dentro de PREPARAR.' },
  { type: 'servo_mover', colour: 170, message0: 'Mover servo (pino %1) para %2 °', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'input_value', name: 'ANGULO' }], inputsInline: true, previousStatement: null, nextStatement: null, tooltip: 'Move o servo para um ângulo de 0 a 180 graus.' },
  { type: 'servo_ler', colour: 170, message0: 'Posição atual do servo (pino %1)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: null, tooltip: 'Retorna o ângulo atual do servo (0 a 180).' },

  // ── BUZZER / SOM ───────────────────────────────────────────────────────────
  { type: 'buzzer_tocar', colour: 50, message0: '🔊 Tocar som: pino %1 frequência %2 Hz', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31, max: 65535 }], previousStatement: null, nextStatement: null, tooltip: 'Toca um som contínuo no buzzer/piezo. Use "Parar som" para encerrar.' },
  { type: 'buzzer_tocar_tempo', colour: 50, message0: '🔊 Tocar som: pino %1 frequência %2 Hz por %3 ms', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31 }, { type: 'field_number', name: 'DUR', value: 500, min: 1 }], previousStatement: null, nextStatement: null, tooltip: 'Toca um som por um tempo determinado (em milissegundos).' },
  { type: 'buzzer_parar', colour: 50, message0: '🔇 Parar som no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, tooltip: 'Para o som do buzzer/piezo naquele pino.' },
];

Blockly.defineBlocksWithJsonArray(customBlocks);

// ─────────────────────────────────────────────────────────────────────────────
// Geradores C++
// ─────────────────────────────────────────────────────────────────────────────

// Estrutura
cppGenerator.forBlock['bloco_setup'] = (b: Blockly.Block) => `void setup() {\n  Serial.begin(9600);\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas configurações entrarão aqui...\n'}}\n\n`;
cppGenerator.forBlock['bloco_loop'] = (b: Blockly.Block) => `void loop() {\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`;

// Pinos
cppGenerator.forBlock['configurar_pino'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, ${b.getFieldValue('MODE')});\n`;
cppGenerator.forBlock['escrever_pino'] = (b: Blockly.Block) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`;
cppGenerator.forBlock['ler_pino_digital'] = (b: Blockly.Block) => [`digitalRead(${b.getFieldValue('PIN')})`, 0];
cppGenerator.forBlock['escrever_pino_pwm'] = (b: Blockly.Block) => `  analogWrite(${b.getFieldValue('PIN')}, ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;
cppGenerator.forBlock['ler_pino_analogico'] = (b: Blockly.Block) => [`analogRead(${b.getFieldValue('PIN')})`, 0];

// Controle básico
cppGenerator.forBlock['esperar'] = (b: Blockly.Block) => `  delay(${b.getFieldValue('TIME')});\n`;
cppGenerator.forBlock['repetir_vezes'] = (b: Blockly.Block) => `  for (int i = 0; i < ${b.getFieldValue('TIMES')}; i++) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;

// Condições
cppGenerator.forBlock['se_entao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  }\n`;
cppGenerator.forBlock['se_entao_senao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  } else {\n${cppGenerator.statementToCode(b, 'SENAO') || ''}  }\n`;
cppGenerator.forBlock['comparar_valores'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || '0'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || '0'})`, 0];
cppGenerator.forBlock['numero_fixo'] = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];
cppGenerator.forBlock['e_ou_logico'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || 'false'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || 'false'})`, 0];
cppGenerator.forBlock['nao_logico'] = (b: Blockly.Block) => [`!(${cppGenerator.valueToCode(b, 'VALOR', 0) || 'false'})`, 0];
cppGenerator.forBlock['mapear_valor'] = (b: Blockly.Block) => [`map(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}, ${b.getFieldValue('DE_MIN')}, ${b.getFieldValue('DE_MAX')}, ${b.getFieldValue('PARA_MIN')}, ${b.getFieldValue('PARA_MAX')})`, 0];

// Ultrassônico
cppGenerator.forBlock['configurar_ultrassonico'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('TRIG')}, OUTPUT);\n  pinMode(${b.getFieldValue('ECHO')}, INPUT);\n`;
cppGenerator.forBlock['ler_distancia_cm'] = (b: Blockly.Block) => [`_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')})`, 0];
cppGenerator.forBlock['mostrar_distancia'] = (b: Blockly.Block) => `  Serial.println(_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}));\n`;
cppGenerator.forBlock['objeto_esta_perto'] = (b: Blockly.Block) => [`(_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}) < ${b.getFieldValue('CM')})`, 0];
cppGenerator.forBlock['distancia_entre'] = (b: Blockly.Block) => [`_distanciaEntre(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}, ${b.getFieldValue('MIN')}.0f, ${b.getFieldValue('MAX')}.0f)`, 0];

// Comunicação
cppGenerator.forBlock['escrever_serial'] = (b: Blockly.Block) => `  Serial.println("${b.getFieldValue('TEXT')}");\n`;
cppGenerator.forBlock['escrever_serial_valor'] = (b: Blockly.Block) => `  Serial.println(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;

// Controle avançado
cppGenerator.forBlock['enquanto_verdadeiro'] = (b: Blockly.Block) =>
  `  while (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
cppGenerator.forBlock['parar_repeticao'] = (_b: Blockly.Block) => `  break;\n`;

// Matemática
cppGenerator.forBlock['operacao_matematica'] = (b: Blockly.Block) => {
  const a = cppGenerator.valueToCode(b, 'A', 99) || '0';
  const op = b.getFieldValue('OP');
  const bv = cppGenerator.valueToCode(b, 'B', 99) || '0';
  return [`(${a} ${op} ${bv})`, 0];
};
cppGenerator.forBlock['valor_absoluto'] = (b: Blockly.Block) =>
  [`abs(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'})`, 0];
cppGenerator.forBlock['constrain_valor'] = (b: Blockly.Block) =>
  [`constrain(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}, ${b.getFieldValue('MIN')}, ${b.getFieldValue('MAX')})`, 0];
cppGenerator.forBlock['random_valor'] = (b: Blockly.Block) =>
  [`random(${b.getFieldValue('MIN')}, ${b.getFieldValue('MAX')})`, 0];
cppGenerator.forBlock['millis_atual'] = (_b: Blockly.Block) => [`millis()`, 0];

// Variáveis
cppGenerator.forBlock['declarar_variavel_global'] = (b: Blockly.Block) => {
  const tipo = b.getFieldValue('TIPO');
  const nome = (b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_');
  const valor = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
  return `${tipo} ${nome} = ${valor};\n`;
};
cppGenerator.forBlock['atribuir_variavel'] = (b: Blockly.Block) => {
  const nome = (b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_');
  const valor = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
  return `  ${nome} = ${valor};\n`;
};
cppGenerator.forBlock['ler_variavel'] = (b: Blockly.Block) =>
  [(b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_'), 0];
cppGenerator.forBlock['incrementar_variavel'] = (b: Blockly.Block) => {
  const nome = (b.getFieldValue('NOME') || 'contador').replace(/\s+/g, '_');
  const valor = cppGenerator.valueToCode(b, 'VALOR', 99) || '1';
  return `  ${nome} += ${valor};\n`;
};

// Funções
cppGenerator.forBlock['definir_funcao'] = (b: Blockly.Block) => {
  const nome = (b.getFieldValue('NOME') || 'minhaFuncao').replace(/\s+/g, '_');
  const corpo = cppGenerator.statementToCode(b, 'DO') || '';
  return `void ${nome}() {\n${corpo}}\n\n`;
};
cppGenerator.forBlock['chamar_funcao'] = (b: Blockly.Block) => {
  const nome = (b.getFieldValue('NOME') || 'minhaFuncao').replace(/\s+/g, '_');
  return `  ${nome}();\n`;
};

// Servo
cppGenerator.forBlock['servo_configurar'] = (b: Blockly.Block) => {
  const pin = b.getFieldValue('PIN');
  return `  _servoObj_${pin}.attach(${pin});\n`;
};
cppGenerator.forBlock['servo_mover'] = (b: Blockly.Block) => {
  const pin = b.getFieldValue('PIN');
  const ang = cppGenerator.valueToCode(b, 'ANGULO', 99) || '90';
  return `  _servoObj_${pin}.write(${ang});\n`;
};
cppGenerator.forBlock['servo_ler'] = (b: Blockly.Block) => {
  const pin = b.getFieldValue('PIN');
  return [`_servoObj_${pin}.read()`, 0];
};

// Buzzer
cppGenerator.forBlock['buzzer_tocar'] = (b: Blockly.Block) =>
  `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')});\n`;
cppGenerator.forBlock['buzzer_tocar_tempo'] = (b: Blockly.Block) =>
  `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')}, ${b.getFieldValue('DUR')});\n`;
cppGenerator.forBlock['buzzer_parar'] = (b: Blockly.Block) =>
  `  noTone(${b.getFieldValue('PIN')});\n`;

// ─────────────────────────────────────────────────────────────────────────────
// generateCode — ordena corretamente: includes → globais → funções → setup → loop
// ─────────────────────────────────────────────────────────────────────────────

const generateCode = (ws: Blockly.WorkspaceSvg): string => {
  const topBlocks = ws.getTopBlocks(true);

  const globalVarLines: string[] = [];
  const funcDefLines: string[] = [];
  let setupCode = '';
  let loopCode = '';

  for (const block of topBlocks) {
    if (block.type === 'bloco_setup') {
      setupCode = cppGenerator.blockToCode(block) as string;
    } else if (block.type === 'bloco_loop') {
      loopCode = cppGenerator.blockToCode(block) as string;
    } else if (block.type === 'declarar_variavel_global') {
      globalVarLines.push(cppGenerator.blockToCode(block) as string);
    } else if (block.type === 'definir_funcao') {
      funcDefLines.push(cppGenerator.blockToCode(block) as string);
    }
  }

  const mainCode = [
    ...globalVarLines,
    globalVarLines.length > 0 ? '\n' : '',
    ...funcDefLines,
    setupCode || 'void setup() {\n  Serial.begin(9600);\n  // Suas configurações entrarão aqui...\n}\n\n',
    loopCode || 'void loop() {\n  // Suas ações principais entrarão aqui...\n}\n\n',
  ].filter(Boolean).join('');

  // ── Servo: detecta pinos usados e injeta #include + objetos globais ────────
  const needsServo = mainCode.includes('_servoObj_');
  let servoHeader = '';
  if (needsServo) {
    const pins = new Set<string>();
    const re = /_servoObj_(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(mainCode)) !== null) pins.add(m[1]);
    servoHeader =
      '#include <Servo.h>\n' +
      [...pins].map(p => `Servo _servoObj_${p};`).join('\n') +
      '\n\n';
  }

  // ── Ultrassônico: injeta helpers ──────────────────────────────────────────
  const needsEntre   = mainCode.includes('_distanciaEntre(');
  const needsUltrass = mainCode.includes('_lerDistancia(') || needsEntre;
  let helperLer   = '';
  let helperEntre = '';
  if (needsUltrass) {
    helperLer =
      'float _lerDistancia(int trig, int echo) {\n' +
      '  digitalWrite(trig, LOW);\n  delayMicroseconds(2);\n' +
      '  digitalWrite(trig, HIGH);\n  delayMicroseconds(10);\n' +
      '  digitalWrite(trig, LOW);\n' +
      '  long dur = pulseIn(echo, HIGH, 38000);\n' +
      '  return dur > 0 ? dur * 0.034f / 2.0f : 0.0f;\n}\n';
    if (needsEntre) {
      helperEntre =
        '\nbool _distanciaEntre(int trig, int echo, float minCm, float maxCm) {\n' +
        '  float d = _lerDistancia(trig, echo);\n' +
        '  return d > 0.0f && d >= minCm && d < maxCm;\n}\n';
    }
  }

  const prefix = servoHeader + helperLer + helperEntre + (needsUltrass ? '\n' : '');
  return prefix + mainCode;
};

// ─────────────────────────────────────────────────────────────────────────────
// Toolbox
// ─────────────────────────────────────────────────────────────────────────────

const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Pinos', colour: '230',
      contents: [
        { kind: 'block', type: 'configurar_pino' },
        { kind: 'block', type: 'escrever_pino' },
        { kind: 'block', type: 'ler_pino_digital' },
        { kind: 'block', type: 'escrever_pino_pwm', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 128 } } } } },
        { kind: 'block', type: 'ler_pino_analogico' },
      ],
    },
    {
      kind: 'category', name: 'Controle', colour: '120',
      contents: [
        { kind: 'block', type: 'esperar' },
        { kind: 'block', type: 'repetir_vezes' },
        { kind: 'block', type: 'enquanto_verdadeiro' },
        { kind: 'block', type: 'parar_repeticao' },
      ],
    },
    {
      kind: 'category', name: 'Condições', colour: '210',
      contents: [
        { kind: 'block', type: 'se_entao' },
        { kind: 'block', type: 'se_entao_senao' },
        { kind: 'block', type: 'comparar_valores', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } } } },
        { kind: 'block', type: 'numero_fixo' },
        { kind: 'block', type: 'e_ou_logico' },
        { kind: 'block', type: 'nao_logico' },
        { kind: 'block', type: 'mapear_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 512 } } } } },
      ],
    },
    {
      kind: 'category', name: 'Matemática', colour: '200',
      contents: [
        { kind: 'block', type: 'operacao_matematica', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'valor_absoluto', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'constrain_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'random_valor' },
        { kind: 'block', type: 'millis_atual' },
      ],
    },
    {
      kind: 'category', name: 'Variáveis', colour: '330',
      contents: [
        { kind: 'block', type: 'declarar_variavel_global', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'atribuir_variavel', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'ler_variavel' },
        { kind: 'block', type: 'incrementar_variavel', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 1 } } } } },
      ],
    },
    {
      kind: 'category', name: 'Funções', colour: '270',
      contents: [
        { kind: 'block', type: 'definir_funcao' },
        { kind: 'block', type: 'chamar_funcao' },
      ],
    },
    {
      kind: 'category', name: 'Ultrassônico', colour: '40',
      contents: [
        { kind: 'block', type: 'configurar_ultrassonico' },
        { kind: 'block', type: 'ler_distancia_cm' },
        { kind: 'block', type: 'mostrar_distancia' },
        { kind: 'block', type: 'objeto_esta_perto' },
        { kind: 'block', type: 'distancia_entre' },
      ],
    },
    {
      kind: 'category', name: 'Servo', colour: '170',
      contents: [
        { kind: 'block', type: 'servo_configurar' },
        { kind: 'block', type: 'servo_mover', inputs: { ANGULO: { block: { type: 'numero_fixo', fields: { VALOR: 90 } } } } },
        { kind: 'block', type: 'servo_ler' },
      ],
    },
    {
      kind: 'category', name: 'Buzzer', colour: '50',
      contents: [
        { kind: 'block', type: 'buzzer_tocar' },
        { kind: 'block', type: 'buzzer_tocar_tempo' },
        { kind: 'block', type: 'buzzer_parar' },
      ],
    },
    {
      kind: 'category', name: 'Comunicação', colour: '160',
      contents: [
        { kind: 'block', type: 'escrever_serial' },
        { kind: 'block', type: 'escrever_serial_valor' },
      ],
    },
  ],
};

const BLOCK_NAMES: Record<string, string> = {
  // Pinos
  configurar_pino: 'Configurar Pino',
  escrever_pino: 'Ligar/Desligar Pino',
  ler_pino_digital: 'Ler Pino Digital',
  escrever_pino_pwm: 'Intensidade (PWM)',
  ler_pino_analogico: 'Ler Sensor Analógico',
  // Controle
  esperar: 'Esperar',
  repetir_vezes: 'Repetir Vezes',
  enquanto_verdadeiro: 'Enquanto... Fizer',
  parar_repeticao: 'Parar de Repetir',
  // Condições
  se_entao: 'Se... Então',
  se_entao_senao: 'Se... Então... Senão',
  comparar_valores: 'Comparar Valores',
  numero_fixo: 'Número',
  e_ou_logico: 'E / Ou',
  nao_logico: 'NÃO',
  mapear_valor: 'Converter Valor',
  // Matemática
  operacao_matematica: 'Operação Matemática',
  valor_absoluto: 'Valor Absoluto',
  constrain_valor: 'Limitar Valor',
  random_valor: 'Número Aleatório',
  millis_atual: 'Tempo Ligado (ms)',
  // Variáveis
  declarar_variavel_global: 'Variável Global',
  atribuir_variavel: 'Guardar em Variável',
  ler_variavel: 'Ler Variável',
  incrementar_variavel: 'Aumentar Variável',
  // Funções
  definir_funcao: 'Definir Função',
  chamar_funcao: 'Executar Função',
  // Ultrassônico
  configurar_ultrassonico: 'Configurar Sensor HC-SR04',
  ler_distancia_cm: 'Ler Distância (cm)',
  mostrar_distancia: 'Mostrar Distância',
  objeto_esta_perto: 'Objeto Está Perto?',
  distancia_entre: 'Distância Entre... e...?',
  // Servo
  servo_configurar: 'Conectar Servo',
  servo_mover: 'Mover Servo',
  servo_ler: 'Posição do Servo',
  // Buzzer
  buzzer_tocar: 'Tocar Som',
  buzzer_tocar_tempo: 'Tocar Som por Tempo',
  buzzer_parar: 'Parar Som',
  // Comunicação
  escrever_serial: 'O Robô Diz (texto)',
  escrever_serial_valor: 'O Robô Diz (valor)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Erros amigáveis
// ─────────────────────────────────────────────────────────────────────────────

type FriendlyError = { emoji: string; title: string; message: string; tip: string; rawError: string };

function getFriendlyError(raw: string): FriendlyError {
  const e = raw.toLowerCase();
  const base = { rawError: raw };
  if (e.includes('falha ao baixar') || e.includes('curl') || e.includes('plano b')) return { ...base, emoji: '🌐', title: 'Problema na Internet!', message: 'Não consegui baixar as ferramentas necessárias.', tip: 'Dica: Verifique a conexão com a internet e tente novamente.' };
  if (e.includes('update-index') || e.includes('erro ao instalar core')) return { ...base, emoji: '📦', title: 'Faltam os pacotes da placa!', message: 'O computador precisa baixar informações da placa, mas a internet falhou.', tip: 'Dica: Verifique a conexão. Essa etapa só acontece uma vez!' };
  if (e.includes('esp32') || e.includes('espressif')) return { ...base, emoji: '🛠️', title: 'Erro ao configurar a placa ESP32!', message: 'Ocorreu um problema ao adicionar as configurações da placa ESP32.', tip: 'Dica: Chame o professor!' };
  if (e.includes('busy') || e.includes('acesso negado') || e.includes('permission denied')) return { ...base, emoji: '🚧', title: 'A porta USB está ocupada!', message: 'Outro programa está usando esta porta.', tip: 'Dica: Feche o Monitor clicando em "🛑 Parar" ou reconecte o cabo USB!' };
  if (e.includes('could not open port') || e.includes('não foi possível abrir') || e.includes('no such file')) return { ...base, emoji: '🔌', title: 'Cabo USB não encontrado!', message: 'O computador não conseguiu encontrar o Arduino.', tip: 'Dica: Verifique o cabo USB e clique em 🔄 para atualizar as portas!' };
  if (e.includes('erro no código') || e.includes('error:') || e.includes('syntax error')) return { ...base, emoji: '🧩', title: 'Hmm… algo está errado nas peças!', message: 'O código gerado pelos blocos tem um probleminha.', tip: 'Dica: Tente remover a última peça que você colocou e montar de novo.' };
  if (e.includes('avrdude') || e.includes('not in sync')) return { ...base, emoji: '😵', title: 'Não consegui falar com o Arduino!', message: 'A placa não respondeu.', tip: 'Dica: Verifique se você escolheu a placa certa!' };
  if (e.includes('timeout') || e.includes('timed out')) return { ...base, emoji: '⏰', title: 'Demorou demais…', message: 'O Arduino não respondeu a tempo.', tip: 'Dica: Desconecte e reconecte o cabo USB e tente novamente!' };
  return { ...base, emoji: '😕', title: 'Algo deu errado por aqui...', message: 'Ocorreu um erro inesperado.', tip: 'Dica: Tente de novo. Se continuar, chame o professor!' };
}

type UploadStage = 'validating' | 'compiling' | 'sending' | 'success';

const UPLOAD_STAGES: { id: UploadStage; label: string; emoji: string; tip: string }[] = [
  { id: 'validating', label: 'Verificando as peças…',  emoji: '🔍', tip: 'Checando se tudo está no lugar certo!' },
  { id: 'compiling',  label: 'Compilando o código…',   emoji: '⚙️', tip: 'Transformando os blocos em linguagem de robô!' },
  { id: 'sending',    label: 'Enviando para o robô…',  emoji: '📡', tip: 'O código está viajando pelo cabo USB agora!' },
  { id: 'success',    label: 'Robô pronto para agir!', emoji: '🤖', tip: 'Seu robô já está executando as instruções!' },
];

// ─────────────────────────────────────────────────────────────────────────────
// BoardSelectionModal
// ─────────────────────────────────────────────────────────────────────────────

interface BoardSelectionModalProps { onSelect: (board: BoardKey) => void; }

function BoardSelectionModal({ onSelect }: BoardSelectionModalProps) {
  const [hovered, setHovered] = useState<BoardKey | null>(null);
  const boards: { key: BoardKey; title: string; color: string; img: string }[] = [
    { key: 'uno',   title: 'Arduino Uno',  color: '#0984e3', img: arduinoUno },
    { key: 'nano',  title: 'Arduino Nano', color: '#ff00d0', img: arduinoNano },
    { key: 'esp32', title: 'ESP32 DevKit', color: '#e17055', img: esp32DevkitV1 },
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 999999 }}>
      <div style={{ background: '#fff', borderRadius: 32, padding: '44px 40px 36px', maxWidth: 680, width: '95%', boxShadow: '0 30px 80px rgba(0,0,0,0.25)', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)', borderTop: '6px solid #00a8ff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
        <div>
          <h2 style={{ color: '#2f3542', fontSize: '1.7rem', fontWeight: 900, marginBottom: 8 }}>Qual placa vamos usar?</h2>
          <p style={{ color: '#7f8c8d', fontSize: '1rem', fontWeight: 700, lineHeight: 1.5 }}>
            Escolha antes de começar. Os pinos disponíveis vão mudar dependendo da placa.
            <br /><strong style={{ color: '#e17055' }}>Essa escolha não pode ser alterada depois de salvar.</strong>
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 16, width: '100%', justifyContent: 'center' }}>
          {boards.map(({ key, title, color, img }) => (
            <button key={key} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)} onClick={() => onSelect(key)}
              style={{ background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '18px 16px 14px', borderRadius: 20, cursor: 'pointer', boxShadow: hovered === key ? `0 8px 24px ${color}44` : '0 2px 8px rgba(0,0,0,0.06)', transform: hovered === key ? 'translateY(-4px) scale(1.03)' : 'none', transition: 'all 0.18s ease', flex: 1, minWidth: 0, outline: 'none' }}>
              <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.25s ease', transform: hovered === key ? 'scale(1.06)' : 'scale(1)' }} />
              </div>
              <span style={{ color: hovered === key ? color : '#2f3542', fontWeight: 900, fontSize: '1rem', transition: 'color 0.18s ease', lineHeight: 1.2 }}>{title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BoardBadge
// ─────────────────────────────────────────────────────────────────────────────

function BoardBadge({ boardKey }: { boardKey: BoardKey }) {
  const colorMap: Record<BoardKey, string> = { uno: '#0984e3', nano: '#ff00d0', esp32: '#e17055' };
  const color = colorMap[boardKey];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: `${color}15`, border: `2px solid ${color}55`, borderRadius: 100, padding: '4px 14px 4px 10px', fontWeight: 900, fontSize: '0.9rem', color, userSelect: 'none' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
      {BOARDS[boardKey].name}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IdeScreen
// ─────────────────────────────────────────────────────────────────────────────

interface IdeScreenProps {
  role: 'student' | 'teacher' | 'visitor';
  readOnly?: boolean;
  onBack: () => void;
  projectId?: string;
}

type BoardLoadState = 'resolving' | 'selecting' | 'ready' | 'error';

// Blocos de nível superior que ficam soltos no workspace (não são órfãos)
const TOP_LEVEL_BLOCK_TYPES = new Set([
  'bloco_setup',
  'bloco_loop',
  'declarar_variavel_global',
  'definir_funcao',
]);

export function IdeScreen({ role, readOnly = false, onBack, projectId }: IdeScreenProps) {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspace  = useRef<Blockly.WorkspaceSvg | null>(null);

  const [board, setBoard]                   = useState<BoardKey | null>(null);
  const [boardLoadState, setBoardLoadState] = useState<BoardLoadState>(
    projectId ? 'resolving' : 'selecting'
  );

  const pendingWorkspaceData = useRef<unknown>(null);

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

  const bloquinTheme = Blockly.Theme.defineTheme('bloquinTheme', {
    name: 'bloquinTheme', base: Blockly.Themes.Classic,
    blockStyles: { colour_blocks: { colourPrimary: '#ef9f4b', colourSecondary: '#d4891f', colourTertiary: '#b87219' }, list_blocks: { colourPrimary: '#4cd137', colourSecondary: '#3bac29', colourTertiary: '#2e8a1f' }, logic_blocks: { colourPrimary: '#6c5ce7', colourSecondary: '#5a4ed4', colourTertiary: '#473dbf' }, loop_blocks: { colourPrimary: '#00b894', colourSecondary: '#00a381', colourTertiary: '#008068' }, math_blocks: { colourPrimary: '#0984e3', colourSecondary: '#0773c9', colourTertiary: '#0562af' }, procedure_blocks: { colourPrimary: '#fd79a8', colourSecondary: '#e46d96', colourTertiary: '#cc6284' }, text_blocks: { colourPrimary: '#fdcb6e', colourSecondary: '#e4b55b', colourTertiary: '#cb9e48' }, variable_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' }, variable_dynamic_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' }, hat_blocks: { colourPrimary: '#a29bfe', colourSecondary: '#9085e3', colourTertiary: '#7e71c8' } },
    componentStyles: { workspaceBackgroundColour: '#eef2f7', toolboxBackgroundColour: '#1a2035', toolboxForegroundColour: '#ffffff', flyoutBackgroundColour: '#242c42', flyoutForegroundColour: '#ffffff', flyoutOpacity: 0.98, scrollbarColour: '#00a8ff', scrollbarOpacity: 0.5, insertionMarkerColour: '#00a8ff', insertionMarkerOpacity: 0.6, markerColour: '#ffffff', cursorColour: '#d0d0d0' },
  });

  const fetchPorts = async () => {
    try {
      const ports = await invoke<string[]>('get_available_ports');
      setAvailablePorts(ports);
      if (ports.length > 0 && !ports.includes(port)) setPort(ports[0]);
    } catch (err) { console.error('Erro ao buscar portas:', err); }
  };

  const getOrphanedBlocks = (): string[] => {
    if (!workspace.current) return [];
    return workspace.current.getTopBlocks(false)
      .filter(b => !TOP_LEVEL_BLOCK_TYPES.has(b.type))
      .map(b => BLOCK_NAMES[b.type] ?? b.type);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ── FASE 1: Resolução da placa ──────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('projetos')
        .select('nome, target_board, workspace_data')
        .eq('id', projectId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setBoardLoadState('selecting');
        return;
      }

      setProjectName(data.nome);
      pendingWorkspaceData.current = data.workspace_data ?? null;

      const raw = data.target_board as string | null | undefined;

      if (!raw || raw === BOARD_UNSET) {
        setBoardLoadState('selecting');
        return;
      }

      if (raw in BOARDS) {
        const key = raw as BoardKey;
        syncBoardPins(key);
        setBoard(key);
        setBoardLoadState('ready');
      } else {
        setBoardLoadState('error');
        setFriendlyError({
          emoji: '⚠️',
          title: 'Placa desconhecida no projeto!',
          message: `O projeto foi salvo com a placa "${raw}", que não é reconhecida pelo sistema.`,
          tip: 'Contate o suporte ou o professor. O projeto não foi carregado.',
          rawError: `target_board="${raw}" não existe em BOARDS.`,
        });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleBoardSelected = async (selected: BoardKey) => {
    syncBoardPins(selected);
    setBoard(selected);

    if (projectId) {
      await supabase
        .from('projetos')
        .update({ target_board: selected })
        .eq('id', projectId);
    }

    setBoardLoadState('ready');
  };

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { fetchPorts(); }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<string>('upload-result', (event) => {
        if (event.payload === 'ok') { setUploadStage('success'); }
        else if (event.payload.startsWith('err:')) { setUploadStage(null); setFriendlyError(getFriendlyError(event.payload.slice(4))); }
        isUploadingRef.current = false;
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ── FASE 2: Inicialização do Blockly ────────────────────────────────────────

  useEffect(() => {
    if (boardLoadState !== 'ready' || !blocklyDiv.current || workspace.current) return;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: toolboxConfig,
      grid: { spacing: 24, length: 4, colour: '#d8e0ec', snap: true },
      readOnly,
      move: { scrollbars: true, drag: true, wheel: true },
      theme: bloquinTheme,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      trashcan: true,
      sounds: false,
    });

    workspace.current.addChangeListener((event) => {
      if (event.isUiEvent) return;
      try { setGeneratedCode(generateCode(workspace.current!) || '// Arraste blocos para dentro de PREPARAR e AGIR!'); }
      catch (e) { console.error('Erro ao gerar código:', e); }
    });

    const ensureRootBlocks = () => {
      if (!workspace.current) return;
      let s = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_setup');
      if (!s) { s = workspace.current.newBlock('bloco_setup'); s.moveBy(50, 50); s.initSvg(); s.render(); }
      s.setDeletable(false);
      let l = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_loop');
      if (!l) { l = workspace.current.newBlock('bloco_loop'); l.moveBy(450, 50); l.initSvg(); l.render(); }
      l.setDeletable(false);
    };

    const savedData = pendingWorkspaceData.current;
    if (savedData) {
      try {
        const raw = typeof savedData === 'string' ? JSON.parse(LZString.decompressFromBase64(savedData) || '{}') : savedData;
        if (raw && Object.keys(raw).length > 0) Blockly.serialization.workspaces.load(raw, workspace.current);
      } catch (_) { /* workspace corrompido — começa vazio */ }
    }

    ensureRootBlocks();

    return () => { if (workspace.current) { workspace.current.dispose(); workspace.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardLoadState]);

  useEffect(() => { if (workspace.current) Blockly.svgResize(workspace.current); }, [role, isCodeVisible, isFullscreenCode, boardLoadState]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [serialMessages, isSerialOpen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<string>('serial-message', (e) => {
        setSerialMessages(prev => { const next = [...prev, e.payload]; return next.length > 50 ? next.slice(next.length - 50) : next; });
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggleSerial = async () => {
    try {
      if (isSerialOpen) { await invoke('stop_serial'); setIsSerialOpen(false); }
      else { setSerialMessages([]); await invoke('start_serial', { porta: port }); setIsSerialOpen(true); }
    } catch (error) { setFriendlyError(getFriendlyError(String(error))); }
  };

  const handleSaveProject = async () => {
    if (!projectId || !workspace.current || !board) return;
    setIsSaving(true);
    const { error } = await supabase.from('projetos').update({
      workspace_data: LZString.compressToBase64(JSON.stringify(Blockly.serialization.workspaces.save(workspace.current))),
      target_board: board,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);
    setIsSaving(false);
    if (!error) { setSaveStatus('success'); }
    else { setFriendlyError({ emoji: '☁️', title: 'Não consegui salvar!', message: error.message, tip: 'Verifique sua conexão com a internet e tente de novo.', rawError: error.message }); }
  };

  const handleUploadCode = async (ignoreOrphans = false) => {
    if (isUploadingRef.current || !board) return;
    if (!ignoreOrphans) { const orphans = getOrphanedBlocks(); if (orphans.length > 0) { setOrphanWarning(orphans); return; } }
    if (!generatedCode.includes('void setup()') || !generatedCode.includes('void loop()')) {
      setFriendlyError({ emoji: '🧩', title: 'Faltam peças importantes!', message: 'Os blocos PREPARAR e AGIR são obrigatórios para o robô funcionar.', tip: 'Dica: Mexa em uma peça e tente de novo para atualizar o código!', rawError: 'Missing setup() or loop().' }); return;
    }
    if (isSerialOpen) { await invoke('stop_serial').catch(() => {}); setIsSerialOpen(false); }
    isUploadingRef.current = true;
    setUploadStage('validating');
    await delay(700);
    if (!isUploadingRef.current) return;
    setUploadStage('compiling');
    invoke('upload_code', { codigo: generatedCode, placa: board, porta: port })
      .catch((e) => { setUploadStage(null); setFriendlyError(getFriendlyError(String(e))); isUploadingRef.current = false; });
    await delay(2500);
    if (!isUploadingRef.current) return;
    setUploadStage('sending');
  };

  const handleCloseError = () => { setFriendlyError(null); setShowTechDetails(false); };

  const projectTitle = projectId
    ? readOnly ? `Inspecionando: ${projectName}` : `Meu Projeto: ${projectName}`
    : '';
  const stageIndex = uploadStage ? UPLOAD_STAGES.findIndex(s => s.id === uploadStage) : -1;
  const currentStageData = uploadStage ? UPLOAD_STAGES.find(s => s.id === uploadStage) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">

      {boardLoadState === 'selecting' && <BoardSelectionModal onSelect={handleBoardSelected} />}

      {boardLoadState === 'resolving' && (
        <div className="modal-overlay" style={{ zIndex: 999998 }}>
          <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, opacity: 0.85 }}>Carregando projeto…</div>
        </div>
      )}

      {readOnly && (
        <div className="readonly-banner">
          <span>Modo Visualização</span>
          <span>Você está vendo o projeto de um aluno. Edição desativada.</span>
        </div>
      )}

      {/* TOPBAR */}
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
          <img src={logoSimples} alt="bloquin" style={{ height: '34px' }} />
          {projectTitle && (
            <div className="project-title-badge">
              {readOnly && <span className="read-only-dot" />}
              <span>{projectTitle}</span>
            </div>
          )}
        </div>

        <div className="hardware-controls" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {boardLoadState === 'ready' && board && <BoardBadge boardKey={board} />}
          <div className="control-divider" />
          <div className="control-group">
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {availablePorts.length === 0 ? <option value="">Selecione uma placa</option> : availablePorts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={fetchPorts} className="btn-icon" title="Atualizar porta"> ↻ </button>
          </div>
          <div className="control-divider" />
          {!readOnly && (
            <>
              <button onClick={() => handleUploadCode()} className="btn-action btn-send" disabled={isUploadingRef.current || boardLoadState !== 'ready'}>Enviar</button>
              <button className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`} onClick={handleToggleSerial}>{isSerialOpen ? '🛑 Parar' : 'Chat'}</button>
            </>
          )}
          {readOnly && (
            <button className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`} onClick={handleToggleSerial}>{isSerialOpen ? '🛑 Parar' : '💬 Monitorar'}</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {role !== 'student' && <button className="btn-secondary topbar-btn" onClick={() => setIsCodeVisible(!isCodeVisible)}>{isCodeVisible ? '🙈 Ocultar Código' : 'Ver Código'}</button>}
          {(role === 'student' || (role === 'teacher' && !readOnly)) && projectId && <button className="btn-primary topbar-btn" onClick={handleSaveProject} disabled={isSaving}>{isSaving ? '⏳ Salvando…' : '💾 Salvar'}</button>}
          <button className="btn-danger topbar-btn" onClick={onBack}>Sair</button>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Código C++</h3>
              <button onClick={() => setIsFullscreenCode(!isFullscreenCode)} style={{ background: 'transparent', border: '1px solid #485460', color: '#a4b0be', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', margin: 0, boxShadow: 'none' }}>{isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}</button>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* MODAL: UPLOAD */}
      {uploadStage && (
        <div className="modal-overlay"><div className="upload-modal">
          {uploadStage === 'success' ? (
            <div className="upload-success-content">
              <div className="success-robot">🤖</div>
              <h2>Robô pronto!</h2>
              <p>O seu robô já está executando as novas instruções. Ele aprendeu tudo que você ensinou!</p>
              <button className="btn-primary upload-close-btn" onClick={() => setUploadStage(null)}>🎉 Continuar programando!</button>
            </div>
          ) : (
            <>
              <div className="upload-rocket-wrap"><span>{currentStageData?.emoji}</span></div>
              <h2 className="upload-stage-label">{currentStageData?.label}</h2>
              <p className="upload-stage-tip">{currentStageData?.tip}</p>
              <div className="upload-progress-bar-track"><div className="upload-progress-bar-fill" style={{ width: `${((stageIndex + 1) / (UPLOAD_STAGES.length - 1)) * 100}%` }} /></div>
              <div className="upload-steps">
                {UPLOAD_STAGES.filter(s => s.id !== 'success').map((s, i) => (
                  <div key={s.id} className={`upload-step ${i <= stageIndex ? 'active' : ''} ${i === stageIndex ? 'current' : ''}`}>
                    <div className="upload-step-dot" />
                    <span className="upload-step-label">{s.label.replace('…', '').replace(' o código', '').replace(' as peças', '').replace(' para o robô', '')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div></div>
      )}

      {/* MODAL: BLOCOS ÓRFÃOS */}
      {orphanWarning.length > 0 && (
        <div className="modal-overlay"><div className="orphan-modal">
          <div className="orphan-icon">🧩</div>
          <h2>Tem peças soltas!</h2>
          <p>As peças abaixo estão flutuando no espaço. Para o robô executar, <strong>todas as peças precisam estar dentro de PREPARAR ou AGIR</strong> (ou dentro de uma Função).</p>
          <div className="orphan-blocks-list">{[...new Set(orphanWarning)].map((name, i) => <div key={i} className="orphan-block-chip"><span>🔷</span> {name}</div>)}</div>
          <div className="orphan-diagram">
            <div className="orphan-diagram-bad"><span>❌</span><div className="mini-block floating">Peça Solta</div></div>
            <div className="orphan-diagram-arrow">→</div>
            <div className="orphan-diagram-good"><span>✅</span><div className="mini-block-container"><div className="mini-block header">PREPARAR / AGIR</div><div className="mini-block child">Peça encaixada</div></div></div>
          </div>
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setOrphanWarning([])}>Vou corrigir</button>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setOrphanWarning([]); handleUploadCode(true); }}>Enviar assim mesmo</button>
          </div>
        </div></div>
      )}

      {/* MODAL: ERRO */}
      {friendlyError && (
        <div className="modal-overlay"><div className="friendly-error-modal">
          <div className="friendly-error-icon">{friendlyError.emoji}</div>
          <h2>{friendlyError.title}</h2>
          <p className="friendly-error-message">{friendlyError.message}</p>
          <div className="friendly-error-tip"><span>💡</span><span>{friendlyError.tip}</span></div>
          <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleCloseError}>Entendi, vou tentar!</button>
          </div>
          <div style={{ width: '100%', marginTop: '15px' }}>
            <button style={{ fontSize: '0.8rem', padding: '5px 10px', border: 'none', background: 'transparent', textDecoration: 'underline', color: '#636e72', cursor: 'pointer', margin: '0 auto', display: 'block', boxShadow: 'none' }} onClick={() => setShowTechDetails(!showTechDetails)}>{showTechDetails ? 'Ocultar detalhes técnicos' : '🛠️ Ver detalhes técnicos (Professor)'}</button>
            {showTechDetails && <pre style={{ textAlign: 'left', backgroundColor: '#2d3436', color: '#ff7675', padding: '10px', borderRadius: '5px', fontSize: '0.75rem', marginTop: '10px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>{friendlyError.rawError}</pre>}
          </div>
        </div></div>
      )}

      {/* MODAL: SALVO */}
      {saveStatus === 'success' && (
        <div className="modal-overlay"><div className="save-success-modal">
          <div className="save-success-icon">☁️</div>
          <h2>Projeto Salvo!</h2>
          <p>Suas peças e progressos foram guardados com segurança na nuvem. Continue programando!</p>
          <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }} onClick={() => setSaveStatus(null)}>Continuar</button>
        </div></div>
      )}

      {/* MONITOR SERIAL */}
      {isSerialOpen && (
        <div className="serial-monitor">
          <div className="serial-monitor-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div className="serial-status-dot" /><span>Robô conectado</span></div>
            <button className="serial-close-btn" onClick={handleToggleSerial}>✕</button>
          </div>
          <div className="serial-monitor-body">
            {serialMessages.length === 0 ? (
              <div className="serial-empty"><span>📡</span><p>Aguardando o robô falar…</p><small>As mensagens do robô aparecerão aqui!</small></div>
            ) : (
              serialMessages.map((msg, idx) => (
                <div key={idx} className="serial-message">
                  <span className="serial-timestamp">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="serial-text">{msg}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="serial-monitor-footer">
            <button className="serial-clear-btn" onClick={() => setSerialMessages([])}>Limpar</button>
            <span>{serialMessages.length} mensagens</span>
          </div>
        </div>
      )}
    </div>
  );
}