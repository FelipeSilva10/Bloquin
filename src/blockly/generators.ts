import * as Blockly from 'blockly/core';

export const cppGenerator = new Blockly.Generator('CPP');

export function initGenerators() {
  cppGenerator.scrub_ = function (block, code, opt_thisOnly) {
    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = opt_thisOnly ? '' : cppGenerator.blockToCode(nextBlock);
    return code + nextCode;
  };

  // Estrutura
  cppGenerator.forBlock['bloco_setup'] = (b: Blockly.Block) => `void setup() {\n  Serial.begin(115200);\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas configurações entrarão aqui...\n'}}\n\n`;
  cppGenerator.forBlock['bloco_loop'] = (b: Blockly.Block) => `void loop() {\n${cppGenerator.statementToCode(b, 'DO') || '  // Suas ações principais entrarão aqui...\n'}}\n\n`;

  // Pinos
  cppGenerator.forBlock['configurar_pino'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('PIN')}, ${b.getFieldValue('MODE')});\n`;
  cppGenerator.forBlock['escrever_pino'] = (b: Blockly.Block) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`;
  cppGenerator.forBlock['ler_pino_digital'] = (b: Blockly.Block) => [`digitalRead(${b.getFieldValue('PIN')})`, 0];
  cppGenerator.forBlock['escrever_pino_pwm'] = (b: Blockly.Block) => `  analogWrite(${b.getFieldValue('PIN')}, ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;
  cppGenerator.forBlock['ler_pino_analogico'] = (b: Blockly.Block) => [`analogRead(${b.getFieldValue('PIN')})`, 0];

  // Controle e Temporizadores
  cppGenerator.forBlock['esperar'] = (b: Blockly.Block) => `  delay(${b.getFieldValue('TIME')});\n`;
  cppGenerator.forBlock['repetir_vezes'] = (b: Blockly.Block) => {
    if (!cppGenerator.nameDB_) cppGenerator.nameDB_ = new Blockly.Names((cppGenerator as any).RESERVED_WORDS_);
    const loopVar = cppGenerator.nameDB_.getDistinctName('i', Blockly.Names.NameType.VARIABLE);
    return `  for (int ${loopVar} = 0; ${loopVar} < ${b.getFieldValue('TIMES')}; ${loopVar}++) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
  };
  cppGenerator.forBlock['a_cada_x_ms'] = (b: Blockly.Block) => {
    if (!cppGenerator.nameDB_) cppGenerator.nameDB_ = new Blockly.Names((cppGenerator as any).RESERVED_WORDS_);
    const timerVar = cppGenerator.nameDB_.getDistinctName('timer', Blockly.Names.NameType.VARIABLE);
    const ms = b.getFieldValue('MS');
    const doCode = cppGenerator.statementToCode(b, 'DO') || '';
    return `  static unsigned long ${timerVar} = 0;\n  if (millis() - ${timerVar} >= ${ms}) {\n    ${timerVar} = millis();\n${doCode}  }\n`;
  };
  cppGenerator.forBlock['enquanto_verdadeiro'] = (b: Blockly.Block) => `  while (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'DO') || ''}  }\n`;
  cppGenerator.forBlock['parar_repeticao'] = (_b: Blockly.Block) => `  break;\n`;

  // Condições e Matemática
  cppGenerator.forBlock['se_entao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  }\n`;
  cppGenerator.forBlock['se_entao_senao'] = (b: Blockly.Block) => `  if (${cppGenerator.valueToCode(b, 'CONDICAO', 0) || 'false'}) {\n${cppGenerator.statementToCode(b, 'ENTAO') || ''}  } else {\n${cppGenerator.statementToCode(b, 'SENAO') || ''}  }\n`;
  cppGenerator.forBlock['comparar_valores'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || '0'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || '0'})`, 0];
  cppGenerator.forBlock['numero_fixo'] = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];
  cppGenerator.forBlock['e_ou_logico'] = (b: Blockly.Block) => [`(${cppGenerator.valueToCode(b, 'A', 0) || 'false'} ${b.getFieldValue('OP')} ${cppGenerator.valueToCode(b, 'B', 0) || 'false'})`, 0];
  cppGenerator.forBlock['nao_logico'] = (b: Blockly.Block) => [`!(${cppGenerator.valueToCode(b, 'VALOR', 0) || 'false'})`, 0];
  cppGenerator.forBlock['mapear_valor'] = (b: Blockly.Block) => [`map(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}, ${b.getFieldValue('DE_MIN')}, ${b.getFieldValue('DE_MAX')}, ${b.getFieldValue('PARA_MIN')}, ${b.getFieldValue('PARA_MAX')})`, 0];
  cppGenerator.forBlock['operacao_matematica'] = (b: Blockly.Block) => {
    const a = cppGenerator.valueToCode(b, 'A', 99) || '0';
    const bv = cppGenerator.valueToCode(b, 'B', 99) || '0';
    return [`(${a} ${b.getFieldValue('OP')} ${bv})`, 0];
  };
  cppGenerator.forBlock['valor_absoluto'] = (b: Blockly.Block) => [`abs(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'})`, 0];
  cppGenerator.forBlock['constrain_valor'] = (b: Blockly.Block) => [`constrain(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}, ${b.getFieldValue('MIN')}, ${b.getFieldValue('MAX')})`, 0];
  cppGenerator.forBlock['random_valor'] = (b: Blockly.Block) => [`random(${b.getFieldValue('MIN')}, ${b.getFieldValue('MAX')})`, 0];
  cppGenerator.forBlock['millis_atual'] = (_b: Blockly.Block) => [`millis()`, 0];

  // Variáveis
  cppGenerator.forBlock['declarar_variavel_global'] = (b: Blockly.Block) => `${b.getFieldValue('TIPO')} ${(b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_')} = ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'};\n`;
  cppGenerator.forBlock['atribuir_variavel'] = (b: Blockly.Block) => `  ${(b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_')} = ${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'};\n`;
  cppGenerator.forBlock['ler_variavel'] = (b: Blockly.Block) => [(b.getFieldValue('NOME') || 'minha_var').replace(/\s+/g, '_'), 0];
  cppGenerator.forBlock['incrementar_variavel'] = (b: Blockly.Block) => `  ${(b.getFieldValue('NOME') || 'contador').replace(/\s+/g, '_')} += ${cppGenerator.valueToCode(b, 'VALOR', 99) || '1'};\n`;
  cppGenerator.forBlock['valor_booleano_fixo'] = (b: Blockly.Block) => [b.getFieldValue('VALOR'), 0];

  // Funções
  cppGenerator.forBlock['definir_funcao'] = (b: Blockly.Block) => {
    return `void ${(b.getFieldValue('NOME') || 'minhaFuncao').replace(/\s+/g, '_')}() {\n${cppGenerator.statementToCode(b, 'DO') || ''}}\n\n`;
  };
  cppGenerator.forBlock['chamar_funcao'] = (b: Blockly.Block) => `  ${(b.getFieldValue('NOME') || 'minhaFuncao').replace(/\s+/g, '_')}();\n`;
  cppGenerator.forBlock['definir_funcao_retorno'] = (b: Blockly.Block) => {
    const nome = (b.getFieldValue('NOME') || 'calcular').replace(/\s+/g, '_');
    const corpo = cppGenerator.statementToCode(b, 'DO') || '';
    const ret = cppGenerator.valueToCode(b, 'RETURN', 99) || '0.0f';
    return `float ${nome}() {\n${corpo}  return (float)(${ret});\n}\n\n`;
  };
  cppGenerator.forBlock['chamar_funcao_retorno'] = (b: Blockly.Block) => [`${(b.getFieldValue('NOME') || 'calcular').replace(/\s+/g, '_')}()`, 0];

  // ESP-NOW
  cppGenerator.forBlock['espnow_iniciar_wifi'] = (_b: Blockly.Block) => `  WiFi.mode(WIFI_STA);\n  WiFi.disconnect();\n  delay(100);\n`;
  cppGenerator.forBlock['espnow_mac_serial'] = (_b: Blockly.Block) => `  Serial.print("[INFO] MAC: ");\n  Serial.println(WiFi.macAddress());\n`;
  cppGenerator.forBlock['espnow_transmissor_init'] = (_b: Blockly.Block) =>
    `  if (esp_now_init() != ESP_OK) {\n    Serial.println("[ERRO] ESP-NOW falhou");\n    while(true) delay(1000);\n  }\n` +
    `  {\n` +
    `    esp_now_peer_info_t _pi = {};\n` +
    `    memcpy(_pi.peer_addr, _espnow_peer_mac, 6);\n` +
    `    _pi.channel = 0;\n` +
    `    _pi.encrypt = false;\n` +
    `    _pi.ifidx = WIFI_IF_STA;\n` +
    `    if (esp_now_add_peer(&_pi) != ESP_OK) {\n      Serial.println("[ERRO] Falha ao adicionar peer");\n      while(true) delay(1000);\n    }\n` +
    `    Serial.println("[OK] ESP-NOW pronto.");\n` +
    `  }\n`;

  cppGenerator.forBlock['espnow_adicionar_receptor'] = (b: Blockly.Block) => {
    const mac = (b.getFieldValue('MAC') || 'AA:BB:CC:DD:EE:FF');
    const safeMac = mac.replace(/-/g, ':').trim();
    const parts = safeMac.split(':').map((p: string) => `0x${p.toUpperCase()}`);
    return (
      `  uint8_t _tmp_mac[6] = {${parts.join(', ')}};\n` +
      `  memcpy(_espnow_peer_mac, _tmp_mac, 6);\n`
    );
  };

  cppGenerator.forBlock['espnow_enviar_pacote'] = (b: Blockly.Block) => `  _PacoteDados _pkt;\n  _pkt.pitch = (float)(${cppGenerator.valueToCode(b, 'PITCH', 99) || '0.0f'});\n  _pkt.roll  = (float)(${cppGenerator.valueToCode(b, 'ROLL', 99) || '0.0f'});\n  _pkt.parar = ${cppGenerator.valueToCode(b, 'PARAR', 0) || 'false'};\n  esp_now_send(_espnow_peer_mac, (uint8_t*)&_pkt, sizeof(_pkt));\n`;
  cppGenerator.forBlock['espnow_receptor_init'] = (_b: Blockly.Block) => `  if (esp_now_init() != ESP_OK) {\n    Serial.println("[ERRO] ESP-NOW falhou");\n    while(true) delay(1000);\n  }\n  esp_now_register_recv_cb(_bloquin_OnDataRecv);\n`;
  cppGenerator.forBlock['espnow_tem_dados_novos'] = (_b: Blockly.Block) => [`_bloquin_temDadosNovos()`, 0];
  cppGenerator.forBlock['espnow_ler_pitch'] = (_b: Blockly.Block) => [`_espnow_pacote.pitch`, 0];
  cppGenerator.forBlock['espnow_ler_roll'] = (_b: Blockly.Block) => [`_espnow_pacote.roll`, 0];
  cppGenerator.forBlock['espnow_ler_flag_parar'] = (_b: Blockly.Block) => [`_espnow_pacote.parar`, 0];
  cppGenerator.forBlock['espnow_timeout_ms'] = (b: Blockly.Block) => [`(_espnow_primeiroRx && (millis() - _espnow_ultimoRx > ${b.getFieldValue('MS')}UL))`, 0];
  cppGenerator.forBlock['espnow_marcar_lido'] = (_b: Blockly.Block) => `  _espnow_dadosNovos = false;\n`;

  // Ultrassônico
  cppGenerator.forBlock['configurar_ultrassonico'] = (b: Blockly.Block) => `  pinMode(${b.getFieldValue('TRIG')}, OUTPUT);\n  pinMode(${b.getFieldValue('ECHO')}, INPUT);\n`;
  cppGenerator.forBlock['ler_distancia_cm'] = (b: Blockly.Block) => [`_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')})`, 0];
  cppGenerator.forBlock['mostrar_distancia'] = (b: Blockly.Block) => `  Serial.println(_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}));\n`;
  cppGenerator.forBlock['objeto_esta_perto'] = (b: Blockly.Block) => [`(_lerDistancia(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}) < ${b.getFieldValue('CM')})`, 0];
  cppGenerator.forBlock['distancia_entre'] = (b: Blockly.Block) => [`_distanciaEntre(${b.getFieldValue('TRIG')}, ${b.getFieldValue('ECHO')}, ${b.getFieldValue('MIN')}.0f, ${b.getFieldValue('MAX')}.0f)`, 0];
  cppGenerator.forBlock['escrever_serial'] = (b: Blockly.Block) => `  Serial.println("${b.getFieldValue('TEXT')}");\n`;
  cppGenerator.forBlock['escrever_serial_valor'] = (b: Blockly.Block) => `  Serial.println(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'});\n`;
  cppGenerator.forBlock['servo_configurar'] = (b: Blockly.Block) => `  _servoObj_${b.getFieldValue('PIN')}.attach(${b.getFieldValue('PIN')});\n`;
  cppGenerator.forBlock['servo_mover'] = (b: Blockly.Block) => `  _servoObj_${b.getFieldValue('PIN')}.write(${cppGenerator.valueToCode(b, 'ANGULO', 99) || '90'});\n`;
  cppGenerator.forBlock['servo_ler'] = (b: Blockly.Block) => [`_servoObj_${b.getFieldValue('PIN')}.read()`, 0];
  cppGenerator.forBlock['buzzer_tocar'] = (b: Blockly.Block) => `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')});\n`;
  cppGenerator.forBlock['buzzer_tocar_tempo'] = (b: Blockly.Block) => `  tone(${b.getFieldValue('PIN')}, ${b.getFieldValue('FREQ')}, ${b.getFieldValue('DUR')});\n`;
  cppGenerator.forBlock['buzzer_parar'] = (b: Blockly.Block) => `  noTone(${b.getFieldValue('PIN')});\n`;
  cppGenerator.forBlock['buzzer_tocar_musica'] = (b: Blockly.Block) => {
    const musica = b.getFieldValue('MUSICA');
    const pin    = b.getFieldValue('PIN');
    return `  _bloquin_tocarMusica(_bloquin_mel_${musica}, _bloquin_notes_${musica}, _bloquin_tempo_${musica}, ${pin});\n`;
  };
  cppGenerator.forBlock['mpu_iniciar'] = (b: Blockly.Block) =>
    `  Wire.begin(${b.getFieldValue('SDA')}, ${b.getFieldValue('SCL')});\n` +
    `  Wire.beginTransmission(0x68);\n  Wire.write(0x6B);\n  Wire.write(0);\n` +
    `  Wire.endTransmission(true);\n  Serial.println("[OK] MPU-6050 iniciado");\n`;
  cppGenerator.forBlock['mpu_ler_pitch'] = (_b: Blockly.Block) => [`_bloquin_lerPitch()`, 0];
  cppGenerator.forBlock['mpu_ler_roll'] = (_b: Blockly.Block) => [`_bloquin_lerRoll()`, 0];

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
      `  _LEDC_ATTACH(${ena}, 0, 1000, 8); _LEDC_WRITE(${ena}, 0, 0);\n` +
      `  _LEDC_ATTACH(${enb}, 1, 1000, 8); _LEDC_WRITE(${enb}, 1, 0);\n`
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
  cppGenerator.forBlock['util_map_float'] = (b: Blockly.Block) => [`_bloquin_mapFloat((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}), ${b.getFieldValue('DE_MIN')}.0f, ${b.getFieldValue('DE_MAX')}.0f, ${b.getFieldValue('PARA_MIN')}.0f, ${b.getFieldValue('PARA_MAX')}.0f)`, 0];
  cppGenerator.forBlock['util_fabsf'] = (b: Blockly.Block) => [`fabsf((float)(${cppGenerator.valueToCode(b, 'VALOR', 99) || '0'}))`, 0];
}

export const generateCode = (ws: Blockly.WorkspaceSvg): string => {
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
    } else if (block.type === 'definir_funcao' || block.type === 'definir_funcao_retorno') {
      funcDefLines.push(cppGenerator.blockToCode(block) as string);
    }
  }

  const mainCode = [
    ...globalVarLines, globalVarLines.length > 0 ? '\n' : '',
    ...funcDefLines,
    setupCode || 'void setup() {\n  Serial.begin(115200);\n}\n\n',
    loopCode || 'void loop() {\n}\n\n',
  ].filter(Boolean).join('');

  // ── Servo ─────────────────────────────────────────────────────────────────
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

  // ── Ultrassônico ──────────────────────────────────────────────────────────
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

  // ── ESP-NOW ───────────────────────────────────────────────────────────────
  const needsEspNowRx = mainCode.includes('_bloquin_OnDataRecv') || mainCode.includes('_espnow_dadosNovos') || mainCode.includes('_espnow_pacote');
  const needsEspNowTx = mainCode.includes('esp_now_send(');
  const needsEspNow   = needsEspNowTx || needsEspNowRx || mainCode.includes('esp_now_init()') || mainCode.includes('WiFi.mode(');

  let espNowHeader = '';
  if (needsEspNow) {
    espNowHeader =
      '#include <esp_now.h>\n' +
      '#include <WiFi.h>\n\n' +
      'typedef struct { float pitch; float roll; bool parar; } _PacoteDados;\n' +
      '_PacoteDados _espnow_pacote;\n' +
      // Bug 1 fix: volatile em dadosNovos já existia; adicionado em ultimoRx e primeiroRx
      // Sem volatile o compilador pode cachear os valores lidos no loop() e nunca
      // enxergar as atualizações feitas dentro do callback (outra task do WiFi stack).
      'volatile bool _espnow_dadosNovos = false;\n' +
      'volatile unsigned long _espnow_ultimoRx = 0;\n' +
      'volatile bool _espnow_primeiroRx = false;\n' +
      // Bug 3 fix: mutex protege o struct _espnow_pacote contra leitura simultânea
      // no loop() enquanto o callback ainda está escrevendo (race condition).
      'portMUX_TYPE _espnow_mux = portMUX_INITIALIZER_UNLOCKED;\n';

    if (mainCode.includes('_espnow_peer_mac')) {
      espNowHeader += 'uint8_t _espnow_peer_mac[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};\n';
    }

    if (needsEspNowRx) {
      espNowHeader +=
        // Bug 2 fix: IRAM_ATTR força o callback para a RAM interna do ESP32.
        // Sem ele, um cache miss durante execução causa panic/reset quando o
        // código está em flash e o WiFi stack chama o callback de outra task.
        '\nvoid IRAM_ATTR _bloquin_OnDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {\n' +
        '  if (len != sizeof(_PacoteDados)) return;\n' +
        // Bug 3 fix: seção crítica garante que o memcpy seja atômico em relação
        // ao loop(). portENTER_CRITICAL_ISR é a versão correta para contextos de
        // callback (pode ser chamada de task ou de ISR sem travar o sistema).
        '  portENTER_CRITICAL_ISR(&_espnow_mux);\n' +
        '  memcpy(&_espnow_pacote, data, sizeof(_PacoteDados));\n' +
        '  _espnow_dadosNovos = true;\n' +
        '  _espnow_ultimoRx = millis();\n' +
        '  _espnow_primeiroRx = true;\n' +
        '  portEXIT_CRITICAL_ISR(&_espnow_mux);\n' +
        '}\n' +
        '\nbool _bloquin_temDadosNovos() {\n' +
        '  if (!_espnow_dadosNovos) return false;\n' +
        // Bug 3 fix: mesma proteção no lado da leitura para garantir que o flag
        // e o pacote sejam vistos em estado consistente pelo loop().
        '  portENTER_CRITICAL(&_espnow_mux);\n' +
        '  _espnow_dadosNovos = false;\n' +
        '  portEXIT_CRITICAL(&_espnow_mux);\n' +
        '  return true;\n' +
        '}\n';
    }
    espNowHeader += '\n';
  }

  // ── MPU-6050 ─────────────────────────────────────────────────────────────
  const needsMPU = mainCode.includes('_bloquin_lerPitch') || mainCode.includes('_bloquin_lerRoll');

  let mpuHeader = '';
  if (needsMPU) {
    mpuHeader =
      '#include <Wire.h>\n\n' +
      'const int _MPU_ADDR = 0x68;\n' +
      'static unsigned long _mpu_lastRead = 0;\n' +
      'static float _mpu_pitchCache = 0.0f, _mpu_rollCache = 0.0f;\n\n' +
      'static void _bloquin_lerAngulos() {\n' +
      '  if (millis() - _mpu_lastRead < 10) return;\n' +
      '  _mpu_lastRead = millis();\n' +
      '  Wire.beginTransmission(_MPU_ADDR);\n' +
      '  Wire.write(0x3B);\n' +
      '  Wire.endTransmission(false);\n' +
      '  Wire.requestFrom(_MPU_ADDR, 6, true);\n' +
      '  int16_t ax = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t ay = Wire.read() << 8 | Wire.read();\n' +
      '  int16_t az = Wire.read() << 8 | Wire.read();\n' +
      '  float accelX = ax / 16384.0f;\n' +
      '  float accelY = ay / 16384.0f;\n' +
      '  float accelZ = az / 16384.0f;\n' +
      '  // Correcao de eixo: MPU montado na luva com orientacao rotacionada 90 graus\n' +
      '  // sensorRoll fisico  -> pitch do carrinho (frente/re)\n' +
      '  // sensorPitch fisico -> roll do carrinho (direita/esq, invertido)\n' +
      '  float sensorPitch = atan2f(-accelX, sqrtf(accelY*accelY + accelZ*accelZ)) * 180.0f / PI;\n' +
      '  float sensorRoll  = atan2f(accelY, accelZ) * 180.0f / PI;\n' +
      '  _mpu_pitchCache = sensorRoll;\n' +
      '  _mpu_rollCache  = -sensorPitch;\n' +
      '}\n' +
      'float _bloquin_lerPitch() { _bloquin_lerAngulos(); return _mpu_pitchCache; }\n' +
      'float _bloquin_lerRoll()  { _bloquin_lerAngulos(); return _mpu_rollCache;  }\n\n';
  }

  // ── Ponte H L298N ─────────────────────────────────────────────────────────
  const needsL298N = mainCode.includes('_bloquin_motorE') || mainCode.includes('_bloquin_motorD') || mainCode.includes('_l298n_');
  const needsAplicarControle = mainCode.includes('_bloquin_aplicarControle');
  const needsMapFloat = mainCode.includes('_bloquin_mapFloat');

  let l298nHeader = '';

  if (needsL298N) {
    l298nHeader =
      // Bug 4 fix: macros de compatibilidade entre ESP32 Core 2.x e Core 3.x.
      // No Core 2.x: ledcAttach não existe; usa-se ledcSetup(canal)+ledcAttachPin(pino,canal)
      //              e ledcWrite(canal, valor).
      // No Core 3.x: ledcAttach(pino, freq, res) e ledcWrite(pino, valor).
      // Os canais 0 (ENA) e 1 (ENB) são fixos — suficiente para um único L298N.
      '// Compatibilidade ledcAttach: ESP32 Core 2.x e Core 3.x\n' +
      '#if !defined(ESP_ARDUINO_VERSION_MAJOR) || ESP_ARDUINO_VERSION_MAJOR < 3\n' +
      '  #define _LEDC_ATTACH(pin,ch,freq,res) ledcSetup(ch,freq,res); ledcAttachPin(pin,ch)\n' +
      '  #define _LEDC_WRITE(pin,ch,val)       ledcWrite(ch,val)\n' +
      '#else\n' +
      '  #define _LEDC_ATTACH(pin,ch,freq,res) ledcAttach(pin,freq,res)\n' +
      '  #define _LEDC_WRITE(pin,ch,val)       ledcWrite(pin,val)\n' +
      '#endif\n\n' +
      '// Pinos globais L298N gerenciados dinamicamente pelo bloco de Setup\n' +
      'int _l298n_ENA=0, _l298n_IN1=0, _l298n_IN2=0;\n' +
      'int _l298n_ENB=0, _l298n_IN3=0, _l298n_IN4=0;\n\n';

    if (needsMapFloat || needsAplicarControle) {
      l298nHeader +=
        'float _bloquin_mapFloat(float x, float iMin, float iMax, float oMin, float oMax) {\n' +
        '  return (x - iMin) * (oMax - oMin) / (iMax - iMin) + oMin;\n' +
        '}\n\n';
    }

    l298nHeader +=
      'void _bloquin_motorE(int v) {\n' +
      '  v = constrain(v, -255, 255);\n' +
      '  digitalWrite(_l298n_IN1, v > 0 ? HIGH : LOW);\n' +
      '  digitalWrite(_l298n_IN2, v < 0 ? HIGH : LOW);\n' +
      // Bug 4 fix: usa macro _LEDC_WRITE com canal 0 (ENA)
      '  _LEDC_WRITE(_l298n_ENA, 0, abs(v));\n' +
      '}\n' +
      'void _bloquin_motorD(int v) {\n' +
      '  v = constrain(v, -255, 255);\n' +
      '  digitalWrite(_l298n_IN3, v > 0 ? HIGH : LOW);\n' +
      '  digitalWrite(_l298n_IN4, v < 0 ? HIGH : LOW);\n' +
      // Bug 4 fix: usa macro _LEDC_WRITE com canal 1 (ENB)
      '  _LEDC_WRITE(_l298n_ENB, 1, abs(v));\n' +
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
      '  return (x - iMin) * (oMax - oMin) / (iMax - iMin) + oMin;\n' +
      '}\n\n';
  }

  // ── Músicas prontas (Buzzer) ──────────────────────────────────────────────
  const needsMusica   = mainCode.includes('_bloquin_tocarMusica');
  const needsMario    = mainCode.includes('_bloquin_mel_mario');
  const needsParabens = mainCode.includes('_bloquin_mel_parabens');

  let musicaHeader = '';
  if (needsMusica) {
    musicaHeader =
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
      '    int divider = mel[i + 1];\n' +
      '    int dur = (divider > 0)\n' +
      '      ? wholenote / divider\n' +
      '      : (int)((wholenote / abs(divider)) * 1.5f);\n' +
      '    if (mel[i] != REST) tone(pin, mel[i], (int)(dur * 0.9f));\n' +
      '    delay(dur);\n' +
      '    noTone(pin);\n' +
      '  }\n' +
      '}\n\n';

    if (needsMario) {
      musicaHeader +=
        '// Melodia: Super Mario Bros (Koji Kondo) — arr. Robson Couto 2019\n' +
        'const int _bloquin_mel_mario[] = {\n' +
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
        'const int _bloquin_mel_parabens[] = {\n' +
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

  const prefix = musicaHeader + espNowHeader + mpuHeader + l298nHeader + servoHeader + helperLer + helperEntre + (needsUltrass ? '\n' : '');
  return prefix + mainCode;
};