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
  uno:   { name: 'Arduino Uno',      pins: [['D2','2'],['D3','3'],['D4','4'],['D5','5'],['D6','6'],['D7','7'],['D8','8'],['D9','9'],['D10','10'],['D11','11'],['D12','12'],['D13 (LED Interno)','13']] },
  nano:  { name: 'Arduino Nano',     pins: [['D2','2'],['D3','3'],['D4','4'],['D5','5'],['D6','6'],['D7','7'],['D8','8'],['D9','9'],['D10','10'],['D11','11'],['D12','12'],['D13 (LED Interno)','13']] },
  esp32: { name: 'ESP32 DevKit V1',  pins: [['GPIO 2 (LED)','2'],['GPIO 4','4'],['GPIO 5','5'],['GPIO 12','12'],['GPIO 13','13'],['GPIO 14','14'],['GPIO 15','15'],['GPIO 18','18'],['GPIO 19','19'],['GPIO 21','21'],['GPIO 22','22'],['GPIO 23','23']] }
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
    { kind: 'category', name: 'Entrada e Saída Digital', colour: '230',
      contents: [{ kind: 'block', type: 'configurar_pino' }, { kind: 'block', type: 'escrever_pino' }, { kind: 'block', type: 'ler_pino_digital' }] },
    { kind: 'category', name: 'Controle', colour: '120',
      contents: [{ kind: 'block', type: 'esperar' }, { kind: 'block', type: 'repetir_vezes' }] },
    { kind: 'category', name: 'Condições', colour: '210',
      contents: [
        { kind: 'block', type: 'se_entao' }, { kind: 'block', type: 'se_entao_senao' },
        { kind: 'block', type: 'comparar_valores', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } } } },
        { kind: 'block', type: 'numero_fixo' }, { kind: 'block', type: 'e_ou_logico' }
      ] },
    { kind: 'category', name: 'Sensor de Distância', colour: '40',
      contents: [{ kind: 'block', type: 'configurar_ultrassonico' }, { kind: 'block', type: 'ler_distancia_cm' }, { kind: 'block', type: 'mostrar_distancia' }, { kind: 'block', type: 'objeto_esta_perto' }] },
    { kind: 'category', name: 'Comunicação', colour: '160',
      contents: [{ kind: 'block', type: 'escrever_serial' }, { kind: 'block', type: 'escrever_serial_valor' }] },
  ]
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SetupProgress {
  etapa: number;
  total: number;
  msg: string;
}

type ArduinoStatus = 'checking' | 'ready' | 'missing' | 'downloading' | 'error';

interface IdeScreenProps {
  role: 'student' | 'teacher' | 'visitor';
  readOnly?: boolean;
  onBack: () => void;
  projectId?: string;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function IdeScreen({ role, readOnly = false, onBack, projectId }: IdeScreenProps) {
  const blocklyDiv   = useRef<HTMLDivElement>(null);
  const workspace    = useRef<Blockly.WorkspaceSvg | null>(null);

  const [board, setBoard]                   = useState<'nano' | 'esp32' | 'uno'>('uno');
  const [port, setPort]                     = useState('');
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [generatedCode, setGeneratedCode]   = useState('// O código C++ aparecerá aqui...');
  const [isSaving, setIsSaving]             = useState(false);
  const [projectName, setProjectName]       = useState('Projeto');
  const [saveStatus, setSaveStatus]         = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage]     = useState('');
  const [isSerialOpen, setIsSerialOpen]     = useState(false);
  const [serialMessages, setSerialMessages] = useState<string[]>([]);
  const messagesEndRef                      = useRef<HTMLDivElement>(null);
  const [isCodeVisible, setIsCodeVisible]   = useState(false);
  const [isFullscreenCode, setIsFullscreenCode] = useState(false);
  const [isUploading, setIsUploading]       = useState(false);
  const isUploadingRef                      = useRef(false);
  const [uploadSuccess, setUploadSuccess]   = useState(false);

  // ── Estado do arduino-cli ─────────────────────────────────────────────────
  const [arduinoStatus, setArduinoStatus]     = useState<ArduinoStatus>('checking');
  const [setupProgress, setSetupProgress]     = useState<SetupProgress | null>(null);
  const [setupError, setSetupError]           = useState('');
  const [showSetupModal, setShowSetupModal]   = useState(false);

  // ── Verificação do arduino-cli na montagem ────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const ok = await invoke<boolean>('check_arduino_cli');
        setArduinoStatus(ok ? 'ready' : 'missing');
        if (!ok) setShowSetupModal(true);
      } catch {
        // Provavelmente está rodando no browser (dev), ignora
        setArduinoStatus('ready');
      }
    };
    check();
  }, []);

  // ── Escuta eventos de progresso do setup ──────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<SetupProgress>('arduino-setup-progress', (e) => {
        setSetupProgress(e.payload);
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleSetupArduinoCli = async () => {
    setArduinoStatus('downloading');
    setSetupError('');
    setSetupProgress({ etapa: 0, total: 4, msg: 'Iniciando instalação...' });
    try {
      await invoke<string>('setup_arduino_cli');
      setArduinoStatus('ready');
      setShowSetupModal(false);
      setSetupProgress(null);
    } catch (err) {
      setArduinoStatus('error');
      setSetupError(String(err));
    }
  };

  // ── Tema Blockly ──────────────────────────────────────────────────────────
  const oficinaTheme = Blockly.Theme.defineTheme('oficinaTheme', {
    name: 'oficinaTheme', base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#f4f7f6', toolboxBackgroundColour: '#2f3542',
      toolboxForegroundColour: '#ffffff', flyoutBackgroundColour: '#3b4252',
      flyoutForegroundColour: '#ffffff', flyoutOpacity: 1,
      scrollbarColour: '#a4b0be', insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3,
    }
  });

  const fetchPorts = async () => {
    try {
      const ports = await invoke<string[]>('get_available_ports');
      setAvailablePorts(ports);
      if (ports.length > 0 && !ports.includes(port)) setPort(ports[0]);
    } catch (error) { console.error(error); }
  };

  useEffect(() => { currentBoardPins = BOARDS[board].pins; }, [board]);
  useEffect(() => { fetchPorts(); }, []);

  useEffect(() => {
    if (blocklyDiv.current && !workspace.current) {
      workspace.current = Blockly.inject(blocklyDiv.current, {
        toolbox: toolboxConfig,
        grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
        readOnly,
        move: { scrollbars: true, drag: true, wheel: true },
        theme: oficinaTheme,
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      });

      workspace.current.addChangeListener((event) => {
        if (event.isUiEvent) return;
        try { setGeneratedCode(cppGenerator.workspaceToCode(workspace.current!) || '// Arraste blocos para dentro de PREPARAR e AGIR!'); } catch (e) { console.error(e); }
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
    (async () => { unlisten = await listen<string>('serial-message', (e) => {
      setSerialMessages(prev => { const n = [...prev, e.payload]; return n.length > 20 ? n.slice(n.length - 20) : n; });
    }); })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleToggleSerial = async () => {
    try {
      if (isSerialOpen) { await invoke('stop_serial'); setIsSerialOpen(false); }
      else { setSerialMessages([]); await invoke('start_serial', { porta: port }); setIsSerialOpen(true); }
    } catch (error) { alert("Erro no Serial: " + error); }
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
    else { setErrorMessage(error.message); setSaveStatus('error'); }
  };

  const handleUploadCode = async () => {
    if (isUploadingRef.current) return;

    // Bloqueia se arduino-cli ainda não foi configurado
    if (arduinoStatus === 'missing' || arduinoStatus === 'error') {
      setShowSetupModal(true);
      return;
    }

    if (!generatedCode.includes('void setup()') || !generatedCode.includes('void loop()')) {
      setErrorMessage("As peças principais (PREPARAR e AGIR) não foram detectadas. Mexa em uma peça para atualizar antes de enviar!");
      setSaveStatus('error'); return;
    }
    try {
      isUploadingRef.current = true; setIsUploading(true); setSaveStatus(null);
      if (isSerialOpen) { await invoke('stop_serial'); setIsSerialOpen(false); }
      await invoke('upload_code', { codigo: generatedCode, placa: board, porta: port });
      setUploadSuccess(true);
    } catch (error) { setErrorMessage(String(error)); setSaveStatus('error'); }
    finally { isUploadingRef.current = false; setIsUploading(false); }
  };

  // ── Indicador de status do arduino-cli na topbar ──────────────────────────
  const arduinoStatusBadge = () => {
    if (arduinoStatus === 'checking') return (
      <span style={{ fontSize: '0.8rem', color: '#7f8c8d', padding: '4px 10px', background: '#f0f0f0', borderRadius: '100px' }}>
        🔍 Verificando...
      </span>
    );
    if (arduinoStatus === 'missing' || arduinoStatus === 'error') return (
      <button onClick={() => setShowSetupModal(true)}
        style={{ fontSize: '0.8rem', color: 'white', padding: '4px 12px', background: '#e74c3c', border: 'none', borderRadius: '100px', cursor: 'pointer', fontWeight: 800 }}>
        ⚠️ Configurar arduino-cli
      </button>
    );
    if (arduinoStatus === 'downloading') return (
      <span style={{ fontSize: '0.8rem', color: 'white', padding: '4px 10px', background: '#f39c12', borderRadius: '100px' }}>
        ⏳ Instalando...
      </span>
    );
    return null; // 'ready' — não mostra nada, não polui a UI
  };

  const projectTitle = projectId
    ? role === 'student'
      ? `Mesa: ${projectName}`
      : readOnly
        ? `Inspecionando: ${projectName}`
        : `Meu Projeto: ${projectName}`
    : '';

  // ── Barra de progresso do setup ───────────────────────────────────────────
  const progressPercent = setupProgress
    ? Math.round((setupProgress.etapa / setupProgress.total) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>

        {/* Logo + título + badge status arduino */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '35px' }} />
          {projectTitle && <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--dark)' }}>{projectTitle}</h2>}
          {arduinoStatusBadge()}
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
                ? <option value="">Conecte o cabo...</option>
                : availablePorts.map(p => <option key={p} value={p}>{p}</option>)
              }
            </select>
            <button onClick={fetchPorts} className="btn-icon" title="Buscar portas">🔄</button>
          </div>
          <div className="control-divider" />
          <button
            onClick={handleUploadCode}
            className="btn-action btn-send"
            disabled={isUploading || arduinoStatus === 'downloading'}
            title={arduinoStatus === 'missing' ? 'arduino-cli não instalado — clique para configurar' : 'Enviar código para o robô'}
            style={{
              opacity: (isUploading || arduinoStatus === 'downloading') ? 0.7 : 1,
              cursor: (isUploading || arduinoStatus === 'downloading') ? 'wait' : 'pointer',
              background: (arduinoStatus === 'missing' || arduinoStatus === 'error') ? '#e74c3c' : undefined,
            }}
          >
            {isUploading ? '⏳ Compilando...' : '🚀 Enviar'}
          </button>
          <button className={`btn-action ${isSerialOpen ? 'btn-chat-active' : 'btn-chat'}`} onClick={handleToggleSerial}>
            {isSerialOpen ? '🛑 Parar' : '💬 Chat'}
          </button>
        </div>

        {/* Botões da direita */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {role !== 'student' && (
            <button className="btn-secondary" onClick={() => setIsCodeVisible(!isCodeVisible)}
              style={{ margin: 0, backgroundColor: '#34495e', boxShadow: '0 4px 0px #2c3e50' }}>
              {isCodeVisible ? '🙈 Ocultar Código' : '💻 Ver Código'}
            </button>
          )}
          {(role === 'student' || (role === 'teacher' && !readOnly)) && projectId && (
            <button className="btn-primary" onClick={handleSaveProject} disabled={isSaving} style={{ margin: 0 }}>
              {isSaving ? '⏳ A gravar...' : '💾 Salvar'}
            </button>
          )}
          <button className="btn-danger" onClick={onBack} style={{ margin: 0 }}>Sair</button>
        </div>
      </div>

      {/* Workspace */}
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Código (C++)</h3>
              <button onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                style={{ background: 'transparent', border: '1px solid #a4b0be', color: '#a4b0be', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', margin: 0 }}>
                {isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}
              </button>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* ── MODAL: SETUP DO ARDUINO-CLI ─────────────────────────────────────── */}
      {showSetupModal && (
        <div style={{ position:'fixed',top:0,left:0,width:'100vw',height:'100vh',backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:99999 }}>
          <div style={{ backgroundColor:'white',padding:'40px',borderRadius:'24px',width:'90%',maxWidth:'480px',textAlign:'center',boxShadow:'0 20px 50px rgba(0,0,0,0.3)' }}>

            {arduinoStatus === 'downloading' ? (
              /* ── Progresso do download ── */
              <>
                <div style={{ fontSize:'4rem',marginBottom:'10px' }}>⚙️</div>
                <h2 style={{ color:'var(--dark)',marginBottom:'10px' }}>Instalando arduino-cli</h2>
                <p style={{ color:'#7f8c8d',marginBottom:'20px',fontSize:'1rem' }}>
                  {setupProgress?.msg ?? 'Aguarde...'}
                </p>
                {/* Barra de progresso */}
                <div style={{ background:'#e0e6ed',borderRadius:'100px',height:'14px',marginBottom:'8px',overflow:'hidden' }}>
                  <div style={{
                    background:'linear-gradient(90deg, #00a8ff, #4cd137)',
                    height:'100%',
                    width:`${progressPercent}%`,
                    borderRadius:'100px',
                    transition:'width 0.4s ease',
                  }} />
                </div>
                <p style={{ color:'#a4b0be',fontSize:'0.85rem' }}>
                  Etapa {setupProgress?.etapa ?? 0} de {setupProgress?.total ?? 4}
                </p>
                <p style={{ color:'#e67e22',fontSize:'0.9rem',marginTop:'12px',fontWeight:700 }}>
                  ⚠️ Não feche o programa durante a instalação
                </p>
              </>
            ) : arduinoStatus === 'error' ? (
              /* ── Erro ── */
              <>
                <div style={{ fontSize:'4rem',marginBottom:'10px' }}>❌</div>
                <h2 style={{ color:'var(--dark)',marginBottom:'10px' }}>Falha na instalação</h2>
                <p style={{ color:'#7f8c8d',marginBottom:'15px',fontSize:'0.95rem' }}>
                  Ocorreu um erro ao instalar o arduino-cli:
                </p>
                <pre style={{ background:'#f8f9fa',padding:'12px',borderRadius:'8px',textAlign:'left',fontSize:'0.8rem',color:'#c0392b',overflowX:'auto',marginBottom:'20px',maxHeight:'120px',overflowY:'auto' }}>
                  {setupError}
                </pre>
                <p style={{ color:'#7f8c8d',fontSize:'0.9rem',marginBottom:'20px' }}>
                  Verifique a sua conexão com a internet e tente novamente.
                </p>
                <div style={{ display:'flex',gap:'10px' }}>
                  <button className="btn-text" style={{ flex:1 }} onClick={() => setShowSetupModal(false)}>
                    Fechar
                  </button>
                  <button className="btn-primary" style={{ flex:2 }} onClick={handleSetupArduinoCli}>
                    🔄 Tentar Novamente
                  </button>
                </div>
              </>
            ) : (
              /* ── Prompt inicial ── */
              <>
                <div style={{ fontSize:'4rem',marginBottom:'10px' }}>🔧</div>
                <h2 style={{ color:'var(--dark)',marginBottom:'10px' }}>arduino-cli não encontrado</h2>
                <p style={{ color:'#7f8c8d',marginBottom:'20px',fontSize:'1rem',lineHeight:1.6 }}>
                  O programa precisa do <strong>arduino-cli</strong> para compilar e enviar código para o robô.
                  <br /><br />
                  Vamos baixar e instalar automaticamente agora.<br />
                  <strong>Necessário: conexão com a internet.</strong>
                </p>
                <div style={{ background:'#f8fafd',borderRadius:'12px',padding:'12px',marginBottom:'20px',textAlign:'left',fontSize:'0.9rem',color:'#2c3e50' }}>
                  <strong>O que será instalado:</strong>
                  <ul style={{ margin:'8px 0 0 20px',lineHeight:1.8 }}>
                    <li>arduino-cli (ferramenta de compilação)</li>
                    <li>Suporte para Arduino Uno e Nano (AVR)</li>
                  </ul>
                  <p style={{ margin:'8px 0 0',color:'#7f8c8d',fontSize:'0.85rem' }}>
                    Suporte para ESP32 será instalado automaticamente na primeira vez que você enviar código para um ESP32.
                  </p>
                </div>
                <div style={{ display:'flex',gap:'10px' }}>
                  <button className="btn-text" style={{ flex:1 }} onClick={() => setShowSetupModal(false)}>
                    Agora não
                  </button>
                  <button className="btn-primary" style={{ flex:2, padding:'14px', fontSize:'1.05rem' }}
                    onClick={handleSetupArduinoCli}>
                    ⬇️ Instalar agora
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modais de feedback existentes ──────────────────────────────────── */}
      {saveStatus === 'success' && (
        <div style={{ position:'fixed',top:0,left:0,width:'100vw',height:'100vh',backgroundColor:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:99999 }}>
          <div style={{ backgroundColor:'white',padding:'40px',borderRadius:'24px',width:'90%',maxWidth:'400px',textAlign:'center',boxShadow:'0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'4.5rem',marginBottom:'10px' }}>✅</div>
            <h2 style={{ color:'var(--dark)',marginBottom:'15px' }}>Projeto Salvo!</h2>
            <p style={{ color:'#7f8c8d',marginBottom:'25px',fontSize:'1.1rem' }}>As suas peças e progressos foram guardados na nuvem.</p>
            <button className="btn-primary" style={{ width:'100%',padding:'14px',fontSize:'1.1rem' }} onClick={() => setSaveStatus(null)}>Continuar</button>
          </div>
        </div>
      )}
      {saveStatus === 'error' && (
        <div style={{ position:'fixed',top:0,left:0,width:'100vw',height:'100vh',backgroundColor:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:99999 }}>
          <div style={{ backgroundColor:'white',padding:'40px',borderRadius:'24px',width:'90%',maxWidth:'400px',textAlign:'center',boxShadow:'0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'4.5rem',marginBottom:'10px' }}>❌</div>
            <h2 style={{ color:'var(--dark)',marginBottom:'15px' }}>Ocorreu um Erro</h2>
            <p style={{ color:'#7f8c8d',marginBottom:'25px',fontSize:'1rem' }}>{errorMessage}</p>
            <button className="btn-danger" style={{ width:'100%',padding:'14px' }} onClick={() => setSaveStatus(null)}>Tentar Novamente</button>
          </div>
        </div>
      )}
      {uploadSuccess && (
        <div style={{ position:'fixed',top:0,left:0,width:'100vw',height:'100vh',backgroundColor:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:99999 }}>
          <div style={{ backgroundColor:'white',padding:'40px',borderRadius:'24px',width:'90%',maxWidth:'400px',textAlign:'center',boxShadow:'0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'4.5rem',marginBottom:'10px' }}>🚀</div>
            <h2 style={{ color:'var(--dark)',marginBottom:'15px' }}>Código Enviado!</h2>
            <p style={{ color:'#7f8c8d',marginBottom:'25px',fontSize:'1.1rem' }}>O seu robô já está a executar as novas instruções perfeitamente.</p>
            <button className="btn-primary" style={{ width:'100%',padding:'14px',fontSize:'1.1rem' }} onClick={() => setUploadSuccess(false)}>Continuar</button>
          </div>
        </div>
      )}
      {isSerialOpen && (
        <div style={{ position:'fixed',bottom:'20px',right:'20px',width:'350px',height:'400px',backgroundColor:'#fff',borderRadius:'16px',boxShadow:'0 10px 30px rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',zIndex:9000,overflow:'hidden',border:'2px solid #e0e6ed' }}>
          <div style={{ backgroundColor:'#2c3e50',color:'white',padding:'15px',fontWeight:'bold',display:'flex',justifyContent:'space-between' }}>
            <span>🤖 O Robô diz...</span>
            <span style={{ cursor:'pointer' }} onClick={handleToggleSerial}>✕</span>
          </div>
          <div style={{ flex:1,padding:'15px',overflowY:'auto',backgroundColor:'#f8fafd',display:'flex',flexDirection:'column',gap:'10px' }}>
            {serialMessages.length === 0
              ? <p style={{ color:'#a4b0be',textAlign:'center',marginTop:'50px',fontStyle:'italic' }}>Aguardando o robô falar...</p>
              : serialMessages.map((msg, idx) => (
                <div key={idx} style={{ backgroundColor:'#dfe6e9',padding:'10px 15px',borderRadius:'15px',borderBottomLeftRadius:'2px',alignSelf:'flex-start',color:'#2d3436',maxWidth:'85%',wordBreak:'break-word',fontFamily:'monospace' }}>{msg}</div>
              ))
            }
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}