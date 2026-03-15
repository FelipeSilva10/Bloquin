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

cppGenerator.scrub_ = function(block, code, opt_thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = opt_thisOnly ? '' : cppGenerator.blockToCode(nextBlock);
  return code + nextCode;
};

const BOARDS = {
  uno:  { name: 'Arduino Uno',  pins: [['D2','2'],['D3 (PWM)','3'],['D4','4'],['D5 (PWM)','5'],['D6 (PWM)','6'],['D7','7'],['D8','8'],['D9 (PWM)','9'],['D10 (PWM)','10'],['D11 (PWM)','11'],['D12','12'],['D13 (LED Interno)','13']] },
  nano: { name: 'Arduino Nano', pins: [['D2','2'],['D3 (PWM)','3'],['D4','4'],['D5 (PWM)','5'],['D6 (PWM)','6'],['D7','7'],['D8','8'],['D9 (PWM)','9'],['D10 (PWM)','10'],['D11 (PWM)','11'],['D12','12'],['D13 (LED Interno)','13']] },
  esp32: { name: 'ESP32 DevKit V1', pins: [
    // ── Uso geral (entrada e saída) ──────────────────────────────────────
    // Pino 0: strapping pin – afeta o modo de boot, usar com cuidado
    ['GPIO 0  ⚠️ boot',   '0' ],
    ['GPIO 2  (LED)',      '2' ],  // LED interno na maioria dos DevKits
    ['GPIO 4',            '4' ],
    ['GPIO 5  ⚠️ boot',   '5' ],  // strapping: deve estar HIGH no boot
    ['GPIO 12 ⚠️ boot',   '12'],  // strapping: nível afeta tensão de flash
    ['GPIO 13',           '13'],
    ['GPIO 14',           '14'],
    ['GPIO 15 ⚠️ boot',   '15'],  // strapping: controla log de boot
    ['GPIO 16',           '16'],
    ['GPIO 17',           '17'],
    ['GPIO 18',           '18'],
    ['GPIO 19',           '19'],
    ['GPIO 21',           '21'],
    ['GPIO 22',           '22'],
    ['GPIO 23',           '23'],
    ['GPIO 25',           '25'],
    ['GPIO 26',           '26'],
    ['GPIO 27',           '27'],
    ['GPIO 32',           '32'],
    ['GPIO 33',           '33'],
    // ── Somente entrada (sem saída de sinal) ─────────────────────────────
    ['GPIO 34 (só leitura)', '34'],
    ['GPIO 35 (só leitura)', '35'],
    ['GPIO 36 (só leitura)', '36'],
    ['GPIO 39 (só leitura)', '39'],
  ]},
};

let currentBoardPins = BOARDS.nano.pins;

const customBlocks = [
  { "type": "bloco_setup",  "message0": "PREPARAR (Roda 1 vez) %1",     "args0": [{ "type": "input_statement", "name": "DO" }], "colour": 290, "tooltip": "Configurações iniciais.", "helpUrl": "" },
  { "type": "bloco_loop",   "message0": "AGIR (Roda para sempre) %1",   "args0": [{ "type": "input_statement", "name": "DO" }], "colour": 260, "tooltip": "Ações que vão se repetir.", "helpUrl": "" },
  { "type": "configurar_pino", "message0": "Configurar pino %1 como %2",
    "args0": [{ "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins },
              { "type": "field_dropdown", "name": "MODE", "options": [["Saída (Enviar sinal)","OUTPUT"],["Entrada (Ler sensor)","INPUT"]] }],
    "previousStatement": null, "nextStatement": null, "colour": 230 },
  { "type": "escrever_pino", "message0": "Colocar pino %1 em estado %2",
    "args0": [{ "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins },
              { "type": "field_dropdown", "name": "STATE", "options": [["Ligado (HIGH)","HIGH"],["Desligado (LOW)","LOW"]] }],
    "previousStatement": null, "nextStatement": null, "colour": 230 },
  { "type": "esperar", "message0": "Esperar %1 milissegundos", "args0": [{ "type": "field_number", "name": "TIME", "value": 1000, "min": 0 }], "previousStatement": null, "nextStatement": null, "colour": 120 },
  { "type": "repetir_vezes", "message0": "Repetir %1 vezes %2 %3",
    "args0": [{ "type": "field_number", "name": "TIMES", "value": 5, "min": 1 }, { "type": "input_dummy" }, { "type": "input_statement", "name": "DO" }],
    "previousStatement": null, "nextStatement": null, "colour": 120 },
  { "type": "escrever_serial", "message0": "O robô diz o texto: %1", "args0": [{ "type": "field_input", "name": "TEXT", "text": "Olá, mundo!" }], "previousStatement": null, "nextStatement": null, "colour": 160 },
  { "type": "ler_pino_digital", "message0": "Ler pino %1", "args0": [{ "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins }], "output": null, "colour": 230 },
  { "type": "escrever_serial_valor", "message0": "O robô diz a leitura de: %1", "args0": [{ "type": "input_value", "name": "VALOR" }], "previousStatement": null, "nextStatement": null, "colour": 160 },
  { "type": "se_entao", "message0": "SE %1 ENTÃO %2 %3",
    "args0": [{ "type": "input_value", "name": "CONDICAO", "check": "Boolean" }, { "type": "input_dummy" }, { "type": "input_statement", "name": "ENTAO" }],
    "previousStatement": null, "nextStatement": null, "colour": 210 },
  { "type": "se_entao_senao", "message0": "SE %1 ENTÃO %2 %3 SENÃO %4 %5",
    "args0": [{ "type": "input_value", "name": "CONDICAO", "check": "Boolean" }, { "type": "input_dummy" }, { "type": "input_statement", "name": "ENTAO" }, { "type": "input_dummy" }, { "type": "input_statement", "name": "SENAO" }],
    "previousStatement": null, "nextStatement": null, "colour": 210 },
  { "type": "comparar_valores", "message0": "%1 %2 %3",
    "args0": [{ "type": "input_value", "name": "A" },
              { "type": "field_dropdown", "name": "OP", "options": [["é maior que",">"],["é menor que","<"],["é igual a","=="],["é maior ou igual a",">="],["é menor ou igual a","<="],["é diferente de","!="]] },
              { "type": "input_value", "name": "B" }],
    "inputsInline": true, "output": "Boolean", "colour": 210 },
  { "type": "numero_fixo", "message0": "%1", "args0": [{ "type": "field_number", "name": "VALOR", "value": 10 }], "output": null, "colour": 210 },
  { "type": "e_ou_logico", "message0": "%1 %2 %3",
    "args0": [{ "type": "input_value", "name": "A", "check": "Boolean" },
              { "type": "field_dropdown", "name": "OP", "options": [["E (as duas condições)","&&"],["OU (qualquer uma)","||"]] },
              { "type": "input_value", "name": "B", "check": "Boolean" }],
    "inputsInline": true, "output": "Boolean", "colour": 210 },
  { "type": "configurar_ultrassonico", "message0": "Configurar sensor de distância: Gatilho %1 Eco %2",
    "args0": [{ "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins }, { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }],
    "previousStatement": null, "nextStatement": null, "colour": 40 },
  { "type": "ler_distancia_cm", "message0": "Distância em cm (Gatilho %1 Eco %2)",
    "args0": [{ "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins }, { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }],
    "output": null, "colour": 40 },
  { "type": "mostrar_distancia", "message0": "O robô diz a distância em cm (Gatilho %1 Eco %2)",
    "args0": [{ "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins }, { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }],
    "previousStatement": null, "nextStatement": null, "colour": 40 },
  { "type": "objeto_esta_perto", "message0": "Tem objeto a menos de %1 cm? (Gatilho %2 Eco %3)",
    "args0": [{ "type": "field_number", "name": "CM", "value": 20, "min": 1 }, { "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins }, { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }],
    "output": "Boolean", "colour": 40 },
];

Blockly.defineBlocksWithJsonArray(customBlocks);

cppGenerator.forBlock['bloco_setup']          = (b: Blockly.Block) => `void setup() {\n  Serial.begin(9600);\n${cppGenerator.statementToCode(b,'DO') || '  // Suas configurações entrarão aqui...\n'}}\n\n`;
cppGenerator.forBlock['bloco_loop']           = (b: Blockly.Block) => `void loop() {\n${cppGenerator.statementToCode(b,'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`;
cppGenerator.forBlock['configurar_pino']      = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, ${b.getFieldValue('MODE')});\n`;
cppGenerator.forBlock['escrever_pino']        = (b: Blockly.Block) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`;
cppGenerator.forBlock['esperar']              = (b: Blockly.Block) => `  delay(${b.getFieldValue('TIME')});\n`;
cppGenerator.forBlock['repetir_vezes']        = (b: Blockly.Block) => `  for (int i = 0; i < ${b.getFieldValue('TIMES')}; i++) {\n${cppGenerator.statementToCode(b,'DO') || ''}  }\n`;
cppGenerator.forBlock['escrever_serial']      = (b: Blockly.Block) => `  Serial.println("${b.getFieldValue('TEXT')}");\n`;
cppGenerator.forBlock['ler_pino_digital']     = (b: Blockly.Block) => [`digitalRead(${b.getFieldValue('PIN')})`, 0];
cppGenerator.forBlock['escrever_serial_valor']= (b: Blockly.Block) => `  Serial.println(${cppGenerator.valueToCode(b,'VALOR',99) || '0'});\n`;
cppGenerator.forBlock['se_entao']             = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b,'CONDICAO',0)||'false'}) {\n${cppGenerator.statementToCode(b,'ENTAO')||''}  }\n`;
cppGenerator.forBlock['se_entao_senao']       = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b,'CONDICAO',0)||'false'}) {\n${cppGenerator.statementToCode(b,'ENTAO')||''}  } else {\n${cppGenerator.statementToCode(b,'SENAO')||''}  }\n`;
cppGenerator.forBlock['comparar_valores']     = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b,'A',0)||'0'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b,'B',0)||'0'})`, 0];
cppGenerator.forBlock['numero_fixo']          = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];
cppGenerator.forBlock['e_ou_logico']          = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b,'A',0)||'false'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b,'B',0)||'false'})`, 0];
cppGenerator.forBlock['configurar_ultrassonico'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('TRIG')}, OUTPUT);\n  pinMode(${b.getFieldValue('ECHO')}, INPUT);\n`;
cppGenerator.forBlock['ler_distancia_cm']     = (b: Blockly.Block) => {
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return [`({ digitalWrite(${t},LOW); delayMicroseconds(2); digitalWrite(${t},HIGH); delayMicroseconds(10); digitalWrite(${t},LOW); (float)pulseIn(${e},HIGH,38000)*0.034/2; })`, 0];
};
cppGenerator.forBlock['mostrar_distancia']    = (b: Blockly.Block) => {
  const t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  return `  digitalWrite(${t},LOW);\n  delayMicroseconds(2);\n  digitalWrite(${t},HIGH);\n  delayMicroseconds(10);\n  digitalWrite(${t},LOW);\n  Serial.println((float)pulseIn(${e},HIGH,38000)*0.034/2);\n`;
};
cppGenerator.forBlock['objeto_esta_perto']    = (b: Blockly.Block) => {
  const cm = b.getFieldValue('CM'), t = b.getFieldValue('TRIG'), e = b.getFieldValue('ECHO');
  const m = `({ digitalWrite(${t},LOW); delayMicroseconds(2); digitalWrite(${t},HIGH); delayMicroseconds(10); digitalWrite(${t},LOW); (float)pulseIn(${e},HIGH,38000)*0.034/2; })`;
  return [`(${m} < ${cm} && ${m} > 0)`, 0];
};

const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: '⚡ Pinos/Portas', colour: '230',
      contents: [{ kind: 'block', type: 'configurar_pino' }, { kind: 'block', type: 'escrever_pino' }, { kind: 'block', type: 'ler_pino_digital' }] },
    { kind: 'category', name: '⏱️ Controle', colour: '120',
      contents: [{ kind: 'block', type: 'esperar' }, { kind: 'block', type: 'repetir_vezes' }] },
    { kind: 'category', name: '🔀 Condições', colour: '210',
      contents: [
        { kind: 'block', type: 'se_entao' }, { kind: 'block', type: 'se_entao_senao' },
        { kind: 'block', type: 'comparar_valores', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } } } },
        { kind: 'block', type: 'numero_fixo' }, { kind: 'block', type: 'e_ou_logico' }
      ] },
    { kind: 'category', name: '📡 Ultrassônico', colour: '40',
      contents: [{ kind: 'block', type: 'configurar_ultrassonico' }, { kind: 'block', type: 'ler_distancia_cm' }, { kind: 'block', type: 'mostrar_distancia' }, { kind: 'block', type: 'objeto_esta_perto' }] },
    { kind: 'category', name: '💬 Comunicação', colour: '160',
      contents: [{ kind: 'block', type: 'escrever_serial' }, { kind: 'block', type: 'escrever_serial_valor' }] },
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: erros amigáveis
// ─────────────────────────────────────────────────────────────────────────────

type FriendlyError = { emoji: string; title: string; message: string; tip: string };

function getFriendlyError(raw: string): FriendlyError {
  const e = raw.toLowerCase();
  if (e.includes('port') || e.includes('porta') || e.includes('serial') || e.includes('com') || e.includes('tty')) {
    return {
      emoji: '🔌',
      title: 'Cabo USB não encontrado!',
      message: 'O computador não conseguiu encontrar o Arduino. Parece que o cabo USB está desconectado ou na porta errada.',
      tip: 'Dica: Verifique se o cabo está bem encaixado e tente clicar em 🔄 para atualizar as portas!',
    };
  }
  if (e.includes('avrdude') || e.includes('programmer') || e.includes('not in sync') || e.includes('out of sync')) {
    return {
      emoji: '😵',
      title: 'Não consegui falar com o Arduino!',
      message: 'O computador tentou se conectar ao Arduino, mas ele não respondeu. Isso pode acontecer se a placa selecionada estiver errada.',
      tip: 'Dica: Verifique se você escolheu a placa certa (Uno, Nano ou ESP32) no seletor do meio da tela!',
    };
  }
  if (e.includes('error') || e.includes('syntax') || e.includes('expected') || e.includes('undeclared')) {
    return {
      emoji: '🧩',
      title: 'Hmm… algo está errado nas peças!',
      message: 'O código gerado pelos blocos tem um probleminha. Às vezes isso acontece quando os blocos estão numa ordem estranha.',
      tip: 'Dica: Tente remover a última peça que você colocou e montar de novo. Se não resolver, chame o professor!',
    };
  }
  if (e.includes('timeout') || e.includes('time out')) {
    return {
      emoji: '⏰',
      title: 'Demorou demais…',
      message: 'O Arduino não respondeu a tempo. Às vezes isso acontece quando a conexão é instável.',
      tip: 'Dica: Desconecte e reconecte o cabo USB e tente novamente!',
    };
  }
  return {
    emoji: '😕',
    title: 'Algo deu errado por aqui...',
    message: 'Ocorreu um erro inesperado. Não se preocupe, isso acontece às vezes!',
    tip: 'Dica: Tente de novo. Se o erro continuar, chame o professor para ajudar!',
  };
}

// Nomes humanos para tipos de bloco
const BLOCK_NAMES: Record<string, string> = {
  configurar_pino: 'Configurar Pino',
  escrever_pino: 'Ligar/Desligar Pino',
  esperar: 'Esperar',
  repetir_vezes: 'Repetir Vezes',
  escrever_serial: 'O Robô Diz',
  ler_pino_digital: 'Ler Pino',
  escrever_serial_valor: 'O Robô Diz o Valor',
  se_entao: 'Se... Então',
  se_entao_senao: 'Se... Então... Senão',
  comparar_valores: 'Comparar',
  numero_fixo: 'Número',
  e_ou_logico: 'E / Ou',
  configurar_ultrassonico: 'Configurar Sensor',
  ler_distancia_cm: 'Ler Distância',
  mostrar_distancia: 'Mostrar Distância',
  objeto_esta_perto: 'Objeto Está Perto?',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de estado de upload
// ─────────────────────────────────────────────────────────────────────────────

type UploadStage = 'validating' | 'compiling' | 'sending' | 'success';

const UPLOAD_STAGES: { id: UploadStage; label: string; emoji: string; tip: string }[] = [
  { id: 'validating', label: 'Verificando as peças…',    emoji: '🔍', tip: 'Checando se tudo está no lugar certo!' },
  { id: 'compiling',  label: 'Compilando o código…',     emoji: '⚙️', tip: 'Transformando os blocos em linguagem de robô!' },
  { id: 'sending',    label: 'Enviando para o robô…',    emoji: '📡', tip: 'O código está viajando pelo cabo USB agora!' },
  { id: 'success',    label: 'Robô pronto para agir!',   emoji: '🤖', tip: 'Seu robô já está executando as instruções!' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface IdeScreenProps {
  role: 'student' | 'teacher' | 'visitor';
  readOnly?: boolean;
  onBack: () => void;
  projectId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export function IdeScreen({ role, readOnly = false, onBack, projectId }: IdeScreenProps) {
  const blocklyDiv   = useRef<HTMLDivElement>(null);
  const workspace    = useRef<Blockly.WorkspaceSvg | null>(null);

  const [board, setBoard]                       = useState<'nano' | 'esp32' | 'uno'>('uno');
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

  // ── Novos estados de UI ───────────────────────────────────────────────────
  const [uploadStage, setUploadStage]           = useState<UploadStage | null>(null);
  const [friendlyError, setFriendlyError]       = useState<FriendlyError | null>(null);
  const [orphanWarning, setOrphanWarning]       = useState<string[]>([]); // lista de nomes dos blocos órfãos
  const isUploadingRef                          = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Tema Blockly melhorado
  // ─────────────────────────────────────────────────────────────────────────

  const oficinaTheme = Blockly.Theme.defineTheme('oficinaTheme', {
    name: 'oficinaTheme',
    base: Blockly.Themes.Classic,
    blockStyles: {
      colour_blocks:  { colourPrimary: '#ef9f4b', colourSecondary: '#d4891f', colourTertiary: '#b87219' },
      list_blocks:    { colourPrimary: '#4cd137', colourSecondary: '#3bac29', colourTertiary: '#2e8a1f' },
      logic_blocks:   { colourPrimary: '#6c5ce7', colourSecondary: '#5a4ed4', colourTertiary: '#473dbf' },
      loop_blocks:    { colourPrimary: '#00b894', colourSecondary: '#00a381', colourTertiary: '#008068' },
      math_blocks:    { colourPrimary: '#0984e3', colourSecondary: '#0773c9', colourTertiary: '#0562af' },
      procedure_blocks: { colourPrimary: '#fd79a8', colourSecondary: '#e46d96', colourTertiary: '#cc6284' },
      text_blocks:    { colourPrimary: '#fdcb6e', colourSecondary: '#e4b55b', colourTertiary: '#cb9e48' },
      variable_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' },
      variable_dynamic_blocks: { colourPrimary: '#e17055', colourSecondary: '#c85f42', colourTertiary: '#b04e30' },
      hat_blocks:     { colourPrimary: '#a29bfe', colourSecondary: '#9085e3', colourTertiary: '#7e71c8' },
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

  // ─────────────────────────────────────────────────────────────────────────
  // Funções de utilidade
  // ─────────────────────────────────────────────────────────────────────────

  const fetchPorts = async () => {
    try {
      const ports = await invoke<string[]>('get_available_ports');
      setAvailablePorts(ports);
      if (ports.length > 0 && !ports.includes(port)) setPort(ports[0]);
    } catch (error) { console.error(error); }
  };

  /** Verifica blocos que não estão dentro de setup ou loop */
  const getOrphanedBlocks = (): string[] => {
    if (!workspace.current) return [];
    const topBlocks = workspace.current.getTopBlocks(false);
    return topBlocks
      .filter(b => b.type !== 'bloco_setup' && b.type !== 'bloco_loop')
      .map(b => BLOCK_NAMES[b.type] ?? b.type);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ─────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => { currentBoardPins = BOARDS[board].pins; }, [board]);
  useEffect(() => { fetchPorts(); }, []);

  useEffect(() => {
    if (blocklyDiv.current && !workspace.current) {
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
          setGeneratedCode(cppGenerator.workspaceToCode(workspace.current!) || '// Arraste blocos para dentro de PREPARAR e AGIR!');
        } catch (e) { console.error(e); }
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

      if (projectId) {
        (async () => {
          const { data, error } = await supabase.from('projetos').select('*').eq('id', projectId).single();
          if (data && !error) {
            setProjectName(data.nome);
            if (data.target_board) setBoard(data.target_board as 'nano' | 'esp32' | 'uno');
            try {
              if (data.workspace_data) {
                const raw = typeof data.workspace_data === 'string'
                  ? JSON.parse(LZString.decompress(data.workspace_data) || '{}')
                  : data.workspace_data;
                if (raw && Object.keys(raw).length > 0)
                  Blockly.serialization.workspaces.load(raw, workspace.current!);
              }
            } catch (_) {}
            ensureRootBlocks();
          }
        })();
      } else { ensureRootBlocks(); }
    }
    return () => { if (workspace.current) { workspace.current.dispose(); workspace.current = null; } };
  }, [projectId, readOnly]);

  useEffect(() => { if (workspace.current) Blockly.svgResize(workspace.current); }, [role, isCodeVisible, isFullscreenCode]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [serialMessages, isSerialOpen]);

  useEffect(() => {
    let unlisten: () => void;
    (async () => {
      unlisten = await listen<string>('serial-message', (e) => {
        setSerialMessages(prev => {
          const n = [...prev, e.payload];
          return n.length > 50 ? n.slice(n.length - 50) : n;
        });
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleToggleSerial = async () => {
    try {
      if (isSerialOpen) { await invoke('stop_serial'); setIsSerialOpen(false); }
      else { setSerialMessages([]); await invoke('start_serial', { porta: port }); setIsSerialOpen(true); }
    } catch (error) { setFriendlyError(getFriendlyError(String(error))); }
  };

  const handleSaveProject = async () => {
    if (!projectId || !workspace.current) return;
    setIsSaving(true);
    const { error } = await supabase.from('projetos').update({
      workspace_data: LZString.compress(JSON.stringify(Blockly.serialization.workspaces.save(workspace.current))),
      target_board: board,
      updated_at: new Date().toISOString()
    }).eq('id', projectId);
    setIsSaving(false);
    if (!error) setSaveStatus('success');
    else { setFriendlyError({ emoji: '☁️', title: 'Não consegui salvar!', message: error.message, tip: 'Verifique sua conexão com a internet e tente de novo.' }); }
  };

  const handleUploadCode = async () => {
    if (isUploadingRef.current) return;

    // 1. Verificar blocos órfãos
    const orphans = getOrphanedBlocks();
    if (orphans.length > 0) {
      setOrphanWarning(orphans);
      return;
    }

    // 2. Verificar blocos raiz
    if (!generatedCode.includes('void setup()') || !generatedCode.includes('void loop()')) {
      setFriendlyError({
        emoji: '🧩',
        title: 'Faltam peças importantes!',
        message: 'As peças PREPARAR e AGIR são obrigatórias para o robô funcionar.',
        tip: 'Dica: Mexa em uma peça e tente de novo para atualizar o código!',
      });
      return;
    }

    // 3. Fechar serial se estiver aberto
    if (isSerialOpen) { await invoke('stop_serial').catch(() => {}); setIsSerialOpen(false); }

    // 4. Iniciar loading com estágios animados
    isUploadingRef.current = true;
    setUploadStage('validating');

    try {
      await delay(700);
      setUploadStage('compiling');

      // Dispara o upload real em paralelo com a animação de estágios
      const uploadPromise = invoke('upload_code', { codigo: generatedCode, placa: board, porta: port });

      await delay(2500);
      setUploadStage('sending');

      // Aguarda o upload finalizar
      await uploadPromise;

      setUploadStage('success');
    } catch (error) {
      setUploadStage(null);
      setFriendlyError(getFriendlyError(String(error)));
    } finally {
      isUploadingRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Título do projeto
  // ─────────────────────────────────────────────────────────────────────────

  const projectTitle = projectId
    ? role === 'student'
      ? `Mesa: ${projectName}`
      : readOnly
        ? `Inspecionando: ${projectName}`
        : `Meu Projeto: ${projectName}`
    : '';

  const stageIndex = uploadStage ? UPLOAD_STAGES.findIndex(s => s.id === uploadStage) : -1;
  const currentStageData = uploadStage ? UPLOAD_STAGES.find(s => s.id === uploadStage) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">

      {/* ── BANNER MODO SOMENTE LEITURA ──────────────────────────────────── */}
      {readOnly && (
        <div className="readonly-banner">
          <span>👁️ Modo Visualização</span>
          <span>Você está vendo o projeto de um aluno. Edição desativada.</span>
        </div>
      )}

      {/* ── TOPBAR ───────────────────────────────────────────────────────── */}
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>

        {/* Logo + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '34px' }} />
          {projectTitle && (
            <div className="project-title-badge">
              {readOnly && <span className="read-only-dot" />}
              <span>{projectTitle}</span>
            </div>
          )}
        </div>

        {/* Controles de hardware (centro) */}
        <div className="hardware-controls" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="control-group">
            <span className="control-icon">🖥️</span>
            <select value={board} onChange={(e) => setBoard(e.target.value as 'nano' | 'esp32' | 'uno')} disabled={readOnly}>
              <option value="uno">Uno</option>
              <option value="nano">Nano</option>
              <option value="esp32">ESP32</option>
            </select>
          </div>
          <div className="control-divider" />
          <div className="control-group">
            <span className="control-icon">🔌</span>
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
              <button onClick={handleUploadCode} className="btn-action btn-send" disabled={isUploadingRef.current}>
                🚀 Enviar
              </button>
              <button className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`} onClick={handleToggleSerial}>
                {isSerialOpen ? '🛑 Parar' : '💬 Chat'}
              </button>
            </>
          )}
          {readOnly && (
            <button className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`} onClick={handleToggleSerial}>
              {isSerialOpen ? '🛑 Parar' : '💬 Monitorar'}
            </button>
          )}
        </div>

        {/* Botões da direita */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {role !== 'student' && (
            <button className="btn-secondary topbar-btn" onClick={() => setIsCodeVisible(!isCodeVisible)}>
              {isCodeVisible ? '🙈 Ocultar Código' : '💻 Ver Código'}
            </button>
          )}
          {(role === 'student' || (role === 'teacher' && !readOnly)) && projectId && (
            <button className="btn-primary topbar-btn" onClick={handleSaveProject} disabled={isSaving}>
              {isSaving ? '⏳ Salvando…' : '💾 Salvar'}
            </button>
          )}
          <button className="btn-danger topbar-btn" onClick={onBack}>← Sair</button>
        </div>
      </div>

      {/* ── WORKSPACE ────────────────────────────────────────────────────── */}
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Código C++</h3>
              <button onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                style={{ background: 'transparent', border: '1px solid #485460', color: '#a4b0be', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', margin: 0, boxShadow: 'none' }}>
                {isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}
              </button>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAIS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* ── LOADING DE UPLOAD ─────────────────────────────────────────────── */}
      {uploadStage && (
        <div className="modal-overlay">
          <div className="upload-modal">
            {uploadStage === 'success' ? (
              /* ─ Tela de sucesso ─ */
              <div className="upload-success-content">
                <div className="success-robot">🤖</div>
                <h2>Robô pronto!</h2>
                <p>O seu robô já está executando as novas instruções. Ele aprendeu tudo que você ensinou!</p>
                <button className="btn-primary upload-close-btn" onClick={() => setUploadStage(null)}>
                  🎉 Continuar programando!
                </button>
              </div>
            ) : (
              /* ─ Tela de carregamento ─ */
              <>
                <div className="upload-rocket-wrap">
                  <span className="upload-rocket">{currentStageData?.emoji}</span>
                </div>
                <h2 className="upload-stage-label">{currentStageData?.label}</h2>
                <p className="upload-stage-tip">{currentStageData?.tip}</p>

                {/* Barra de progresso */}
                <div className="upload-progress-bar-track">
                  <div
                    className="upload-progress-bar-fill"
                    style={{ width: `${((stageIndex + 1) / (UPLOAD_STAGES.length - 1)) * 100}%` }}
                  />
                </div>

                {/* Etapas como pontos */}
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
          </div>
        </div>
      )}

      {/* ── AVISO: BLOCOS ÓRFÃOS ──────────────────────────────────────────── */}
      {orphanWarning.length > 0 && (
        <div className="modal-overlay">
          <div className="orphan-modal">
            <div className="orphan-icon">🧩</div>
            <h2>Tem peças soltas!</h2>
            <p>
              As peças abaixo estão flutuando no espaço e não estão conectadas a nenhuma função.
              Para o robô executar, <strong>todas as peças precisam estar dentro de PREPARAR ou AGIR</strong>.
            </p>

            {/* Lista das peças soltas */}
            <div className="orphan-blocks-list">
              {[...new Set(orphanWarning)].map((name, i) => (
                <div key={i} className="orphan-block-chip">
                  <span>🔷</span> {name}
                </div>
              ))}
            </div>

            {/* Diagrama visual */}
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
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setOrphanWarning([]); /* força envio */ }}>
                Enviar assim mesmo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ERRO AMIGÁVEL ─────────────────────────────────────────────────── */}
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
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => setFriendlyError(null)}>
                Entendi, vou tentar!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SALVO COM SUCESSO ─────────────────────────────────────────────── */}
      {saveStatus === 'success' && (
        <div className="modal-overlay">
          <div className="save-success-modal">
            <div className="save-success-icon">☁️</div>
            <h2>Projeto Salvo!</h2>
            <p>Suas peças e progressos foram guardados com segurança na nuvem. Continue programando!</p>
            <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }} onClick={() => setSaveStatus(null)}>
              Continuar 🚀
            </button>
          </div>
        </div>
      )}

      {/* ── MONITOR SERIAL ────────────────────────────────────────────────── */}
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
            {serialMessages.length === 0
              ? (
                <div className="serial-empty">
                  <span>📡</span>
                  <p>Aguardando o robô falar…</p>
                  <small>As mensagens do robô aparecerão aqui!</small>
                </div>
              )
              : serialMessages.map((msg, idx) => (
                <div key={idx} className="serial-message">
                  <span className="serial-timestamp">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="serial-text">{msg}</span>
                </div>
              ))
            }
            <div ref={messagesEndRef} />
          </div>
          <div className="serial-monitor-footer">
            <button className="serial-clear-btn" onClick={() => setSerialMessages([])}>
              🗑️ Limpar
            </button>
            <span>{serialMessages.length} mensagens</span>
          </div>
        </div>
      )}
    </div>
  );
}