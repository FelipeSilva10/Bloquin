export const toolboxConfig = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Pinos', colour: '165',
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
        { kind: 'block', type: 'a_cada_x_ms' }, // Eixo 6
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
        { kind: 'block', type: 'valor_booleano_fixo' }, // MM2 (Movido de Variáveis)
        { kind: 'block', type: 'e_ou_logico' },
        { kind: 'block', type: 'nao_logico' },
      ],
    },
    {
      kind: 'category', name: 'Matemática', colour: '255',
      contents: [
        { kind: 'block', type: 'numero_fixo' }, // MM2 (Movido de Condições)
        { kind: 'block', type: 'operacao_matematica', inputs: { A: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } }, B: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'mapear_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 512 } } } } }, // MM2 (Movido de Condições)
        { kind: 'block', type: 'valor_absoluto', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'constrain_valor', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'random_valor' },
        { kind: 'block', type: 'millis_atual' },
        { kind: 'block', type: 'util_map_float', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
        { kind: 'block', type: 'util_fabsf', inputs: { VALOR: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } },
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
        { kind: 'block', type: 'definir_funcao_retorno', inputs: { RETURN: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } } } }, // Eixo 6
        { kind: 'block', type: 'chamar_funcao_retorno' }, // Eixo 6
      ],
    },
    {
      kind: 'category', name: 'Ultrassônico', colour: '30',
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
      kind: 'category', name: 'Buzzer', colour: '75',
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
    {
      kind: 'category', name: 'Sem Fio (Luva)', colour: '300',
      contents: [
        { kind: 'block', type: 'espnow_iniciar_wifi' },
        { kind: 'block', type: 'espnow_mac_serial' },
        { kind: 'sep' },
        { kind: 'block', type: 'espnow_transmissor_init' },
        { kind: 'block', type: 'espnow_adicionar_receptor' },
        {
          kind: 'block', type: 'espnow_enviar_pacote',
          inputs: {
            PITCH: { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            ROLL:  { block: { type: 'numero_fixo', fields: { VALOR: 0 } } },
            PARAR: { block: { type: 'valor_booleano_fixo', fields: { VALOR: 'false' } } },
          },
        },
        { kind: 'sep' },
        { kind: 'block', type: 'espnow_receptor_init' },
        { kind: 'block', type: 'espnow_tem_dados_novos' },
        { kind: 'block', type: 'espnow_ler_pitch' },
        { kind: 'block', type: 'espnow_ler_roll' },
        { kind: 'block', type: 'espnow_ler_flag_parar' },
        { kind: 'block', type: 'espnow_timeout_ms' },
      ],
    },
    {
      kind: 'category', name: 'Acelerômetro', colour: '310',
      contents: [
        { kind: 'block', type: 'mpu_iniciar' },
        { kind: 'block', type: 'mpu_ler_pitch' },
        { kind: 'block', type: 'mpu_ler_roll' },
      ],
    },
    {
      kind: 'category', name: 'Motores do Robô', colour: '120',
      contents: [
        { kind: 'block', type: 'l298n_configurar_simples' },
        { kind: 'block', type: 'l298n_mover_robo', inputs: { FORCA: { block: { type: 'numero_fixo', fields: { VALOR: 200 } } } } },
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
  ],
};

export const BLOCK_NAMES: Record<string, string> = {
  // Mantém exatamente o mesmo dicionário de nomes anterior + os novos:
  a_cada_x_ms: 'A cada X ms (Temporizador)',
  definir_funcao_retorno: 'Definir Função com Resposta',
  chamar_funcao_retorno: 'Executar e Pegar Resposta',
  configurar_pino: 'Configurar Pino',
  escrever_pino: 'Ligar/Desligar Pino',
  ler_pino_digital: 'Ler Pino Digital',
  escrever_pino_pwm: 'Força do Pino (PWM)',
  ler_pino_analogico: 'Ler Sensor Analógico',
  esperar: 'Esperar',
  repetir_vezes: 'Repetir Vezes',
  enquanto_verdadeiro: 'Enquanto... Fizer',
  parar_repeticao: 'Parar Repetição',
  se_entao: 'Se... Então',
  se_entao_senao: 'Se... Então... Senão',
  comparar_valores: 'Comparar Valores',
  numero_fixo: 'Número',
  e_ou_logico: 'E / Ou',
  nao_logico: 'NÃO',
  mapear_valor: 'Converter Escala',
  operacao_matematica: 'Operação Matemática',
  valor_absoluto: 'Valor Positivo',
  constrain_valor: 'Limitar Valor',
  random_valor: 'Número Aleatório',
  millis_atual: 'Tempo Ligado (ms)',
  util_map_float: 'Converter (Decimal)',
  util_fabsf: 'Valor Positivo (Decimal)',
  declarar_variavel_global: 'Variável',
  atribuir_variavel: 'Guardar em Variável',
  ler_variavel: 'Ler Variável',
  incrementar_variavel: 'Aumentar Variável',
  valor_booleano_fixo: 'Verdadeiro / Falso',
  definir_funcao: 'Definir Função',
  chamar_funcao: 'Executar Função',
  configurar_ultrassonico: 'Configurar Sensor de Distância',
  ler_distancia_cm: 'Ler Distância (cm)',
  mostrar_distancia: 'Mostrar Distância no Ecrã',
  objeto_esta_perto: 'Objeto Está Perto?',
  distancia_entre: 'Distância Entre... e...?',
  servo_configurar: 'Conectar Servo',
  servo_mover: 'Mover Servo',
  servo_ler: 'Posição do Servo',
  buzzer_tocar: 'Tocar Som',
  buzzer_tocar_tempo: 'Tocar Som por Tempo',
  buzzer_parar: 'Parar Som',
  escrever_serial: 'O Robô Diz (texto)',
  escrever_serial_valor: 'O Robô Diz (valor)',
  espnow_iniciar_wifi: 'Preparar Antena Wi-Fi',
  espnow_mac_serial: 'Mostrar Código do Robô',
  espnow_transmissor_init: 'Preparar Luva (Transmissor)',
  espnow_adicionar_receptor: 'Conectar ao Robô',
  espnow_enviar_pacote: 'Enviar Movimentos ao Robô',
  espnow_receptor_init: 'Preparar Robô (Receptor)',
  espnow_tem_dados_novos: 'Recebeu comandos?',
  espnow_ler_pitch: 'Inclinação Frente/Trás (Luva)',
  espnow_ler_roll: 'Inclinação Esquerda/Direita (Luva)',
  espnow_ler_flag_parar: 'Comando Parar (Luva)',
  espnow_timeout_ms: 'Caiu a Conexão?',
  mpu_iniciar: 'Iniciar Acelerômetro',
  mpu_ler_pitch: 'Ler Inclinação Frente/Trás',
  mpu_ler_roll: 'Ler Inclinação Lateral',
  l298n_configurar_simples: 'Configurar Motores do Robô',
  l298n_mover_robo: 'Mover Robô (Controlo Duplo)',
  l298n_mover_motor: 'Girar Motor Individual',
  l298n_velocidade_por_pitch_roll: 'Mover por Inclinação (Avançado)',
};