import arduinoUnoImage from '../../assets/arduino_uno.jpg';
import buzzerImage from '../../assets/buzzer.jpg';
import hcSr04Image from '../../assets/hcsr04.jpg';
import ldrImage from '../../assets/ldr.jpg';
import ledImage from '../../assets/led.jpg';
import motorImage from '../../assets/motor.jpg';
import mpu6050Image from '../../assets/mpu6050.jpg';
import ponteHImage from '../../assets/ponteH.jpg';
import pushButtonImage from '../../assets/botãopush.jpg';
import resistorImage from '../../assets/resistor.jpg';
import esp32DevKitImage from '../../assets/esp32_devkit_v1.jpg';
import type {
  ComponentCatalogItem,
  ComponentCategory,
  ComponentCategoryId,
  ComponentId,
} from './types';

export const COMPONENT_CATEGORIES: readonly ComponentCategory[] = [
  { id: 'microcontrollers', label: 'Microcontroladores', description: 'Placas que executam o programa.', accent: 'blue' },
  { id: 'sensors', label: 'Sensores', description: 'Entradas que percebem o ambiente.', accent: 'violet' },
  { id: 'actuators', label: 'Atuadores', description: 'Saídas que transformam sinais em ação.', accent: 'orange' },
  { id: 'modules', label: 'Módulos', description: 'Circuitos prontos para funções específicas.', accent: 'green' },
  { id: 'motors', label: 'Motores', description: 'Movimento elétrico para projetos.', accent: 'pink' },
  { id: 'electronic-components', label: 'Componentes eletrônicos', description: 'Peças fundamentais do circuito.', accent: 'slate' },
  { id: 'power', label: 'Alimentação', description: 'Fontes e distribuição de energia.', accent: 'orange' },
  { id: 'communication', label: 'Comunicação', description: 'Conexões entre dispositivos.', accent: 'blue' },
  { id: 'tools', label: 'Ferramentas', description: 'Itens de montagem e medição.', accent: 'slate' },
];

export const COMPONENT_CATALOG: readonly ComponentCatalogItem[] = [
  {
    id: 'esp32-devkit-v1',
    name: 'ESP32 DevKit V1',
    categoryId: 'microcontrollers',
    illustration: 'board',
    summary: 'Placa com Wi‑Fi e Bluetooth para projetos conectados e mais avançados.',
    purpose: 'Executa programas, lê sensores e controla atuadores. É a placa indicada quando o projeto precisa de comunicação sem fio.',
    student: {
      whatIs: 'A placa que faz o projeto pensar.',
      usefulFor: 'Ler sensores, controlar peças e usar Wi‑Fi.',
      howToConnect: 'Use 3V3 e GND. Para I²C, SDA é 21 e SCL é 22.',
      attention: 'Os pinos do ESP32 não aceitam 5 V.',
      bloquinExample: 'Faça um sensor mandar um aviso sem fio.',
    },
    tags: ['ESP32', 'Wi‑Fi', 'Bluetooth', '3,3 V'],
    specifications: ['Lógica de 3,3 V', 'Wi‑Fi e Bluetooth integrados', 'GPIOs digitais, analógicos e PWM', 'Conversor analógico de até 12 bits (0–4095 no Bloquin)'],
    pins: [
      { label: '3V3', role: 'power', description: 'Alimentação de 3,3 V para módulos compatíveis.' },
      { label: 'GND', role: 'ground', description: 'Terra comum do circuito.' },
      { label: 'GPIO 21 / 22', role: 'i2c', description: 'SDA e SCL recomendados para I²C.' },
      { label: 'GPIO 34–39', role: 'analog', description: 'Entradas somente de leitura; não use para acionar cargas.' },
      { label: 'GPIO 0, 2, 5, 12, 15', role: 'digital', description: 'Pinos de inicialização: use com atenção para não impedir o boot.' },
    ],
    connections: [
      { title: 'Sensor I²C', description: 'Conecte SDA ao GPIO 21, SCL ao GPIO 22, GND comum e alimentação compatível com 3,3 V.' },
      { title: 'Saída digital', description: 'Use um GPIO de saída para LED, buzzer ou entrada de driver; nunca ligue motor diretamente.' },
    ],
    cautions: ['Os GPIOs do ESP32 não toleram 5 V.', 'GPIO 34, 35, 36 e 39 são apenas entrada.', 'Compartilhe o GND com qualquer fonte externa usada no projeto.'],
    relatedBlocks: [
      { blockType: 'configurar_pino', label: 'Configurar pino', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'escrever_pino', label: 'Colocar pino em estado', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'espnow_iniciar_wifi', label: 'Preparar comunicação sem fio', toolboxCategory: 'Comunicação Sem Fio' },
    ],
    relatedComponentIds: ['mpu6050', 'l298n', 'hc-sr04'],
    media: [{ kind: 'image', role: 'main', src: esp32DevKitImage, alt: 'Placa ESP32 DevKit V1' }],
  },
  {
    id: 'arduino-uno',
    name: 'Arduino Uno',
    categoryId: 'microcontrollers',
    illustration: 'board',
    summary: 'Placa de 5 V simples e popular para os primeiros projetos de eletrônica.',
    purpose: 'Executa o programa e oferece pinos digitais, PWM e entradas analógicas para montar protótipos com sensores e atuadores.',
    student: {
      whatIs: 'Uma placa para começar a programar circuitos.',
      usefulFor: 'Ler sensores e mandar sinais para luzes e sons.',
      howToConnect: 'Use 5V e GND; escolha um pino para cada peça.',
      attention: 'Motor não liga direto na placa.',
      bloquinExample: 'Faça um LED piscar.',
    },
    tags: ['Arduino', 'ATmega328P', '5 V', 'iniciante'],
    specifications: ['Lógica de 5 V', '14 pinos digitais, sendo 6 com PWM', '6 entradas analógicas (A0–A5)', 'Leitura analógica de 0–1023 no Bloquin'],
    pins: [
      { label: '5V', role: 'power', description: 'Alimentação de módulos de 5 V de baixo consumo.' },
      { label: 'GND', role: 'ground', description: 'Terra comum do circuito.' },
      { label: 'D3, D5, D6, D9, D10, D11', role: 'digital', description: 'Pinos com PWM para brilho de LED e velocidade de motor via driver.' },
      { label: 'A0–A5', role: 'analog', description: 'Entradas para sensores analógicos, como LDR.' },
      { label: 'A4 / A5', role: 'i2c', description: 'SDA e SCL para módulos I²C.' },
    ],
    connections: [
      { title: 'LED', description: 'Use um pino digital, resistor em série e GND.' },
      { title: 'Sensor analógico', description: 'Ligue a saída do divisor do sensor em uma entrada A0–A5.' },
    ],
    cautions: ['Não alimente motor, fita de LEDs ou servo diretamente pelo pino 5V da placa.', 'D0 e D1 são usados pela comunicação USB/serial; prefira outros pinos em projetos comuns.'],
    relatedBlocks: [
      { blockType: 'configurar_pino', label: 'Configurar pino', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'ler_pino_analogico', label: 'Ler sensor analógico', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'escrever_pino_pwm', label: 'Força do pino (PWM)', toolboxCategory: 'Entradas e Saídas' },
    ],
    relatedComponentIds: ['led-5mm', 'ldr', 'hc-sr04'],
    media: [{ kind: 'image', role: 'main', src: arduinoUnoImage, alt: 'Placa Arduino Uno' }],
  },
  {
    id: 'led-5mm',
    name: 'LED',
    categoryId: 'electronic-components',
    illustration: 'led',
    summary: 'Diodo emissor de luz para indicar estados, criar sinais visuais e testar saídas.',
    purpose: 'Acende quando a corrente passa no sentido correto. É uma forma segura e visível de aprender a controlar uma saída digital.',
    student: {
      whatIs: 'Uma luz pequena para mostrar o que o projeto está fazendo.',
      usefulFor: 'Dar avisos, sinais e cores ao projeto.',
      howToConnect: 'Pino → resistor → perna longa; perna curta → GND.',
      attention: 'Sempre use resistor.',
      bloquinExample: 'Acenda a luz quando apertar um botão.',
    },
    tags: ['luz', 'saída', 'polaridade', '220 Ω'],
    specifications: ['Possui polaridade', 'Use resistor em série', 'Corrente típica: cerca de 10–20 mA', 'Cores diferentes têm quedas de tensão diferentes'],
    pins: [
      { label: 'Ânodo (+)', role: 'signal', description: 'Perna normalmente mais longa; vai ao resistor e ao pino de saída.' },
      { label: 'Cátodo (−)', role: 'ground', description: 'Lado chato do encapsulamento; vai ao GND.' },
    ],
    connections: [
      { title: 'LED com Arduino', description: 'Pino digital → resistor de 220 Ω a 330 Ω → ânodo; cátodo → GND.' },
      { title: 'LED com ESP32', description: 'GPIO → resistor de 220 Ω a 330 Ω → ânodo; cátodo → GND.' },
    ],
    cautions: ['Nunca ligue um LED diretamente entre um pino e GND: use resistor.', 'Se não acender, desligue a alimentação e confira a polaridade.'],
    relatedBlocks: [
      { blockType: 'configurar_pino', label: 'Configurar pino como saída', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'escrever_pino', label: 'Ligar/desligar pino', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'escrever_pino_pwm', label: 'Controlar brilho (PWM)', toolboxCategory: 'Entradas e Saídas' },
    ],
    relatedComponentIds: ['resistor', 'arduino-uno', 'esp32-devkit-v1'],
    media: [{ kind: 'image', role: 'main', src: ledImage, alt: 'LED vermelho de 5 mm' }],
  },
  {
    id: 'resistor',
    name: 'Resistor',
    categoryId: 'electronic-components',
    illustration: 'resistor',
    summary: 'Componente que limita corrente e ajuda a dividir tensão em um circuito.',
    purpose: 'Protege LEDs e entradas, define estados lógicos com pull-up/pull-down e forma divisores de tensão com sensores como o LDR.',
    student: {
      whatIs: 'A peça que diminui a força da corrente.',
      usefulFor: 'Proteger LED e ajudar sensores a medir.',
      howToConnect: 'Com LED, coloque-o no caminho da corrente.',
      attention: 'Ele não tem lado certo.',
      bloquinExample: 'Monte uma luz segura com resistor de 220 Ω.',
    },
    tags: ['220 Ω', '10 kΩ', 'sem polaridade', 'corrente'],
    specifications: ['Não possui polaridade', 'Valor em ohms (Ω)', '220 Ω a 330 Ω é comum com LEDs', '10 kΩ é comum em botões e divisores'],
    pins: [
      { label: 'Terminal 1', role: 'signal', description: 'Pode ser ligado em qualquer lado: não há polaridade.' },
      { label: 'Terminal 2', role: 'signal', description: 'Pode ser ligado em qualquer lado: não há polaridade.' },
    ],
    connections: [
      { title: 'Limitar LED', description: 'Coloque o resistor em série entre o pino e o LED.' },
      { title: 'Divisor com LDR', description: 'Use LDR e resistor de 10 kΩ entre alimentação e GND; leia o ponto central em uma entrada analógica.' },
    ],
    cautions: ['Escolha valor e potência adequados; um resistor muito pequeno pode aquecer.', 'As faixas de cor indicam o valor. Confirme com multímetro quando houver dúvida.'],
    relatedBlocks: [
      { blockType: 'ler_pino_analogico', label: 'Ler sensor analógico', toolboxCategory: 'Entradas e Saídas', description: 'Usado quando o resistor forma um divisor com LDR.' },
    ],
    relatedComponentIds: ['led-5mm', 'ldr', 'push-button'],
    media: [{ kind: 'image', role: 'main', src: resistorImage, alt: 'Resistor eletrônico' }],
  },
  {
    id: 'push-button',
    name: 'Botão tátil',
    categoryId: 'electronic-components',
    illustration: 'button',
    summary: 'Interruptor momentâneo para enviar uma entrada digital ao programa.',
    purpose: 'Permite que a pessoa controle o projeto. Quando pressionado, fecha o circuito entre seus dois lados elétricos.',
    student: {
      whatIs: 'Um interruptor que você aperta.',
      usefulFor: 'Avisar o programa que alguém fez uma ação.',
      howToConnect: 'Um lado vai ao pino; o outro, ao GND.',
      attention: 'Confira a posição no protoboard antes de ligar.',
      bloquinExample: 'Aperte para ligar um LED.',
    },
    tags: ['entrada', 'digital', 'pull-up', 'interruptor'],
    specifications: ['Normalmente aberto (NA)', 'Não possui polaridade', 'As duas pernas de cada lado já são conectadas internamente', 'Pode usar resistor externo ou INPUT_PULLUP'],
    pins: [
      { label: 'Lado A', role: 'signal', description: 'As duas pernas deste lado são o mesmo contato.' },
      { label: 'Lado B', role: 'ground', description: 'As duas pernas deste lado são o outro contato.' },
    ],
    connections: [
      { title: 'Com INPUT_PULLUP', description: 'Um lado no pino digital e o outro no GND. No código, pressionado costuma ler 0 (LOW).' },
      { title: 'Com pull-down externo', description: 'Use resistor de 10 kΩ ao GND e o botão ao VCC para a leitura ficar HIGH quando pressionado.' },
    ],
    cautions: ['Confira a orientação no protoboard: girar o botão em 90° pode unir contatos incorretamente.', 'Não deixe uma entrada digital sem pull-up ou pull-down.'],
    relatedBlocks: [
      { blockType: 'configurar_pino', label: 'Configurar pino como entrada', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'ler_pino_digital', label: 'Ler pino digital', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'se_entao', label: 'Se… então', toolboxCategory: 'Lógica' },
    ],
    relatedComponentIds: ['resistor', 'led-5mm', 'passive-buzzer'],
    media: [{ kind: 'image', role: 'main', src: pushButtonImage, alt: 'Botão tátil' }],
  },
  {
    id: 'passive-buzzer',
    name: 'Buzzer passivo',
    categoryId: 'actuators',
    illustration: 'buzzer',
    summary: 'Emite tons ao receber uma frequência em um pino de saída.',
    purpose: 'Cria avisos sonoros, músicas simples e feedback para botões e sensores. O buzzer passivo precisa de uma frequência gerada pela placa.',
    student: {
      whatIs: 'Uma peça que toca sons e notas.',
      usefulFor: 'Criar alarmes, efeitos e músicas simples.',
      howToConnect: '+ no pino de saída; − no GND.',
      attention: 'Buzzer ativo não toca notas do mesmo jeito.',
      bloquinExample: 'Toque uma nota ao apertar o botão.',
    },
    tags: ['som', 'saída', 'tom', 'piezo'],
    specifications: ['Normalmente possui marcação + e −', 'Controlado por frequência', 'Compatível com os blocos de tocar som', 'Consumo baixo em comparação a motores'],
    pins: [
      { label: '+', role: 'signal', description: 'Conecte a um pino digital de saída.' },
      { label: '−', role: 'ground', description: 'Conecte ao GND.' },
    ],
    connections: [
      { title: 'Buzzer básico', description: 'Pino digital → terminal +; terminal − → GND.' },
    ],
    cautions: ['Um buzzer ativo apenas liga/desliga e não toca notas da mesma forma; confirme o tipo.', 'Evite volumes ou frequências incômodas perto do ouvido.'],
    relatedBlocks: [
      { blockType: 'buzzer_tocar', label: 'Tocar som', toolboxCategory: 'Buzzer' },
      { blockType: 'buzzer_tocar_tempo', label: 'Tocar som por tempo', toolboxCategory: 'Buzzer' },
      { blockType: 'buzzer_tocar_musica', label: 'Tocar música pronta', toolboxCategory: 'Buzzer' },
    ],
    relatedComponentIds: ['push-button', 'arduino-uno', 'esp32-devkit-v1'],
    media: [{ kind: 'image', role: 'main', src: buzzerImage, alt: 'Buzzer passivo' }],
  },
  {
    id: 'ldr',
    name: 'LDR',
    categoryId: 'sensors',
    illustration: 'ldr',
    summary: 'Resistor dependente de luz: sua resistência varia conforme a iluminação.',
    purpose: 'Permite que o projeto perceba claro e escuro. Em conjunto com um resistor fixo, produz uma tensão que a placa lê em uma entrada analógica.',
    student: {
      whatIs: 'Um sensor que percebe claro e escuro.',
      usefulFor: 'Fazer o projeto reagir à luz.',
      howToConnect: 'Use LDR e resistor juntos; leia o ponto do meio.',
      attention: 'Ele precisa de um resistor para medir direito.',
      bloquinExample: 'Acenda uma luz quando escurecer.',
    },
    tags: ['luz', 'analógico', 'fotoresistor', 'divisor de tensão'],
    specifications: ['Não possui polaridade', 'Precisa de resistor fixo para leitura analógica', 'Resposta gradual à luz', 'Leitura depende do ambiente e da montagem'],
    pins: [
      { label: 'Terminal 1', role: 'analog', description: 'Pode ser conectado em qualquer lado do divisor.' },
      { label: 'Terminal 2', role: 'analog', description: 'Pode ser conectado em qualquer lado do divisor.' },
    ],
    connections: [
      { title: 'Divisor de tensão', description: 'VCC → LDR → ponto de leitura analógica → resistor de 10 kΩ → GND.' },
      { title: 'Ajuste de limite', description: 'Leia valores no ambiente claro e escuro para decidir o número usado em uma condição.' },
    ],
    cautions: ['O valor lido não é uma unidade de lux; calibre para o ambiente.', 'No ESP32, mantenha a tensão no pino analógico dentro de 3,3 V.'],
    relatedBlocks: [
      { blockType: 'ler_pino_analogico', label: 'Ler sensor analógico', toolboxCategory: 'Entradas e Saídas' },
      { blockType: 'comparar_valores', label: 'Comparar valores', toolboxCategory: 'Lógica' },
      { blockType: 'mapear_valor', label: 'Converter escala', toolboxCategory: 'Matemática' },
    ],
    relatedComponentIds: ['resistor', 'led-5mm', 'arduino-uno'],
    media: [{ kind: 'image', role: 'main', src: ldrImage, alt: 'Sensor LDR' }],
  },
  {
    id: 'hc-sr04',
    name: 'HC-SR04',
    categoryId: 'sensors',
    illustration: 'ultrasonic',
    summary: 'Sensor ultrassônico que mede distância usando pulso de som.',
    purpose: 'Envia um pulso ultrassônico pelo TRIG e mede o retorno no ECHO para estimar a distância de objetos à frente.',
    student: {
      whatIs: 'Um sensor que mede a distância até um objeto.',
      usefulFor: 'Fazer o robô perceber obstáculos.',
      howToConnect: 'VCC e GND; TRIG envia, ECHO recebe.',
      attention: 'No ESP32, proteja o pino ECHO de 5 V.',
      bloquinExample: 'Pare o robô quando algo chegar perto.',
    },
    tags: ['distância', 'ultrassom', 'TRIG', 'ECHO'],
    specifications: ['Alimentação típica: 5 V', 'Faixa típica: cerca de 2 cm a 4 m', 'Usa um pino de disparo e um de eco', 'O ECHO de módulos comuns é nível lógico de 5 V'],
    pins: [
      { label: 'VCC', role: 'power', description: 'Alimentação de 5 V no módulo comum.' },
      { label: 'GND', role: 'ground', description: 'Terra comum.' },
      { label: 'TRIG', role: 'digital', description: 'Entrada de disparo ligada a um pino de saída da placa.' },
      { label: 'ECHO', role: 'digital', description: 'Saída de retorno ligada a um pino de entrada da placa.' },
    ],
    connections: [
      { title: 'Arduino Uno', description: 'VCC em 5V, GND em GND, TRIG em saída digital e ECHO em entrada digital.' },
      { title: 'ESP32', description: 'Alimente conforme o módulo e reduza o sinal ECHO de 5 V para 3,3 V com divisor ou conversor de nível.' },
    ],
    cautions: ['Não conecte o ECHO de 5 V diretamente a um GPIO do ESP32.', 'Superfícies macias, inclinadas ou muito próximas podem gerar leituras instáveis.'],
    relatedBlocks: [
      { blockType: 'configurar_ultrassonico', label: 'Configurar sensor de distância', toolboxCategory: 'Sensor de Distância' },
      { blockType: 'ler_distancia_cm', label: 'Ler distância (cm)', toolboxCategory: 'Sensor de Distância' },
      { blockType: 'objeto_esta_perto', label: 'Objeto está perto?', toolboxCategory: 'Sensor de Distância' },
    ],
    relatedComponentIds: ['arduino-uno', 'esp32-devkit-v1', 'led-5mm'],
    media: [{ kind: 'image', role: 'main', src: hcSr04Image, alt: 'Sensor ultrassônico HC-SR04' }],
  },
  {
    id: 'mpu6050',
    name: 'MPU6050',
    categoryId: 'modules',
    illustration: 'imu',
    summary: 'Módulo com acelerômetro e giroscópio para detectar inclinação e movimento.',
    purpose: 'Mede aceleração e rotação. No Bloquin, os blocos do acelerômetro oferecem valores de inclinação frente/trás e lateral.',
    student: {
      whatIs: 'Um sensor que percebe inclinação e movimento.',
      usefulFor: 'Controlar projetos ao inclinar uma peça.',
      howToConnect: 'Ligue VCC, GND, SDA e SCL.',
      attention: 'Veja na placa se ela usa 3,3 V ou 5 V.',
      bloquinExample: 'Incline para virar o robô.',
    },
    tags: ['I²C', 'acelerômetro', 'giroscópio', 'inclinação'],
    specifications: ['Comunicação I²C', 'Acelerômetro de 3 eixos', 'Giroscópio de 3 eixos', 'Endereço I²C normalmente 0x68'],
    pins: [
      { label: 'VCC', role: 'power', description: 'Verifique a serigrafia do breakout; muitos aceitam 3,3 V ou 5 V na alimentação.' },
      { label: 'GND', role: 'ground', description: 'Terra comum.' },
      { label: 'SDA', role: 'i2c', description: 'Linha de dados I²C; A4 no Uno e GPIO 21 no ESP32 por padrão.' },
      { label: 'SCL', role: 'i2c', description: 'Linha de clock I²C; A5 no Uno e GPIO 22 no ESP32 por padrão.' },
    ],
    connections: [
      { title: 'Arduino Uno', description: 'SDA → A4, SCL → A5, GND comum e alimentação conforme o seu módulo.' },
      { title: 'ESP32', description: 'SDA → GPIO 21 e SCL → GPIO 22 são os padrões recomendados pelo Bloquin.' },
    ],
    cautions: ['Confira a tensão lógica e os pull-ups do seu breakout antes de usar com ESP32.', 'Mantenha o módulo firme: vibrações e montagem inclinada afetam a leitura.'],
    relatedBlocks: [
      { blockType: 'mpu_iniciar', label: 'Iniciar acelerômetro', toolboxCategory: 'Acelerômetro' },
      { blockType: 'mpu_ler_pitch', label: 'Ler inclinação frente/trás', toolboxCategory: 'Acelerômetro' },
      { blockType: 'mpu_ler_roll', label: 'Ler inclinação lateral', toolboxCategory: 'Acelerômetro' },
    ],
    relatedComponentIds: ['esp32-devkit-v1', 'arduino-uno', 'l298n'],
    media: [{ kind: 'image', role: 'main', src: mpu6050Image, alt: 'Módulo MPU6050' }],
  },
  {
    id: 'l298n',
    name: 'Driver L298N',
    categoryId: 'modules',
    illustration: 'driver',
    summary: 'Ponte H dupla que permite controlar sentido e velocidade de até dois motores DC.',
    purpose: 'Recebe sinais de baixa corrente da placa e fornece energia ao motor por uma fonte apropriada. É o intermediário obrigatório entre placa e motor.',
    student: {
      whatIs: 'A peça que dá força para os motores.',
      usefulFor: 'Fazer rodas girarem para frente ou para trás.',
      howToConnect: 'Placa nos pinos IN/EN; motor nos pinos OUT.',
      attention: 'A bateria do motor vai no driver, não na placa.',
      bloquinExample: 'Faça o robô andar para frente.',
    },
    tags: ['ponte H', 'motor', 'PWM', 'driver'],
    specifications: ['Controla dois motores DC', 'Entradas IN1–IN4 definem o sentido', 'ENA e ENB recebem PWM para velocidade', 'Tem queda de tensão relativamente alta em comparação a drivers modernos'],
    pins: [
      { label: 'ENA / ENB', role: 'signal', description: 'Entradas de habilitação/velocidade; use pinos PWM.' },
      { label: 'IN1–IN4', role: 'digital', description: 'Entradas digitais que definem o sentido dos dois motores.' },
      { label: 'OUT1–OUT4', role: 'motor', description: 'Saídas para os terminais dos motores.' },
      { label: 'Vmotor / GND', role: 'power', description: 'Fonte dos motores e terra comum com a placa.' },
    ],
    connections: [
      { title: 'Sinais da placa', description: 'ENA/ENB em pinos PWM; IN1–IN4 em pinos digitais de saída.' },
      { title: 'Energia e motores', description: 'Fonte externa adequada no driver, motores em OUT1–OUT4 e GND da fonte unido ao GND da placa.' },
    ],
    cautions: ['Nunca alimente o motor pelo pino da placa.', 'Desligue a fonte antes de trocar fios do motor.', 'Confira tensão, corrente e jumpers do módulo L298N antes de ligar.'],
    relatedBlocks: [
      { blockType: 'l298n_configurar_simples', label: 'Configurar motor DC', toolboxCategory: 'Motor DC' },
      { blockType: 'l298n_mover_robo', label: 'Mover robô', toolboxCategory: 'Motor DC' },
      { blockType: 'l298n_mover_motor', label: 'Girar motor individual', toolboxCategory: 'Motor DC' },
      { blockType: 'l298n_parar', label: 'Parar motores', toolboxCategory: 'Motor DC' },
    ],
    relatedComponentIds: ['dc-motor', 'esp32-devkit-v1', 'mpu6050'],
    media: [{ kind: 'image', role: 'main', src: ponteHImage, alt: 'Driver de motor L298N, ponte H' }],
  },
  {
    id: 'dc-motor',
    name: 'Motor DC',
    categoryId: 'motors',
    illustration: 'motor',
    summary: 'Motor de corrente contínua que transforma energia elétrica em rotação.',
    purpose: 'Move rodas, hélices e mecanismos simples. Precisa de um driver, como o L298N, pois exige mais corrente que um pino da placa suporta.',
    student: {
      whatIs: 'O motor que faz uma roda girar.',
      usefulFor: 'Mover rodas, hélices e mecanismos.',
      howToConnect: 'Ligue os dois fios em uma saída do L298N.',
      attention: 'Nunca ligue motor direto em um pino.',
      bloquinExample: 'Gire uma roda pelo driver.',
    },
    tags: ['movimento', 'corrente contínua', 'ponte H', 'robótica'],
    specifications: ['Dois terminais', 'Sentido muda ao inverter a polaridade', 'Velocidade pode ser controlada por PWM via driver', 'Tem corrente de partida maior que a corrente em movimento'],
    pins: [
      { label: 'Terminal A', role: 'motor', description: 'Conecte a uma saída do canal do driver.' },
      { label: 'Terminal B', role: 'motor', description: 'Conecte à outra saída do mesmo canal do driver.' },
    ],
    connections: [
      { title: 'Com L298N', description: 'Ligue os dois terminais em OUT1/OUT2 ou OUT3/OUT4. Inverta-os se o sentido desejado ficar oposto.' },
      { title: 'Alimentação', description: 'A fonte do motor entra no driver, não nos GPIOs ou no 5V/3V3 da placa.' },
    ],
    cautions: ['Não conecte um motor diretamente a um GPIO.', 'Motores geram ruído elétrico; mantenha fios firmes e fonte compatível.', 'Verifique a corrente de partida para não sobrecarregar o driver ou a bateria.'],
    relatedBlocks: [
      { blockType: 'l298n_configurar_simples', label: 'Configurar motor DC', toolboxCategory: 'Motor DC' },
      { blockType: 'l298n_mover_robo', label: 'Mover robô', toolboxCategory: 'Motor DC' },
      { blockType: 'l298n_mover_motor', label: 'Girar motor individual', toolboxCategory: 'Motor DC' },
    ],
    relatedComponentIds: ['l298n', 'esp32-devkit-v1', 'arduino-uno'],
    media: [{ kind: 'image', role: 'main', src: motorImage, alt: 'Motor de corrente contínua' }],
  },
];

export const COMPONENT_BY_ID: ReadonlyMap<ComponentId, ComponentCatalogItem> = new Map(
  COMPONENT_CATALOG.map((component): [ComponentId, ComponentCatalogItem] => [component.id, component]),
);

export function getComponentById(id: ComponentId | null | undefined): ComponentCatalogItem | undefined {
  return id ? COMPONENT_BY_ID.get(id) : undefined;
}

export function getComponentsByCategory(categoryId: ComponentCategoryId): readonly ComponentCatalogItem[] {
  return COMPONENT_CATALOG.filter((component) => component.categoryId === categoryId);
}

export function isComponentId(value: string): value is ComponentId {
  return COMPONENT_BY_ID.has(value as ComponentId);
}
