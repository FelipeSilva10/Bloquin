import * as Blockly from 'blockly/core';
import { BOARDS, type BoardKey } from './boards';
import {
  ESP32_INPUT_ONLY_PINS,
  LOOP_TYPES,
} from './contracts';
import { synchronizeVariableTypes, synchronizeListTypes } from './variableTypes';
import { BLOCK_DOC_REGISTRY } from '../features/blockDocs/registry';
export { BOARDS, BOARD_UNSET } from './boards';
export type { BoardKey } from './boards';

let currentBoardPins: [string, string][] = [...BOARDS.uno.pins] as [string, string][];
let currentOutputPins: [string, string][] = [...BOARDS.uno.outputPins] as [string, string][];
let currentPwmPins: [string, string][] = [...BOARDS.uno.pwmPins] as [string, string][];
let currentAnalogPins: [string, string][] = [...BOARDS.uno.analogPins] as [string, string][];
let currentI2cSdaPins: [string, string][] = [...BOARDS.uno.i2cSdaPins] as [string, string][];
let currentI2cSclPins: [string, string][] = [...BOARDS.uno.i2cSclPins] as [string, string][];
let currentBoardKey: BoardKey = 'uno';
const synchronizedVariableEvents = new WeakSet<Blockly.Events.Abstract>();
const synchronizedListEvents = new WeakSet<Blockly.Events.Abstract>();

export function syncBoardPins(boardKey: BoardKey) {
  currentBoardKey = boardKey;
  currentBoardPins = [...BOARDS[boardKey].pins] as [string, string][];
  currentOutputPins = [...BOARDS[boardKey].outputPins] as [string, string][];
  currentPwmPins = [...BOARDS[boardKey].pwmPins] as [string, string][];
  currentAnalogPins = [...BOARDS[boardKey].analogPins] as [string, string][];
  currentI2cSdaPins = [...BOARDS[boardKey].i2cSdaPins] as [string, string][];
  currentI2cSclPins = [...BOARDS[boardKey].i2cSclPins] as [string, string][];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização dos Blocos e Extensões
// ─────────────────────────────────────────────────────────────────────────────
export function initBlocks() {
  
  // Extensão de Validação de Contexto (Setup/Preparar) (C5, UX2)
  if (!Blockly.Extensions.isRegistered('validacao_setup_ext')) {
    Blockly.Extensions.register('validacao_setup_ext', function (this: Blockly.Block) {
      this.setOnChange(function (this: Blockly.Block, _e: any) {
        if (!this.workspace || this.isInFlyout) return;
        const warnings: string[] = [];
        let parent = this.getSurroundParent();
        let valid = false;
        while (parent) {
          if (parent.type === 'bloco_setup') { valid = true; break; }
          parent = parent.getSurroundParent();
        }
        if (!valid) {
          warnings.push('Este bloco de configuração deve ficar dentro do bloco "PREPARAR".');
        }

        if (
          this.type === 'configurar_pino'
          && currentBoardKey === 'esp32'
          && ESP32_INPUT_ONLY_PINS.has(String(this.getFieldValue('PIN')))
          && this.getFieldValue('MODE') !== 'INPUT'
        ) {
          warnings.push('Os GPIO 34, 35, 36 e 39 do ESP32 aceitam somente entrada, sem pull-up interno.');
        }

        this.setWarningText(warnings.length > 0 ? warnings.join('\n') : null);
      });
    });
  }

  if (!Blockly.Extensions.isRegistered('validacao_setup_mac_ext')) {
    Blockly.Extensions.register('validacao_setup_mac_ext', function (this: Blockly.Block) {
      this.setOnChange(function (this: Blockly.Block, _e: any) {
        if (!this.workspace || this.isInFlyout) return;
        const warnings: string[] = [];

        let parent = this.getSurroundParent();
        let isInSetup = false;
        while (parent) {
          if (parent.type === 'bloco_setup') {
            isInSetup = true;
            break;
          }
          parent = parent.getSurroundParent();
        }
        if (!isInSetup) {
          warnings.push('Este bloco deve ficar dentro do bloco "PREPARAR".');
        }

        const mac = this.getFieldValue('MAC');
        if (mac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
          warnings.push('Formato de MAC inválido. Use AA:BB:CC:DD:EE:FF.');
        }

        this.setWarningText(warnings.length > 0 ? warnings.join('\n') : null);
      });
    });
  }

  if (!Blockly.Extensions.isRegistered('validacao_repeticao_ext')) {
    Blockly.Extensions.register('validacao_repeticao_ext', function (this: Blockly.Block) {
      this.setOnChange(function (this: Blockly.Block, _e: any) {
        if (!this.workspace || this.isInFlyout) return;
        let parent = this.getSurroundParent();
        while (parent) {
          if (LOOP_TYPES.has(parent.type)) {
            this.setWarningText(null);
            return;
          }
          parent = parent.getSurroundParent();
        }
        this.setWarningText('“Parar repetição” precisa ficar dentro de “Repetir” ou “Enquanto”.');
      });
    });
  }

  if (!Blockly.Extensions.isRegistered('tipagem_variavel_ext')) {
    Blockly.Extensions.register('tipagem_variavel_ext', function (this: Blockly.Block) {
      if (this.workspace) synchronizeVariableTypes(this.workspace);
      this.setOnChange(function (this: Blockly.Block, event: Blockly.Events.Abstract) {
        if (
          !this.workspace
          || this.isInFlyout
          || event.isUiEvent
          || synchronizedVariableEvents.has(event)
        ) return;
        synchronizedVariableEvents.add(event);
        synchronizeVariableTypes(this.workspace);
      });
    });
  }

  if (!Blockly.Extensions.isRegistered('tipagem_lista_ext')) {
    Blockly.Extensions.register('tipagem_lista_ext', function (this: Blockly.Block) {
      if (this.workspace) synchronizeListTypes(this.workspace);
      this.setOnChange(function (this: Blockly.Block, event: Blockly.Events.Abstract) {
        if (
          !this.workspace
          || this.isInFlyout
          || event.isUiEvent
          || synchronizedListEvents.has(event)
        ) return;
        synchronizedListEvents.add(event);
        synchronizeListTypes(this.workspace);
      });
    });
  }

  const customBlocks = [
    // ── ESTRUTURA
    { type: 'bloco_setup', colour: 290, helpUrl: '', message0: 'PREPARAR (Roda 1 vez) %1', args0: [{ type: 'input_statement', name: 'DO' }] },
    { type: 'bloco_loop', colour: 260, helpUrl: '', message0: 'AGIR (Roda para sempre) %1', args0: [{ type: 'input_statement', name: 'DO' }] },

    // ── PINOS
    { type: 'configurar_pino', colour: 165, message0: '⚡ Configurar pino %1 como %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }, { type: 'field_dropdown', name: 'MODE', options: [['Saída (Enviar sinal)', 'OUTPUT'], ['Entrada (Ler sensor)', 'INPUT'], ['Entrada com redutor de energia', 'INPUT_PULLUP']] }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'escrever_pino', colour: 165, message0: 'Colocar pino %1 em estado %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'STATE', options: [['Ligado (HIGH)', 'HIGH'], ['Desligado (LOW)', 'LOW']] }], previousStatement: null, nextStatement: null },
    { type: 'escrever_pino_booleano', colour: 165, message0: 'Colocar pino %1 conforme %2', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'input_value', name: 'STATE', check: 'Boolean' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'ler_pino_digital', colour: 165, message0: 'Ler pino digital %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], output: ['Number', 'Boolean'] },
    { type: 'escrever_pino_pwm', colour: 165, message0: 'Força do pino %1 → %2 (0 a 255)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentPwmPins }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'ler_pino_analogico', colour: 165, message0: 'Ler sensor analógico no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentAnalogPins }], output: 'Number' }, // C6

    // ── CONTROLE
    { type: 'esperar', colour: 120, message0: 'Esperar %1 milissegundos', args0: [{ type: 'field_number', name: 'TIME', value: 1000, min: 0, precision: 1 }], previousStatement: null, nextStatement: null },
    { type: 'esperar_duracao', colour: 120, message0: 'Esperar %1 milissegundos', args0: [{ type: 'input_value', name: 'TIME', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'repetir_vezes', colour: 120, message0: 'Repetir %1 vezes %2 %3', args0: [{ type: 'field_number', name: 'TIMES', value: 5, min: 1, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
    { type: 'repetir_quantidade', colour: 120, message0: 'Repetir %1 vezes %2 %3', args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
    { type: 'a_cada_x_ms', colour: 120, message0: '⏳ A cada %1 ms fazer %2 %3', args0: [{ type: 'field_number', name: 'MS', value: 1000, min: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null }, // Eixo 6
    { type: 'enquanto_verdadeiro', colour: 120, message0: 'Enquanto %1 fizer %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null },
    { type: 'parar_repeticao', colour: 120, message0: '⛔ Parar repetição', args0: [], previousStatement: null, nextStatement: null, extensions: ['validacao_repeticao_ext'] },

    // ── CONDIÇÕES
    { type: 'se_entao', colour: 210, message0: 'SE %1 ENTÃO %2 %3', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }], previousStatement: null, nextStatement: null },
    { type: 'se_entao_senao', colour: 210, message0: 'SE %1 ENTÃO %2 %3 SENÃO %4 %5', args0: [{ type: 'input_value', name: 'CONDICAO', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'ENTAO' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'SENAO' }], previousStatement: null, nextStatement: null },
    { type: 'comparar_valores', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Number' }, { type: 'field_dropdown', name: 'OP', options: [['é maior que', '>'], ['é menor que', '<'], ['é igual a', '=='], ['é maior ou igual a', '>='], ['é menor ou igual a', '<='], ['é diferente de', '!=']] }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Boolean' },
    { type: 'e_ou_logico', colour: 210, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }, { type: 'field_dropdown', name: 'OP', options: [['E', '&&'], ['OU', '||']] }, { type: 'input_value', name: 'B', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },
    { type: 'nao_logico', colour: 210, message0: 'NÃO %1', args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },
    { type: 'valor_booleano_fixo', colour: 210, message0: '%1', args0: [{ type: 'field_dropdown', name: 'VALOR', options: [['verdadeiro', 'true'], ['falso', 'false']] }], output: 'Boolean' },
    { type: 'numero_para_booleano', colour: 210, message0: '%1 é diferente de zero?', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, output: 'Boolean' },
    { type: 'booleano_para_numero', colour: 210, message0: 'Converter %1 para número', args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }], inputsInline: true, output: 'Number' },
    { type: 'mudou_para_verdadeiro', colour: 210, message0: '%1 mudou de falso para verdadeiro?', args0: [{ type: 'input_value', name: 'VALOR', check: 'Boolean' }], inputsInline: true, output: 'Boolean' },

    // ── MATEMÁTICA
    { type: 'numero_fixo', colour: 255, message0: '%1', args0: [{ type: 'field_number', name: 'VALOR', value: 10 }], output: 'Number' }, // C6
    { type: 'operacao_matematica', colour: 255, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: 'Number' }, { type: 'field_dropdown', name: 'OP', options: [['+ soma', '+'], ['− subtração', '-'], ['× multiplicação', '*'], ['÷ divisão', '/'], ['% resto', '%']] }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Number' }, // C6
    { type: 'potencia', colour: 255, message0: '%1 elevado a %2', args0: [{ type: 'input_value', name: 'BASE', check: 'Number' }, { type: 'input_value', name: 'EXPOENTE', check: 'Number' }], inputsInline: true, output: 'Number' },
    { type: 'minimo_maximo', colour: 255, message0: '%1 entre %2 e %3', args0: [{ type: 'field_dropdown', name: 'OP', options: [['Menor valor', 'MIN'], ['Maior valor', 'MAX']] }, { type: 'input_value', name: 'A', check: 'Number' }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, output: 'Number' },
    { type: 'funcao_matematica', colour: 255, message0: '%1 %2', args0: [{ type: 'field_dropdown', name: 'OP', options: [['Arredondar', 'ROUND'], ['Arredondar para baixo', 'FLOOR'], ['Arredondar para cima', 'CEIL'], ['Raiz quadrada', 'SQRT']] }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, output: 'Number' },
    { type: 'valor_absoluto', colour: 255, message0: '|%1| valor positivo', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], output: 'Number' }, // C6
    { type: 'mapear_valor', colour: 255, message0: 'Converter %1 de %2-%3 para %4-%5', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'DE_MIN', value: 0 }, { type: 'field_number', name: 'DE_MAX', value: 1023 }, { type: 'field_number', name: 'PARA_MIN', value: 0 }, { type: 'field_number', name: 'PARA_MAX', value: 255 }], inputsInline: true, output: 'Number' },
    { type: 'constrain_valor', colour: 255, message0: 'Limitar %1 entre %2 e %3', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 255 }], inputsInline: true, output: 'Number' }, // C6
    { type: 'random_valor', colour: 255, message0: 'Número aleatório de %1 a %2', args0: [{ type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 100 }], output: 'Number' }, // C6
    { type: 'millis_atual', colour: 255, message0: 'Tempo ligado (ms)', args0: [], output: 'Number' }, // C6
    { type: 'util_map_float', colour: 255, message0: 'Converter (Decimal) %1 de %2-%3 para %4-%5', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }, { type: 'field_number', name: 'DE_MIN', value: 0 }, { type: 'field_number', name: 'DE_MAX', value: 45 }, { type: 'field_number', name: 'PARA_MIN', value: 150 }, { type: 'field_number', name: 'PARA_MAX', value: 255 }], inputsInline: true, output: 'Number' }, // C6
    { type: 'util_fabsf', colour: 255, message0: '|%1| valor positivo (Decimal)', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], output: 'Number' }, // C6

    // ── VARIÁVEIS
    { type: 'declarar_variavel_global', colour: 330, message0: '📦 Variável %1 %2 = %3', args0: [{ type: 'field_dropdown', name: 'TIPO', options: [['Número Inteiro', 'int'], ['Número Decimal', 'float'], ['Verdadeiro/Falso', 'bool'], ['Texto', 'string']] }, { type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR', check: 'Number' }], extensions: ['tipagem_variavel_ext'] },
    { type: 'atribuir_variavel', colour: 330, message0: 'Guardar em %1 o valor %2', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null, extensions: ['tipagem_variavel_ext'] },
    { type: 'ler_variavel', colour: 330, message0: 'variável %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_var' }], output: null, extensions: ['tipagem_variavel_ext'] },
    { type: 'incrementar_variavel', colour: 330, message0: 'Aumentar %1 em %2', args0: [{ type: 'field_input', name: 'NOME', text: 'contador' }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null, extensions: ['tipagem_variavel_ext'] },

    // ── LISTAS (vetores de tamanho fixo — sem tipo Texto: lista de String
    // reatribuída em loop é risco real de fragmentação de heap no AVR)
    { type: 'declarar_lista_global', colour: 345, message0: '📚 Lista %1 %2 de tamanho %3', args0: [{ type: 'field_dropdown', name: 'TIPO', options: [['Números Inteiros', 'int'], ['Números Decimais', 'float'], ['Verdadeiro/Falso', 'bool']] }, { type: 'field_input', name: 'NOME', text: 'minha_lista' }, { type: 'field_number', name: 'TAMANHO', value: 10, min: 1, precision: 1 }] },
    { type: 'lista_definir_item', colour: 345, message0: '📚 Guardar na lista %1, posição %2, o valor %3', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_lista' }, { type: 'input_value', name: 'INDICE', check: 'Number' }, { type: 'input_value', name: 'VALOR' }], inputsInline: true, previousStatement: null, nextStatement: null, extensions: ['tipagem_lista_ext'] },
    { type: 'lista_ler_item', colour: 345, message0: '📚 Item da lista %1 na posição %2', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_lista' }, { type: 'input_value', name: 'INDICE', check: 'Number' }], inputsInline: true, output: null, extensions: ['tipagem_lista_ext'] },
    { type: 'lista_tamanho', colour: 345, message0: '📚 Tamanho da lista %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minha_lista' }], output: 'Number' },

    // ── ARMAZENAMENTO (memória permanente — EEPROM no AVR, Preferences no
    // ESP32; só números, mesmo espírito da simplificação das Listas)
    { type: 'armazenamento_salvar', colour: 345, message0: '💾 Salvar valor: chave %1 = %2', args0: [{ type: 'field_input', name: 'CHAVE', text: 'recorde' }, { type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'armazenamento_ler', colour: 345, message0: '💾 Ler valor salvo: chave %1 (se vazio: %2)', args0: [{ type: 'field_input', name: 'CHAVE', text: 'recorde' }, { type: 'input_value', name: 'PADRAO', check: 'Number' }], inputsInline: true, output: 'Number' },

    // ── FUNÇÕES
    { type: 'definir_funcao', colour: 270, message0: '⚡ Função %1 %2 %3', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }] },
    { type: 'chamar_funcao', colour: 270, message0: 'Executar função %1', args0: [{ type: 'field_input', name: 'NOME', text: 'minhaFuncao' }], previousStatement: null, nextStatement: null },
    { type: 'definir_funcao_retorno', colour: 270, message0: '⚡ Função %1 com resposta %2 %3 Devolver %4', args0: [{ type: 'field_input', name: 'NOME', text: 'calcular' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }, { type: 'input_value', name: 'RETURN', check: 'Number' }] }, // Eixo 6
    { type: 'chamar_funcao_retorno', colour: 270, message0: 'Resposta de %1', args0: [{ type: 'field_input', name: 'NOME', text: 'calcular' }], output: 'Number' }, // Eixo 6

    // ── ULTRASSÔNICO
    { type: 'configurar_ultrassonico', colour: 30, message0: '📏 Configurar sensor de distância: Trigger %1 Echo %2', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'ler_distancia_cm', colour: 30, message0: 'Distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Number' }, // C6
    { type: 'mostrar_distancia', colour: 30, message0: 'O robô diz a distância em cm (Trigger %1 Echo %2)', args0: [{ type: 'field_dropdown', name: 'TRIG', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], previousStatement: null, nextStatement: null },
    { type: 'objeto_esta_perto', colour: 30, message0: 'Tem objeto a menos de %1 cm? (Trigger %2 Echo %3)', args0: [{ type: 'field_number', name: 'CM', value: 20, min: 1 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean' },
    { type: 'distancia_entre', colour: 30, message0: 'Distância entre %1 e %2 cm? (Trigger %3 Echo %4)', args0: [{ type: 'field_number', name: 'MIN', value: 10, min: 0 }, { type: 'field_number', name: 'MAX', value: 20, min: 0 }, { type: 'field_dropdown', name: 'TRIG', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'ECHO', options: () => currentBoardPins }], output: 'Boolean' },

    // ── DHT11/DHT22 (temperatura e umidade)
    { type: 'dht_iniciar', colour: 15, message0: '🌡️ Configurar Sensor DHT11/DHT22 (pino %1, modelo %2)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'TIPO', options: [['DHT11', 'DHT11'], ['DHT22', 'DHT22']] }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'dht_ler_temperatura', colour: 15, message0: '🌡️ Temperatura do DHT (°C)', output: 'Number' },
    { type: 'dht_ler_umidade', colour: 15, message0: '💧 Umidade do DHT (%)', output: 'Number' },

    // ── RECEPTOR INFRAVERMELHO (protocolo NEC, à mão sobre pulseIn)
    { type: 'ir_iniciar', colour: 285, message0: '📡 Configurar Receptor Infravermelho (pino %1)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentBoardPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'ir_disponivel', colour: 285, message0: 'Chegou um código do controle remoto?', output: 'Boolean' },
    { type: 'ir_ler_codigo', colour: 285, message0: 'Código recebido do controle remoto', output: 'Number' },

    // ── TEXTO
    { type: 'texto_fixo', colour: 160, message0: 'texto %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá!' }], output: 'String' },
    { type: 'comparar_texto', colour: 160, message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A', check: ['Number', 'Boolean', 'String'] }, { type: 'field_dropdown', name: 'OP', options: [['é igual a', '=='], ['é diferente de', '!=']] }, { type: 'input_value', name: 'B', check: ['Number', 'Boolean', 'String'] }], inputsInline: true, output: 'Boolean' },
    { type: 'concatenar_texto', colour: 160, message0: 'unir texto %1 e %2', args0: [{ type: 'input_value', name: 'A', check: ['Number', 'Boolean', 'String'] }, { type: 'input_value', name: 'B', check: ['Number', 'Boolean', 'String'] }], inputsInline: true, output: 'String' },
    { type: 'comprimento_texto', colour: 160, message0: 'comprimento do texto %1', args0: [{ type: 'input_value', name: 'VALOR', check: ['Number', 'Boolean', 'String'] }], inputsInline: true, output: 'Number' },
    { type: 'texto_contem', colour: 160, message0: '%1 contém %2 ?', args0: [{ type: 'input_value', name: 'A', check: ['Number', 'Boolean', 'String'] }, { type: 'input_value', name: 'B', check: ['Number', 'Boolean', 'String'] }], inputsInline: true, output: 'Boolean' },
    { type: 'texto_para_numero', colour: 160, message0: 'converter texto %1 para número', args0: [{ type: 'input_value', name: 'VALOR', check: 'String' }], inputsInline: true, output: 'Number' },
    { type: 'numero_para_texto', colour: 160, message0: 'converter número %1 para texto', args0: [{ type: 'input_value', name: 'VALOR', check: 'Number' }], inputsInline: true, output: 'String' },

    // ── SERIAL
    { type: 'escrever_serial', colour: 135, message0: 'O robô diz o texto: %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá!' }], previousStatement: null, nextStatement: null },
    { type: 'escrever_serial_valor', colour: 135, message0: 'O robô diz: %1', args0: [{ type: 'input_value', name: 'VALOR', check: ['Number', 'Boolean', 'String'] }], previousStatement: null, nextStatement: null },
    { type: 'serial_disponivel', colour: 135, message0: 'Chegou dado pela Serial (USB)?', output: 'Boolean' },
    { type: 'serial_ler_texto', colour: 135, message0: 'Ler texto recebido pela Serial (USB)', output: 'String' },

    // ── SERVO MOTOR
    { type: 'servo_configurar', colour: 170, message0: 'Conectar servo no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'servo_mover', colour: 170, message0: 'Mover servo (pino %1) para %2 °', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'input_value', name: 'ANGULO', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'servo_ler', colour: 170, message0: 'Posição atual do servo (pino %1)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }], output: 'Number' }, // C6

    // ── BUZZER
    { type: 'buzzer_tocar', colour: 75, message0: '🔊 Tocar som: pino %1 frequência %2 Hz', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31, max: 65535 }], previousStatement: null, nextStatement: null },
    { type: 'buzzer_tocar_musica', colour: 75, message0: '🎵 Tocar música: pino %1  %2', args0: [
    { type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins },
    { type: 'field_dropdown', name: 'MUSICA', options: [['🍄 Super Mario Bros', 'mario'],['🎂 Parabéns a Você', 'parabens'],
    ]},
  ],
  previousStatement: null, nextStatement: null,
},
    { type: 'buzzer_tocar_tempo', colour: 75, message0: '🔊 Tocar som: pino %1 frequência %2 Hz por %3 ms', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'field_number', name: 'FREQ', value: 440, min: 31 }, { type: 'field_number', name: 'DUR', value: 500, min: 1 }], previousStatement: null, nextStatement: null },
    { type: 'buzzer_parar', colour: 75, message0: '🔇 Parar som no pino %1', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }], previousStatement: null, nextStatement: null },

    // ── DISPLAY LCD (I²C, HD44780 4 bits via expansor PCF8574)
    { type: 'lcd_iniciar', colour: 45, message0: '🖥️ Iniciar Display LCD (SDA %1 SCL %2 endereço %3, %4 colunas × %5 linhas)', args0: [{ type: 'field_dropdown', name: 'SDA', options: () => currentI2cSdaPins }, { type: 'field_dropdown', name: 'SCL', options: () => currentI2cSclPins }, { type: 'field_dropdown', name: 'ADDR', options: [['0x27 (mais comum)', '0x27'], ['0x3F', '0x3F']] }, { type: 'field_number', name: 'COLUNAS', value: 16, min: 1, max: 40, precision: 1 }, { type: 'field_number', name: 'LINHAS', value: 2, min: 1, max: 4, precision: 1 }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'lcd_limpar', colour: 45, message0: '🖥️ Limpar Display LCD', previousStatement: null, nextStatement: null },
    { type: 'lcd_posicionar_cursor', colour: 45, message0: '🖥️ Posicionar cursor do Display LCD: coluna %1 linha %2', args0: [{ type: 'input_value', name: 'COLUNA', check: 'Number' }, { type: 'input_value', name: 'LINHA', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'lcd_escrever_texto', colour: 45, message0: '🖥️ Display LCD escreve o texto: %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'Olá!' }], previousStatement: null, nextStatement: null },
    { type: 'lcd_escrever_valor', colour: 45, message0: '🖥️ Display LCD escreve: %1', args0: [{ type: 'input_value', name: 'VALOR', check: ['Number', 'Boolean', 'String'] }], previousStatement: null, nextStatement: null },

    // ── LED ENDEREÇÁVEL (NeoPixel/WS2812, via biblioteca Adafruit_NeoPixel —
    // única exceção à regra "sem biblioteca externa": o protocolo exige
    // timing de dezenas de nanossegundos, inviável de reimplementar à mão
    // de forma confiável entre AVR 16MHz e ESP32 240MHz, mesmo motivo que já
    // justifica ESP32Servo.h para o Servo)
    { type: 'neopixel_iniciar', colour: 285, message0: '🌈 Configurar Tira de LEDs (pino %1, quantidade %2)', args0: [{ type: 'field_dropdown', name: 'PIN', options: () => currentOutputPins }, { type: 'field_number', name: 'QUANTIDADE', value: 8, min: 1, max: 300, precision: 1 }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'neopixel_definir_cor', colour: 285, message0: '🌈 Definir cor do LED %1: Vermelho %2 Verde %3 Azul %4', args0: [{ type: 'input_value', name: 'INDICE', check: 'Number' }, { type: 'input_value', name: 'R', check: 'Number' }, { type: 'input_value', name: 'G', check: 'Number' }, { type: 'input_value', name: 'B', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'neopixel_limpar', colour: 285, message0: '🌈 Apagar todos os LEDs (na memória)', previousStatement: null, nextStatement: null },
    { type: 'neopixel_mostrar', colour: 285, message0: '🌈 Atualizar Tira de LEDs (mostrar cores definidas)', previousStatement: null, nextStatement: null },

    // ── ESP-NOW (Sem Fio)
    { type: 'espnow_iniciar_wifi', colour: 300, message0: '📶 Preparar comunicação sem fio (Wi-Fi)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_mac_serial', colour: 300, message0: '📋 Mostrar Código deste dispositivo (MAC)', previousStatement: null, nextStatement: null },
    { type: 'espnow_transmissor_init', colour: 300, message0: '📡 Preparar Luva (Transmissor)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_adicionar_receptor', colour: 300, message0: '🔗 Conectar ao Robô (Código: %1)', args0: [{ type: 'field_input', name: 'MAC', text: 'AA:BB:CC:DD:EE:FF' }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_mac_ext'] }, // C2
    { type: 'espnow_enviar_pacote', colour: 300, message0: 'Enviar para o robô: inclinação frente/trás %1 inclinação esq/dir %2 parar %3', args0: [{ type: 'input_value', name: 'PITCH', check: 'Number' }, { type: 'input_value', name: 'ROLL', check: 'Number' }, { type: 'input_value', name: 'PARAR', check: 'Boolean' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'espnow_receptor_init', colour: 300, message0: '📡 Preparar Robô (Receptor)', previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'espnow_tem_dados_novos', colour: 300, message0: 'Chegou mensagem da luva?', output: 'Boolean' }, // C6
    { type: 'espnow_ler_pitch', colour: 300, message0: 'Inclinação frente/trás recebida', output: 'Number' }, // C6
    { type: 'espnow_ler_roll', colour: 300, message0: 'Inclinação esq/dir recebida', output: 'Number' }, // C6
    { type: 'espnow_ler_flag_parar', colour: 300, message0: 'Comando "parar" recebido?', output: 'Boolean' }, // C6
    { type: 'espnow_timeout_ms', colour: 300, message0: 'Sem sinal da luva por mais de %1 ms?', args0: [{ type: 'field_number', name: 'MS', value: 600, min: 100 }], output: 'Boolean' },
    { type: 'espnow_marcar_lido', colour: 300, message0: '✅ Marcar mensagem como lida', args0: [], previousStatement: null, nextStatement: null },

    // ── ESP-NOW — mensagem genérica (não é exclusiva de robôs: sensor, LED,
    // comando, telemetria — qualquer combinação de até 3 números + 1 sinal)
    { type: 'espnow_enviar_mensagem', colour: 300, message0: '📤 Enviar mensagem: tipo %1 %2 valor A %3 valor B %4 valor C %5 %6 sinal %7', args0: [{ type: 'field_number', name: 'TIPO', value: 0, min: 0, max: 255, precision: 1 }, { type: 'input_dummy' }, { type: 'input_value', name: 'A', check: 'Number' }, { type: 'input_value', name: 'B', check: 'Number' }, { type: 'input_value', name: 'C', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_value', name: 'SINAL', check: 'Boolean' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'espnow_mensagem_tipo', colour: 300, message0: 'Tipo da mensagem recebida', output: 'Number' },
    { type: 'espnow_mensagem_valor_a', colour: 300, message0: 'Valor A recebido', output: 'Number' },
    { type: 'espnow_mensagem_valor_b', colour: 300, message0: 'Valor B recebido', output: 'Number' },
    { type: 'espnow_mensagem_valor_c', colour: 300, message0: 'Valor C recebido', output: 'Number' },
    { type: 'espnow_mensagem_sinal', colour: 300, message0: 'Sinal (verdadeiro/falso) recebido', output: 'Boolean' },
    { type: 'espnow_mensagem_remetente', colour: 300, message0: 'Código (MAC) de quem enviou a última mensagem', output: 'String' },
    { type: 'espnow_iniciou_com_sucesso', colour: 300, message0: 'ESP-NOW iniciou com sucesso?', output: 'Boolean' },
    { type: 'espnow_envio_confirmado', colour: 300, message0: 'O último envio foi confirmado pelo rádio?', output: 'Boolean' },
    { type: 'espnow_contagem_invalidas', colour: 300, message0: 'Quantidade de mensagens inválidas recebidas', output: 'Number' },

    // ── WI-FI (rede) — conexão comum à internet/roteador, independente do ESP-NOW
    { type: 'wifi_conectar', colour: 200, message0: '📶 Conectar ao Wi-Fi: rede %1 senha %2', args0: [{ type: 'field_input', name: 'SSID', text: 'MinhaRede' }, { type: 'field_input', name: 'SENHA', text: 'minhasenha' }], previousStatement: null, nextStatement: null },
    { type: 'wifi_esta_conectado', colour: 200, message0: 'Wi-Fi está conectado?', output: 'Boolean' },
    { type: 'wifi_endereco_ip', colour: 200, message0: 'Endereço IP do Wi-Fi', output: 'String' },
    { type: 'wifi_desconectar', colour: 200, message0: '📶 Desconectar Wi-Fi', previousStatement: null, nextStatement: null },
    { type: 'wifi_http_get', colour: 200, message0: '🌐 Fazer requisição HTTP para %1', args0: [{ type: 'input_value', name: 'URL', check: 'String' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'wifi_http_sucesso', colour: 200, message0: 'Requisição HTTP teve sucesso?', output: 'Boolean' },
    { type: 'wifi_http_resposta', colour: 200, message0: 'Resposta da requisição HTTP', output: 'String' },

    // ── BLUETOOTH (clássico, porta serial sem fio — parear com celular)
    { type: 'bt_iniciar', colour: 230, message0: '🔵 Iniciar Bluetooth: nome do dispositivo %1', args0: [{ type: 'field_input', name: 'NOME', text: 'Bloquin' }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'bt_disponivel', colour: 230, message0: 'Chegou dado novo pelo Bluetooth?', output: 'Boolean' },
    { type: 'bt_ler_texto', colour: 230, message0: 'Ler texto recebido pelo Bluetooth', output: 'String' },
    { type: 'bt_enviar_texto', colour: 230, message0: 'Enviar texto pelo Bluetooth: %1', args0: [{ type: 'input_value', name: 'TEXTO', check: 'String' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'bt_conectado', colour: 230, message0: 'Um celular está conectado pelo Bluetooth?', output: 'Boolean' },

    // ── MPU-6050
    { type: 'mpu_iniciar', colour: 310, message0: '🧭 Iniciar MPU6050 (SDA %1 SCL %2 Endereço %3)', args0: [{ type: 'field_dropdown', name: 'SDA', options: () => currentI2cSdaPins }, { type: 'field_dropdown', name: 'SCL', options: () => currentI2cSclPins }, { type: 'field_dropdown', name: 'ADDR', options: [['0x68 (padrão — AD0 em GND)', '0x68'], ['0x69 (AD0 em VCC)', '0x69']] }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'mpu_ler_pitch', colour: 310, message0: '🧭 Inclinação frente/trás (graus)', output: 'Number' }, // C6
    { type: 'mpu_ler_roll', colour: 310, message0: '🧭 Inclinação esquerda/direita (graus)', output: 'Number' }, // C6
    { type: 'mpu_ler_aceleracao_x', colour: 310, message0: '📈 Aceleração X (g)', output: 'Number' },
    { type: 'mpu_ler_aceleracao_y', colour: 310, message0: '📈 Aceleração Y (g)', output: 'Number' },
    { type: 'mpu_ler_aceleracao_z', colour: 310, message0: '📈 Aceleração Z (g)', output: 'Number' },
    { type: 'mpu_ler_giro_x', colour: 310, message0: '🌀 Rotação X (°/s)', output: 'Number' },
    { type: 'mpu_ler_giro_y', colour: 310, message0: '🌀 Rotação Y (°/s)', output: 'Number' },
    { type: 'mpu_ler_giro_z', colour: 310, message0: '🌀 Rotação Z (°/s)', output: 'Number' },
    { type: 'mpu_ler_temperatura', colour: 310, message0: '🌡️ Temperatura do MPU6050 (°C)', output: 'Number' },

    // ── PONTE H
    { type: 'l298n_configurar_simples', colour: 120, message0: '⚙️ Configurar Motores do Robô%1Motor Esquerdo (Força %2 IN1 %3 IN2 %4)%5Motor Direito (Força %6 IN3 %7 IN4 %8)', args0: [{ type: 'input_dummy' }, { type: 'field_dropdown', name: 'ENA', options: () => currentPwmPins }, { type: 'field_dropdown', name: 'IN1', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'IN2', options: () => currentOutputPins }, { type: 'input_dummy' }, { type: 'field_dropdown', name: 'ENB', options: () => currentPwmPins }, { type: 'field_dropdown', name: 'IN3', options: () => currentOutputPins }, { type: 'field_dropdown', name: 'IN4', options: () => currentOutputPins }], previousStatement: null, nextStatement: null, extensions: ['validacao_setup_ext'] },
    { type: 'l298n_mover_robo', colour: 120, message0: '🚗 Mover robô para %1 com força %2', args0: [{ type: 'field_dropdown', name: 'DIRECAO', options: [['Frente', 'FRENTE'], ['Trás', 'TRAS'], ['Esquerda', 'ESQUERDA'], ['Direita', 'DIREITA'], ['Parar', 'PARAR']] }, { type: 'input_value', name: 'FORCA', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'l298n_mover_motor', colour: 120, message0: 'Girar motor %1 para %2 com força %3', args0: [{ type: 'field_dropdown', name: 'MOTOR', options: [['Esquerdo', 'E'], ['Direito', 'D']] }, { type: 'field_dropdown', name: 'DIRECAO', options: [['Frente', 'FRENTE'], ['Trás', 'TRAS'], ['Parar', 'PARAR']] }, { type: 'input_value', name: 'FORCA', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
    { type: 'l298n_velocidade_por_pitch_roll', colour: 120, message0: '🚗 Mover por inclinação (Frente/Trás %1 Esq/Dir %2)', args0: [{ type: 'input_value', name: 'PITCH', check: 'Number' }, { type: 'input_value', name: 'ROLL', check: 'Number' }], inputsInline: true, previousStatement: null, nextStatement: null },
  ];
  Blockly.Blocks['l298n_parar'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🛑 Parar Robô');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
      this.setTooltip(BLOCK_DOC_REGISTRY.l298n_parar?.summary ?? 'Para os dois motores do robô imediatamente.');
      this.setHelpUrl('');
    },
  };
  // O registro central de documentação (src/features/blockDocs) é a única
  // fonte do texto de tooltip — nenhum bloco define `tooltip` diretamente
  // aqui, evitando descrição duplicada espalhada pelos blocos individuais.
  const documentedBlocks = customBlocks.map((definition) => ({
    ...definition,
    tooltip: BLOCK_DOC_REGISTRY[definition.type]?.summary ?? '',
  }));
  Blockly.defineBlocksWithJsonArray(documentedBlocks);
}
