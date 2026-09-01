import * as Blockly from 'blockly/core';
import type { BoardKey } from './boards';
import { LOOP_TYPES, SETUP_ONLY_TYPES, type VariableCppType } from './contracts';
import { toCppIdentifier } from './identifiers';
import { synchronizeVariableTypes, synchronizeListTypes } from './variableTypes';

export const cppGenerator = new Blockly.Generator('CPP');
let targetBoard: BoardKey = 'uno';

function cppStringLiteral(value: unknown): string {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}"`;
}

function floatLiteral(value: unknown, fallback = 0): string {
  const parsed = Number(value);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return Number.isInteger(number) ? `${number}.0f` : `${number}f`;
}

// IDs de bloco do Blockly podem conter caracteres inválidos num identificador
// C++ (ex. `-`) — usados para nomear a variável global de estado por
// instância do bloco "mudou_para_verdadeiro" (um bloco, uma borda lembrada).
function sanitizeBlockId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function isInsideLoop(block: Blockly.Block): boolean {
  let parent = block.getSurroundParent();
  while (parent) {
    if (LOOP_TYPES.has(parent.type)) {
      return true;
    }
    parent = parent.getSurroundParent();
  }
  return false;
}

function distinctName(base: string): string {
  if (!cppGenerator.nameDB_) {
    cppGenerator.nameDB_ = new Blockly.Names((cppGenerator as Blockly.Generator & {
      RESERVED_WORDS_?: string;
    }).RESERVED_WORDS_ ?? '');
  }
  return cppGenerator.nameDB_.getDistinctName(base, Blockly.Names.NameType.VARIABLE);
}

function variableCppType(block: Blockly.Block): VariableCppType {
  const type = block.getFieldValue('TIPO');
  return type === 'float' || type === 'bool' || type === 'string' ? type : 'int';
}

// O id interno de tipo ('string') não é uma palavra-chave C++ válida — a
// classe do Arduino core é `String`, maiúscula. int/float/bool já coincidem
// com a palavra-chave C++ real, então passam direto.
function cppTypeKeyword(type: VariableCppType): string {
  return type === 'string' ? 'String' : type;
}

function defaultVariableValue(type: VariableCppType): string {
  if (type === 'float') return '0.0f';
  if (type === 'bool') return 'false';
  if (type === 'string') return '""';
  return '0';
}

const GLOBAL_INITIALIZER_VALUE_TYPES = new Set([
  'numero_fixo',
  'valor_booleano_fixo',
  'texto_fixo',
  'operacao_matematica',
  'potencia',
  'minimo_maximo',
  'funcao_matematica',
  'valor_absoluto',
  'mapear_valor',
  'constrain_valor',
  'util_map_float',
  'util_fabsf',
  'numero_para_booleano',
  'booleano_para_numero',
]);

function isSafeGlobalInitializer(block: Blockly.Block | null): boolean {
  if (!block || !GLOBAL_INITIALIZER_VALUE_TYPES.has(block.type)) return false;
  return block.getChildren(false).every((child) => isSafeGlobalInitializer(child));
}

interface DeferredInitializer {
  name: string;
  code: string;
  dependencies: string[];
}

function initializerVariableDependencies(block: Blockly.Block): string[] {
  return [...new Set(
    block.getDescendants(false)
      .filter((descendant) => descendant.type === 'ler_variavel')
      .map((descendant) => toCppIdentifier(
        descendant.getFieldValue('NOME'),
        'minha_var',
        'var',
      )),
  )];
}

function orderDeferredInitializers(
  initializers: DeferredInitializer[],
): DeferredInitializer[] {
  const byName = new Map<string, DeferredInitializer>();
  for (const initializer of initializers) {
    if (!byName.has(initializer.name)) byName.set(initializer.name, initializer);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: DeferredInitializer[] = [];

  const visit = (initializer: DeferredInitializer) => {
    if (visited.has(initializer.name) || visiting.has(initializer.name)) return;
    visiting.add(initializer.name);
    for (const dependency of initializer.dependencies) {
      const dependencyInitializer = byName.get(dependency);
      if (dependencyInitializer) visit(dependencyInitializer);
    }
    visiting.delete(initializer.name);
    visited.add(initializer.name);
    ordered.push(initializer);
  };

  for (const initializer of initializers) visit(initializer);
  return ordered;
}

function directStatementChain(root: Blockly.Block, inputName: string): Blockly.Block[] {
  const statements: Blockly.Block[] = [];
  let current = root.getInputTargetBlock(inputName);
  while (current) {
    statements.push(current);
    current = current.nextConnection?.targetBlock() ?? null;
  }
  return statements;
}

function statementCodeOnly(block: Blockly.Block): string {
  const code = cppGenerator.blockToCode(block, true);
  return Array.isArray(code) ? code[0] : code;
}

function buildSetupCode(
  setupRoot: Blockly.Block | null,
  automaticLines: string[],
  deferredLines: string[],
): string {
  const directStatements = setupRoot ? directStatementChain(setupRoot, 'DO') : [];
  const configurations = directStatements.filter((block) => SETUP_ONLY_TYPES.has(block.type));
  const actions = directStatements.filter((block) => !SETUP_ONLY_TYPES.has(block.type));
  const body = [
    ...automaticLines.map((line) => `  ${line}\n`),
    ...configurations.map(statementCodeOnly),
    ...deferredLines.map((line) => `  ${line}\n`),
    ...actions.map(statementCodeOnly),
  ].join('');
  return `void setup() {\n  Serial.begin(115200);\n${body || '  // Suas configurações entrarão aqui...\n'}}\n\n`;
}

export function initGenerators() {
  cppGenerator.scrub_ = function (block, code, opt_thisOnly) {
    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = opt_thisOnly ? '' : cppGenerator.blockToCode(nextBlock);
    return code + nextCode;
  };

  // Estrutura
  cppGenerator.forBlock['bloco_setup'] = (b: Blockly.Block) => buildSetupCode(b, [], []);
  cppGenerator.forBlock['bloco_loop'] = (b: Blockly.Block) => `void loop() {\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`;

  // Pinos
  cppGenerator.forBlock['configurar_pino'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, ${b.getFieldValue('MODE')});\n`;
  cppGenerator.forBlock['escrever_pino'] = (b: Blockly.Block) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`;
  cppGenerator.forBlock['escrever_pino_booleano'] = (b: Blockly.Block) => {
    const state = cppGenerator.valueToCode(b, 'STATE', 0) || 'false';
    return `  digitalWrite(${b.getFieldValue('PIN')}, (${state}) ? HIGH : LOW);\n`;
  };
  cppGenerator.forBlock['ler_pino_digital'] = (b: Blockly.Block) => [`digitalRead(${b.getFieldValue('PIN')})`, 0];
  cppGenerator.forBlock['escrever_pino_pwm'] = (b: Blockly.Block) => {
    const value = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
    return `  analogWrite(${b.getFieldValue('PIN')}, (int)_bloquin_limitar((float)(${value}), 0.0f, 255.0f));\n`;
  };
  cppGenerator.forBlock['ler_pino_analogico'] = (b: Blockly.Block) => [`analogRead(${b.getFieldValue('PIN')})`, 0];

  // Controle e Temporizadores
  cppGenerator.forBlock['esperar'] = (b: Blockly.Block) => `  delay(${b.getFieldValue('TIME')});\n`;
  cppGenerator.forBlock['esperar_duracao'] = (b: Blockly.Block) => {
    const waitVar = distinctName('tempoEspera');
    const duration = cppGenerator.valueToCode(b, 'TIME', 99) || '0';
    return `  float ${waitVar} = (float)(${duration});\n  if (${waitVar} > 0.0f) delay((unsigned long)${waitVar});\n`;
  };
  cppGenerator.forBlock['repetir_vezes'] = (b: Blockly.Block) => {
    const loopVar = distinctName('i');
    return `  for (int ${loopVar} = 0; ${loopVar} < ${b.getFieldValue('TIMES')}; ${loopVar}++) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
  };
  cppGenerator.forBlock['repetir_quantidade'] = (b: Blockly.Block) => {
    const countVar = distinctName('quantidade');
    const loopVar = distinctName('i');
    const amount = cppGenerator.valueToCode(b, 'TIMES', 99) || '0';
    return `  long ${countVar} = (long)(${amount});\n  if (${countVar} < 0) ${countVar} = 0;\n  for (long ${loopVar} = 0; ${loopVar} < ${countVar}; ${loopVar}++) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
  };
  cppGenerator.forBlock['a_cada_x_ms'] = (b: Blockly.Block) => {
    const timerVar = distinctName('timer');
    const ms = b.getFieldValue('MS');
    const doCode = cppGenerator.statementToCode(b, 'DO') || '';
    return `  static unsigned long ${timerVar} = 0;\n  if (millis() - ${timerVar} >= ${ms}) {\n    ${timerVar} = millis();\n${doCode}  }\n`;
  };
  cppGenerator.forBlock['enquanto_verdadeiro'] = (b: Blockly.Block) => `  while (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
  cppGenerator.forBlock['parar_repeticao'] = (b: Blockly.Block) =>
    isInsideLoop(b)
      ? '  break;\n'
      : '  // “Parar repetição” ignorado: o bloco não está dentro de uma repetição.\n';

  // Condições e Matemática
  cppGenerator.forBlock['se_entao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  }\n`;
  cppGenerator.forBlock['se_entao_senao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  } else {\n${cppGenerator.statementToCode(b, 'SENAO') || ''}  }\n`;
  cppGenerator.forBlock['comparar_valores'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || '0'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || '0'})`, 0];
  cppGenerator.forBlock['numero_fixo'] = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];
  cppGenerator.forBlock['e_ou_logico'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || 'false'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || 'false'})`, 0];
  cppGenerator.forBlock['nao_logico'] = (b: Blockly.Block) => [`!(${cppGenerator.valueToCode(b, 'VALOR', 0) || 'false'})`, 0];
  cppGenerator.forBlock['numero_para_booleano'] = (b: Blockly.Block) => [`((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}) != 0.0f)`, 0];
  cppGenerator.forBlock['booleano_para_numero'] = (b: Blockly.Block) => [`((${cppGenerator.valueToCode(b, 'VALOR', 0) || 'false'}) ? 1 : 0)`, 0];
  cppGenerator.forBlock['mudou_para_verdadeiro'] = (b: Blockly.Block) => {
    const condition = cppGenerator.valueToCode(b, 'VALOR', 0) || 'false';
    return [`_bloquin_borda(_borda_${sanitizeBlockId(b.id)}, (${condition}))`, 0];
  };
  cppGenerator.forBlock['mapear_valor'] = (b: Blockly.Block) => [`_bloquin_mapFloat((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}), ${floatLiteral(b.getFieldValue('DE_MIN'))}, ${floatLiteral(b.getFieldValue('DE_MAX'))}, ${floatLiteral(b.getFieldValue('PARA_MIN'))}, ${floatLiteral(b.getFieldValue('PARA_MAX'))})`, 0];
  cppGenerator.forBlock['operacao_matematica'] = (b: Blockly.Block) => {
    const a = cppGenerator.valueToCode(b, 'A', 99) || '0';
    const bv = cppGenerator.valueToCode(b, 'B', 99) || '0';
    if (b.getFieldValue('OP') === '/') return [`_bloquin_dividir((float)(${a}), (float)(${bv}))`, 0];
    if (b.getFieldValue('OP') === '%') return [`_bloquin_resto((float)(${a}), (float)(${bv}))`, 0];
    return [`(${a} ${b.getFieldValue('OP')} ${bv})`, 0];
  };
  cppGenerator.forBlock['potencia'] = (b: Blockly.Block) => [`powf((float)(${cppGenerator.valueToCode(b, 'BASE', 99) || '0'}), (float)(${cppGenerator.valueToCode(b, 'EXPOENTE', 99) || '0'}))`, 0];
  cppGenerator.forBlock['minimo_maximo'] = (b: Blockly.Block) => {
    const fn = b.getFieldValue('OP') === 'MAX' ? 'fmaxf' : 'fminf';
    return [`${fn}((float)(${cppGenerator.valueToCode(b, 'A', 99) || '0'}), (float)(${cppGenerator.valueToCode(b, 'B', 99) || '0'}))`, 0];
  };
  cppGenerator.forBlock['funcao_matematica'] = (b: Blockly.Block) => {
    const value = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
    const operation = b.getFieldValue('OP');
    if (operation === 'FLOOR') return [`floorf((float)(${value}))`, 0];
    if (operation === 'CEIL') return [`ceilf((float)(${value}))`, 0];
    if (operation === 'SQRT') return [`sqrtf(fmaxf(0.0f, (float)(${value})))`, 0];
    return [`roundf((float)(${value}))`, 0];
  };
  cppGenerator.forBlock['valor_absoluto'] = (b: Blockly.Block) => [`fabsf((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}))`, 0];
  cppGenerator.forBlock['constrain_valor'] = (b: Blockly.Block) => {
    const first = Number(b.getFieldValue('MIN'));
    const second = Number(b.getFieldValue('MAX'));
    const minimum = Number.isFinite(first) && Number.isFinite(second) ? Math.min(first, second) : 0;
    const maximum = Number.isFinite(first) && Number.isFinite(second) ? Math.max(first, second) : 255;
    return [`_bloquin_limitar((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}), ${floatLiteral(minimum)}, ${floatLiteral(maximum)})`, 0];
  };
  cppGenerator.forBlock['random_valor'] = (b: Blockly.Block) => {
    const first = Number(b.getFieldValue('MIN'));
    const maximum = Number(b.getFieldValue('MAX'));
    const minimum = Number.isFinite(first) && Number.isFinite(maximum) ? Math.min(first, maximum) : 0;
    const inclusiveMaximum = Number.isFinite(first) && Number.isFinite(maximum) ? Math.max(first, maximum) + 1 : 101;
    return [`random(${minimum}, ${inclusiveMaximum})`, 0];
  };
  cppGenerator.forBlock['millis_atual'] = (_b: Blockly.Block) => [`millis()`, 0];

  // Variáveis
  cppGenerator.forBlock['declarar_variavel_global'] = (b: Blockly.Block) => {
    const type = variableCppType(b);
    return `${cppTypeKeyword(type)} ${toCppIdentifier(b.getFieldValue('NOME'), 'minha_var', 'var')} = ${cppGenerator.valueToCode(b, 'VALOR', 99) || defaultVariableValue(type)};\n`;
  };
  cppGenerator.forBlock['atribuir_variavel'] = (b: Blockly.Block) => `  ${toCppIdentifier(b.getFieldValue('NOME'), 'minha_var', 'var')} = ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'};\n`;
  cppGenerator.forBlock['ler_variavel'] = (b: Blockly.Block) => [toCppIdentifier(b.getFieldValue('NOME'), 'minha_var', 'var'), 0];
  cppGenerator.forBlock['incrementar_variavel'] = (b: Blockly.Block) => `  ${toCppIdentifier(b.getFieldValue('NOME'), 'contador', 'var')} += ${cppGenerator.valueToCode(b, 'VALOR', 99) || '1'};\n`;

  // Listas — fallback para o caso raro do bloco não estar solto no
  // workspace (o caminho normal é tratado como topBlock em generateCode,
  // igual a declarar_variavel_global).
  cppGenerator.forBlock['declarar_lista_global'] = (b: Blockly.Block) => {
    const type = variableCppType(b);
    const tamanho = Math.max(1, Math.round(Number(b.getFieldValue('TAMANHO')) || 1));
    return `${cppTypeKeyword(type)} ${toCppIdentifier(b.getFieldValue('NOME'), 'minha_lista', 'var')}[${tamanho}] = {};\n`;
  };
  // sizeof(nome)/sizeof(nome[0]) dá o tamanho declarado em tempo de
  // compilação — dispensa o gerador JS guardar um mapa nome→tamanho.
  cppGenerator.forBlock['lista_definir_item'] = (b: Blockly.Block) => {
    const nome = toCppIdentifier(b.getFieldValue('NOME'), 'minha_lista', 'var');
    const indice = cppGenerator.valueToCode(b, 'INDICE', 99) || '0';
    const valor = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
    return `  ${nome}[_bloquin_indiceLista((long)(${indice}), sizeof(${nome}) / sizeof(${nome}[0]))] = ${valor};\n`;
  };
  cppGenerator.forBlock['lista_ler_item'] = (b: Blockly.Block) => {
    const nome = toCppIdentifier(b.getFieldValue('NOME'), 'minha_lista', 'var');
    const indice = cppGenerator.valueToCode(b, 'INDICE', 99) || '0';
    return [`${nome}[_bloquin_indiceLista((long)(${indice}), sizeof(${nome}) / sizeof(${nome}[0]))]`, 0];
  };
  cppGenerator.forBlock['lista_tamanho'] = (b: Blockly.Block) => {
    const nome = toCppIdentifier(b.getFieldValue('NOME'), 'minha_lista', 'var');
    return [`(long)(sizeof(${nome}) / sizeof(${nome}[0]))`, 0];
  };

  // Armazenamento permanente — a chave literal do bloco basta: cada
  // plataforma resolve o deslocamento/namespace por conta própria dentro
  // do helper (ver headers em generateCode), sem o gerador JS precisar
  // de um mapa chave→posição.
  cppGenerator.forBlock['armazenamento_salvar'] = (b: Blockly.Block) => {
    const chave = cppStringLiteral(b.getFieldValue('CHAVE'));
    const valor = cppGenerator.valueToCode(b, 'VALOR', 99) || '0';
    return `  _bloquin_eepromSalvar(${chave}, (float)(${valor}));\n`;
  };
  cppGenerator.forBlock['armazenamento_ler'] = (b: Blockly.Block) => {
    const chave = cppStringLiteral(b.getFieldValue('CHAVE'));
    const padrao = cppGenerator.valueToCode(b, 'PADRAO', 99) || '0';
    return [`_bloquin_eepromLer(${chave}, (float)(${padrao}))`, 0];
  };
  cppGenerator.forBlock['valor_booleano_fixo'] = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];
  cppGenerator.forBlock['texto_fixo'] = (b: Blockly.Block) => [cppStringLiteral(b.getFieldValue('TEXT')), 0];

  // Texto — aceitam Number/Boolean/String nas entradas flexíveis, mesmo
  // contrato já usado por "O Robô Diz" (escrever_serial_valor): String(x)
  // resolve para o construtor certo (int/float/bool/String) em cada caso.
  cppGenerator.forBlock['comparar_texto'] = (b: Blockly.Block) => {
    const a = cppGenerator.valueToCode(b, 'A', 0) || '""';
    const bv = cppGenerator.valueToCode(b, 'B', 0) || '""';
    return [`(String(${a}) ${b.getFieldValue('OP')} String(${bv}))`, 0];
  };
  cppGenerator.forBlock['concatenar_texto'] = (b: Blockly.Block) => {
    const a = cppGenerator.valueToCode(b, 'A', 0) || '""';
    const bv = cppGenerator.valueToCode(b, 'B', 0) || '""';
    return [`(String(${a}) + String(${bv}))`, 0];
  };
  cppGenerator.forBlock['comprimento_texto'] = (b: Blockly.Block) => [`(String(${cppGenerator.valueToCode(b, 'VALOR', 0) || '""'}).length())`, 0];
  cppGenerator.forBlock['texto_contem'] = (b: Blockly.Block) => {
    const a = cppGenerator.valueToCode(b, 'A', 0) || '""';
    const bv = cppGenerator.valueToCode(b, 'B', 0) || '""';
    return [`(String(${a}).indexOf(String(${bv})) >= 0)`, 0];
  };
  // Wrap com String(): a entrada é tipada como String no Blockly, mas o C++
  // gerado por "texto_fixo" é um literal `const char[]` puro (sem .toFloat()),
  // não um objeto String — só blocos como "Ler Texto da Serial"/Bluetooth ou
  // uma variável de texto já devolvem String de verdade.
  cppGenerator.forBlock['texto_para_numero'] = (b: Blockly.Block) => [`String(${cppGenerator.valueToCode(b, 'VALOR', 0) || '""'}).toFloat()`, 0];
  cppGenerator.forBlock['numero_para_texto'] = (b: Blockly.Block) => [`String(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'})`, 0];

  // Funções
  cppGenerator.forBlock['definir_funcao'] = (b: Blockly.Block) => {
    return `void ${toCppIdentifier(b.getFieldValue('NOME'), 'minhaFuncao', 'fn')}() {\n${cppGenerator.statementToCode(b, 'DO') || ''}}\n\n`;
  };
  cppGenerator.forBlock['chamar_funcao'] = (b: Blockly.Block) => `  ${toCppIdentifier(b.getFieldValue('NOME'), 'minhaFuncao', 'fn')}();\n`;
  cppGenerator.forBlock['definir_funcao_retorno'] = (b: Blockly.Block) => {
    const nome = toCppIdentifier(b.getFieldValue('NOME'), 'calcular', 'fn');
    const corpo = cppGenerator.statementToCode(b, 'DO') || '';
    const ret = cppGenerator.valueToCode(b, 'RETURN', 99) || '0.0f';
    return `float ${nome}() {\n${corpo}  return (float)(${ret});\n}\n\n`;
  };
  cppGenerator.forBlock['chamar_funcao_retorno'] = (b: Blockly.Block) => [`${toCppIdentifier(b.getFieldValue('NOME'), 'calcular', 'fn')}()`, 0];

  // ESP-NOW
  cppGenerator.forBlock['espnow_iniciar_wifi'] = (_b: Blockly.Block) => `  WiFi.mode(WIFI_STA);\n  WiFi.disconnect();\n  delay(100);\n`;
  cppGenerator.forBlock['espnow_mac_serial'] = (_b: Blockly.Block) => `  Serial.print("[INFO] MAC: ");\n  Serial.println(WiFi.macAddress());\n`;
  // Ao contrário da versão anterior, falha de inicialização/peer NÃO trava o
  // sketch para sempre num `while(true)`: isso impediria qualquer fail-safe
  // (nem o timeout do receptor rodaria). Em vez disso, guardamos o estado em
  // `_espnow_ok` e o usuário pode consultá-lo com "ESP-NOW iniciou com
  // sucesso?" para decidir o que fazer.
  cppGenerator.forBlock['espnow_transmissor_init'] = (_b: Blockly.Block) =>
    `  _espnow_ok = (esp_now_init() == ESP_OK);\n` +
    `  if (_espnow_ok) {\n` +
    `    esp_now_register_send_cb(_bloquin_OnDataSent);\n` +
    `    Serial.println("[OK] ESP-NOW iniciado (transmissor).");\n` +
    `  } else {\n` +
    `    Serial.println("[ERRO] ESP-NOW falhou ao iniciar. Verifique se a placa é um ESP32.");\n` +
    `  }\n`;

  cppGenerator.forBlock['espnow_adicionar_receptor'] = (b: Blockly.Block) => {
    const mac = (b.getFieldValue('MAC') || 'AA:BB:CC:DD:EE:FF');
    const normalizedMac = String(mac).replace(/-/g, ':').trim();
    const safeMac = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(normalizedMac)
      ? normalizedMac
      : 'FF:FF:FF:FF:FF:FF';
    const parts = safeMac.split(':').map((p: string) => `0x${p.toUpperCase()}`);
    return (
      `  if (_espnow_ok) {\n` +
      `    uint8_t _tmp_mac[6] = {${parts.join(', ')}};\n` +
      `    memcpy(_espnow_peer_mac, _tmp_mac, 6);\n` +
      `    if (esp_now_is_peer_exist(_espnow_peer_mac)) esp_now_del_peer(_espnow_peer_mac);\n` +
      `    esp_now_peer_info_t _pi = {};\n` +
      `    memcpy(_pi.peer_addr, _espnow_peer_mac, 6);\n` +
      `    _pi.channel = 0;\n` +
      `    _pi.encrypt = false;\n` +
      `    _pi.ifidx = WIFI_IF_STA;\n` +
      `    if (esp_now_add_peer(&_pi) != ESP_OK) {\n` +
      `      _espnow_ok = false;\n` +
      `      Serial.println("[ERRO] Falha ao conectar ao receptor.");\n` +
      `    }\n` +
      `  }\n`
    );
  };

  cppGenerator.forBlock['espnow_enviar_pacote'] = (b: Blockly.Block) => `  _BloquinMensagem _pkt = {};\n  _pkt.valorA = (float)(${cppGenerator.valueToCode(b, 'PITCH', 99) || '0.0f'});\n  _pkt.valorB  = (float)(${cppGenerator.valueToCode(b, 'ROLL', 99) || '0.0f'});\n  _pkt.sinal = ${cppGenerator.valueToCode(b, 'PARAR', 0) || 'false'};\n  esp_now_send(_espnow_peer_mac, (uint8_t*)&_pkt, sizeof(_pkt));\n`;
  cppGenerator.forBlock['espnow_receptor_init'] = (_b: Blockly.Block) =>
    `  _espnow_ok = (esp_now_init() == ESP_OK);\n` +
    `  if (_espnow_ok) {\n` +
    `    esp_now_register_recv_cb(_bloquin_OnDataRecv);\n` +
    `    Serial.println("[OK] ESP-NOW iniciado (receptor).");\n` +
    `  } else {\n` +
    `    Serial.println("[ERRO] ESP-NOW falhou ao iniciar. Verifique se a placa é um ESP32.");\n` +
    `  }\n`;
  cppGenerator.forBlock['espnow_tem_dados_novos'] = (_b: Blockly.Block) => [`_bloquin_temDadosNovos()`, 0];
  cppGenerator.forBlock['espnow_ler_pitch'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowPitch()`, 0];
  cppGenerator.forBlock['espnow_ler_roll'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowRoll()`, 0];
  cppGenerator.forBlock['espnow_ler_flag_parar'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowParar()`, 0];
  cppGenerator.forBlock['espnow_timeout_ms'] = (b: Blockly.Block) => [`_bloquin_espnowTimeout(${b.getFieldValue('MS')}UL)`, 0];
  cppGenerator.forBlock['espnow_marcar_lido'] = (_b: Blockly.Block) => `  _bloquin_marcarEspnowLido();\n`;

  // ESP-NOW — mensagem genérica: o mesmo envelope (tipo + valorA/B/C + sinal)
  // serve para telemetria de sensor, comandos de motor, LED, etc. Os blocos
  // "pitch/roll/parar" acima são um alias legado sobre os mesmos campos.
  cppGenerator.forBlock['espnow_enviar_mensagem'] = (b: Blockly.Block) => {
    const tipo = b.getFieldValue('TIPO');
    const a = cppGenerator.valueToCode(b, 'A', 99) || '0.0f';
    const bv = cppGenerator.valueToCode(b, 'B', 99) || '0.0f';
    const c = cppGenerator.valueToCode(b, 'C', 99) || '0.0f';
    const sinal = cppGenerator.valueToCode(b, 'SINAL', 0) || 'false';
    return (
      `  _BloquinMensagem _msg = {};\n` +
      `  _msg.tipo = (uint8_t)(${tipo});\n` +
      `  _msg.valorA = (float)(${a});\n` +
      `  _msg.valorB = (float)(${bv});\n` +
      `  _msg.valorC = (float)(${c});\n` +
      `  _msg.sinal = ${sinal};\n` +
      `  esp_now_send(_espnow_peer_mac, (uint8_t*)&_msg, sizeof(_msg));\n`
    );
  };
  cppGenerator.forBlock['espnow_mensagem_tipo'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowTipo()`, 0];
  cppGenerator.forBlock['espnow_mensagem_valor_a'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowValorA()`, 0];
  cppGenerator.forBlock['espnow_mensagem_valor_b'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowValorB()`, 0];
  cppGenerator.forBlock['espnow_mensagem_valor_c'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowValorC()`, 0];
  cppGenerator.forBlock['espnow_mensagem_sinal'] = (_b: Blockly.Block) => [`_bloquin_lerEspnowSinal()`, 0];
  cppGenerator.forBlock['espnow_mensagem_remetente'] = (_b: Blockly.Block) => [`_bloquin_espnowRemetente()`, 0];
  cppGenerator.forBlock['espnow_iniciou_com_sucesso'] = (_b: Blockly.Block) => [`_espnow_ok`, 0];
  cppGenerator.forBlock['espnow_envio_confirmado'] = (_b: Blockly.Block) => [`_espnow_ultimoEnvioOk`, 0];
  cppGenerator.forBlock['espnow_contagem_invalidas'] = (_b: Blockly.Block) => [`_espnow_invalidas`, 0];

  // Ultrassônico
  cppGenerator.forBlock['configurar_ultrassonico'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('TRIG')}, OUTPUT);\n  pinMode(${b.getFieldValue('ECHO')}, INPUT);\n`;
  cppGenerator.forBlock['ler_distancia_cm'] = (b: Blockly.Block) => [`_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')})`, 0];
  cppGenerator.forBlock['mostrar_distancia'] = (b: Blockly.Block) => `  Serial.println(_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}));\n`;
  cppGenerator.forBlock['objeto_esta_perto'] = (b: Blockly.Block) => [`_objetoPerto(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}, ${floatLiteral(b.getFieldValue('CM'))})`, 0];
  cppGenerator.forBlock['distancia_entre'] = (b: Blockly.Block) => [`_distanciaEntre(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}, ${floatLiteral(b.getFieldValue('MIN'))}, ${floatLiteral(b.getFieldValue('MAX'))})`, 0];
  cppGenerator.forBlock['dht_iniciar'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, INPUT_PULLUP);\n`;
  cppGenerator.forBlock['dht_ler_temperatura'] = (_b: Blockly.Block) => [`_bloquin_lerDHTTemperatura()`, 0];
  cppGenerator.forBlock['dht_ler_umidade'] = (_b: Blockly.Block) => [`_bloquin_lerDHTUmidade()`, 0];
  cppGenerator.forBlock['ir_iniciar'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, INPUT);\n`;
  cppGenerator.forBlock['ir_disponivel'] = (_b: Blockly.Block) => [`_bloquin_irDisponivel()`, 0];
  cppGenerator.forBlock['ir_ler_codigo'] = (_b: Blockly.Block) => [`_bloquin_irCodigo()`, 0];
  cppGenerator.forBlock['escrever_serial'] = (b: Blockly.Block) => `  Serial.println(${cppStringLiteral(b.getFieldValue('TEXT'))});\n`;
  cppGenerator.forBlock['escrever_serial_valor'] = (b: Blockly.Block) => `  Serial.println(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;
  cppGenerator.forBlock['serial_disponivel'] = (_b: Blockly.Block) => [`(Serial.available() > 0)`, 0];
  cppGenerator.forBlock['serial_ler_texto'] = (_b: Blockly.Block) => [`_bloquin_lerSerial()`, 0];
  cppGenerator.forBlock['servo_configurar'] = (b: Blockly.Block) => `  _servoObj_${b.getFieldValue('PIN')}.attach(${b.getFieldValue('PIN')});\n`;
  cppGenerator.forBlock['servo_mover'] = (b: Blockly.Block) => `  _servoObj_${b.getFieldValue('PIN')}.write((int)_bloquin_limitar((float)(${cppGenerator.valueToCode(b, 'ANGULO', 99) || '90'}), 0.0f, 180.0f));\n`;
  cppGenerator.forBlock['servo_ler'] = (b: Blockly.Block) => [`_servoObj_${b.getFieldValue('PIN')}.read()`, 0];
  cppGenerator.forBlock['buzzer_tocar'] = (b: Blockly.Block) => `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')});\n`;
  cppGenerator.forBlock['buzzer_tocar_tempo'] = (b: Blockly.Block) => `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')}, ${b.getFieldValue('DUR')});\n`;
  cppGenerator.forBlock['buzzer_parar'] = (b: Blockly.Block) => `  noTone(${b.getFieldValue('PIN')});\n`;
  cppGenerator.forBlock['buzzer_tocar_musica'] = (b: Blockly.Block) => {
    const musica = b.getFieldValue('MUSICA');
    const pin    = b.getFieldValue('PIN');
    return `  _bloquin_tocarMusica(_bloquin_mel_${musica}, _bloquin_notes_${musica}, _bloquin_tempo_${musica}, ${pin});\n`;
  };
  cppGenerator.forBlock['lcd_iniciar'] = (b: Blockly.Block) =>
    (targetBoard === 'esp32'
      ? `  Wire.begin(${b.getFieldValue('SDA')}, ${b.getFieldValue('SCL')});\n`
      : '  Wire.begin(); // SDA=A4, SCL=A5 no Arduino Uno/Nano\n') +
    `  _bloquin_lcdInit();\n`;
  cppGenerator.forBlock['lcd_limpar'] = (_b: Blockly.Block) => `  _bloquin_lcdClear();\n`;
  cppGenerator.forBlock['lcd_posicionar_cursor'] = (b: Blockly.Block) => {
    const coluna = cppGenerator.valueToCode(b, 'COLUNA', 99) || '0';
    const linha = cppGenerator.valueToCode(b, 'LINHA', 99) || '0';
    // _bloquin_limitar antes do cast: converter um float negativo direto
    // para uint8_t é comportamento indefinido em C++, não só "dá errado".
    return `  _bloquin_lcdSetCursor((uint8_t)_bloquin_limitar((float)(${coluna}), 0.0f, 255.0f), (uint8_t)_bloquin_limitar((float)(${linha}), 0.0f, 255.0f));\n`;
  };
  cppGenerator.forBlock['lcd_escrever_texto'] = (b: Blockly.Block) => `  _bloquin_lcdPrint(${cppStringLiteral(b.getFieldValue('TEXT'))});\n`;
  cppGenerator.forBlock['lcd_escrever_valor'] = (b: Blockly.Block) => `  _bloquin_lcdPrint(String(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}));\n`;
  cppGenerator.forBlock['neopixel_iniciar'] = (_b: Blockly.Block) => `  _neopixel.begin();\n  _neopixel.show();\n`;
  cppGenerator.forBlock['neopixel_definir_cor'] = (b: Blockly.Block) => {
    const indice = cppGenerator.valueToCode(b, 'INDICE', 99) || '0';
    const r = cppGenerator.valueToCode(b, 'R', 99) || '0';
    const g = cppGenerator.valueToCode(b, 'G', 99) || '0';
    const bv = cppGenerator.valueToCode(b, 'B', 99) || '0';
    return (
      // _bloquin_limitar antes do cast do índice pelo mesmo motivo do LCD
      // acima — um índice grande demais para a tira já é ignorado sozinho
      // por Adafruit_NeoPixel::setPixelColor, mas um índice negativo
      // convertido direto para uint16_t é comportamento indefinido.
      `  _neopixel.setPixelColor((uint16_t)_bloquin_limitar((float)(${indice}), 0.0f, 65535.0f), _neopixel.Color(\n` +
      `    (uint8_t)_bloquin_limitar((float)(${r}), 0.0f, 255.0f),\n` +
      `    (uint8_t)_bloquin_limitar((float)(${g}), 0.0f, 255.0f),\n` +
      `    (uint8_t)_bloquin_limitar((float)(${bv}), 0.0f, 255.0f)));\n`
    );
  };
  cppGenerator.forBlock['neopixel_limpar'] = (_b: Blockly.Block) => `  _neopixel.clear();\n`;
  cppGenerator.forBlock['neopixel_mostrar'] = (_b: Blockly.Block) => `  _neopixel.show();\n`;
  cppGenerator.forBlock['mpu_iniciar'] = (b: Blockly.Block) => {
    const addr = b.getFieldValue('ADDR') || '0x68';
    return (targetBoard === 'esp32'
      ? `  Wire.begin(${b.getFieldValue('SDA')}, ${b.getFieldValue('SCL')});\n`
      : '  Wire.begin(); // SDA=A4, SCL=A5 no Arduino Uno/Nano\n') +
    `  Wire.beginTransmission(${addr});\n  Wire.write(0x6B);\n  Wire.write(0);\n` +
    `  if (Wire.endTransmission(true) == 0) {\n` +
    `    Serial.println("[OK] MPU-6050 iniciado");\n` +
    `  } else {\n` +
    `    Serial.println("[ERRO] MPU-6050 não respondeu");\n` +
    `  }\n`;
  };
  cppGenerator.forBlock['mpu_ler_pitch'] = (_b: Blockly.Block) => [`_bloquin_lerPitch()`, 0];
  cppGenerator.forBlock['mpu_ler_roll'] = (_b: Blockly.Block) => [`_bloquin_lerRoll()`, 0];
  cppGenerator.forBlock['mpu_ler_aceleracao_x'] = (_b: Blockly.Block) => [`_bloquin_lerAcelX()`, 0];
  cppGenerator.forBlock['mpu_ler_aceleracao_y'] = (_b: Blockly.Block) => [`_bloquin_lerAcelY()`, 0];
  cppGenerator.forBlock['mpu_ler_aceleracao_z'] = (_b: Blockly.Block) => [`_bloquin_lerAcelZ()`, 0];
  cppGenerator.forBlock['mpu_ler_giro_x'] = (_b: Blockly.Block) => [`_bloquin_lerGiroX()`, 0];
  cppGenerator.forBlock['mpu_ler_giro_y'] = (_b: Blockly.Block) => [`_bloquin_lerGiroY()`, 0];
  cppGenerator.forBlock['mpu_ler_giro_z'] = (_b: Blockly.Block) => [`_bloquin_lerGiroZ()`, 0];
  cppGenerator.forBlock['mpu_ler_temperatura'] = (_b: Blockly.Block) => [`_bloquin_lerTemperaturaMPU()`, 0];

  // ── Ponte H — FIX Bug 4: usa macros _LEDC_ATTACH/_LEDC_WRITE compatíveis
  //    com Core 2.x (ledcSetup/ledcAttachPin/ledcWrite por canal) e
  //    Core 3.x (ledcAttach/ledcWrite por pino). Canais fixos: 0=ENA, 1=ENB.
  cppGenerator.forBlock['l298n_configurar_simples'] = (b: Blockly.Block) => {
    const ena = b.getFieldValue('ENA'), in1 = b.getFieldValue('IN1'), in2 = b.getFieldValue('IN2');
    const enb = b.getFieldValue('ENB'), in3 = b.getFieldValue('IN3'), in4 = b.getFieldValue('IN4');
    return (
      `  _l298n_ENA=${ena}; _l298n_IN1=${in1}; _l298n_IN2=${in2};\n` +
      `  _l298n_ENB=${enb}; _l298n_IN3=${in3}; _l298n_IN4=${in4};\n` +
      `  pinMode(${ena},OUTPUT); pinMode(${enb},OUTPUT);\n` +
      `  pinMode(${in1},OUTPUT); pinMode(${in2},OUTPUT);\n` +
      `  pinMode(${in3},OUTPUT); pinMode(${in4},OUTPUT);\n` +
      `  digitalWrite(${in1},LOW); digitalWrite(${in2},LOW);\n` +
      `  digitalWrite(${in3},LOW); digitalWrite(${in4},LOW);\n` +
      // Bug 4 fix: canais 0 e 1 → compatível Core 2.x e Core 3.x via macro
      (targetBoard === 'esp32'
        ? `  _LEDC_ATTACH(${ena}, 0, 1000, 8); _LEDC_WRITE(${ena}, 0, 0);\n` +
          `  _LEDC_ATTACH(${enb}, 1, 1000, 8); _LEDC_WRITE(${enb}, 1, 0);\n`
        : `  analogWrite(${ena}, 0); analogWrite(${enb}, 0);\n`)
    );
  };
  cppGenerator.forBlock['l298n_mover_robo'] = (b: Blockly.Block) => {
    const dir = b.getFieldValue('DIRECAO'), forca = cppGenerator.valueToCode(b, 'FORCA', 99) || '0';
    if (dir === 'FRENTE') return `  _bloquin_motorE(${forca});\n  _bloquin_motorD(${forca});\n`;
    if (dir === 'TRAS') return `  _bloquin_motorE(-(${forca}));\n  _bloquin_motorD(-(${forca}));\n`;
    if (dir === 'ESQUERDA') return `  _bloquin_motorE(-(${forca}));\n  _bloquin_motorD(${forca});\n`;
    if (dir === 'DIREITA') return `  _bloquin_motorE(${forca});\n  _bloquin_motorD(-(${forca}));\n`;
    return `  _bloquin_motorE(0);\n  _bloquin_motorD(0);\n`;
  };
  cppGenerator.forBlock['l298n_mover_motor'] = (b: Blockly.Block) => {
    const func = b.getFieldValue('MOTOR') === 'E' ? '_bloquin_motorE' : '_bloquin_motorD';
    const dir = b.getFieldValue('DIRECAO'), forca = cppGenerator.valueToCode(b, 'FORCA', 99) || '0';
    if (dir === 'FRENTE') return `  ${func}(${forca});\n`;
    if (dir === 'TRAS') return `  ${func}(-(${forca}));\n`;
    return `  ${func}(0);\n`;
  };
  cppGenerator.forBlock['l298n_parar'] = (_b: Blockly.Block) => `  _bloquin_motorE(0);\n  _bloquin_motorD(0);\n`;
  cppGenerator.forBlock['l298n_velocidade_por_pitch_roll'] = (b: Blockly.Block) => `  _bloquin_aplicarControle((float)(${cppGenerator.valueToCode(b, 'PITCH', 99) || '0.0f'}), (float)(${cppGenerator.valueToCode(b, 'ROLL', 99) || '0.0f'}), 10.0f, 8.0f);\n`;
  cppGenerator.forBlock['util_map_float'] = (b: Blockly.Block) => [`_bloquin_mapFloat((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}), ${floatLiteral(b.getFieldValue('DE_MIN'))}, ${floatLiteral(b.getFieldValue('DE_MAX'))}, ${floatLiteral(b.getFieldValue('PARA_MIN'))}, ${floatLiteral(b.getFieldValue('PARA_MAX'))})`, 0];
  cppGenerator.forBlock['util_fabsf'] = (b: Blockly.Block) => [`fabsf((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}))`, 0];

  // Wi-Fi (rede comum, independente do ESP-NOW) — não trava em caso de falha:
  // o usuário decide o que fazer consultando "Wi-Fi está conectado?".
  cppGenerator.forBlock['wifi_conectar'] = (b: Blockly.Block) => {
    const ssid = cppStringLiteral(b.getFieldValue('SSID'));
    const senha = cppStringLiteral(b.getFieldValue('SENHA'));
    return (
      `  WiFi.mode(WIFI_STA);\n` +
      `  WiFi.begin(${ssid}, ${senha});\n` +
      `  {\n` +
      `    unsigned long _wifiInicio = millis();\n` +
      `    while (WiFi.status() != WL_CONNECTED && millis() - _wifiInicio < 10000UL) delay(250);\n` +
      `  }\n` +
      `  if (WiFi.status() == WL_CONNECTED) {\n` +
      `    Serial.print("[OK] Wi-Fi conectado. IP: ");\n` +
      `    Serial.println(WiFi.localIP());\n` +
      `  } else {\n` +
      `    Serial.println("[ERRO] Não foi possível conectar ao Wi-Fi em 10 s.");\n` +
      `  }\n`
    );
  };
  cppGenerator.forBlock['wifi_esta_conectado'] = (_b: Blockly.Block) => [`(WiFi.status() == WL_CONNECTED)`, 0];
  cppGenerator.forBlock['wifi_endereco_ip'] = (_b: Blockly.Block) => [`WiFi.localIP().toString()`, 0];
  cppGenerator.forBlock['wifi_desconectar'] = (_b: Blockly.Block) => `  WiFi.disconnect(true);\n`;
  cppGenerator.forBlock['wifi_http_get'] = (b: Blockly.Block) => {
    const url = cppGenerator.valueToCode(b, 'URL', 0) || '""';
    return (
      `  {\n` +
      `    HTTPClient _http;\n` +
      `    _http.begin(${url});\n` +
      `    int _httpCodigo = _http.GET();\n` +
      `    _wifi_http_ok = (_httpCodigo >= 200 && _httpCodigo < 300);\n` +
      `    _wifi_http_resposta = _wifi_http_ok ? _http.getString() : "";\n` +
      `    _http.end();\n` +
      `  }\n`
    );
  };
  cppGenerator.forBlock['wifi_http_sucesso'] = (_b: Blockly.Block) => [`_wifi_http_ok`, 0];
  cppGenerator.forBlock['wifi_http_resposta'] = (_b: Blockly.Block) => [`_wifi_http_resposta`, 0];

  // Bluetooth clássico (BluetoothSerial) — mesma filosofia do ESP-NOW/Wi-Fi:
  // iniciar, status, enviar, receber.
  cppGenerator.forBlock['bt_iniciar'] = (b: Blockly.Block) =>
    `  _bloquinBT.begin(${cppStringLiteral(b.getFieldValue('NOME'))});\n  Serial.println("[OK] Bluetooth iniciado.");\n`;
  cppGenerator.forBlock['bt_disponivel'] = (_b: Blockly.Block) => [`(_bloquinBT.available() > 0)`, 0];
  cppGenerator.forBlock['bt_ler_texto'] = (_b: Blockly.Block) => [`_bloquin_lerBluetooth()`, 0];
  cppGenerator.forBlock['bt_enviar_texto'] = (b: Blockly.Block) => `  _bloquinBT.println(${cppGenerator.valueToCode(b, 'TEXTO', 0) || '""'});\n`;
  cppGenerator.forBlock['bt_conectado'] = (_b: Blockly.Block) => [`_bloquinBT.hasClient()`, 0];
}

export const generateCode = (
  ws: Blockly.WorkspaceSvg,
  board: BoardKey = 'uno',
): string => {
  targetBoard = board;
  synchronizeVariableTypes(ws);
  synchronizeListTypes(ws);
  cppGenerator.nameDB_?.reset();
  if (cppGenerator.nameDB_) {
    cppGenerator.nameDB_.setVariableMap(ws.getVariableMap());
  }

  const allBlocks = ws.getAllBlocks(false);
  const topBlocks = ws.getTopBlocks(true);
  const blockTypes = new Set(allBlocks.map((block) => block.type));
  const hasBlock = (...types: string[]) => types.some((type) => blockTypes.has(type));

  const globalVarLines: string[] = [];
  const globalListLines: string[] = [];
  const deferredGlobalInitializers: DeferredInitializer[] = [];
  const functionPrototypes: string[] = [];
  const funcDefLines: string[] = [];
  let setupRoot: Blockly.Block | null = null;
  let loopCode = '';

  for (const block of topBlocks) {
    if (block.type === 'bloco_setup') {
      setupRoot ??= block;
    } else if (block.type === 'bloco_loop') {
      if (!loopCode) loopCode = cppGenerator.blockToCode(block) as string;
    } else if (block.type === 'declarar_variavel_global') {
      const type = variableCppType(block);
      const name = toCppIdentifier(block.getFieldValue('NOME'), 'minha_var', 'var');
      const valueBlock = block.getInputTargetBlock('VALOR');
      const valueCode = cppGenerator.valueToCode(block, 'VALOR', 99);
      if (valueBlock && valueCode && isSafeGlobalInitializer(valueBlock)) {
        globalVarLines.push(`${cppTypeKeyword(type)} ${name} = ${valueCode};\n`);
      } else {
        globalVarLines.push(`${cppTypeKeyword(type)} ${name} = ${defaultVariableValue(type)};\n`);
        if (valueBlock && valueCode) {
          deferredGlobalInitializers.push({
            name,
            code: `${name} = ${valueCode};`,
            dependencies: initializerVariableDependencies(valueBlock),
          });
        }
      }
    } else if (block.type === 'declarar_lista_global') {
      const type = variableCppType(block);
      const name = toCppIdentifier(block.getFieldValue('NOME'), 'minha_lista', 'var');
      const tamanho = Math.max(1, Math.round(Number(block.getFieldValue('TAMANHO')) || 1));
      globalListLines.push(`${cppTypeKeyword(type)} ${name}[${tamanho}] = {};\n`);
    } else if (block.type === 'definir_funcao' || block.type === 'definir_funcao_retorno') {
      const returnType = block.type === 'definir_funcao_retorno' ? 'float' : 'void';
      functionPrototypes.push(
        `${returnType} ${toCppIdentifier(block.getFieldValue('NOME'), block.type === 'definir_funcao_retorno' ? 'calcular' : 'minhaFuncao', 'fn')}();\n`,
      );
      funcDefLines.push(cppGenerator.blockToCode(block) as string);
    }
  }

  loopCode ||= 'void loop() {\n}\n\n';

  const explicitlyConfiguredPins = new Set(
    allBlocks
      .filter((block) => block.type === 'configurar_pino')
      .map((block) => String(block.getFieldValue('PIN'))),
  );
  const outputPinsUsedDirectly = new Set(
    allBlocks
      .filter((block) => [
        'escrever_pino',
        'escrever_pino_booleano',
        'escrever_pino_pwm',
      ].includes(block.type))
      .map((block) => String(block.getFieldValue('PIN'))),
  );
  const automaticPinSetup = [...outputPinsUsedDirectly]
    .filter((pin) => !explicitlyConfiguredPins.has(pin))
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    .map((pin) => `pinMode(${pin}, OUTPUT); // configuração automática da saída`);

  const setupCode = buildSetupCode(
    setupRoot,
    automaticPinSetup,
    orderDeferredInitializers(deferredGlobalInitializers).map((initializer) => initializer.code),
  );

  const mainCode = [
    ...functionPrototypes, functionPrototypes.length > 0 ? '\n' : '',
    ...globalVarLines, globalVarLines.length > 0 ? '\n' : '',
    ...globalListLines, globalListLines.length > 0 ? '\n' : '',
    ...funcDefLines,
    setupCode,
    loopCode,
  ].filter(Boolean).join('');

  // ── Servo ─────────────────────────────────────────────────────────────────
  const needsServo = hasBlock('servo_configurar', 'servo_mover', 'servo_ler');
  let servoHeader = '';
  if (needsServo) {
    const pins = new Set(
      allBlocks
        .filter((block) => block.type.startsWith('servo_'))
        .map((block) => String(block.getFieldValue('PIN'))),
    );
    servoHeader =
      (targetBoard === 'esp32' ? '#include <ESP32Servo.h>\n' : '#include <Servo.h>\n') +
      [...pins].map(p => `Servo _servoObj_${p};`).join('\n') +
      '\n\n';
  }

  // ── Ultrassônico ──────────────────────────────────────────────────────────
  const needsEntre = hasBlock('distancia_entre');
  const needsPerto = hasBlock('objeto_esta_perto');
  const needsUltrass = hasBlock(
    'ler_distancia_cm',
    'mostrar_distancia',
    'objeto_esta_perto',
    'distancia_entre',
  );
  let helperLer   = '';
  let helperEntre = '';
  let helperPerto = '';
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
    if (needsPerto) {
      helperPerto =
        '\nbool _objetoPerto(int trig, int echo, float maxCm) {\n' +
        '  float d = _lerDistancia(trig, echo);\n' +
        '  return d > 0.0f && d < maxCm;\n}\n';
    }
  }

  // ── DHT11/DHT22 (temperatura e umidade) ──────────────────────────────────
  // Protocolo de 1 fio implementado à mão sobre pulseIn(), no mesmo espírito
  // de _lerDistancia() acima — sem depender de nenhuma biblioteca de DHT,
  // que o aluno precisaria instalar à parte no Arduino IDE.
  const needsDHT = hasBlock('dht_iniciar', 'dht_ler_temperatura', 'dht_ler_umidade');
  let dhtHeader = '';
  if (needsDHT) {
    const dhtInitBlock = allBlocks.find((block) => block.type === 'dht_iniciar');
    const dhtPin = dhtInitBlock ? dhtInitBlock.getFieldValue('PIN') : '2';
    const dhtIsDht11 = !dhtInitBlock || dhtInitBlock.getFieldValue('TIPO') !== 'DHT22';
    dhtHeader =
      `const int _DHT_PIN = ${dhtPin};\n` +
      `const bool _DHT_TIPO11 = ${dhtIsDht11 ? 'true' : 'false'};\n` +
      // Começa "vencido" (estouro proposital de unsigned) para a primeira
      // leitura de verdade acontecer já na primeira chamada, mesmo nos
      // primeiros 2 s depois de ligar — sem isso, millis() - 0 < 2000 seria
      // verdadeiro logo no início e devolveria o cache (0.0f) sem nunca ter
      // lido o sensor.
      'static unsigned long _dht_lastRead = (unsigned long)-2000;\n' +
      'static bool _dht_lastOk = false;\n' +
      'static float _dht_tempCache = 0.0f, _dht_umidCache = 0.0f;\n\n' +
      'static bool _bloquin_lerDHT() {\n' +
      '  if (millis() - _dht_lastRead < 2000) return _dht_lastOk;\n' +
      '  pinMode(_DHT_PIN, OUTPUT);\n' +
      '  digitalWrite(_DHT_PIN, LOW);\n' +
      '  delay(18);\n' +
      '  digitalWrite(_DHT_PIN, HIGH);\n' +
      '  delayMicroseconds(30);\n' +
      '  pinMode(_DHT_PIN, INPUT_PULLUP);\n' +
      '  if (pulseIn(_DHT_PIN, LOW, 1000) == 0) { _dht_lastOk = false; _dht_lastRead = millis(); return false; }\n' +
      '  if (pulseIn(_DHT_PIN, HIGH, 1000) == 0) { _dht_lastOk = false; _dht_lastRead = millis(); return false; }\n' +
      '  uint8_t data[5] = {0, 0, 0, 0, 0};\n' +
      '  for (int i = 0; i < 40; i++) {\n' +
      '    if (pulseIn(_DHT_PIN, LOW, 1000) == 0) { _dht_lastOk = false; _dht_lastRead = millis(); return false; }\n' +
      '    unsigned long alto = pulseIn(_DHT_PIN, HIGH, 1000);\n' +
      '    data[i / 8] <<= 1;\n' +
      '    if (alto > 40) data[i / 8] |= 1;\n' +
      '  }\n' +
      '  uint8_t checksum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);\n' +
      '  if (checksum != data[4]) { _dht_lastOk = false; _dht_lastRead = millis(); return false; }\n' +
      '  if (_DHT_TIPO11) {\n' +
      '    _dht_umidCache = data[0];\n' +
      '    _dht_tempCache = data[2];\n' +
      '  } else {\n' +
      '    _dht_umidCache = ((data[0] << 8) | data[1]) / 10.0f;\n' +
      '    int16_t rawTemp = ((data[2] & 0x7F) << 8) | data[3];\n' +
      '    _dht_tempCache = (data[2] & 0x80) ? -(rawTemp / 10.0f) : (rawTemp / 10.0f);\n' +
      '  }\n' +
      '  _dht_lastOk = true;\n' +
      '  _dht_lastRead = millis();\n' +
      '  return true;\n' +
      '}\n' +
      'float _bloquin_lerDHTTemperatura() { _bloquin_lerDHT(); return _dht_tempCache; }\n' +
      'float _bloquin_lerDHTUmidade() { _bloquin_lerDHT(); return _dht_umidCache; }\n\n';
  }

  // ── Receptor Infravermelho (protocolo NEC, à mão sobre pulseIn) ─────────
  // 100% polling (sem interrupção): "disponível?" faz a tentativa de
  // decodificação de verdade (com timeout curto na primeira marca, para não
  // travar o resto do AGIR na maioria das voltas em que nada foi recebido);
  // "código" só devolve o que já foi decodificado. Não decodifica o quadro
  // de repetição do NEC (botão segurado) — fora de escopo, mesmo espírito
  // de "ESP-NOW não reinventa retransmissão".
  const needsIR = hasBlock('ir_iniciar', 'ir_disponivel', 'ir_ler_codigo');
  let irHeader = '';
  if (needsIR) {
    const irInitBlock = allBlocks.find((block) => block.type === 'ir_iniciar');
    const irPin = irInitBlock ? irInitBlock.getFieldValue('PIN') : '2';
    irHeader =
      `const int _IR_PIN = ${irPin};\n` +
      'static unsigned long _ir_ultimoCodigo = 0;\n\n' +
      // Confere primeiro se o pino já está em nível baixo antes de comprometer
      // com o pulseIn: sem isso, cada chamada bloqueava até 20 ms na
      // enorme maioria das voltas do AGIR (nenhum botão sendo apertado),
      // travando junto qualquer outra coisa no mesmo loop (LED, buzzer,
      // outros sensores). Com o pino em repouso (alto), a checagem é quase
      // instantânea; só quando um sinal já começou é que vale a pena esperar.
      'static bool _bloquin_irDisponivel() {\n' +
      '  if (digitalRead(_IR_PIN) == HIGH) return false;\n' +
      '  unsigned long marcaLider = pulseIn(_IR_PIN, LOW, 20000);\n' +
      '  if (marcaLider < 8000 || marcaLider > 10500) return false;\n' +
      '  unsigned long espacoLider = pulseIn(_IR_PIN, HIGH, 6000);\n' +
      '  if (espacoLider < 3500 || espacoLider > 5500) return false;\n' +
      '  uint32_t codigo = 0;\n' +
      '  for (int i = 0; i < 32; i++) {\n' +
      '    if (pulseIn(_IR_PIN, LOW, 2000) == 0) return false;\n' +
      '    unsigned long espaco = pulseIn(_IR_PIN, HIGH, 3000);\n' +
      '    if (espaco == 0) return false;\n' +
      '    codigo <<= 1;\n' +
      '    if (espaco > 1000) codigo |= 1UL;\n' +
      '  }\n' +
      '  _ir_ultimoCodigo = codigo;\n' +
      '  return true;\n' +
      '}\n' +
      'static unsigned long _bloquin_irCodigo() { return _ir_ultimoCodigo; }\n\n';
  }

  // ── Display LCD (I²C, HD44780 4 bits via expansor PCF8574) ──────────────
  // Implementado à mão sobre Wire.h (mesmo espírito do MPU6050 abaixo) —
  // sem depender de LiquidCrystal_I2C, que o aluno precisaria instalar à
  // parte no Arduino IDE.
  const needsLCD = hasBlock(
    'lcd_iniciar',
    'lcd_limpar',
    'lcd_posicionar_cursor',
    'lcd_escrever_texto',
    'lcd_escrever_valor',
  );
  let lcdHeader = '';
  if (needsLCD) {
    const lcdInitBlock = allBlocks.find((block) => block.type === 'lcd_iniciar');
    const lcdAddr = lcdInitBlock ? (lcdInitBlock.getFieldValue('ADDR') || '0x27') : '0x27';
    const lcdCols = lcdInitBlock ? (lcdInitBlock.getFieldValue('COLUNAS') || 16) : 16;
    const lcdRows = lcdInitBlock ? (lcdInitBlock.getFieldValue('LINHAS') || 2) : 2;
    lcdHeader =
      // #include <Wire.h> duplicado com o do MPU6050 (quando os dois
      // coexistem) é inofensivo — Wire.h tem include guard próprio.
      '#include <Wire.h>\n\n' +
      `const uint8_t _LCD_ADDR = ${lcdAddr};\n` +
      `const uint8_t _LCD_COLS = ${lcdCols};\n` +
      `const uint8_t _LCD_ROWS = ${lcdRows};\n` +
      'const uint8_t _LCD_BACKLIGHT = 0x08;\n\n' +
      'void _bloquin_lcdExpanderWrite(uint8_t data) {\n' +
      '  Wire.beginTransmission(_LCD_ADDR);\n' +
      '  Wire.write(data | _LCD_BACKLIGHT);\n' +
      '  Wire.endTransmission();\n' +
      '}\n' +
      'void _bloquin_lcdPulseEnable(uint8_t data) {\n' +
      '  _bloquin_lcdExpanderWrite(data | 0x04);\n' +
      '  delayMicroseconds(1);\n' +
      '  _bloquin_lcdExpanderWrite(data & ~0x04);\n' +
      '  delayMicroseconds(50);\n' +
      '}\n' +
      'void _bloquin_lcdSendNibble(uint8_t nibble, uint8_t rs) {\n' +
      '  _bloquin_lcdPulseEnable((nibble & 0xF0) | rs);\n' +
      '}\n' +
      'void _bloquin_lcdSend(uint8_t value, uint8_t rs) {\n' +
      '  _bloquin_lcdSendNibble(value & 0xF0, rs);\n' +
      '  _bloquin_lcdSendNibble((value << 4) & 0xF0, rs);\n' +
      '}\n' +
      'void _bloquin_lcdCommand(uint8_t cmd) { _bloquin_lcdSend(cmd, 0x00); }\n' +
      'void _bloquin_lcdData(uint8_t data) { _bloquin_lcdSend(data, 0x01); }\n' +
      'void _bloquin_lcdInit() {\n' +
      '  delay(50);\n' +
      '  _bloquin_lcdSendNibble(0x30, 0x00); delay(5);\n' +
      '  _bloquin_lcdSendNibble(0x30, 0x00); delayMicroseconds(150);\n' +
      '  _bloquin_lcdSendNibble(0x30, 0x00);\n' +
      '  _bloquin_lcdSendNibble(0x20, 0x00);\n' +
      '  _bloquin_lcdCommand(0x28);\n' +
      '  _bloquin_lcdCommand(0x08);\n' +
      '  _bloquin_lcdCommand(0x01); delay(2);\n' +
      '  _bloquin_lcdCommand(0x06);\n' +
      '  _bloquin_lcdCommand(0x0C);\n' +
      '}\n' +
      'void _bloquin_lcdClear() { _bloquin_lcdCommand(0x01); delay(2); }\n' +
      'void _bloquin_lcdSetCursor(uint8_t col, uint8_t row) {\n' +
      '  const uint8_t offsets[] = {0x00, 0x40, 0x14, 0x54};\n' +
      '  uint8_t r = row < 4 ? row : 3;\n' +
      '  uint8_t c = col < _LCD_COLS ? col : (_LCD_COLS > 0 ? _LCD_COLS - 1 : 0);\n' +
      '  _bloquin_lcdCommand(0x80 | (c + offsets[r]));\n' +
      '}\n' +
      'void _bloquin_lcdPrint(const String &texto) {\n' +
      '  for (unsigned int i = 0; i < texto.length(); i++) _bloquin_lcdData((uint8_t)texto[i]);\n' +
      '}\n\n';
  }

  // ── LED Endereçável (NeoPixel/WS2812) ────────────────────────────────────
  // Única família que depende de biblioteca externa (Adafruit_NeoPixel) —
  // o protocolo exige timing de dezenas de nanossegundos, inviável de
  // reimplementar à mão de forma confiável entre AVR e ESP32 (mesmo motivo
  // que já justifica ESP32Servo.h para o Servo).
  const needsNeopixel = hasBlock(
    'neopixel_iniciar',
    'neopixel_definir_cor',
    'neopixel_limpar',
    'neopixel_mostrar',
  );
  let neopixelHeader = '';
  if (needsNeopixel) {
    const neopixelInitBlock = allBlocks.find((block) => block.type === 'neopixel_iniciar');
    const neopixelPin = neopixelInitBlock ? neopixelInitBlock.getFieldValue('PIN') : '2';
    const neopixelCount = neopixelInitBlock ? (neopixelInitBlock.getFieldValue('QUANTIDADE') || 8) : 8;
    neopixelHeader =
      '#include <Adafruit_NeoPixel.h>\n\n' +
      `Adafruit_NeoPixel _neopixel(${neopixelCount}, ${neopixelPin}, NEO_GRB + NEO_KHZ800);\n\n`;
  }

  // ── Wi-Fi/ESP-NOW compartilham o mesmo #include <WiFi.h> — emitido uma
  // única vez aqui, nunca dentro de espNowHeader/wifiHeader individualmente.
  const needsGenericWifi = hasBlock(
    'wifi_conectar',
    'wifi_esta_conectado',
    'wifi_endereco_ip',
    'wifi_desconectar',
    'wifi_http_get',
    'wifi_http_sucesso',
    'wifi_http_resposta',
  );

  // ── ESP-NOW ───────────────────────────────────────────────────────────────
  // O envelope de mensagem (`_BloquinMensagem`) é genérico: tipo + até três
  // valores numéricos + um sinal verdadeiro/falso. Os blocos legados
  // "pitch/roll/parar" (mantidos por compatibilidade com projetos salvos) e
  // os novos blocos "tipo/valor A/B/C/sinal" leem os MESMOS campos — não há
  // dois protocolos concorrentes, só dois conjuntos de nomes para o mesmo dado.
  const needsEspNowRx = hasBlock(
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
  );
  const needsEspNowTx = hasBlock(
    'espnow_transmissor_init',
    'espnow_adicionar_receptor',
    'espnow_enviar_pacote',
    'espnow_enviar_mensagem',
    'espnow_envio_confirmado',
  );
  const needsEspNow = [...blockTypes].some((type) => type.startsWith('espnow_'));

  let espNowHeader = '';
  if (needsEspNow && targetBoard !== 'esp32') {
    // Sem o include incompatível: assim o compilador para nesta única
    // mensagem, em vez de falhar primeiro por "esp_now.h: No such file".
    espNowHeader = '#error "Os blocos ESP-NOW exigem uma placa ESP32."\n\n';
  } else if (needsEspNow) {
    espNowHeader =
      '#include <esp_now.h>\n\n' +
      'typedef struct {\n' +
      '  uint8_t tipo;\n' +
      '  float valorA;\n' +
      '  float valorB;\n' +
      '  float valorC;\n' +
      '  bool sinal;\n' +
      '} _BloquinMensagem;\n' +
      // Estado da última inicialização/registro de peer, consultável pelo
      // usuário em vez de travar o sketch num `while(true)` silencioso.
      'volatile bool _espnow_ok = false;\n';

    if (needsEspNowTx) {
      espNowHeader +=
        'uint8_t _espnow_peer_mac[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};\n' +
        'volatile bool _espnow_ultimoEnvioOk = false;\n' +
        '\nvoid _bloquin_OnDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {\n' +
        '  (void)info;\n' +
        '  _espnow_ultimoEnvioOk = (status == ESP_NOW_SEND_SUCCESS);\n' +
        '}\n';
    }

    if (needsEspNowRx) {
      espNowHeader +=
        '_BloquinMensagem _espnow_pacoteBruto = {};\n' +
        '_BloquinMensagem _espnow_snapshot = {};\n' +
        'volatile uint32_t _espnow_geracao = 0;\n' +
        'volatile unsigned long _espnow_ultimoRx = 0;\n' +
        'volatile bool _espnow_primeiroRx = false;\n' +
        'uint32_t _espnow_geracaoLida = 0;\n' +
        'uint32_t _espnow_geracaoConsultada = 0;\n' +
        'portMUX_TYPE _espnow_mux = portMUX_INITIALIZER_UNLOCKED;\n' +
        // Identificação do remetente e contagem de pacotes rejeitados por
        // tamanho inválido — diagnóstico de erro pedido pela auditoria de
        // comunicação (não inventam retransmissão: o ESP-NOW/Wi-Fi já faz
        // ACK e retentativa a nível de rádio para unicast).
        'uint8_t _espnow_remetente[6] = {0,0,0,0,0,0};\n' +
        'volatile uint32_t _espnow_invalidas = 0;\n' +
        '\nvoid _bloquin_OnDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {\n' +
        '  if (len != sizeof(_BloquinMensagem)) { _espnow_invalidas++; return; }\n' +
        '  if (info) memcpy(_espnow_remetente, info->src_addr, 6);\n' +
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  memcpy(&_espnow_pacoteBruto, data, sizeof(_BloquinMensagem));\n' +
        '  _espnow_geracao++;\n' +
        '  _espnow_ultimoRx = millis();\n' +
        '  _espnow_primeiroRx = true;\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '}\n' +
        '\nbool _bloquin_temDadosNovos() {\n' +
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  bool novos = _espnow_geracao != _espnow_geracaoLida;\n' +
        '  if (novos) {\n' +
        '    _espnow_snapshot = _espnow_pacoteBruto;\n' +
        '    _espnow_geracaoConsultada = _espnow_geracao;\n' +
        '  }\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '  return novos;\n' +
        '}\n' +
        '\n_BloquinMensagem _bloquin_obterSnapshotEspnow() {\n' +
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  _espnow_snapshot = _espnow_pacoteBruto;\n' +
        '  _espnow_geracaoConsultada = _espnow_geracao;\n' +
        '  _BloquinMensagem copia = _espnow_snapshot;\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '  return copia;\n' +
        '}\n' +
        // Aliases legados (pitch/roll/parar) sobre os mesmos campos genéricos.
        '\nfloat _bloquin_lerEspnowPitch() { return _bloquin_obterSnapshotEspnow().valorA; }\n' +
        'float _bloquin_lerEspnowRoll() { return _bloquin_obterSnapshotEspnow().valorB; }\n' +
        'bool _bloquin_lerEspnowParar() { return _bloquin_obterSnapshotEspnow().sinal; }\n' +
        // Acessores genéricos.
        'uint8_t _bloquin_lerEspnowTipo() { return _bloquin_obterSnapshotEspnow().tipo; }\n' +
        'float _bloquin_lerEspnowValorA() { return _bloquin_obterSnapshotEspnow().valorA; }\n' +
        'float _bloquin_lerEspnowValorB() { return _bloquin_obterSnapshotEspnow().valorB; }\n' +
        'float _bloquin_lerEspnowValorC() { return _bloquin_obterSnapshotEspnow().valorC; }\n' +
        'bool _bloquin_lerEspnowSinal() { return _bloquin_obterSnapshotEspnow().sinal; }\n' +
        'String _bloquin_espnowRemetente() {\n' +
        '  char _buf[18];\n' +
        '  snprintf(_buf, sizeof(_buf), "%02X:%02X:%02X:%02X:%02X:%02X",\n' +
        '    _espnow_remetente[0], _espnow_remetente[1], _espnow_remetente[2],\n' +
        '    _espnow_remetente[3], _espnow_remetente[4], _espnow_remetente[5]);\n' +
        '  return String(_buf);\n' +
        '}\n' +
        '\nvoid _bloquin_marcarEspnowLido() {\n' +
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  _espnow_geracaoLida = _espnow_geracaoConsultada;\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '}\n' +
        '\nbool _bloquin_espnowTimeout(unsigned long limite) {\n' +
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  bool recebeu = _espnow_primeiroRx;\n' +
        '  unsigned long ultimo = _espnow_ultimoRx;\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '  return recebeu ? (millis() - ultimo > limite) : (millis() > limite);\n' +
        '}\n';
    }
    espNowHeader += '\n';
  }

  // ── Leitura de texto por Stream (Serial e Bluetooth compartilham) ───────
  // Serial e BluetoothSerial são as duas Stream de leitura de texto do
  // Bloquin; o laço de "esvaziar o que já chegou" é idêntico para as duas,
  // então mora aqui uma vez só em vez de duplicado em cada header.
  const needsStreamRead = hasBlock('serial_ler_texto', 'bt_ler_texto');
  let streamHelperHeader = '';
  if (needsStreamRead) {
    streamHelperHeader =
      'String _bloquin_lerStream(Stream &origem) {\n' +
      '  String _txt = "";\n' +
      '  while (origem.available() > 0) {\n' +
      '    _txt += (char)origem.read();\n' +
      '  }\n' +
      '  return _txt;\n' +
      '}\n\n';
  }

  // ── Serial (USB) — universal, roda em Uno/Nano/ESP32, sem #include: Serial
  // já vem sempre disponível e Serial.begin(115200) já roda em setup() (ver
  // buildSetupCode acima) independente de haver bloco de Serial ou não.
  let serialHeader = '';
  if (hasBlock('serial_ler_texto')) {
    serialHeader = 'String _bloquin_lerSerial() { return _bloquin_lerStream(Serial); }\n\n';
  }

  // ── Wi-Fi (rede comum) ───────────────────────────────────────────────────
  let wifiHeader = '';
  if (needsGenericWifi && targetBoard !== 'esp32') {
    wifiHeader = '#error "Os blocos de Wi-Fi exigem uma placa ESP32."\n\n';
  }
  const needsWifiInclude = (needsEspNow || needsGenericWifi) && targetBoard === 'esp32';
  const networkHeader = needsWifiInclude ? '#include <WiFi.h>\n\n' : '';

  // ── Wi-Fi: cliente HTTP — HTTPClient.h já vem embutido no core do ESP32,
  // mesma categoria de WiFi.h/esp_now.h/BluetoothSerial.h (nenhuma
  // instalação extra no Arduino IDE do aluno).
  const needsHttp = hasBlock('wifi_http_get', 'wifi_http_sucesso', 'wifi_http_resposta');
  let httpHeader = '';
  if (needsHttp && targetBoard === 'esp32') {
    httpHeader =
      '#include <HTTPClient.h>\n\n' +
      'bool _wifi_http_ok = false;\n' +
      'String _wifi_http_resposta = "";\n\n';
  }

  // ── Bluetooth (clássico, BluetoothSerial) ────────────────────────────────
  const needsBluetooth = hasBlock(
    'bt_iniciar',
    'bt_disponivel',
    'bt_ler_texto',
    'bt_enviar_texto',
    'bt_conectado',
  );
  let bluetoothHeader = '';
  if (needsBluetooth && targetBoard !== 'esp32') {
    bluetoothHeader = '#error "Os blocos de Bluetooth exigem uma placa ESP32."\n\n';
  } else if (needsBluetooth) {
    bluetoothHeader = '#include <BluetoothSerial.h>\n\nBluetoothSerial _bloquinBT;\n\n';
    if (hasBlock('bt_ler_texto')) {
      bluetoothHeader += 'String _bloquin_lerBluetooth() { return _bloquin_lerStream(_bloquinBT); }\n\n';
    }
  }

  // ── MPU-6050 ─────────────────────────────────────────────────────────────
  const needsMPU = hasBlock(
    'mpu_iniciar',
    'mpu_ler_pitch',
    'mpu_ler_roll',
    'mpu_ler_aceleracao_x',
    'mpu_ler_aceleracao_y',
    'mpu_ler_aceleracao_z',
    'mpu_ler_giro_x',
    'mpu_ler_giro_y',
    'mpu_ler_giro_z',
    'mpu_ler_temperatura',
  );

  let mpuHeader = '';
  if (needsMPU) {
    const mpuInitBlock = allBlocks.find((block) => block.type === 'mpu_iniciar');
    const mpuAddr = mpuInitBlock ? (mpuInitBlock.getFieldValue('ADDR') || '0x68') : '0x68';
    mpuHeader =
      '#include <Wire.h>\n\n' +
      `const int _MPU_ADDR = ${mpuAddr};\n` +
      'static unsigned long _mpu_lastRead = 0;\n' +
      'static float _mpu_accelX = 0.0f, _mpu_accelY = 0.0f, _mpu_accelZ = 0.0f;\n' +
      'static float _mpu_gyroX = 0.0f, _mpu_gyroY = 0.0f, _mpu_gyroZ = 0.0f;\n' +
      'static float _mpu_tempC = 0.0f;\n' +
      'static float _mpu_pitchCache = 0.0f, _mpu_rollCache = 0.0f;\n\n' +
      // Um único burst de 14 bytes (0x3B..0x48) cobre acelerômetro, temperatura
      // e giroscópio — o mesmo layout de registrador documentado pelo MPU-6050,
      // lido uma vez e cacheado por 10 ms para todos os blocos de leitura.
      'static void _bloquin_lerMPU() {\n' +
      '  if (millis() - _mpu_lastRead < 10) return;\n' +
      '  _mpu_lastRead = millis();\n' +
      '  Wire.beginTransmission(_MPU_ADDR);\n' +
      '  Wire.write(0x3B);\n' +
      '  if (Wire.endTransmission(false) != 0) return;\n' +
      '  if (Wire.requestFrom(_MPU_ADDR, 14, true) != 14) return;\n' +
      '  if (Wire.available() < 14) return;\n' +
      '  int16_t ax = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t ay = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t az = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t rawTemp = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t gx = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t gy = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t gz = Wire.read() << 8 | Wire.read();\n' +
      '  _mpu_accelX = ax / 16384.0f;\n' +
      '  _mpu_accelY = ay / 16384.0f;\n' +
      '  _mpu_accelZ = az / 16384.0f;\n' +
      '  _mpu_gyroX = gx / 131.0f;\n' +
      '  _mpu_gyroY = gy / 131.0f;\n' +
      '  _mpu_gyroZ = gz / 131.0f;\n' +
      '  _mpu_tempC = rawTemp / 340.0f + 36.53f;\n' +
      '  _mpu_pitchCache = atan2f(-_mpu_accelX, sqrtf(_mpu_accelY*_mpu_accelY + _mpu_accelZ*_mpu_accelZ)) * 180.0f / PI;\n' +
      '  _mpu_rollCache  = atan2f(_mpu_accelY, _mpu_accelZ) * 180.0f / PI;\n' +
      '}\n' +
      'float _bloquin_lerPitch() { _bloquin_lerMPU(); return _mpu_pitchCache; }\n' +
      'float _bloquin_lerRoll()  { _bloquin_lerMPU(); return _mpu_rollCache;  }\n' +
      'float _bloquin_lerAcelX() { _bloquin_lerMPU(); return _mpu_accelX; }\n' +
      'float _bloquin_lerAcelY() { _bloquin_lerMPU(); return _mpu_accelY; }\n' +
      'float _bloquin_lerAcelZ() { _bloquin_lerMPU(); return _mpu_accelZ; }\n' +
      'float _bloquin_lerGiroX() { _bloquin_lerMPU(); return _mpu_gyroX; }\n' +
      'float _bloquin_lerGiroY() { _bloquin_lerMPU(); return _mpu_gyroY; }\n' +
      'float _bloquin_lerGiroZ() { _bloquin_lerMPU(); return _mpu_gyroZ; }\n' +
      'float _bloquin_lerTemperaturaMPU() { _bloquin_lerMPU(); return _mpu_tempC; }\n\n';
  }

  // ── Ponte H L298N ─────────────────────────────────────────────────────────
  const needsL298N = hasBlock(
    'l298n_configurar_simples',
    'l298n_mover_robo',
    'l298n_parar',
    'l298n_mover_motor',
    'l298n_velocidade_por_pitch_roll',
  );
  const needsAplicarControle = hasBlock('l298n_velocidade_por_pitch_roll');
  const needsMapFloat = hasBlock('mapear_valor', 'util_map_float') || needsAplicarControle;
  const mathOperations = allBlocks.filter((block) => block.type === 'operacao_matematica');
  const needsSafeDivision = mathOperations.some((block) => block.getFieldValue('OP') === '/');
  const needsSafeRemainder = mathOperations.some((block) => block.getFieldValue('OP') === '%');
  const needsSafeLimit = hasBlock('constrain_valor', 'escrever_pino_pwm', 'servo_mover', 'neopixel_definir_cor', 'lcd_posicionar_cursor');
  const needsMathLibrary = needsMapFloat
    || needsSafeDivision
    || needsSafeRemainder
    || needsAplicarControle
    || needsMPU
    || hasBlock(
      'potencia',
      'minimo_maximo',
      'funcao_matematica',
      'valor_absoluto',
      'util_fabsf',
    );

  let mathHeader = needsMathLibrary ? '#include <math.h>\n\n' : '';
  if (needsSafeLimit) {
    mathHeader +=
      'float _bloquin_limitar(float valor, float minimo, float maximo) {\n' +
      '  if (minimo > maximo) { float troca = minimo; minimo = maximo; maximo = troca; }\n' +
      '  if (valor < minimo) return minimo;\n' +
      '  if (valor > maximo) return maximo;\n' +
      '  return valor;\n' +
      '}\n\n';
  }
  if (needsSafeDivision) {
    mathHeader +=
      'float _bloquin_dividir(float a, float b) {\n' +
      '  return fabsf(b) < 0.000001f ? 0.0f : a / b;\n' +
      '}\n\n';
  }
  if (needsSafeRemainder) {
    mathHeader +=
      'float _bloquin_resto(float a, float b) {\n' +
      '  return fabsf(b) < 0.000001f ? 0.0f : fmodf(a, b);\n' +
      '}\n\n';
  }

  // ── Detecção de borda ("mudou de falso para verdadeiro?") ────────────────
  // Cada instância do bloco precisa lembrar o valor da chamada anterior — uma
  // variável global `bool` por instância (nomeada pelo id do bloco), passada
  // por referência para uma função auxiliar única. Sem restrição de placa e
  // sem singleton: várias instâncias convivem, cada uma com seu próprio estado.
  const edgeBlocks = allBlocks.filter((block) => block.type === 'mudou_para_verdadeiro');
  let edgeHeader = '';
  if (edgeBlocks.length > 0) {
    edgeHeader =
      'bool _bloquin_borda(bool &anterior, bool atual) {\n' +
      '  bool subiu = atual && !anterior;\n' +
      '  anterior = atual;\n' +
      '  return subiu;\n' +
      '}\n' +
      edgeBlocks.map((block) => `bool _borda_${sanitizeBlockId(block.id)} = false;\n`).join('')
      + '\n';
  }

  // ── Listas: índice sempre protegido contra estouro ───────────────────────
  // Cada lista já é um array C++ de verdade — sizeof(nome)/sizeof(nome[0])
  // dá o tamanho em tempo de compilação, então este helper único (sem
  // conhecer nome nenhum) resolve o clamp para todas as listas do projeto.
  const needsListaIndice = hasBlock('lista_definir_item', 'lista_ler_item');
  let listaHeader = '';
  if (needsListaIndice) {
    listaHeader =
      'long _bloquin_indiceLista(long idx, unsigned long tamanho) {\n' +
      '  if (idx < 0) return 0;\n' +
      '  if ((unsigned long)idx >= tamanho) return (long)tamanho - 1;\n' +
      '  return idx;\n' +
      '}\n\n';
  }

  // ── Armazenamento permanente (EEPROM no AVR, Preferences no ESP32) ──────
  // Só a chave literal do próprio bloco é necessária em cada ponto de
  // chamada — cada plataforma resolve o "onde guardar" por conta própria
  // aqui, sem o gerador JS precisar de um mapa chave→posição por bloco.
  const needsArmazenamento = hasBlock('armazenamento_salvar', 'armazenamento_ler');
  let armazenamentoHeader = '';
  if (needsArmazenamento) {
    if (targetBoard === 'esp32') {
      armazenamentoHeader =
        '#include <Preferences.h>\n\n' +
        'Preferences _bloquinPrefs;\n' +
        // Só grava se o valor mudou — mesmo cuidado do lado AVR
        // (EEPROM.update), poupando ciclos de escrita da flash/NVS.
        'void _bloquin_eepromSalvar(const char* chave, float valor) {\n' +
        '  _bloquinPrefs.begin("bloquin", false);\n' +
        '  if (_bloquinPrefs.getFloat(chave, valor + 1.0f) != valor) {\n' +
        '    _bloquinPrefs.putFloat(chave, valor);\n' +
        '  }\n' +
        '  _bloquinPrefs.end();\n' +
        '}\n' +
        'float _bloquin_eepromLer(const char* chave, float padrao) {\n' +
        '  _bloquinPrefs.begin("bloquin", true);\n' +
        '  float valor = _bloquinPrefs.getFloat(chave, padrao);\n' +
        '  _bloquinPrefs.end();\n' +
        '  return valor;\n' +
        '}\n\n';
    } else {
      // Ordenado (não na ordem de percurso do workspace): o deslocamento de
      // cada chave no EEPROM precisa depender só do CONJUNTO de chaves
      // usadas no projeto, nunca da ordem/posição dos blocos no workspace —
      // sem isso, só reorganizar blocos no canvas (sem mudar o significado
      // do programa) poderia fazer uma chave "roubar" o espaço gravado de
      // outra na próxima compilação.
      const chaves = [...new Set(
        allBlocks
          .filter((block) => block.type === 'armazenamento_salvar' || block.type === 'armazenamento_ler')
          .map((block) => String(block.getFieldValue('CHAVE'))),
      )].sort();
      armazenamentoHeader =
        '#include <EEPROM.h>\n' +
        '#include <string.h>\n\n' +
        `const char* _bloquin_eepromChaves[] = { ${chaves.map((chave) => cppStringLiteral(chave)).join(', ')} };\n` +
        `const uint8_t _BLOQUIN_EEPROM_N = ${chaves.length};\n` +
        'int _bloquin_eepromOffset(const char* chave) {\n' +
        '  for (uint8_t i = 0; i < _BLOQUIN_EEPROM_N; i++) {\n' +
        '    if (strcmp(_bloquin_eepromChaves[i], chave) == 0) return (int)i * 5;\n' +
        '  }\n' +
        '  return 0;\n' +
        '}\n' +
        // Byte de marca (0xA5) distingue "nunca gravado" (EEPROM de fábrica
        // vem com lixo, não zero) de "gravado de verdade" — sem marca,
        // devolve o padrão em vez de decodificar bytes aleatórios.
        // EEPROM.update() só grava se o valor mudou, poupando ciclos de
        // gravação (a EEPROM tem vida útil limitada).
        'void _bloquin_eepromSalvar(const char* chave, float valor) {\n' +
        '  int off = _bloquin_eepromOffset(chave);\n' +
        '  EEPROM.update(off, 0xA5);\n' +
        '  EEPROM.put(off + 1, valor);\n' +
        '}\n' +
        'float _bloquin_eepromLer(const char* chave, float padrao) {\n' +
        '  int off = _bloquin_eepromOffset(chave);\n' +
        '  if (EEPROM.read(off) != 0xA5) return padrao;\n' +
        '  float valor;\n' +
        '  EEPROM.get(off + 1, valor);\n' +
        '  return valor;\n' +
        '}\n\n';
    }
  }

  let l298nHeader = '';

  if (needsL298N) {
    l298nHeader =
      (targetBoard === 'esp32'
        ? '// Compatibilidade LEDC: ESP32 Arduino Core 2.x e 3.x\n' +
          '#if !defined(ESP_ARDUINO_VERSION_MAJOR) || ESP_ARDUINO_VERSION_MAJOR < 3\n' +
          '  #define _LEDC_ATTACH(pin,ch,freq,res) ledcSetup(ch,freq,res); ledcAttachPin(pin,ch)\n' +
          '  #define _LEDC_WRITE(pin,ch,val)       ledcWrite(ch,val)\n' +
          '#else\n' +
          '  #define _LEDC_ATTACH(pin,ch,freq,res) ledcAttach(pin,freq,res)\n' +
          '  #define _LEDC_WRITE(pin,ch,val)       ledcWrite(pin,val)\n' +
          '#endif\n\n'
        : '') +
      '// Pinos globais L298N gerenciados dinamicamente pelo bloco de Setup\n' +
      'int _l298n_ENA=0, _l298n_IN1=0, _l298n_IN2=0;\n' +
      'int _l298n_ENB=0, _l298n_IN3=0, _l298n_IN4=0;\n\n';

    if (needsMapFloat || needsAplicarControle) {
      l298nHeader +=
        'float _bloquin_mapFloat(float x, float iMin, float iMax, float oMin, float oMax) {\n' +
        '  if (fabsf(iMax - iMin) < 0.000001f) return oMin;\n' +
        '  return (x - iMin) * (oMax - oMin) / (iMax - iMin) + oMin;\n' +
        '}\n\n';
    }

    const writeMotorE = targetBoard === 'esp32'
      ? '  _LEDC_WRITE(_l298n_ENA, 0, abs(v));\n'
      : '  analogWrite(_l298n_ENA, abs(v));\n';
    const writeMotorD = targetBoard === 'esp32'
      ? '  _LEDC_WRITE(_l298n_ENB, 1, abs(v));\n'
      : '  analogWrite(_l298n_ENB, abs(v));\n';

    l298nHeader +=
      'void _bloquin_motorE(int v) {\n' +
      '  v = constrain(v, -255, 255);\n' +
      '  digitalWrite(_l298n_IN1, v > 0 ? HIGH : LOW);\n' +
      '  digitalWrite(_l298n_IN2, v < 0 ? HIGH : LOW);\n' +
      writeMotorE +
      '}\n' +
      'void _bloquin_motorD(int v) {\n' +
      '  v = constrain(v, -255, 255);\n' +
      '  digitalWrite(_l298n_IN3, v > 0 ? HIGH : LOW);\n' +
      '  digitalWrite(_l298n_IN4, v < 0 ? HIGH : LOW);\n' +
      writeMotorD +
      '}\n\n';

    if (needsAplicarControle) {
      l298nHeader +=
        'void _bloquin_aplicarControle(float pitch, float roll, float zonaP, float zonaR) {\n' +
        '  float ap = fabsf(pitch), ar = fabsf(roll);\n' +
        '  int vb = 0;\n' +
        '  if (ap > zonaP) vb = (int)_bloquin_mapFloat(constrain(ap, zonaP, 45.0f), zonaP, 45.0f, 150, 255);\n' +
        '  int dlt = 0;\n' +
        '  if (ar > zonaR && vb > 0) dlt = (int)_bloquin_mapFloat(constrain(ar, zonaR, 35.0f), zonaR, 35.0f, 0, vb * 0.8f);\n' +
        '  int sn = (pitch >= 0) ? 1 : -1;\n' +
        '  int ve = sn * constrain((roll > zonaR ? vb + dlt : roll < -zonaR ? vb - dlt : vb), 0, 255);\n' +
        '  int vd = sn * constrain((roll > zonaR ? vb - dlt : roll < -zonaR ? vb + dlt : vb), 0, 255);\n' +
        '  _bloquin_motorE(ve);\n' +
        '  _bloquin_motorD(vd);\n' +
        '}\n\n';
    }
  } else if (needsMapFloat) {
    l298nHeader =
      'float _bloquin_mapFloat(float x, float iMin, float iMax, float oMin, float oMax) {\n' +
      '  if (fabsf(iMax - iMin) < 0.000001f) return oMin;\n' +
      '  return (x - iMin) * (oMax - oMin) / (iMax - iMin) + oMin;\n' +
      '}\n\n';
  }

  // ── Músicas prontas (Buzzer) ──────────────────────────────────────────────
  const musicBlocks = allBlocks.filter(
    (block) => block.type === 'buzzer_tocar_musica',
  );
  const needsMusica = musicBlocks.length > 0;
  const needsMario = musicBlocks.some((block) => block.getFieldValue('MUSICA') === 'mario');
  const needsParabens = musicBlocks.some((block) => block.getFieldValue('MUSICA') === 'parabens');

  let musicaHeader = '';
  if (needsMusica) {
    musicaHeader =
      '#if defined(ARDUINO_ARCH_AVR)\n' +
      '  #include <avr/pgmspace.h>\n' +
      '  #define _BLOQUIN_PROGMEM PROGMEM\n' +
      '  #define _BLOQUIN_READ_MELODY(arr,idx) pgm_read_word_near((arr) + (idx))\n' +
      '#else\n' +
      '  #define _BLOQUIN_PROGMEM\n' +
      '  #define _BLOQUIN_READ_MELODY(arr,idx) ((arr)[idx])\n' +
      '#endif\n' +
      '#define REST      0\n' +
      '#define NOTE_B0   31\n#define NOTE_C1   33\n#define NOTE_CS1  35\n' +
      '#define NOTE_D1   37\n#define NOTE_DS1  39\n#define NOTE_E1   41\n' +
      '#define NOTE_F1   44\n#define NOTE_FS1  46\n#define NOTE_G1   49\n' +
      '#define NOTE_GS1  52\n#define NOTE_A1   55\n#define NOTE_AS1  58\n' +
      '#define NOTE_B1   62\n#define NOTE_C2   65\n#define NOTE_CS2  69\n' +
      '#define NOTE_D2   73\n#define NOTE_DS2  78\n#define NOTE_E2   82\n' +
      '#define NOTE_F2   87\n#define NOTE_FS2  93\n#define NOTE_G2   98\n' +
      '#define NOTE_GS2 104\n#define NOTE_A2  110\n#define NOTE_AS2 117\n' +
      '#define NOTE_B2  123\n#define NOTE_C3  131\n#define NOTE_CS3 139\n' +
      '#define NOTE_D3  147\n#define NOTE_DS3 156\n#define NOTE_E3  165\n' +
      '#define NOTE_F3  175\n#define NOTE_FS3 185\n#define NOTE_G3  196\n' +
      '#define NOTE_GS3 208\n#define NOTE_A3  220\n#define NOTE_AS3 233\n' +
      '#define NOTE_B3  247\n#define NOTE_C4  262\n#define NOTE_CS4 277\n' +
      '#define NOTE_D4  294\n#define NOTE_DS4 311\n#define NOTE_E4  330\n' +
      '#define NOTE_F4  349\n#define NOTE_FS4 370\n#define NOTE_G4  392\n' +
      '#define NOTE_GS4 415\n#define NOTE_A4  440\n#define NOTE_AS4 466\n' +
      '#define NOTE_B4  494\n#define NOTE_C5  523\n#define NOTE_CS5 554\n' +
      '#define NOTE_D5  587\n#define NOTE_DS5 622\n#define NOTE_E5  659\n' +
      '#define NOTE_F5  698\n#define NOTE_FS5 740\n#define NOTE_G5  784\n' +
      '#define NOTE_GS5 831\n#define NOTE_A5  880\n#define NOTE_AS5 932\n' +
      '#define NOTE_B5  988\n#define NOTE_C6 1047\n#define NOTE_CS6 1109\n' +
      '#define NOTE_D6 1175\n#define NOTE_DS6 1245\n#define NOTE_E6 1319\n' +
      '#define NOTE_F6 1397\n#define NOTE_FS6 1480\n#define NOTE_G6 1568\n' +
      '#define NOTE_GS6 1661\n#define NOTE_A6 1760\n#define NOTE_AS6 1865\n' +
      '#define NOTE_B6 1976\n#define NOTE_C7 2093\n#define NOTE_CS7 2217\n' +
      '#define NOTE_D7 2349\n#define NOTE_DS7 2489\n#define NOTE_E7 2637\n' +
      '#define NOTE_F7 2794\n#define NOTE_FS7 2960\n#define NOTE_G7 3136\n' +
      '#define NOTE_GS7 3322\n#define NOTE_A7 3520\n#define NOTE_AS7 3729\n' +
      '#define NOTE_B7 3951\n#define NOTE_C8 4186\n#define NOTE_CS8 4435\n' +
      '#define NOTE_D8 4699\n#define NOTE_DS8 4978\n\n';

    musicaHeader +=
      'void _bloquin_tocarMusica(const int* mel, int notes, int tempo, int pin) {\n' +
      '  int wholenote = (60000 * 4) / tempo;\n' +
      '  for (int i = 0; i < notes * 2; i += 2) {\n' +
      '    int note = _BLOQUIN_READ_MELODY(mel, i);\n' +
      '    int divider = _BLOQUIN_READ_MELODY(mel, i + 1);\n' +
      '    int dur = (divider > 0)\n' +
      '      ? wholenote / divider\n' +
      '      : (int)((wholenote / abs(divider)) * 1.5f);\n' +
      '    if (note != REST) tone(pin, note, (int)(dur * 0.9f));\n' +
      '    delay(dur);\n' +
      '    noTone(pin);\n' +
      '  }\n' +
      '}\n\n';

    if (needsMario) {
      musicaHeader +=
        '// Melodia: Super Mario Bros (Koji Kondo) — arr. Robson Couto 2019\n' +
        'const int _bloquin_mel_mario[] _BLOQUIN_PROGMEM = {\n' +
        '  NOTE_E5,8, NOTE_E5,8, REST,8, NOTE_E5,8, REST,8, NOTE_C5,8, NOTE_E5,8,\n' +
        '  NOTE_G5,4, REST,4, NOTE_G4,8, REST,4,\n' +
        '  NOTE_C5,-4, NOTE_G4,8, REST,4, NOTE_E4,-4,\n' +
        '  NOTE_A4,4, NOTE_B4,4, NOTE_AS4,8, NOTE_A4,4,\n' +
        '  NOTE_G4,-8, NOTE_E5,-8, NOTE_G5,-8, NOTE_A5,4, NOTE_F5,8, NOTE_G5,8,\n' +
        '  REST,8, NOTE_E5,4, NOTE_C5,8, NOTE_D5,8, NOTE_B4,-4,\n' +
        '  NOTE_C5,-4, NOTE_G4,8, REST,4, NOTE_E4,-4,\n' +
        '  NOTE_A4,4, NOTE_B4,4, NOTE_AS4,8, NOTE_A4,4,\n' +
        '  NOTE_G4,-8, NOTE_E5,-8, NOTE_G5,-8, NOTE_A5,4, NOTE_F5,8, NOTE_G5,8,\n' +
        '  REST,8, NOTE_E5,4, NOTE_C5,8, NOTE_D5,8, NOTE_B4,-4,\n' +
        '  REST,4, NOTE_G5,8, NOTE_FS5,8, NOTE_F5,8, NOTE_DS5,4, NOTE_E5,8,\n' +
        '  REST,8, NOTE_GS4,8, NOTE_A4,8, NOTE_C4,8, REST,8, NOTE_A4,8, NOTE_C5,8, NOTE_D5,8,\n' +
        '  REST,4, NOTE_DS5,4, REST,8, NOTE_D5,-4,\n' +
        '  NOTE_C5,2, REST,2,\n' +
        '  REST,4, NOTE_G5,8, NOTE_FS5,8, NOTE_F5,8, NOTE_DS5,4, NOTE_E5,8,\n' +
        '  REST,8, NOTE_GS4,8, NOTE_A4,8, NOTE_C4,8, REST,8, NOTE_A4,8, NOTE_C5,8, NOTE_D5,8,\n' +
        '  REST,4, NOTE_DS5,4, REST,8, NOTE_D5,-4,\n' +
        '  NOTE_C5,2, REST,2,\n' +
        '  NOTE_C5,8, NOTE_C5,4, NOTE_C5,8, REST,8, NOTE_C5,8, NOTE_D5,4,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_C5,8, NOTE_C5,4, NOTE_C5,8, REST,8, NOTE_C5,8, NOTE_D5,8, NOTE_E5,8,\n' +
        '  REST,1,\n' +
        '  NOTE_C5,8, NOTE_C5,4, NOTE_C5,8, REST,8, NOTE_C5,8, NOTE_D5,4,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_E5,8, NOTE_E5,8, REST,8, NOTE_E5,8, REST,8, NOTE_C5,8, NOTE_E5,4,\n' +
        '  NOTE_G5,4, REST,4, NOTE_G4,4, REST,4,\n' +
        '  NOTE_C5,-4, NOTE_G4,8, REST,4, NOTE_E4,-4,\n' +
        '  NOTE_A4,4, NOTE_B4,4, NOTE_AS4,8, NOTE_A4,4,\n' +
        '  NOTE_G4,-8, NOTE_E5,-8, NOTE_G5,-8, NOTE_A5,4, NOTE_F5,8, NOTE_G5,8,\n' +
        '  REST,8, NOTE_E5,4, NOTE_C5,8, NOTE_D5,8, NOTE_B4,-4,\n' +
        '  NOTE_C5,-4, NOTE_G4,8, REST,4, NOTE_E4,-4,\n' +
        '  NOTE_A4,4, NOTE_B4,4, NOTE_AS4,8, NOTE_A4,4,\n' +
        '  NOTE_G4,-8, NOTE_E5,-8, NOTE_G5,-8, NOTE_A5,4, NOTE_F5,8, NOTE_G5,8,\n' +
        '  REST,8, NOTE_E5,4, NOTE_C5,8, NOTE_D5,8, NOTE_B4,-4,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_D5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_G5,-8, NOTE_F5,-8,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_B4,8, NOTE_F5,4, NOTE_F5,8, NOTE_F5,-8, NOTE_E5,-8, NOTE_D5,-8,\n' +
        '  NOTE_C5,8, NOTE_E4,4, NOTE_E4,8, NOTE_C4,2,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_D5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_G5,-8, NOTE_F5,-8,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_B4,8, NOTE_F5,4, NOTE_F5,8, NOTE_F5,-8, NOTE_E5,-8, NOTE_D5,-8,\n' +
        '  NOTE_C5,8, NOTE_E4,4, NOTE_E4,8, NOTE_C4,2,\n' +
        '  NOTE_C5,8, NOTE_C5,4, NOTE_C5,8, REST,8, NOTE_C5,8, NOTE_D5,8, NOTE_E5,8,\n' +
        '  REST,1,\n' +
        '  NOTE_C5,8, NOTE_C5,4, NOTE_C5,8, REST,8, NOTE_C5,8, NOTE_D5,4,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_E5,8, NOTE_E5,8, REST,8, NOTE_E5,8, REST,8, NOTE_C5,8, NOTE_E5,4,\n' +
        '  NOTE_G5,4, REST,4, NOTE_G4,4, REST,4,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_D5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_A5,-8, NOTE_G5,-8, NOTE_F5,-8,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_A4,8, NOTE_G4,2,\n' +
        '  NOTE_E5,8, NOTE_C5,4, NOTE_G4,8, REST,4, NOTE_GS4,4,\n' +
        '  NOTE_A4,8, NOTE_F5,4, NOTE_F5,8, NOTE_A4,2,\n' +
        '  NOTE_B4,8, NOTE_F5,4, NOTE_F5,8, NOTE_F5,-8, NOTE_E5,-8, NOTE_D5,-8,\n' +
        '  NOTE_C5,8, NOTE_E4,4, NOTE_E4,8, NOTE_C4,2,\n' +
        '  NOTE_C5,-4, NOTE_G4,-4, NOTE_E4,4,\n' +
        '  NOTE_A4,-8, NOTE_B4,-8, NOTE_A4,-8, NOTE_GS4,-8, NOTE_AS4,-8, NOTE_GS4,-8,\n' +
        '  NOTE_G4,8, NOTE_D4,8, NOTE_E4,-2,\n' +
        '};\n' +
        'const int _bloquin_notes_mario = sizeof(_bloquin_mel_mario) / sizeof(_bloquin_mel_mario[0]) / 2;\n' +
        'const int _bloquin_tempo_mario = 200;\n\n';
    }

    if (needsParabens) {
      musicaHeader +=
        '// Melodia: Parabéns a Você — arr. Robson Couto 2019\n' +
        'const int _bloquin_mel_parabens[] _BLOQUIN_PROGMEM = {\n' +
        '  NOTE_C4,4, NOTE_C4,8,\n' +
        '  NOTE_D4,-4, NOTE_C4,-4, NOTE_F4,-4,\n' +
        '  NOTE_E4,-2, NOTE_C4,4, NOTE_C4,8,\n' +
        '  NOTE_D4,-4, NOTE_C4,-4, NOTE_G4,-4,\n' +
        '  NOTE_F4,-2, NOTE_C4,4, NOTE_C4,8,\n' +
        '  NOTE_C5,-4, NOTE_A4,-4, NOTE_F4,-4,\n' +
        '  NOTE_E4,-4, NOTE_D4,-4, NOTE_AS4,4, NOTE_AS4,8,\n' +
        '  NOTE_A4,-4, NOTE_F4,-4, NOTE_G4,-4,\n' +
        '  NOTE_F4,-2,\n' +
        '};\n' +
        'const int _bloquin_notes_parabens = sizeof(_bloquin_mel_parabens) / sizeof(_bloquin_mel_parabens[0]) / 2;\n' +
        'const int _bloquin_tempo_parabens = 140;\n\n';
    }
  }

  const prefix = musicaHeader + mathHeader + edgeHeader + listaHeader + armazenamentoHeader
    + networkHeader + espNowHeader + wifiHeader
    + httpHeader + streamHelperHeader + serialHeader + bluetoothHeader + mpuHeader + lcdHeader + neopixelHeader + dhtHeader
    + irHeader + l298nHeader
    + servoHeader + helperLer + helperEntre + helperPerto
    + (needsUltrass ? '\n' : '');
  return prefix + mainCode;
};
