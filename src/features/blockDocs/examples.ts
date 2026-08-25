import type { BlockExample } from './types';

/**
 * Sequências de exemplo reais, no mesmo formato que
 * `Blockly.serialization.workspaces.save()`/`.load()` produzem e consomem.
 * Inspiradas diretamente nas 6 fixtures que `scripts/blockly-audit.ts`
 * compila de verdade (`createCompilationFixtures`), mas recortadas e
 * focadas por tema para caber na tela de detalhe de um único bloco.
 */

function example(
  id: string,
  title: string,
  board: BlockExample['board'],
  caption: string,
  blocks: Record<string, unknown>[],
  blockTypes: string[],
): BlockExample {
  return {
    id,
    title,
    board,
    caption,
    workspace: { blocks: { languageVersion: 0, blocks } },
    blockTypes,
  };
}

export const BLOCK_EXAMPLES: readonly BlockExample[] = [
  example(
    'piscar-led',
    'Piscar um LED',
    'uno',
    'Configure o pino como saída no PREPARAR e alterne HIGH/LOW no AGIR, com uma espera entre as trocas.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'configurar_pino', fields: { PIN: '13', MODE: 'OUTPUT' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'escrever_pino', fields: { PIN: '13', STATE: 'HIGH' },
        next: { block: {
          type: 'esperar', fields: { TIME: 500 },
          next: { block: {
            type: 'escrever_pino', fields: { PIN: '13', STATE: 'LOW' },
            next: { block: { type: 'esperar', fields: { TIME: 500 } } },
          } },
        } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'configurar_pino', 'escrever_pino', 'esperar'],
  ),
  example(
    'sensor-liga-led',
    'Ligar um LED quando o sensor passar de um valor',
    'uno',
    'Lê um sensor analógico e usa SE... ENTÃO para decidir se o LED liga, comparando com um número fixo.',
    [
      { type: 'se_entao', x: 20, y: 20, inputs: {
        CONDICAO: { block: {
          type: 'comparar_valores', fields: { OP: '>' },
          inputs: {
            A: { block: { type: 'ler_pino_analogico', fields: { PIN: 'A0' } } },
            B: { block: { type: 'numero_fixo', fields: { VALOR: 500 } } },
          },
        } },
        ENTAO: { block: {
          type: 'escrever_pino_booleano', fields: { PIN: '13' },
          inputs: { STATE: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'true' } } } },
        } },
      } },
    ],
    ['se_entao', 'comparar_valores', 'ler_pino_analogico', 'numero_fixo', 'escrever_pino_booleano', 'valor_booleano_fixo'],
  ),
  example(
    'contador-serial',
    'Contar e mostrar no monitor',
    'uno',
    'Guarda um número numa variável, aumenta 1 a cada volta do AGIR e mostra o valor atual. "Variável" fica solto no workspace (fora de PREPARAR/AGIR): ele vira uma declaração global, não um passo de setup.',
    [
      { type: 'declarar_variavel_global', x: 20, y: 20, fields: { TIPO: 'int', NOME: 'contador' },
        inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } },
      },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'incrementar_variavel', fields: { NOME: 'contador' },
        inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 1 } } } },
        next: { block: {
          type: 'escrever_serial_valor',
          inputs: { VALOR: { block: { type: 'ler_variavel', fields: { NOME: 'contador' } } } },
          next: { block: { type: 'esperar', fields: { TIME: 1000 } } },
        } },
      } } } },
    ],
    ['bloco_loop', 'declarar_variavel_global', 'incrementar_variavel', 'ler_variavel', 'escrever_serial_valor', 'numero_fixo', 'esperar'],
  ),
  example(
    'bipe-repetido',
    'Repetir um bipe algumas vezes',
    'uno',
    'Repete um bloco de som um número fixo de vezes, com uma pausa entre cada bipe.',
    [
      { type: 'repetir_vezes', x: 20, y: 20, fields: { TIMES: 3 }, inputs: { DO: { block: {
        type: 'buzzer_tocar_tempo', fields: { PIN: '3', FREQ: 440, DUR: 200 },
        next: { block: { type: 'esperar', fields: { TIME: 200 } } },
      } } } },
    ],
    ['repetir_vezes', 'buzzer_tocar_tempo', 'esperar'],
  ),
  example(
    'funcao-piscar',
    'Agrupar ações numa função',
    'uno',
    'Reúne uma sequência de blocos numa função nomeada e executa essa função a partir do AGIR.',
    [
      { type: 'definir_funcao', x: 20, y: 20, fields: { NOME: 'piscarLed' }, inputs: { DO: { block: {
        type: 'escrever_pino', fields: { PIN: '13', STATE: 'HIGH' },
        next: { block: {
          type: 'esperar', fields: { TIME: 200 },
          next: { block: { type: 'escrever_pino', fields: { PIN: '13', STATE: 'LOW' } } },
        } },
      } } } },
      { type: 'bloco_loop', x: 20, y: 160, inputs: { DO: { block: {
        type: 'chamar_funcao', fields: { NOME: 'piscarLed' },
      } } } },
    ],
    ['definir_funcao', 'chamar_funcao', 'escrever_pino', 'esperar', 'bloco_loop'],
  ),
  example(
    'funcao-com-resposta',
    'Calcular um valor e reaproveitar em vários lugares',
    'uno',
    'Uma função com resposta lê o sensor e devolve uma escala já convertida — é só "executar e pegar resposta" quando precisar do valor.',
    [
      { type: 'definir_funcao_retorno', x: 20, y: 20, fields: { NOME: 'lerLuminosidade' }, inputs: {
        RETURN: { block: {
          type: 'mapear_valor', fields: { DE_MIN: 0, DE_MAX: 1023, PARA_MIN: 0, PARA_MAX: 255 },
          inputs: { VALOR: { block: { type: 'ler_pino_analogico', fields: { PIN: 'A0' } } } },
        } },
      } },
      { type: 'escrever_serial_valor', x: 20, y: 160, inputs: {
        VALOR: { block: { type: 'chamar_funcao_retorno', fields: { NOME: 'lerLuminosidade' } } },
      } },
    ],
    ['definir_funcao_retorno', 'chamar_funcao_retorno', 'mapear_valor', 'ler_pino_analogico', 'escrever_serial_valor'],
  ),
  example(
    'temporizador-sem-travar',
    'Repetir algo de tempos em tempos sem travar o robô',
    'uno',
    '"A cada X ms" substitui um delay: o resto do AGIR continua rodando entre uma execução e outra.',
    [
      { type: 'a_cada_x_ms', x: 20, y: 20, fields: { MS: 1000 }, inputs: { DO: { block: {
        type: 'escrever_serial_valor', inputs: { VALOR: { block: { type: 'millis_atual' } } },
      } } } },
    ],
    ['a_cada_x_ms', 'escrever_serial_valor', 'millis_atual'],
  ),
  example(
    'sensor-distancia',
    'Avisar quando algo se aproxima',
    'uno',
    'Configura o sensor ultrassônico uma vez no PREPARAR e, no AGIR, só mostra a distância quando um objeto está perto.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'configurar_ultrassonico', fields: { TRIG: '12', ECHO: '13' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'se_entao', inputs: {
          CONDICAO: { block: { type: 'objeto_esta_perto', fields: { CM: 20, TRIG: '12', ECHO: '13' } } },
          ENTAO: { block: { type: 'mostrar_distancia', fields: { TRIG: '12', ECHO: '13' } } },
        },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'configurar_ultrassonico', 'se_entao', 'objeto_esta_perto', 'mostrar_distancia'],
  ),
  example(
    'robo-anda-e-para',
    'Mover o robô e parar',
    'uno',
    'Configura os dois motores uma vez e, no AGIR, manda o robô para frente com força fixa, espera e para.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'l298n_configurar_simples',
        fields: { ENA: '3', IN1: '2', IN2: '4', ENB: '5', IN3: '7', IN4: '8' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 160, inputs: { DO: { block: {
        type: 'l298n_mover_robo', fields: { DIRECAO: 'FRENTE' },
        inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 180 } } } },
        next: { block: {
          type: 'esperar', fields: { TIME: 1000 },
          next: { block: { type: 'l298n_parar' } },
        } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'l298n_configurar_simples', 'l298n_mover_robo', 'numero_fixo', 'esperar', 'l298n_parar'],
  ),
  example(
    'robo-motor-individual',
    'Girar cada motor separadamente',
    'uno',
    'Depois de configurar o L298N, dá para controlar o motor esquerdo e o direito de forma independente — útil para giros no lugar.',
    [
      { type: 'l298n_mover_motor', x: 20, y: 20, fields: { MOTOR: 'E', DIRECAO: 'FRENTE' },
        inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 200 } } } },
        next: { block: {
          type: 'l298n_mover_motor', fields: { MOTOR: 'D', DIRECAO: 'TRAS' },
          inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 200 } } } },
        } },
      },
    ],
    ['l298n_mover_motor', 'numero_fixo'],
  ),
  example(
    'servo-vai-e-volta',
    'Mover um servo motor de um lado a outro',
    'uno',
    'Conecta o servo uma vez no PREPARAR e, no AGIR, alterna entre dois ângulos com uma espera entre eles.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'servo_configurar', fields: { PIN: '9' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'servo_mover', fields: { PIN: '9' }, inputs: { ANGULO: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } },
        next: { block: {
          type: 'esperar', fields: { TIME: 500 },
          next: { block: {
            type: 'servo_mover', fields: { PIN: '9' }, inputs: { ANGULO: { block: { type: 'numero_fixo', fields: { VALOR: 180 } } } },
            next: { block: { type: 'esperar', fields: { TIME: 500 } } },
          } },
        } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'servo_configurar', 'servo_mover', 'numero_fixo', 'esperar'],
  ),
  example(
    'acelerometro-leitura',
    'Ler a inclinação do acelerômetro',
    'uno',
    'Inicia o MPU-6050 uma vez e, no AGIR, mostra as duas inclinações lidas continuamente.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'mpu_iniciar', fields: { SDA: 'A4', SCL: 'A5' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'escrever_serial_valor', inputs: { VALOR: { block: { type: 'mpu_ler_pitch' } } },
        next: { block: {
          type: 'escrever_serial_valor', inputs: { VALOR: { block: { type: 'mpu_ler_roll' } } },
          next: { block: { type: 'esperar', fields: { TIME: 200 } } },
        } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'mpu_iniciar', 'mpu_ler_pitch', 'mpu_ler_roll', 'escrever_serial_valor', 'esperar'],
  ),
  example(
    'esp-now-transmissor',
    'Luva transmissora: enviar a inclinação por Wi-Fi',
    'esp32',
    'Prepara o Wi-Fi, o transmissor e o código do receptor uma vez, depois envia continuamente a inclinação lida pelo acelerômetro.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'espnow_iniciar_wifi',
        next: { block: {
          type: 'espnow_transmissor_init',
          next: { block: {
            type: 'espnow_adicionar_receptor', fields: { MAC: 'AA:BB:CC:DD:EE:FF' },
            next: { block: { type: 'mpu_iniciar', fields: { SDA: '21', SCL: '22' } } },
          } },
        } },
      } } } },
      { type: 'bloco_loop', x: 20, y: 220, inputs: { DO: { block: {
        type: 'espnow_enviar_pacote',
        inputs: {
          PITCH: { block: { type: 'mpu_ler_pitch' } },
          ROLL: { block: { type: 'mpu_ler_roll' } },
          PARAR: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
        },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'espnow_iniciar_wifi', 'espnow_transmissor_init', 'espnow_adicionar_receptor', 'mpu_iniciar', 'espnow_enviar_pacote', 'mpu_ler_pitch', 'mpu_ler_roll', 'valor_booleano_fixo'],
  ),
  example(
    'esp-now-receptor',
    'Robô receptor: mover conforme os dados recebidos',
    'esp32',
    'Prepara o Wi-Fi, o receptor e os motores uma vez; a cada mensagem nova, marca como lida e move o robô pela inclinação recebida.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'espnow_iniciar_wifi',
        next: { block: {
          type: 'espnow_receptor_init',
          next: { block: {
            type: 'l298n_configurar_simples',
            fields: { ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14' },
          } },
        } },
      } } } },
      { type: 'bloco_loop', x: 20, y: 220, inputs: { DO: { block: {
        type: 'se_entao', inputs: {
          CONDICAO: { block: { type: 'espnow_tem_dados_novos' } },
          ENTAO: { block: {
            type: 'espnow_marcar_lido',
            next: { block: {
              type: 'l298n_velocidade_por_pitch_roll',
              inputs: {
                PITCH: { block: { type: 'espnow_ler_pitch' } },
                ROLL: { block: { type: 'espnow_ler_roll' } },
              },
            } },
          } },
        },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'espnow_iniciar_wifi', 'espnow_receptor_init', 'l298n_configurar_simples', 'se_entao', 'espnow_tem_dados_novos', 'espnow_marcar_lido', 'l298n_velocidade_por_pitch_roll', 'espnow_ler_pitch', 'espnow_ler_roll'],
  ),
  example(
    'mostrar-mac',
    'Descobrir o código (MAC) do dispositivo',
    'esp32',
    'Antes de conectar dois ESP32 por ESP-NOW, mostre o MAC de cada um no monitor serial para copiar no bloco "Conectar ao Receptor".',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'espnow_iniciar_wifi',
        next: { block: { type: 'espnow_mac_serial' } },
      } } } },
    ],
    ['bloco_setup', 'espnow_iniciar_wifi', 'espnow_mac_serial'],
  ),
  example(
    'texto-fixo-serial',
    'Mostrar um texto calculado',
    'uno',
    'O bloco de texto pode ser plugado onde um valor é esperado, como na fala do robô.',
    [
      { type: 'escrever_serial_valor', x: 20, y: 20, inputs: {
        VALOR: { block: { type: 'texto_fixo', fields: { TEXT: 'Olá, robô!' } } },
      } },
    ],
    ['escrever_serial_valor', 'texto_fixo'],
  ),
  example(
    'converter-escala-pwm',
    'Converter a leitura do sensor para força do motor',
    'uno',
    'Converte a faixa 0–1023 do sensor analógico para 0–255 (a faixa aceita pelo PWM) antes de aplicar no pino.',
    [
      { type: 'escrever_pino_pwm', x: 20, y: 20, fields: { PIN: '3' }, inputs: {
        VALOR: { block: {
          type: 'mapear_valor', fields: { DE_MIN: 0, DE_MAX: 1023, PARA_MIN: 0, PARA_MAX: 255 },
          inputs: { VALOR: { block: { type: 'ler_pino_analogico', fields: { PIN: 'A0' } } } },
        } },
      } },
    ],
    ['escrever_pino_pwm', 'mapear_valor', 'ler_pino_analogico'],
  ),
  example(
    'espera-aleatoria',
    'Esperar um tempo sorteado',
    'uno',
    'Um número aleatório calculado pode alimentar diretamente o bloco de espera, criando uma pausa diferente a cada vez.',
    [
      { type: 'esperar_duracao', x: 20, y: 20, inputs: {
        TIME: { block: { type: 'random_valor', fields: { MIN: 500, MAX: 1500 } } },
      } },
    ],
    ['esperar_duracao', 'random_valor'],
  ),
  // Os dois exemplos abaixo mostram a MESMA arquitetura do par
  // esp-now-transmissor/esp-now-receptor (MPU6050 → lógica → ESP-NOW →
  // motor, com fail-safe), mas compostos só com blocos genéricos — nenhum
  // bloco "controlar robô por inclinação" foi criado: a decisão de direção
  // é um SE...SENÃO comum, e o transporte é a mensagem tipo/A/B/C/sinal, que
  // serve para qualquer projeto, não só este.
  example(
    'esp-now-transmissor-generico',
    'Transmissor: decidir e enviar por mensagem genérica',
    'esp32',
    'Em vez do pacote fixo de inclinação, a inclinação lida vira uma decisão (SE... SENÃO) e a mensagem genérica carrega o tipo decidido, além dos valores brutos — a mesma mensagem serve para sensor, comando ou telemetria em outros projetos.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'espnow_iniciar_wifi',
        next: { block: {
          type: 'espnow_transmissor_init',
          next: { block: {
            type: 'espnow_adicionar_receptor', fields: { MAC: 'AA:BB:CC:DD:EE:FF' },
            next: { block: { type: 'mpu_iniciar', fields: { SDA: '21', SCL: '22', ADDR: '0x68' } } },
          } },
        } },
      } } } },
      { type: 'bloco_loop', x: 20, y: 220, inputs: { DO: { block: {
        type: 'se_entao_senao', inputs: {
          CONDICAO: { block: {
            type: 'comparar_valores', fields: { OP: '>' },
            inputs: {
              A: { block: { type: 'mpu_ler_pitch' } },
              B: { block: { type: 'numero_fixo', fields: { VALOR: 15 } } },
            },
          } },
          ENTAO: { block: {
            type: 'espnow_enviar_mensagem', fields: { TIPO: 1 },
            inputs: {
              A: { block: { type: 'mpu_ler_pitch' } },
              B: { block: { type: 'mpu_ler_roll' } },
              C: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
              SINAL: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
            },
          } },
          SENAO: { block: {
            type: 'espnow_enviar_mensagem', fields: { TIPO: 0 },
            inputs: {
              A: { block: { type: 'mpu_ler_pitch' } },
              B: { block: { type: 'mpu_ler_roll' } },
              C: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
              SINAL: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
            },
          } },
        },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'espnow_iniciar_wifi', 'espnow_transmissor_init', 'espnow_adicionar_receptor', 'mpu_iniciar', 'se_entao_senao', 'comparar_valores', 'mpu_ler_pitch', 'numero_fixo', 'espnow_enviar_mensagem', 'mpu_ler_roll', 'valor_booleano_fixo'],
  ),
  example(
    'esp-now-receptor-generico',
    'Receptor: interpretar mensagem genérica e aplicar fail-safe',
    'esp32',
    'Lê o "tipo" da mensagem para decidir frente ou parar, e — fora do "chegou mensagem nova", rodando sempre — para os motores se ficar tempo demais sem receber nada: o timeout já existente é o mecanismo de fail-safe, aqui aplicado a uma mensagem genérica.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'espnow_iniciar_wifi',
        next: { block: {
          type: 'espnow_receptor_init',
          next: { block: {
            type: 'l298n_configurar_simples',
            fields: { ENA: '25', IN1: '26', IN2: '27', ENB: '33', IN3: '32', IN4: '14' },
          } },
        } },
      } } } },
      { type: 'bloco_loop', x: 20, y: 220, inputs: { DO: { block: {
        type: 'se_entao', inputs: {
          CONDICAO: { block: { type: 'espnow_tem_dados_novos' } },
          ENTAO: { block: {
            type: 'espnow_marcar_lido',
            next: { block: {
              type: 'se_entao_senao', inputs: {
                CONDICAO: { block: {
                  type: 'comparar_valores', fields: { OP: '==' },
                  inputs: {
                    A: { block: { type: 'espnow_mensagem_tipo' } },
                    B: { block: { type: 'numero_fixo', fields: { VALOR: 1 } } },
                  },
                } },
                ENTAO: { block: {
                  type: 'l298n_mover_robo', fields: { DIRECAO: 'FRENTE' },
                  inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 180 } } } },
                } },
                SENAO: { block: { type: 'l298n_parar' } },
              },
            } },
          } },
        },
        next: { block: {
          type: 'se_entao', inputs: {
            CONDICAO: { block: { type: 'espnow_timeout_ms', fields: { MS: 800 } } },
            ENTAO: { block: { type: 'l298n_parar' } },
          },
        } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'espnow_iniciar_wifi', 'espnow_receptor_init', 'l298n_configurar_simples', 'se_entao', 'espnow_tem_dados_novos', 'espnow_marcar_lido', 'se_entao_senao', 'comparar_valores', 'espnow_mensagem_tipo', 'numero_fixo', 'l298n_mover_robo', 'l298n_parar', 'espnow_timeout_ms'],
  ),
  example(
    'wifi-status',
    'Conectar ao Wi-Fi e mostrar o IP',
    'esp32',
    'Conecta a uma rede comum no PREPARAR; no AGIR, mostra o endereço IP quando conectado ou avisa quando não está — sem travar o programa se a rede cair.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'wifi_conectar', fields: { SSID: 'MinhaRede', SENHA: 'minhasenha' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'se_entao_senao', inputs: {
          CONDICAO: { block: { type: 'wifi_esta_conectado' } },
          ENTAO: { block: {
            type: 'escrever_serial_valor',
            inputs: { VALOR: { block: { type: 'wifi_endereco_ip' } } },
          } },
          SENAO: { block: { type: 'escrever_serial', fields: { TEXT: 'Sem Wi-Fi' } } },
        },
        next: { block: { type: 'esperar', fields: { TIME: 1000 } } },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'wifi_conectar', 'se_entao_senao', 'wifi_esta_conectado', 'escrever_serial_valor', 'wifi_endereco_ip', 'escrever_serial', 'esperar'],
  ),
  example(
    'bluetooth-eco',
    'Ecoar de volta o que chegar pelo Bluetooth',
    'esp32',
    'Inicia o Bluetooth uma vez; a cada volta do AGIR, se chegou texto novo, devolve o mesmo texto — útil para testar a conexão com um app como "Serial Bluetooth Terminal" no celular.',
    [
      { type: 'bloco_setup', x: 20, y: 20, inputs: { DO: { block: {
        type: 'bt_iniciar', fields: { NOME: 'Bloquin' },
      } } } },
      { type: 'bloco_loop', x: 20, y: 140, inputs: { DO: { block: {
        type: 'se_entao', inputs: {
          CONDICAO: { block: { type: 'bt_disponivel' } },
          ENTAO: { block: {
            type: 'bt_enviar_texto',
            inputs: { TEXTO: { block: { type: 'bt_ler_texto' } } },
          } },
        },
      } } } },
    ],
    ['bloco_setup', 'bloco_loop', 'bt_iniciar', 'se_entao', 'bt_disponivel', 'bt_enviar_texto', 'bt_ler_texto'],
  ),
];

export function getExampleById(id: string): BlockExample | undefined {
  return BLOCK_EXAMPLES.find((item) => item.id === id);
}

export function getExamplesForBlockType(type: string): BlockExample[] {
  return BLOCK_EXAMPLES.filter((example) => example.blockTypes.includes(type));
}
