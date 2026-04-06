import * as Blockly from 'blockly/core';

// ─────────────────────────────────────────────────────────────────────────────
// Definição das placas
// ─────────────────────────────────────────────────────────────────────────────
export const BOARDS = {
  uno: { name: 'Arduino Uno', pins: [['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'], ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'], ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'], ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5']] },
  nano: { name: 'Arduino Nano', pins: [['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'], ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'], ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'], ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5']] },
  esp32: { name: 'ESP32 DevKit V1', pins: [['GPIO 0  ⚠️ boot', '0'], ['GPIO 2  (LED)', '2'], ['GPIO 4', '4'], ['GPIO 5  ⚠️ boot', '5'], ['GPIO 12 ⚠️ boot', '12'], ['GPIO 13', '13'], ['GPIO 14', '14'], ['GPIO 15 ⚠️ boot', '15'], ['GPIO 16', '16'], ['GPIO 17', '17'], ['GPIO 18', '18'], ['GPIO 19', '19'], ['GPIO 21', '21'], ['GPIO 22', '22'], ['GPIO 23', '23'], ['GPIO 25', '25'], ['GPIO 26', '26'], ['GPIO 27', '27'], ['GPIO 32', '32'], ['GPIO 33', '33'], ['GPIO 34 (leitura)', '34'], ['GPIO 35 (leitura)', '35'], ['GPIO 36 (leitura)', '36'], ['GPIO 39 (leitura)', '39']] },
} as const;

export type BoardKey = keyof typeof BOARDS;
export const BOARD_UNSET = 'unset';

let currentBoardPins: [string, string][] = [...BOARDS.uno.pins] as [string, string][];

export function syncBoardPins(boardKey: BoardKey) {
  currentBoardPins = [...BOARDS[boardKey].pins] as [string, string][];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização dos Blocos e Extensões
// ─────────────────────────────────────────────────────────────────────────────
export function initBlocks() {
  
  // Extensão de Validação do MAC Address (C2, UX2)
  if (!Blockly.Extensions.isRegistered('validacao_mac_ext')) {
    Blockly.Extensions.register('validacao_mac_ext', function (this: Blockly.Block) {
      this.setOnChange(function (this: Blockly.Block, _e: any) {
        if (!this.workspace || this.isInFlyout) return;
        const mac = this.getFieldValue('MAC');
        if (mac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
          this.setWarningText('Formato de MAC inválido.\nUse o padrão: AA:BB:CC:DD:EE:FF');
        } else {
          this.setWarningText(null);
        }
      });
    });
  }

  // Extensão de Validação de Contexto (Setup/Preparar) (C5, UX2)
  if (!Blockly.Extensions.isRegistered('validacao_setup_ext')) {
    Blockly.Extensions.register('validacao_setup_ext', function (this: Blockly.Block) {
      this.setOnChange(function (this: Blockly.Block, _e: any) {
        if (!this.workspace || this.isInFlyout) return;
        let parent = this.getSurroundParent();
        let valid = false;
        while (parent) {
          if (parent.type === 'bloco_setup') { valid = true; break; }
          parent = parent.getSurroundParent();
        }
        if (!valid) {
          this.setWarningText('Atenção: Este bloco de configuração deve ficar dentro do bloco "PREPARAR".');
        } else {
          this.setWarningText(null);
        }
      });
    });
  }

  const customBlocks = [
    // ── ESTRUTURA
    { type: 'bloco_setup', colour: 290, helpUrl: '', message0: 'PREPARAR (Roda 1 vez) %1', args0: [{ type: 'input_statement', name: 'DO' }], tooltip: 'Código inicial.' },
    { type: 'bloco_loop', colour: 260, helpUrl: '', message0: 'AGIR (Roda para sempre) %1', args0: [{ type: 'input_statement', name: 'DO' }], tooltip: 'Repetição principal.' },

    // ── PINOS
    { type: 'configurar_pino', colour: 165, message0: '⚡ Configurar pino %1 como %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'MODE', options: [['Saída (Enviar sinal)', 'OUTPUT'], ['Entrada (Ler sensor)', 'INPUT'], ['Entrada com redutor de energia', 'INPUT_PULLUP']] }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'escrever_pino', colour: 165, message0: 'Colocar pino %1 em estado %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'STATE', options: [['Ligado (HIGH)', 'HIGH'], ['Desligado (LOW)', 'LOW']] }], previousStatement: null, nextStatement: null },
    { type: 'ler_pino_digital', colour: 165, message0: 'Ler pino digital %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: 'Number' }, // C6
    { type: 'escrever_pino_pwm', colour: 165, message0: 'Força do pino %1 → %2 (0 a 255)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'ler_pino_analogico', colour: 165, message0: 'Ler sensor analógico no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: 'Number' }, // C6

    // ── CONTROLE
    { type: 'esperar', colour: 120, message0: 'Esperar %1 milissegundos', args0: [{ type: 'field_number', name: 'TIME', value: 1000, min: 0 }], previousStatement: null, nextStatement: null },
    { type: 'repetir_vezes', colour: 120, message0: 'Repetir %1 vezes %2 %3', args0: [{ type: 'field_number', name: 'TIMES', value: 5, min: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
    { type: 'a_cada_x_ms', colour: 120, message0: '⏳ A cada %1 ms fazer %2 %3', args0: [{ type: 'field_number', name: 'MS', value: 1000, min: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, tooltip: 'Temporizador sem travar o robô (substitui delay).' }, // Eixo 6
    { type: 'enquanto_verdadeiro', colour: 120, message0: 'Enquanto %1 fizer %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
    { type: 'parar_repeticao', colour: 120, message0: '⛔ Parar repetição', args0: [], previousStatement: null, nextStatement: null },

    // ── CONDIÇÕES
    { type: 'se_entao', colour: 210, message0: 'SE %1 ENTÃO %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }], previousStatement: null, nextStatement: null },
    { type: 'se_entao_senao', colour: 210, message0: 'SE %1 ENTÃO %2 %3 SENÃO %4 %5', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'SENAO' }], previousStatement: null, nextStatement: null },
    { type: 'comparar_valores', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Number' }, { type: 'field_dropdown', name: 'OP', options: [['é maior que', '>'], ['é menor que', '<'], ['é igual a', '=='], ['é maior ou igual a', '>='], ['é menor ou igual a', '<='], ['é diferente de', '!=']] }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Boolean' },
    { type: 'e_ou_logico', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }, { type: 'field_dropdown', name: 'OP', options: [['E', '&&'], ['OU', '||']] }, { type: 'input_value', name: 'B', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },
    { type: 'nao_logico', colour: 210, message0: 'NÃO %1', args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },
    { type: 'valor_booleano_fixo', colour: 210, message0: '%1', args0: [{ type: 'field_dropdown', name: 'VALOR', options: [['verdadeiro', 'true'], ['falso', 'false']] }], output: 'Boolean' },

    // ── MATEMÁTICA
    { type: 'numero_fixo', colour: 255, message0: '%1', args0: [{ type: 'field_number', name: 'VALOR', value: 10 }], output: 'Number' }, // C6
    { type: 'operacao_matematica', colour: 255, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Number' }, { type: 'field_dropdown', name: 'OP', options: [['+ soma', '+'], ['− subtração', '-'], ['× multiplicação', '*'], ['÷ divisão', '/'], ['% resto', '%']] }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Number' }, // C6
    { type: 'valor_absoluto', colour: 255, message0: '|%1| valor positivo', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], output: 'Number' }, // C6
    { type: 'mapear_valor', colour: 255, message0: 'Converter %1 de %2-%3 para %4-%5', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'DE_MIN', value: 0 }, { type: 'field_number', name: 'DE_MAX', value: 1023 }, { type: 'field_number', name: 'PARA_MIN', value: 0 }, { type: 'field_number', name: 'PARA_MAX', value: 255 }], inputsInline: true, output: 'Number' },
    { type: 'constrain_valor', colour: 255, message0: 'Limitar %1 entre %2 e %3', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 255 }], inputsInline: true, output: 'Number' }, // C6
    { type: 'random_valor', colour: 255, message0: 'Número aleatório de %1 a %2', args0: [{ type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 100 }], output: 'Number' }, // C6
    { type: 'millis_atual', colour: 255, message0: 'Tempo ligado (ms)', args0: [], output: 'Number' }, // C6
    { type: 'util_map_float', colour: 255, message0: 'Converter (Decimal) %1 de %2-%3 para %4-%5', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'DE_MIN', value: 0 }, { type: 'field_number', name: 'DE_MAX', value: 45 }, { type: 'field_number', name: 'PARA_MIN', value: 150 }, { type: 'field_number', name: 'PARA_MAX', value: 255 }], inputsInline: true, output: 'Number' }, // C6
    { type: 'util_fabsf', colour: 255, message0: '|%1| valor positivo (Decimal)', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], output: 'Number' }, // C6

    // ── VARIÁVEIS
    { type: 'declarar_variavel_global', colour: 330, message0: '📦 Variável %1 %2 = %3', args0: [{ type: 'field_dropdown', name: 'TIPO', options: [['Número Inteiro', 'int'], ['Número Decimal', 'float'], ['Verdadeiro/Falso', 'bool']] }, { type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR' }] },
    { type: 'atribuir_variavel', colour: 330, message0: 'Guardar em %1 o valor %2', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'ler_variavel', colour: 330, message0: 'variável %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }], output: null },
    { type: 'incrementar_variavel', colour: 330, message0: 'Aumentar %1 em %2', args0: [{ type: 'field_input', name: 'NOME', text: 'contador' }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },

    // ── FUNÇÕES
    { type: 'definir_funcao', colour: 270, message0: '⚡ Função %1 %2 %3', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }] },
    { type: 'chamar_funcao', colour: 270, message0: 'Executar função %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }], previousStatement: null, nextStatement: null },
    { type: 'definir_funcao_retorno', colour: 270, message0: '⚡ Função %1 com resposta %2 %3 Devolver %4', args0: [{ type: 'field_input', name: 'NOME', text: 'calcular' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }, { type: 'input_value', name: 'RETURN', check: 'Number' }] }, // Eixo 6
    { type: 'chamar_funcao_retorno', colour: 270, message0: 'Resposta de %1', args0: [{ type: 'field_input', name: 'NOME', text: 'calcular' }], output: 'Number' }, // Eixo 6

    // ── ULTRASSÔNICO
    { type: 'configurar_ultrassonico', colour: 30, message0: '📏 Configurar sensor de distância: Trigger %1 Echo %2', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'ler_distancia_cm', colour: 30, message0: 'Distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Number' }, // C6
    { type: 'mostrar_distancia', colour: 30, message0: 'O robô diz a distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null },
    { type: 'objeto_esta_perto', colour: 30, message0: 'Tem objeto a menos de %1 cm? (Trigger %2 Echo %3)', args0: [{ type: 'field_number', name: 'CM', value: 20, min: 1 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean' },
    { type: 'distancia_entre', colour: 30, message0: 'Distância entre %1 e %2 cm? (Trigger %3 Echo %4)', args0: [{ type: 'field_number', name: 'MIN', value: 10, min: 0 }, { type: 'field_number', name: 'MAX', value: 20, min: 0 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean' },

    // ── COMUNICAÇÃO
    { type: 'escrever_serial', colour: 160, message0: 'O robô diz o texto: %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá!' }], previousStatement: null, nextStatement: null },
    { type: 'escrever_serial_valor', colour: 160, message0: 'O robô diz o valor: %1', args0: [{ type: 'input_value', name: 'VALOR' }], previousStatement: null, nextStatement: null },

    // ── SERVO MOTOR
    { type: 'servo_configurar', colour: 170, message0: 'Conectar servo no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'servo_mover', colour: 170, message0: 'Mover servo (pino %1) para %2 °', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'input_value', name: 'ANGULO', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'servo_ler', colour: 170, message0: 'Posição atual do servo (pino %1)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: 'Number' }, // C6

    // ── BUZZER
    { type: 'buzzer_tocar', colour: 75, message0: '🔊 Tocar som: pino %1 frequência %2 Hz', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31, max: 65535 }], previousStatement: null, nextStatement: null },
    { type: 'buzzer_tocar_tempo', colour: 75, message0: '🔊 Tocar som: pino %1 frequência %2 Hz por %3 ms', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31 }, { type: 'field_number', name: 'DUR', value: 500, min: 1 }], previousStatement: null, nextStatement: null },
    { type: 'buzzer_parar', colour: 75, message0: '🔇 Parar som no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], previousStatement: null, nextStatement: null },

    // ── ESP-NOW (Sem Fio)
    { type: 'espnow_iniciar_wifi', colour: 300, message0: '📶 Preparar comunicação sem fio (Wi-Fi)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_mac_serial', colour: 300, message0: '📋 Mostrar Código deste dispositivo (MAC)', previousStatement: null, nextStatement: null },
    { type: 'espnow_transmissor_init', colour: 300, message0: '📡 Preparar Luva (Transmissor)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_adicionar_receptor', colour: 300, message0: '🔗 Conectar ao Robô (Código: %1)', args0: [{ type: 'field_input', name: 'MAC', text: 'AA:BB:CC:DD:EE:FF' }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext', 'validacao_mac_ext'] }, // C2
    { type: 'espnow_enviar_pacote', colour: 300, message0: 'Enviar para o robô: inclinação frente/trás %1 inclinação esq/dir %2 parar %3', args0: [{ type: 'input_value', name: 'PITCH', check: 'Number' }, { type: 'input_value', name: 'ROLL', check: 'Number' }, { type: 'input_value', name: 'PARAR', check: 'Boolean' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'espnow_receptor_init', colour: 300, message0: '📡 Preparar Robô (Receptor)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_tem_dados_novos', colour: 300, message0: 'Chegou mensagem da luva?', output: 'Boolean' }, // C6
    { type: 'espnow_ler_pitch', colour: 300, message0: 'Inclinação frente/trás recebida', output: 'Number' }, // C6
    { type: 'espnow_ler_roll', colour: 300, message0: 'Inclinação esq/dir recebida', output: 'Number' }, // C6
    { type: 'espnow_ler_flag_parar', colour: 300, message0: 'Comando "parar" recebido?', output: 'Boolean' }, // C6
    { type: 'espnow_timeout_ms', colour: 300, message0: 'Sem sinal da luva por mais de %1 ms?', args0: [{ type: 'field_number', name: 'MS', value: 600, min: 100 }], output: 'Boolean' },

    // ── MPU-6050
    { type: 'mpu_iniciar', colour: 310, message0: '🧭 Iniciar Acelerômetro (SDA %1 SCL %2)', args0: [{ type: 'field_dropdown', name: 'SDA', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'SCL', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'mpu_ler_pitch', colour: 310, message0: '🧭 Inclinação frente/trás (graus)', output: 'Number' }, // C6
    { type: 'mpu_ler_roll', colour: 310, message0: '🧭 Inclinação esquerda/direita (graus)', output: 'Number' }, // C6

    // ── PONTE H
    { type: 'l298n_configurar_simples', colour: 120, message0: '⚙️ Configurar Motores do Robô%1Motor Esquerdo (Força %2 IN1 %3 IN2 %4)%5Motor Direito (Força %6 IN3 %7 IN4 %8)', args0: [{ type: 'input_dummy' }, { type: 'field_dropdown', name: 'ENA', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'IN1', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'IN2', options: () => currentBoardPins }, { type: 'input_dummy' }, { type: 'field_dropdown', name: 'ENB', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'IN3', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'IN4', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'l298n_mover_robo', colour: 120, message0: '🚗 Mover robô para %1 com força %2', args0: [{ type: 'field_dropdown', name: 'DIRECAO', options: [['Frente', 'FRENTE'], ['Trás', 'TRAS'], ['Esquerda', 'ESQUERDA'], ['Direita', 'DIREITA'], ['Parar', 'PARAR']] }, { type: 'input_value', name: 'FORCA', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'l298n_mover_motor', colour: 120, message0: 'Girar motor %1 para %2 com força %3', args0: [{ type: 'field_dropdown', name: 'MOTOR', options: [['Esquerdo', 'E'], ['Direito', 'D']] }, { type: 'field_dropdown', name: 'DIRECAO', options: [['Frente', 'FRENTE'], ['Trás', 'TRAS'], ['Parar', 'PARAR']] }, { type: 'input_value', name: 'FORCA', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'l298n_velocidade_por_pitch_roll', colour: 120, message0: '🚗 Mover por inclinação (Frente/Trás %1 Esq/Dir %2)', args0: [{ type: 'input_value', name: 'PITCH', check: 'Number' }, { type: 'input_value', name: 'ROLL', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
  ];

  Blockly.defineBlocksWithJsonArray(customBlocks);
}