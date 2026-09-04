import { BOARDS, type BoardKey } from './boards';

// Categorias que só fazem sentido com o rádio Wi-Fi/Bluetooth do ESP32 —
// escondidas da toolbox em Uno/Nano por getToolboxConfig() abaixo. Mantido
// por nome (não por import de ESP32_ONLY_TYPES de contracts.ts) porque o
// filtro aqui é por categoria inteira, não por tipo de bloco individual.
const ESP32_ONLY_CATEGORY_NAMES = new Set(['ESP-NOW', 'Wi-Fi', 'Bluetooth']);

export const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Lógica', colour: '210', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--logica' },
      contents: [
        { kind: 'block', type: 'se_entao' },
        { kind: 'block', type: 'se_entao_senao' },
        { kind: 'block', type: 'comparar_valores', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 10 } } } } },
        { kind: 'block', type: 'valor_booleano_fixo' },
        { kind: 'block', type: 'e_ou_logico' },
        { kind: 'block', type: 'nao_logico' },
        { kind: 'block', type: 'numero_para_booleano', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 1 } } } } },
        { kind: 'block', type: 'booleano_para_numero', inputs: { VALOR: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'true' } } } } },
        { kind: 'block', type: 'mudou_para_verdadeiro', inputs: { VALOR: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'true' } } } } },
      ],
    },
    {
      kind: 'category', name: 'Controle', colour: '120', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--controle' },
      contents: [
        { kind: 'block', type: 'repetir_vezes' },
        { kind: 'block', type: 'repetir_quantidade', inputs: { TIMES: { block: { type: 'numero_fixo', fields: { VALOR: 5 } } } } },
        { kind: 'block', type: 'enquanto_verdadeiro' },
        { kind: 'block', type: 'parar_repeticao' },
      ],
    },
    {
      kind: 'category', name: 'Matemática', colour: '255', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--matematica' },
      contents: [
        { kind: 'block', type: 'numero_fixo' },
        { kind: 'block', type: 'operacao_matematica', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'potencia', inputs: { BASE: { block: { type: 'numero_fixo', fields: { VALOR: 2 } } }, EXPOENTE: { block: { type: 'numero_fixo', fields: { VALOR: 3 } } } } },
        { kind: 'block', type: 'minimo_maximo', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 100 } } } } },
        { kind: 'block', type: 'funcao_matematica', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'mapear_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 512 } } } } },
        { kind: 'block', type: 'valor_absoluto', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'constrain_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'random_valor' },
      ],
    },
    {
      kind: 'category', name: 'Variáveis', colour: '330', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--variaveis' },
      contents: [
        { kind: 'block', type: 'declarar_variavel_global', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'atribuir_variavel', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'ler_variavel' },
        { kind: 'block', type: 'incrementar_variavel', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 1 } } } } },
      ],
    },
    {
      kind: 'category', name: 'Listas', colour: '345', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--listas' },
      contents: [
        { kind: 'block', type: 'declarar_lista_global' },
        { kind: 'block', type: 'lista_definir_item', inputs: { INDICE: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'lista_ler_item', inputs: { INDICE: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'lista_tamanho' },
      ],
    },
    {
      kind: 'category', name: 'Armazenamento', colour: '345', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--armazenamento' },
      contents: [
        { kind: 'block', type: 'armazenamento_salvar', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'armazenamento_ler', inputs: { PADRAO: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
      ],
    },
    {
      kind: 'category', name: 'Funções', colour: '270', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--funcoes' },
      contents: [
        { kind: 'block', type: 'definir_funcao' },
        { kind: 'block', type: 'chamar_funcao' },
        { kind: 'block', type: 'definir_funcao_retorno', inputs: { RETURN: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'chamar_funcao_retorno' },
      ],
    },
    {
      kind: 'category', name: 'Tempo', colour: '120', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--tempo' },
      contents: [
        { kind: 'block', type: 'esperar' },
        { kind: 'block', type: 'esperar_duracao', inputs: { TIME: { block: { type: 'numero_fixo', fields: { VALOR: 1000 } } } } },
        { kind: 'block', type: 'a_cada_x_ms' },
        { kind: 'block', type: 'millis_atual' },
      ],
    },
    {
      kind: 'category', name: 'Entradas e Saídas', colour: '165', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--entradas-saidas' },
      contents: [
        { kind: 'block', type: 'configurar_pino' },
        { kind: 'block', type: 'escrever_pino' },
        { kind: 'block', type: 'escrever_pino_booleano', inputs: { STATE: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'true' } } } } },
        { kind: 'block', type: 'ler_pino_digital' },
        { kind: 'block', type: 'escrever_pino_pwm', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 128 } } } } },
        { kind: 'block', type: 'ler_pino_analogico' },
      ],
    },
    {
      kind: 'category', name: 'Sensor de Distância', colour: '30', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--sensor-distancia' },
      contents: [
        { kind: 'block', type: 'configurar_ultrassonico' },
        { kind: 'block', type: 'ler_distancia_cm' },
        { kind: 'block', type: 'mostrar_distancia' },
        { kind: 'block', type: 'objeto_esta_perto' },
        { kind: 'block', type: 'distancia_entre' },
      ],
    },
    {
      kind: 'category', name: 'Sensor de Temperatura e Umidade', colour: '15', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--sensor-temp-umidade' },
      contents: [
        { kind: 'block', type: 'dht_iniciar' },
        { kind: 'block', type: 'dht_ler_temperatura' },
        { kind: 'block', type: 'dht_ler_umidade' },
      ],
    },
    {
      kind: 'category', name: 'Receptor Infravermelho', colour: '285', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--receptor-ir' },
      contents: [
        { kind: 'block', type: 'ir_iniciar' },
        { kind: 'block', type: 'ir_disponivel' },
        { kind: 'block', type: 'ir_ler_codigo' },
      ],
    },
    {
      kind: 'category', name: 'MPU6050', colour: '310', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--mpu6050' },
      contents: [
        { kind: 'block', type: 'mpu_iniciar' },
        { kind: 'block', type: 'mpu_ler_pitch' },
        { kind: 'block', type: 'mpu_ler_roll' },
        { kind: 'sep' },
        { kind: 'block', type: 'mpu_ler_aceleracao_x' },
        { kind: 'block', type: 'mpu_ler_aceleracao_y' },
        { kind: 'block', type: 'mpu_ler_aceleracao_z' },
        { kind: 'block', type: 'mpu_ler_giro_x' },
        { kind: 'block', type: 'mpu_ler_giro_y' },
        { kind: 'block', type: 'mpu_ler_giro_z' },
        { kind: 'block', type: 'mpu_ler_temperatura' },
      ],
    },
    {
      kind: 'category', name: 'Servo', colour: '170', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--servo' },
      contents: [
        { kind: 'block', type: 'servo_configurar' },
        { kind: 'block', type: 'servo_mover', inputs: { ANGULO: { block: { type: 'numero_fixo', fields: { VALOR: 90 } } } } },
        { kind: 'block', type: 'servo_ler' },
      ],
    },
    {
      kind: 'category', name: 'Buzzer', colour: '75', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--buzzer' },
      contents: [
        { kind: 'block', type: 'buzzer_tocar' },
        { kind: 'block', type: 'buzzer_tocar_tempo' },
        { kind: 'block', type: 'buzzer_parar' },
        { kind: 'block', type: 'buzzer_tocar_musica' },
      ],
    },
    {
      kind: 'category', name: 'Display LCD', colour: '45', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--display-lcd' },
      contents: [
        { kind: 'block', type: 'lcd_iniciar' },
        { kind: 'block', type: 'lcd_limpar' },
        { kind: 'block', type: 'lcd_posicionar_cursor', inputs: { COLUNA: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, LINHA: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'lcd_escrever_texto' },
        { kind: 'block', type: 'lcd_escrever_valor' },
      ],
    },
    {
      kind: 'category', name: 'LED Endereçável', colour: '285', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--led-enderecavel' },
      contents: [
        { kind: 'block', type: 'neopixel_iniciar' },
        {
          kind: 'block', type: 'neopixel_definir_cor',
          inputs: {
            INDICE: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            R: { block: { type: 'numero_fixo', fields: { VALOR: 255 } } },
            G: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            B: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
          },
        },
        { kind: 'block', type: 'neopixel_limpar' },
        { kind: 'block', type: 'neopixel_mostrar' },
      ],
    },
    {
      kind: 'category', name: 'Motor DC', colour: '120', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--motor-dc' },
      contents: [
        { kind: 'block', type: 'l298n_configurar_simples' },
        { kind: 'block', type: 'l298n_mover_robo', inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 200 } } } } },
        { kind: 'block', type: 'l298n_parar' },
        { kind: 'block', type: 'l298n_mover_motor', inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 200 } } } } },
        {
          kind: 'block', type: 'l298n_velocidade_por_pitch_roll',
          inputs: {
            PITCH: { block: { type: 'espnow_ler_pitch' } },
            ROLL:  { block: { type: 'espnow_ler_roll'  } },
          },
        },
      ],
    },
    {
      kind: 'category', name: 'Texto', colour: '160', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--texto' },
      contents: [
        { kind: 'block', type: 'texto_fixo' },
        { kind: 'block', type: 'comparar_texto', inputs: { A: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } }, B: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } } } },
        { kind: 'block', type: 'concatenar_texto', inputs: { A: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } }, B: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } } } },
        { kind: 'block', type: 'comprimento_texto', inputs: { VALOR: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } } } },
        { kind: 'block', type: 'texto_contem', inputs: { A: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } }, B: { block: { type: 'texto_fixo', fields: { TEXT: 'texto' } } } } },
        { kind: 'block', type: 'texto_para_numero', inputs: { VALOR: { block: { type: 'texto_fixo', fields: { TEXT: '10' } } } } },
        { kind: 'block', type: 'numero_para_texto', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
      ],
    },
    {
      kind: 'category', name: 'Serial', colour: '135', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--serial' },
      contents: [
        { kind: 'block', type: 'escrever_serial' },
        { kind: 'block', type: 'escrever_serial_valor' },
        { kind: 'block', type: 'serial_disponivel' },
        { kind: 'block', type: 'serial_ler_texto' },
      ],
    },
    {
      // ESP-NOW é um TRANSPORTE genérico entre ESP32s — não é exclusivo de
      // controle de robô. A mensagem tipo/valor A/B/C/sinal serve para
      // sensor, comando, LED ou telemetria; pitch/roll/parar é só um alias
      // legado sobre os mesmos campos, mantido para projetos salvos.
      kind: 'category', name: 'ESP-NOW', colour: '300', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--esp-now' },
      contents: [
        { kind: 'block', type: 'espnow_iniciar_wifi' },
        { kind: 'block', type: 'espnow_mac_serial' },
        { kind: 'block', type: 'espnow_iniciou_com_sucesso' },
        { kind: 'sep' },
        { kind: 'block', type: 'espnow_transmissor_init' },
        { kind: 'block', type: 'espnow_adicionar_receptor' },
        {
          kind: 'block', type: 'espnow_enviar_mensagem',
          inputs: {
            A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            B: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            C: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            SINAL: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
          },
        },
        { kind: 'block', type: 'espnow_envio_confirmado' },
        { kind: 'sep' },
        { kind: 'block', type: 'espnow_receptor_init' },
        { kind: 'block', type: 'espnow_tem_dados_novos' },
        { kind: 'block', type: 'espnow_mensagem_tipo' },
        { kind: 'block', type: 'espnow_mensagem_valor_a' },
        { kind: 'block', type: 'espnow_mensagem_valor_b' },
        { kind: 'block', type: 'espnow_mensagem_valor_c' },
        { kind: 'block', type: 'espnow_mensagem_sinal' },
        { kind: 'block', type: 'espnow_mensagem_remetente' },
        { kind: 'block', type: 'espnow_marcar_lido' },
        { kind: 'block', type: 'espnow_timeout_ms' },
        { kind: 'block', type: 'espnow_contagem_invalidas' },
        { kind: 'sep' },
        { kind: 'block', type: 'espnow_ler_pitch' },
        { kind: 'block', type: 'espnow_ler_roll' },
        { kind: 'block', type: 'espnow_ler_flag_parar' },
        {
          kind: 'block', type: 'espnow_enviar_pacote',
          inputs: {
            PITCH: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            ROLL:  { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            PARAR: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
          },
        },
      ],
    },
    {
      kind: 'category', name: 'Wi-Fi', colour: '200', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--wifi' },
      contents: [
        { kind: 'block', type: 'wifi_conectar' },
        { kind: 'block', type: 'wifi_esta_conectado' },
        { kind: 'block', type: 'wifi_endereco_ip' },
        { kind: 'block', type: 'wifi_desconectar' },
        { kind: 'sep' },
        { kind: 'block', type: 'wifi_http_get', inputs: { URL: { block: { type: 'texto_fixo', fields: { TEXT: 'http://' } } } } },
        { kind: 'block', type: 'wifi_http_sucesso' },
        { kind: 'block', type: 'wifi_http_resposta' },
      ],
    },
    {
      kind: 'category', name: 'Bluetooth', colour: '230', cssConfig: { icon: 'toolbox-cat-icon toolbox-cat-icon--bluetooth' },
      contents: [
        { kind: 'block', type: 'bt_iniciar' },
        { kind: 'block', type: 'bt_conectado' },
        { kind: 'block', type: 'bt_disponivel' },
        { kind: 'block', type: 'bt_ler_texto' },
        { kind: 'block', type: 'bt_enviar_texto', inputs: { TEXTO: { block: { type: 'texto_fixo', fields: { TEXT: 'Olá!' } } } } },
      ],
    },
  ],
};

const toolboxConfigCache = new Map<BoardKey, ReturnType<typeof buildToolboxConfig>>();

export function getToolboxConfig(board: BoardKey) {
  const cached = toolboxConfigCache.get(board);
  if (cached) return cached;
  const built = buildToolboxConfig(board);
  toolboxConfigCache.set(board, built);
  return built;
}

/**
 * Reconstrói o toolbox inteiro (filter+map de todas as categorias/blocos) —
 * caro o bastante para NÃO chamar direto fora de `getToolboxConfig` acima,
 * que memoiza o resultado por placa (só existem 3 valores possíveis). Sem
 * esse cache, cada busca de um bloco na toolbox (ex. `derive.ts` resolvendo
 * a documentação de cada bloco) reconstruía a árvore inteira do zero.
 */
function buildToolboxConfig(board: BoardKey) {
  const defaults = board === 'esp32'
    ? {
        ultrasonic: { TRIG: '18', ECHO: '19' },
        l298n: { ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14' },
        servo: { PIN: '13' },
        io: { PIN: '2' },
        pwm: { PIN: '2' },
        analog: { PIN: '32' },
        analogMaximum: BOARDS[board].analogReadMaximum,
      }
    : {
        ultrasonic: { TRIG: '12', ECHO: '13' },
        l298n: { ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8' },
        servo: { PIN: '9' },
        io: { PIN: '13' },
        pwm: { PIN: '3' },
        analog: { PIN: 'A0' },
        analogMaximum: BOARDS[board].analogReadMaximum,
      };

  return {
    ...toolboxConfig,
    contents: toolboxConfig.contents
      .filter((category) => board === 'esp32' || !ESP32_ONLY_CATEGORY_NAMES.has(category.name ?? ''))
      .map((category) => {
        return {
          ...category,
          contents: category.contents.map((item) => {
            if (item.kind !== 'block') return item;
            const type = item.type;
            if (!type) return item;
            if ([
              'configurar_ultrassonico',
              'ler_distancia_cm',
              'mostrar_distancia',
              'objeto_esta_perto',
              'distancia_entre',
            ].includes(type)) {
              return { ...item, fields: defaults.ultrasonic };
            }
            if (item.type === 'l298n_configurar_simples') {
              return { ...item, fields: defaults.l298n };
            }
            if (['servo_configurar', 'servo_mover', 'servo_ler'].includes(type)) {
              return { ...item, fields: defaults.servo };
            }
            if ([
              'configurar_pino',
              'escrever_pino',
              'escrever_pino_booleano',
              'ler_pino_digital',
            ].includes(type)) {
              return { ...item, fields: defaults.io };
            }
            if (type === 'escrever_pino_pwm') {
              return { ...item, fields: defaults.pwm };
            }
            if (type === 'ler_pino_analogico') {
              return { ...item, fields: defaults.analog };
            }
            if (type === 'mapear_valor') {
              return {
                ...item,
                fields: { DE_MAX: defaults.analogMaximum },
                inputs: {
                  VALOR: {
                    block: {
                      type: 'numero_fixo',
                      fields: { VALOR: Math.round(defaults.analogMaximum / 2) },
                    },
                  },
                },
              };
            }
            if (
              board !== 'esp32'
              && item.type === 'l298n_velocidade_por_pitch_roll'
            ) {
              return {
                ...item,
                inputs: {
                  PITCH: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
                  ROLL: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
                },
              };
            }
            return item;
          }),
        };
      }),
  };
}

export const BLOCK_NAMES: Record<string, string> = {
  // Mantém exatamente o mesmo dicionário de nomes anterior + os novos:
  a_cada_x_ms: 'A cada X ms (Temporizador)',
  definir_funcao_retorno: 'Definir Função com Resposta',
  chamar_funcao_retorno: 'Executar e Pegar Resposta',
  configurar_pino: 'Configurar Pino',
  escrever_pino: 'Ligar/Desligar Pino',
  escrever_pino_booleano: 'Controlar Pino com Condição',
  ler_pino_digital: 'Ler Pino Digital',
  escrever_pino_pwm: 'Força do Pino (PWM)',
  ler_pino_analogico: 'Ler Sensor Analógico',
  esperar: 'Esperar',
  esperar_duracao: 'Esperar Tempo Calculado',
  repetir_vezes: 'Repetir Vezes',
  repetir_quantidade: 'Repetir Quantidade Calculada',
  enquanto_verdadeiro: 'Enquanto... Fizer',
  parar_repeticao: 'Parar Repetição',
  se_entao: 'Se... Então',
  se_entao_senao: 'Se... Então... Senão',
  comparar_valores: 'Comparar Valores',
  numero_fixo: 'Número',
  numero_para_booleano: 'Número é Diferente de Zero?',
  booleano_para_numero: 'Verdadeiro/Falso para Número',
  e_ou_logico: 'E / Ou',
  nao_logico: 'NÃO',
  mudou_para_verdadeiro: 'Mudou de Falso para Verdadeiro?',
  mapear_valor: 'Converter Escala',
  operacao_matematica: 'Operação Matemática',
  potencia: 'Potência',
  minimo_maximo: 'Menor / Maior Valor',
  funcao_matematica: 'Arredondar / Raiz Quadrada',
  valor_absoluto: 'Valor Positivo',
  constrain_valor: 'Limitar Valor',
  random_valor: 'Número Aleatório',
  millis_atual: 'Tempo Ligado (ms)',
  util_map_float: 'Converter Escala (Preciso)',
  util_fabsf: 'Valor Positivo (Preciso)',
  declarar_variavel_global: 'Variável',
  atribuir_variavel: 'Guardar em Variável',
  ler_variavel: 'Ler Variável',
  incrementar_variavel: 'Aumentar Variável',
  declarar_lista_global: 'Lista',
  lista_definir_item: 'Guardar Item na Lista',
  lista_ler_item: 'Ler Item da Lista',
  lista_tamanho: 'Tamanho da Lista',
  armazenamento_salvar: 'Salvar Valor Permanente',
  armazenamento_ler: 'Ler Valor Permanente',
  valor_booleano_fixo: 'Verdadeiro / Falso',
  definir_funcao: 'Definir Função',
  chamar_funcao: 'Executar Função',
  configurar_ultrassonico: 'Configurar Sensor de Distância',
  ler_distancia_cm: 'Ler Distância (cm)',
  mostrar_distancia: 'Mostrar Distância no Ecrã',
  objeto_esta_perto: 'Objeto Está Perto?',
  distancia_entre: 'Distância Entre... e...?',
  dht_iniciar: 'Configurar Sensor DHT11/DHT22',
  dht_ler_temperatura: 'Temperatura do DHT',
  dht_ler_umidade: 'Umidade do DHT',
  ir_iniciar: 'Configurar Receptor Infravermelho',
  ir_disponivel: 'Chegou um Código do Controle Remoto?',
  ir_ler_codigo: 'Código Recebido do Controle Remoto',
  lcd_iniciar: 'Iniciar Display LCD',
  lcd_limpar: 'Limpar Display LCD',
  lcd_posicionar_cursor: 'Posicionar Cursor do Display LCD',
  lcd_escrever_texto: 'Display LCD Escreve (texto)',
  lcd_escrever_valor: 'Display LCD Escreve (valor)',
  neopixel_iniciar: 'Configurar Tira de LEDs',
  neopixel_definir_cor: 'Definir Cor do LED',
  neopixel_limpar: 'Apagar Todos os LEDs',
  neopixel_mostrar: 'Atualizar Tira de LEDs',
  servo_configurar: 'Conectar Servo',
  servo_mover: 'Mover Servo',
  servo_ler: 'Posição do Servo',
  buzzer_tocar: 'Tocar Som',
  buzzer_tocar_tempo: 'Tocar Som por Tempo',
  buzzer_parar: 'Parar Som',
  buzzer_tocar_musica: 'Tocar Música Pronta',
  escrever_serial: 'O Robô Diz (texto)',
  escrever_serial_valor: 'O Robô Diz (valor)',
  serial_disponivel: 'Chegou Dado pela Serial?',
  serial_ler_texto: 'Ler Texto da Serial',
  texto_fixo: 'Texto',
  comparar_texto: 'Comparar Texto',
  concatenar_texto: 'Unir Texto',
  comprimento_texto: 'Comprimento do Texto',
  texto_contem: 'Texto Contém?',
  texto_para_numero: 'Texto para Número',
  numero_para_texto: 'Número para Texto',
  espnow_iniciar_wifi: 'Preparar Comunicação Sem Fio',
  espnow_mac_serial: 'Mostrar Código deste Dispositivo',
  espnow_iniciou_com_sucesso: 'ESP-NOW Iniciou com Sucesso?',
  espnow_transmissor_init: 'Preparar como Transmissor',
  espnow_adicionar_receptor: 'Conectar ao Receptor',
  espnow_enviar_mensagem: 'Enviar Mensagem (tipo + A/B/C + sinal)',
  espnow_envio_confirmado: 'Envio Confirmado pelo Rádio?',
  espnow_enviar_pacote: 'Enviar Dados (legado: A, B, Parar)',
  espnow_receptor_init: 'Preparar como Receptor',
  espnow_tem_dados_novos: 'Chegou Mensagem Nova?',
  espnow_mensagem_tipo: 'Tipo da Mensagem Recebida',
  espnow_mensagem_valor_a: 'Valor A Recebido',
  espnow_mensagem_valor_b: 'Valor B Recebido',
  espnow_mensagem_valor_c: 'Valor C Recebido',
  espnow_mensagem_sinal: 'Sinal Recebido',
  espnow_mensagem_remetente: 'Remetente da Mensagem (MAC)',
  espnow_marcar_lido: 'Marcar Mensagem como Lida',
  espnow_timeout_ms: 'Sem Sinal por Mais de X ms?',
  espnow_contagem_invalidas: 'Mensagens Inválidas Recebidas',
  espnow_ler_pitch: 'Valor A Recebido (legado)',
  espnow_ler_roll: 'Valor B Recebido (legado)',
  espnow_ler_flag_parar: 'Comando Parar Recebido? (legado)',
  wifi_conectar: 'Conectar ao Wi-Fi',
  wifi_esta_conectado: 'Wi-Fi Está Conectado?',
  wifi_endereco_ip: 'Endereço IP do Wi-Fi',
  wifi_desconectar: 'Desconectar Wi-Fi',
  wifi_http_get: 'Fazer Requisição HTTP',
  wifi_http_sucesso: 'Requisição HTTP Teve Sucesso?',
  wifi_http_resposta: 'Resposta da Requisição HTTP',
  bt_iniciar: 'Iniciar Bluetooth',
  bt_conectado: 'Celular Conectado por Bluetooth?',
  bt_disponivel: 'Chegou Dado pelo Bluetooth?',
  bt_ler_texto: 'Ler Texto do Bluetooth',
  bt_enviar_texto: 'Enviar Texto pelo Bluetooth',
  mpu_iniciar: 'Iniciar MPU6050',
  mpu_ler_pitch: 'Ler Inclinação Frente/Trás',
  mpu_ler_roll: 'Ler Inclinação Lateral',
  mpu_ler_aceleracao_x: 'Aceleração X',
  mpu_ler_aceleracao_y: 'Aceleração Y',
  mpu_ler_aceleracao_z: 'Aceleração Z',
  mpu_ler_giro_x: 'Rotação X (Giroscópio)',
  mpu_ler_giro_y: 'Rotação Y (Giroscópio)',
  mpu_ler_giro_z: 'Rotação Z (Giroscópio)',
  mpu_ler_temperatura: 'Temperatura do MPU6050',
  l298n_configurar_simples: 'Configurar Motor DC',
  l298n_mover_robo: 'Mover (Frente, Trás, Esq, Dir)',
  l298n_parar: 'Parar Motores',
  l298n_mover_motor: 'Girar Motor Individual',
  l298n_velocidade_por_pitch_roll: 'Mover por Dois Valores (A e B)',
};
