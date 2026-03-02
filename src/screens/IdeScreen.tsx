import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as PtBr from 'blockly/msg/pt-br';
import { supabase } from '../lib/supabase'; 
import logoSimples from '../assets/LogoSimples.png'; 
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

Blockly.setLocale(PtBr as any);
const cppGenerator = new Blockly.Generator('CPP');

cppGenerator.scrub_ = function(block, code, opt_thisOnly) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = opt_thisOnly ? '' : cppGenerator.blockToCode(nextBlock);
  return code + nextCode;
};

const BOARDS = {
  uno: { name: 'Arduino Uno', pins: [['D2', '2'], ['D3', '3'], ['D4', '4'], ['D5', '5'], ['D6', '6'], ['D7', '7'], ['D8', '8'], ['D9', '9'], ['D10', '10'], ['D11', '11'], ['D12', '12'], ['D13 (LED Interno)', '13']] },
  nano: { name: 'Arduino Nano', pins: [['D2', '2'], ['D3', '3'], ['D4', '4'], ['D5', '5'], ['D6', '6'], ['D7', '7'], ['D8', '8'], ['D9', '9'], ['D10', '10'], ['D11', '11'], ['D12', '12'], ['D13 (LED Interno)', '13']] },
  esp32: { name: 'ESP32 DevKit V1', pins: [['GPIO 2 (LED)', '2'], ['GPIO 4', '4'], ['GPIO 5', '5'], ['GPIO 12', '12'], ['GPIO 13', '13'], ['GPIO 14', '14'], ['GPIO 15', '15'], ['GPIO 18', '18'], ['GPIO 19', '19'], ['GPIO 21', '21'], ['GPIO 22', '22'], ['GPIO 23', '23']] }
};

let currentBoardPins = BOARDS.nano.pins;

const customBlocks = [
  // ─── BLOCOS ORIGINAIS ────────────────────────────────────────────────────────
  { 
    "type": "bloco_setup", 
    "message0": "⚙️ PREPARAR (Roda 1 vez) %1", 
    "args0": [{ "type": "input_statement", "name": "DO" }], 
    "colour": 290, "tooltip": "Configurações iniciais.", 
    "helpUrl": "" 
  },
  { "type": "bloco_loop", 
    "message0": "🔄 AGIR (Roda para sempre) %1", 
    "args0": [{ "type": "input_statement", "name": "DO" }], 
    "colour": 260, 
    "tooltip": "Ações que vão se repetir.", 
    "helpUrl": "" 
  },
  { "type": "configurar_pino", 
    "message0": "⚙️ Configurar pino %1 como %2", 
    "args0": [
      { "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins }, 
      { "type": "field_dropdown", "name": "MODE", "options": [["Saída (Enviar sinal)", "OUTPUT"], ["Entrada (Ler sensor)", "INPUT"]] }
    ], 
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 230 
  },
  { 
    "type": "escrever_pino", 
    "message0": "💡 Colocar pino %1 em estado %2", 
    "args0": [
      { "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins }, 
      { "type": "field_dropdown", "name": "STATE", "options": [["Ligado (HIGH)", "HIGH"], ["Desligado (LOW)", "LOW"]] }
    ], 
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 230 
  },
  { 
    "type": "esperar", 
    "message0": "⏱️ Esperar %1 milissegundos", 
    "args0": [{ "type": "field_number", "name": "TIME", "value": 1000, "min": 0 }], 
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 120 
  },
  { 
    "type": "repetir_vezes", 
    "message0": "🔁 Repetir %1 vezes %2 %3", 
    "args0": [
      { "type": "field_number", "name": "TIMES", "value": 5, "min": 1 }, 
      { "type": "input_dummy" }, 
      { "type": "input_statement", "name": "DO" }
    ],
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 120 
  },
  { 
    "type": "escrever_serial", 
    "message0": "💬 O robô diz o texto: %1", 
    "args0": [{ "type": "field_input", "name": "TEXT", "text": "Olá, mundo!" }], 
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 160, 
    "tooltip": "Envia uma mensagem de texto para o computador." 
  },
  { 
    "type": "ler_pino_digital", 
    "message0": "📥 Ler pino %1", 
    "args0": [{ "type": "field_dropdown", "name": "PIN", "options": () => currentBoardPins }], 
    "output": null,
    "colour": 230, 
    "tooltip": "Lê se o pino está recebendo energia (Ligado = 1, Desligado = 0)." 
  },
  { 
    "type": "escrever_serial_valor", 
    "message0": "💬 O robô diz a leitura de: %1", 
    "args0": [{ "type": "input_value", "name": "VALOR" }],
    "previousStatement": null, 
    "nextStatement": null, 
    "colour": 160, 
    "tooltip": "Envia o valor de um sensor ou pino para o Chat." 
  },

  // ─── NOVOS: CONDIÇÕES ─────────────────────────────────────────────────────────

  // Bloco: SE ... ENTÃO
  {
    "type": "se_entao",
    "message0": "🤔 SE %1 ENTÃO %2 %3",
    "args0": [
      { "type": "input_value",     "name": "CONDICAO", "check": "Boolean" },
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "ENTAO" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 210,
    "tooltip": "Executa as ações de dentro SOMENTE SE a condição for verdadeira.",
    "helpUrl": ""
  },

  // Bloco: SE ... ENTÃO ... SENÃO
  {
    "type": "se_entao_senao",
    "message0": "🤔 SE %1 ENTÃO %2 %3 SENÃO %4 %5",
    "args0": [
      { "type": "input_value",     "name": "CONDICAO", "check": "Boolean" },
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "ENTAO" },
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "SENAO" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 210,
    "tooltip": "Se a condição for verdadeira faz o ENTÃO, se não faz o SENÃO.",
    "helpUrl": ""
  },

  // Bloco: Comparador (A é maior/menor/igual a B)
  {
    "type": "comparar_valores",
    "message0": "%1 %2 %3",
    "args0": [
      { "type": "input_value", "name": "A" },
      { "type": "field_dropdown", "name": "OP", "options": [
          ["é maior que",          ">"],
          ["é menor que",          "<"],
          ["é igual a",            "=="],
          ["é maior ou igual a",   ">="],
          ["é menor ou igual a",   "<="],
          ["é diferente de",       "!="]
      ]},
      { "type": "input_value", "name": "B" }
    ],
    "inputsInline": true,
    "output": "Boolean",
    "colour": 210,
    "tooltip": "Compara dois valores e diz se é verdadeiro ou falso.",
    "helpUrl": ""
  },

  // Bloco: Número fixo (para usar em comparações)
  {
    "type": "numero_fixo",
    "message0": "%1",
    "args0": [{ "type": "field_number", "name": "VALOR", "value": 10 }],
    "output": null,
    "colour": 210,
    "tooltip": "Um número para usar em comparações e cálculos.",
    "helpUrl": ""
  },

  // Bloco: E lógico / OU lógico
  {
    "type": "e_ou_logico",
    "message0": "%1 %2 %3",
    "args0": [
      { "type": "input_value", "name": "A", "check": "Boolean" },
      { "type": "field_dropdown", "name": "OP", "options": [
          ["E (as duas condições)", "&&"],
          ["OU (qualquer uma)",     "||"]
      ]},
      { "type": "input_value", "name": "B", "check": "Boolean" }
    ],
    "inputsInline": true,
    "output": "Boolean",
    "colour": 210,
    "tooltip": "Junta duas condições: E = as duas precisam ser verdade. OU = basta uma.",
    "helpUrl": ""
  },

  // ─── NOVOS: SENSOR ULTRASSÔNICO HC-SR04 ─────────────────────────────────────

  // Bloco: Configurar sensor de distância (vai no PREPARAR)
  {
    "type": "configurar_ultrassonico",
    "message0": "📡 Configurar sensor de distância: Gatilho %1 Eco %2",
    "args0": [
      { "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins },
      { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 40,
    "tooltip": "Coloque este bloco no PREPARAR. Liga os pinos do sensor de distância HC-SR04.",
    "helpUrl": ""
  },

  // Bloco: Ler distância em cm (valor, para usar com comparações)
  {
    "type": "ler_distancia_cm",
    "message0": "📏 Distância em cm (Gatilho %1 Eco %2)",
    "args0": [
      { "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins },
      { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }
    ],
    "output": null,
    "colour": 40,
    "tooltip": "Mede e retorna a distância em centímetros usando o sensor HC-SR04.",
    "helpUrl": ""
  },

  // Bloco: Medir e mostrar distância no Chat (atalho)
  {
    "type": "mostrar_distancia",
    "message0": "📡 O robô diz a distância em cm (Gatilho %1 Eco %2)",
    "args0": [
      { "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins },
      { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 40,
    "tooltip": "Mede a distância e já envia para o Chat. Atalho fácil!",
    "helpUrl": ""
  },

  // Bloco: Objeto está perto? (booleano de conveniência para crianças)
  {
    "type": "objeto_esta_perto",
    "message0": "🚨 Tem objeto a menos de %1 cm? (Gatilho %2 Eco %3)",
    "args0": [
      { "type": "field_number", "name": "CM",   "value": 20, "min": 1 },
      { "type": "field_dropdown", "name": "TRIG", "options": () => currentBoardPins },
      { "type": "field_dropdown", "name": "ECHO", "options": () => currentBoardPins }
    ],
    "output": "Boolean",
    "colour": 40,
    "tooltip": "Verdadeiro se detectar alguma coisa a menos de X centímetros.",
    "helpUrl": ""
  },
];

Blockly.defineBlocksWithJsonArray(customBlocks);

// ─── GERADORES: BLOCOS ORIGINAIS ──────────────────────────────────────────────

cppGenerator.forBlock['bloco_setup'] = function(block: Blockly.Block) {
   const branch = cppGenerator.statementToCode(block, 'DO') || '  // Suas configurações entrarão aqui...\n';
   return `void setup() {\n  Serial.begin(9600);\n${branch}}\n\n`; 
};

cppGenerator.forBlock['bloco_loop'] = function(block: Blockly.Block) {
   return `void loop() {\n${cppGenerator.statementToCode(block, 'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`; 
};

cppGenerator.forBlock['configurar_pino'] = function(block: Blockly.Block) {
   return `  pinMode(${block.getFieldValue('PIN')}, ${block.getFieldValue('MODE')});\n`; 
};

cppGenerator.forBlock['escrever_pino'] = function(block: Blockly.Block) {
   return `  digitalWrite(${block.getFieldValue('PIN')}, ${block.getFieldValue('STATE')});\n`; 
};

cppGenerator.forBlock['esperar'] = function(block: Blockly.Block) {
   return `  delay(${block.getFieldValue('TIME')});\n`; 
};

cppGenerator.forBlock['repetir_vezes'] = function(block: Blockly.Block) {
   return `  for (int i = 0; i < ${block.getFieldValue('TIMES')}; i++) {\n${cppGenerator.statementToCode(block, 'DO') || ''}  }\n`; 
};

cppGenerator.forBlock['escrever_serial'] = function(block: Blockly.Block) {
   return `  Serial.println("${block.getFieldValue('TEXT')}");\n`; 
};

cppGenerator.forBlock['ler_pino_digital'] = function(block: Blockly.Block) { 
  return [`digitalRead(${block.getFieldValue('PIN')})`, 0]; 
};

cppGenerator.forBlock['escrever_serial_valor'] = function(block: Blockly.Block) { 
  const valorEncaixado = cppGenerator.valueToCode(block, 'VALOR', 99) || '0';
  return `  Serial.println(${valorEncaixado});\n`; 
};

// ─── GERADORES: CONDIÇÕES ─────────────────────────────────────────────────────

cppGenerator.forBlock['se_entao'] = function(block: Blockly.Block) {
  const condicao = cppGenerator.valueToCode(block, 'CONDICAO', 0) || 'false';
  const entao   = cppGenerator.statementToCode(block, 'ENTAO') || '';
  return `  if (${condicao}) {\n${entao}  }\n`;
};

cppGenerator.forBlock['se_entao_senao'] = function(block: Blockly.Block) {
  const condicao = cppGenerator.valueToCode(block, 'CONDICAO', 0) || 'false';
  const entao    = cppGenerator.statementToCode(block, 'ENTAO')   || '';
  const senao    = cppGenerator.statementToCode(block, 'SENAO')   || '';
  return `  if (${condicao}) {\n${entao}  } else {\n${senao}  }\n`;
};

cppGenerator.forBlock['comparar_valores'] = function(block: Blockly.Block) {
  const a  = cppGenerator.valueToCode(block, 'A', 0) || '0';
  const b  = cppGenerator.valueToCode(block, 'B', 0) || '0';
  const op = block.getFieldValue('OP');
  return [`(${a} ${op} ${b})`, 0];
};

cppGenerator.forBlock['numero_fixo'] = function(block: Blockly.Block) {
  return [block.getFieldValue('VALOR'), 0];
};

cppGenerator.forBlock['e_ou_logico'] = function(block: Blockly.Block) {
  const a  = cppGenerator.valueToCode(block, 'A', 0) || 'false';
  const b  = cppGenerator.valueToCode(block, 'B', 0) || 'false';
  const op = block.getFieldValue('OP');
  return [`(${a} ${op} ${b})`, 0];
};

// ─── GERADORES: SENSOR HC-SR04 ────────────────────────────────────────────────

cppGenerator.forBlock['configurar_ultrassonico'] = function(block: Blockly.Block) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  return `  pinMode(${trig}, OUTPUT); // Sensor distância - Gatilho\n  pinMode(${echo}, INPUT);  // Sensor distância - Eco\n`;
};

// Gera uma expressão inline que faz a medição completa do HC-SR04.
// Usa "statement expression" do GCC (suportado pelo Arduino) para
// executar várias instruções dentro de uma expressão de valor.
cppGenerator.forBlock['ler_distancia_cm'] = function(block: Blockly.Block) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  const codigo = 
    `({ digitalWrite(${trig}, LOW); delayMicroseconds(2); ` +
    `digitalWrite(${trig}, HIGH); delayMicroseconds(10); ` +
    `digitalWrite(${trig}, LOW); ` +
    `(float)pulseIn(${echo}, HIGH, 38000) * 0.034 / 2; })`;
  return [codigo, 0];
};

cppGenerator.forBlock['mostrar_distancia'] = function(block: Blockly.Block) {
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  return (
    `  digitalWrite(${trig}, LOW);\n` +
    `  delayMicroseconds(2);\n` +
    `  digitalWrite(${trig}, HIGH);\n` +
    `  delayMicroseconds(10);\n` +
    `  digitalWrite(${trig}, LOW);\n` +
    `  Serial.println((float)pulseIn(${echo}, HIGH, 38000) * 0.034 / 2);\n`
  );
};

cppGenerator.forBlock['objeto_esta_perto'] = function(block: Blockly.Block) {
  const cm   = block.getFieldValue('CM');
  const trig = block.getFieldValue('TRIG');
  const echo = block.getFieldValue('ECHO');
  const medicao =
    `({ digitalWrite(${trig}, LOW); delayMicroseconds(2); ` +
    `digitalWrite(${trig}, HIGH); delayMicroseconds(10); ` +
    `digitalWrite(${trig}, LOW); ` +
    `(float)pulseIn(${echo}, HIGH, 38000) * 0.034 / 2; })`;
  return [`(${medicao} < ${cm} && ${medicao} > 0)`, 0];
};

// ─── TOOLBOX ──────────────────────────────────────────────────────────────────

const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    { 
      kind: 'category', name: '0️⃣1️⃣ Entrada e Saída Digital', colour: '230', 
      contents: [
        { kind: 'block', type: 'configurar_pino' }, 
        { kind: 'block', type: 'escrever_pino' },
        { kind: 'block', type: 'ler_pino_digital' }
      ] 
    },
    { 
      kind: 'category', name: '🔁 Controle', colour: '120', 
      contents: [
        { kind: 'block', type: 'esperar' }, 
        { kind: 'block', type: 'repetir_vezes' }
      ] 
    },
    { 
      kind: 'category', name: '🤔 Condições', colour: '210', 
      contents: [
        { kind: 'block', type: 'se_entao' },
        { kind: 'block', type: 'se_entao_senao' },
        { 
          kind: 'block', type: 'comparar_valores',
          inputs: {
            A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } }
          }
        },
        { kind: 'block', type: 'numero_fixo' },
        {
          kind: 'block', type: 'e_ou_logico'
        }
      ] 
    },
    { 
      kind: 'category', name: '📡 Sensor de Distância', colour: '40', 
      contents: [
        { kind: 'block', type: 'configurar_ultrassonico' },
        { kind: 'block', type: 'ler_distancia_cm' },
        { kind: 'block', type: 'mostrar_distancia' },
        { kind: 'block', type: 'objeto_esta_perto' },
      ] 
    },
    { 
      kind: 'category', name: '💬 Comunicação', colour: '160', 
      contents: [
        { kind: 'block', type: 'escrever_serial' },
        { kind: 'block', type: 'escrever_serial_valor' }
      ] 
    }
  ]
};

interface IdeScreenProps { role: 'student' | 'teacher' | 'visitor'; onBack: () => void; projectId?: string; }

export function IdeScreen({ role, onBack, projectId }: IdeScreenProps) {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  
  const [board, setBoard] = useState<'nano' | 'esp32' | 'uno'>('uno'); 
  const [port, setPort] = useState(''); 
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string>('// O código C++ aparecerá aqui...');
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState('Projeto');
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSerialOpen, setIsSerialOpen] = useState(false);
  const [serialMessages, setSerialMessages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  const [isCodeVisible, setIsCodeVisible] = useState(false); 
  const [isFullscreenCode, setIsFullscreenCode] = useState(false); 
  const [isUploading, setIsUploading] = useState(false);
  const isUploadingRef = useRef(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const oficinaTheme = Blockly.Theme.defineTheme('oficinaTheme', {
    name: 'oficinaTheme', base: Blockly.Themes.Classic,
    componentStyles: { workspaceBackgroundColour: '#f4f7f6', toolboxBackgroundColour: '#2f3542', toolboxForegroundColour: '#ffffff', flyoutBackgroundColour: '#3b4252', flyoutForegroundColour: '#ffffff', flyoutOpacity: 1, scrollbarColour: '#a4b0be', insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3, }
  });

  const fetchPorts = async () => {
    try {
      const ports = await invoke<string[]>('get_available_ports');
      setAvailablePorts(ports);
      if (ports.length > 0 && !ports.includes(port)) {
        setPort(ports[0]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { currentBoardPins = BOARDS[board].pins; }, [board]);

  useEffect(() => {
    fetchPorts();
  }, []);

  useEffect(() => {
    if (blocklyDiv.current && !workspace.current) {
      workspace.current = Blockly.inject(blocklyDiv.current, {
        toolbox: toolboxConfig, grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
        readOnly: role === 'teacher' && projectId !== undefined,
        move: { scrollbars: true, drag: true, wheel: true },
        theme: oficinaTheme, zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      });

      workspace.current.addChangeListener((event) => {
        if (event.isUiEvent) return; 
        try { setGeneratedCode(cppGenerator.workspaceToCode(workspace.current!) || '// Arraste blocos para dentro de PREPARAR e AGIR!'); } catch (e) { console.error(e); }
      });

      const ensureRootBlocks = () => {
        if (!workspace.current) return;
        let setupBlock = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_setup');
        if (!setupBlock) { setupBlock = workspace.current.newBlock('bloco_setup'); setupBlock.moveBy(50, 50); setupBlock.initSvg(); setupBlock.render(); }
        setupBlock.setDeletable(false); 

        let loopBlock = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_loop');
        if (!loopBlock) { loopBlock = workspace.current.newBlock('bloco_loop'); loopBlock.moveBy(450, 50); loopBlock.initSvg(); loopBlock.render(); }
        loopBlock.setDeletable(false); 
      };

      if (projectId) {
        const loadProject = async () => {
          const { data, error } = await supabase.from('projetos').select('*').eq('id', projectId).single();
          if (data && !error) {
            setProjectName(data.nome);
            if (data.target_board) setBoard(data.target_board as 'nano' | 'esp32');
            try { if (data.workspace_data && Object.keys(data.workspace_data).length > 0) Blockly.serialization.workspaces.load(data.workspace_data, workspace.current!); } catch (err) { }
            ensureRootBlocks(); 
          }
        }; loadProject();
      } else { ensureRootBlocks(); }     
    }
    return () => {
      if (workspace.current) {
        workspace.current.dispose();
        workspace.current = null;
      }
    };
  }, [projectId, role]);

  useEffect(() => { if (workspace.current) { Blockly.svgResize(workspace.current); } }, [role, isCodeVisible, isFullscreenCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialMessages, isSerialOpen]);

  useEffect(() => {
    let unlisten: () => void;
    const setupListener = async () => {
      unlisten = await listen<string>('serial-message', (event) => {
        setSerialMessages(prev => {
          const newMessages = [...prev, event.payload];
          if (newMessages.length > 20) return newMessages.slice(newMessages.length - 20);
          return newMessages;
        });
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

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
      alert("Erro no Serial: " + error);
    }
  };

  const handleSaveProject = async () => {
    if (!projectId || !workspace.current) return;
    setIsSaving(true);
    const { error } = await supabase.from('projetos').update({
      workspace_data: Blockly.serialization.workspaces.save(workspace.current),
      target_board: board,
      updated_at: new Date().toISOString()
    }).eq('id', projectId);
    setIsSaving(false);
    if (!error) setSaveStatus('success'); else { setErrorMessage(error.message); setSaveStatus('error'); }
  };

  const handleUploadCode = async () => {
    if (isUploadingRef.current) return;
    if (!generatedCode.includes('void setup()') || !generatedCode.includes('void loop()')) {
      setErrorMessage("As peças principais (PREPARAR e AGIR) não foram detectadas no código C++. Mexa em uma peça na tela para atualizar antes de enviar!");
      setSaveStatus('error');
      return;
    }
    try {
      isUploadingRef.current = true;
      setIsUploading(true);
      setSaveStatus(null);
      if (isSerialOpen) {
        await invoke('stop_serial');
        setIsSerialOpen(false);
      }
      await invoke('upload_code', { codigo: generatedCode, placa: board, porta: port });
      setUploadSuccess(true);
    } catch (error) {
      setErrorMessage(String(error));
      setSaveStatus('error'); 
    } finally {
      isUploadingRef.current = false;
      setIsUploading(false);
    }
  };

  return (
    <div className="app-container">
      
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 'fit-content' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '35px' }} />
            {projectId && (
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--dark)' }}>
                {role === 'student' ? `Mesa: ${projectName}` : `👀 Inspecionando: ${projectName}`}
              </h2>
            )}
        </div>

        <div className="hardware-controls" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="control-group">
            <span className="control-icon">🖥️</span>
            <select value={board} onChange={(e) => setBoard(e.target.value as 'nano' | 'esp32' | 'uno')} disabled={role === 'teacher' && projectId !== undefined}>
              <option value="uno">Uno</option>
              <option value="nano">Nano</option>
              <option value="esp32">ESP32</option>
            </select>
          </div>
          <div className="control-divider" />
          <div className="control-group">
            <span className="control-icon">🔌</span>
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {availablePorts.length === 0 ? (
                <option value="">Conecte o cabo...</option>
              ) : (
                availablePorts.map(p => <option key={p} value={p}>{p}</option>)
              )}
            </select>
            <button onClick={fetchPorts} className="btn-icon" title="Buscar portas">🔄</button>
          </div>
          <div className="control-divider" />
          <button 
            onClick={handleUploadCode} 
            className="btn-action btn-send"
            disabled={isUploading}
            style={{ opacity: isUploading ? 0.7 : 1, cursor: isUploading ? 'wait' : 'pointer' }}
          >
            {isUploading ? '⏳ Compilando...' : '🚀 Enviar'}
          </button>
          <button 
            className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`}
            onClick={handleToggleSerial}
          >
            {isSerialOpen ? '🛑 Parar' : '💬 Chat'}
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {role !== 'student' && (
            <button className="btn-secondary" onClick={() => setIsCodeVisible(!isCodeVisible)} style={{ margin: 0, backgroundColor: '#34495e', boxShadow: '0 4px 0px #2c3e50' }}>
              {isCodeVisible ? '🙈 Ocultar Código' : '💻 Ver Código'}
            </button>
          )}
          {role === 'student' && projectId && (
            <button className="btn-primary" onClick={handleSaveProject} disabled={isSaving} style={{ margin: 0 }}>
              {isSaving ? '⏳ A gravar...' : '💾 Salvar'}
            </button>
          )}
          <button className="btn-danger" onClick={onBack} style={{ margin: 0 }}>Sair</button>
        </div>
      </div>
      
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Código (C++)</h3>
              <button 
                onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                style={{ background: 'transparent', border: '1px solid #a4b0be', color: '#a4b0be', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', margin: 0 }}
              >
                {isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}
              </button>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* ── Modais de feedback ─────────────────────────────────────────────── */}
      {saveStatus === 'success' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '4.5rem', marginBottom: '10px' }}>✅</div>
            <h2 style={{ color: 'var(--dark)', marginBottom: '15px' }}>Projeto Salvo!</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '1.1rem' }}>As suas peças e progressos foram guardados na nuvem.</p>
            <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }} onClick={() => setSaveStatus(null)}>Continuar</button>
          </div>
        </div>
      )}

      {saveStatus === 'error' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '4.5rem', marginBottom: '10px' }}>❌</div>
            <h2 style={{ color: 'var(--dark)', marginBottom: '15px' }}>Ocorreu um Erro</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '1rem' }}>{errorMessage}</p>
            <button className="btn-danger" style={{ width: '100%', padding: '14px' }} onClick={() => setSaveStatus(null)}>Tentar Novamente</button>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '4.5rem', marginBottom: '10px' }}>🚀</div>
            <h2 style={{ color: 'var(--dark)', marginBottom: '15px' }}>Código Enviado!</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '1.1rem' }}>O seu robô já está a executar as novas instruções perfeitamente.</p>
            <button className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }} onClick={() => setUploadSuccess(false)}>Continuar</button>
          </div>
        </div>
      )}

      {isSerialOpen && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', width: '350px', height: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', zIndex: 9000, overflow: 'hidden', border: '2px solid #e0e6ed' }}>
          <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            <span>🤖 O Robô diz...</span>
            <span style={{ cursor: 'pointer' }} onClick={handleToggleSerial}>✕</span>
          </div>
          <div style={{ flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#f8fafd', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {serialMessages.length === 0 ? (
              <p style={{ color: '#a4b0be', textAlign: 'center', marginTop: '50px', fontStyle: 'italic' }}>Aguardando o robô falar...</p>
            ) : (
              serialMessages.map((msg, idx) => (
                <div key={idx} style={{ backgroundColor: '#dfe6e9', padding: '10px 15px', borderRadius: '15px', borderBottomLeftRadius: '2px', alignSelf: 'flex-start', color: '#2d3436', maxWidth: '85%', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                  {msg}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}