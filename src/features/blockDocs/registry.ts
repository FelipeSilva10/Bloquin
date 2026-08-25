import type { BlockDocEntry } from './types';

/**
 * Fonte única de texto para cada bloco: usada tanto para o tooltip nativo do
 * Blockly (`summary`) quanto para a aba de Documentação. Tudo que pode ser
 * calculado a partir de outro módulo (categoria, tipos, restrições de placa,
 * singleton, pinos, "usado com") NÃO é repetido aqui — ver `derive.ts`.
 *
 * `util_map_float` e `util_fabsf` são aliases legados (escondidos da
 * toolbox, mantidos só para abrir projetos antigos) e recebem entrada
 * mínima: eles nunca aparecem na aba de Documentação nem no hover, porque um
 * aluno nunca consegue arrastá-los da paleta.
 */
export const BLOCK_DOC_REGISTRY: Record<string, BlockDocEntry> = {
  // ── ESTRUTURA ────────────────────────────────────────────────────────────
  bloco_setup: {
    summary: 'Código que roda uma única vez, assim que o robô liga.',
    whatItDoes: 'É a "casca" onde ficam as configurações iniciais do programa: definir pinos, iniciar sensores e motores, preparar a comunicação. Tudo dentro dele roda uma vez só, no instante em que a placa liga ou é resetada.',
    whenToUse: 'Sempre existe um em todo projeto Bloquin (ele já vem pronto no workspace). Coloque aqui qualquer bloco de configuração — "Configurar Pino", "Conectar Servo", "Configurar Sensor de Distância", etc.',
    exampleIds: ['piscar-led'],
  },
  bloco_loop: {
    summary: 'Código que se repete sem parar enquanto o robô estiver ligado.',
    whatItDoes: 'É a "casca" onde fica o comportamento principal do robô. Tudo dentro dele roda de novo e de novo, em looping, do início ao fim, para sempre — é aqui que o robô realmente "age".',
    whenToUse: 'Sempre existe um em todo projeto Bloquin. Coloque aqui as ações que devem se repetir: ler sensores, decidir o que fazer, mover motores, mostrar mensagens.',
    exampleIds: ['piscar-led'],
  },

  // ── PINOS ────────────────────────────────────────────────────────────────
  configurar_pino: {
    summary: 'Define se um pino vai enviar sinal (saída) ou receber sinal de um sensor (entrada).',
    whatItDoes: 'Prepara um pino da placa para funcionar como Saída (para ligar um LED, motor, etc.), Entrada (para ler um botão ou sensor digital) ou Entrada com redutor de energia (entrada com resistor pull-up interno, evita "flutuação" quando nada está conectado).',
    whenToUse: 'Use um destes para cada pino que você for usar diretamente (fora dos blocos de sensor/atuador prontos, que já configuram o pino sozinhos). Sempre dentro do PREPARAR, antes de ligar/ler o pino no AGIR.',
    exampleIds: ['piscar-led'],
  },
  escrever_pino: {
    summary: 'Liga (HIGH) ou desliga (LOW) um pino configurado como saída.',
    whatItDoes: 'Manda o pino para o nível alto (5V/3.3V, "ligado") ou baixo (0V, "desligado"). É a forma mais direta de acender um LED, ativar um relé ou dar um pulso simples.',
    whenToUse: 'Use depois de configurar o pino como Saída. Ideal quando o estado é sempre um valor fixo escolhido por você (não calculado por outro bloco) — para ligar conforme uma condição calculada, use "Controlar Pino com Condição".',
    exampleIds: ['piscar-led', 'funcao-piscar'],
  },
  escrever_pino_booleano: {
    summary: 'Liga o pino quando a condição for verdadeira e desliga quando for falsa.',
    whatItDoes: 'Mesma ideia de "Ligar/Desligar Pino", mas o estado vem de um bloco de valor verdadeiro/falso plugado na entrada — geralmente o resultado de uma comparação.',
    whenToUse: 'Use quando o estado do pino depende de uma condição, por exemplo "ligue o LED se a distância for menor que 10 cm", sem precisar escrever um SE... ENTÃO separado.',
    dependencyNotes: ['O pino precisa ter sido configurado como Saída no PREPARAR.'],
    exampleIds: ['sensor-liga-led'],
  },
  ler_pino_digital: {
    summary: 'Retorna 1/verdadeiro para HIGH e 0/falso para LOW.',
    whatItDoes: 'Lê o estado atual de um pino configurado como entrada (por exemplo, um botão): devolve verdadeiro quando o pino está em nível alto, falso quando está em nível baixo.',
    whenToUse: 'Use dentro de um SE... ENTÃO ou de uma condição para reagir a um botão, chave ou sensor digital simples (que só tem dois estados).',
    dependencyNotes: ['O pino precisa ter sido configurado como Entrada (ou Entrada com redutor de energia) no PREPARAR.'],
  },
  escrever_pino_pwm: {
    summary: 'Define a "força" de um pino PWM de 0 (desligado) a 255 (força máxima).',
    whatItDoes: 'Em vez de só ligar/desligar, este bloco controla a intensidade do sinal — útil para variar o brilho de um LED ou a velocidade de um motor simples ligado direto num pino PWM.',
    whenToUse: 'Use em pinos que aceitam PWM quando você precisa de um valor intermediário, não apenas ligado/desligado. Combine com "Converter Escala" quando o valor vier de um sensor (0–1023) e precisar virar 0–255.',
    exampleIds: ['converter-escala-pwm'],
  },
  ler_pino_analogico: {
    summary: 'Lê um sensor analógico e devolve um número (0 a 1023 no Uno/Nano, 0 a 4095 no ESP32).',
    whatItDoes: 'Lê a tensão num pino analógico e converte para um número: quanto maior a tensão, maior o número devolvido. É como o robô "sente" sensores que não são simplesmente ligado/desligado (potenciômetro, LDR, sensores de temperatura analógicos, etc.).',
    whenToUse: 'Use sempre que tiver um sensor analógico conectado. O valor pode ser comparado (SE... ENTÃO), convertido de escala ("Converter Escala") ou mostrado no monitor serial.',
    exampleIds: ['sensor-liga-led', 'converter-escala-pwm'],
  },

  // ── CONTROLE ─────────────────────────────────────────────────────────────
  esperar: {
    summary: 'Pausa o programa por um número fixo de milissegundos.',
    whatItDoes: 'Para completamente a execução do programa pelo tempo escolhido (1000 ms = 1 segundo) antes de continuar para o próximo bloco.',
    whenToUse: 'Use para dar tempo entre ações (por exemplo, entre ligar e desligar um LED). Se o tempo precisa ser calculado por outro bloco em vez de digitado, use "Esperar Tempo Calculado". Evite usar dentro do AGIR se quiser que o robô continue reagindo a sensores enquanto espera — nesse caso, "A cada X ms" é melhor.',
    exampleIds: ['piscar-led', 'bipe-repetido', 'funcao-piscar', 'servo-vai-e-volta'],
  },
  esperar_duracao: {
    summary: 'Espera pelo tempo calculado por outro bloco.',
    whatItDoes: 'Mesma pausa do bloco "Esperar", mas o tempo em milissegundos vem de uma entrada conectável em vez de um número fixo digitado no bloco.',
    whenToUse: 'Use quando o tempo de espera precisa variar — por exemplo, um número aleatório ("Número Aleatório") ou um valor lido de sensor.',
    exampleIds: ['espera-aleatoria'],
  },
  repetir_vezes: {
    summary: 'Repete os blocos de dentro um número fixo de vezes, digitado no próprio bloco.',
    whatItDoes: 'Executa a sequência de blocos encaixada nele exatamente a quantidade de vezes indicada, depois segue para o próximo bloco.',
    whenToUse: 'Use quando já se sabe de antemão quantas vezes repetir (por exemplo, "tocar 3 bipes").',
    exampleIds: ['bipe-repetido'],
  },
  repetir_quantidade: {
    summary: 'Repete pela quantidade calculada por outro bloco.',
    whatItDoes: 'Mesma repetição de "Repetir Vezes", mas a quantidade vem de uma entrada conectável (uma variável, um cálculo) em vez de um número fixo.',
    whenToUse: 'Use quando o número de repetições precisa mudar conforme o programa roda, em vez de ser sempre o mesmo valor.',
  },
  a_cada_x_ms: {
    summary: 'Temporizador sem travar o robô (substitui delay).',
    whatItDoes: 'Executa os blocos de dentro somente quando já passou o intervalo de tempo escolhido desde a última vez — mas, ao contrário de "Esperar", não trava o resto do programa entre uma execução e outra.',
    whenToUse: 'Use no lugar de "Esperar" sempre que quiser repetir algo periodicamente (piscar, medir, enviar dados) sem impedir que o resto do AGIR continue rodando e reagindo a outras coisas ao mesmo tempo.',
    exampleIds: ['temporizador-sem-travar'],
  },
  enquanto_verdadeiro: {
    summary: 'Repete os blocos de dentro enquanto a condição continuar verdadeira.',
    whatItDoes: 'Verifica a condição; se for verdadeira, executa os blocos de dentro e verifica de novo; para assim que a condição virar falsa.',
    whenToUse: 'Use quando o número de repetições não é conhecido de antemão e depende de uma condição mudar (por exemplo, "enquanto não tiver objeto perto"). Cuidado: se a condição nunca ficar falsa, o robô trava nesse bloco para sempre.',
  },
  parar_repeticao: {
    summary: 'Interrompe imediatamente a repetição mais próxima (Repetir ou Enquanto) e continua depois dela.',
    whatItDoes: 'Sai na hora do laço de repetição em que está encaixado, pulando direto para o que vem depois dele — mesmo que a condição de repetição ainda fosse verdadeira.',
    whenToUse: 'Use dentro de um "Repetir Vezes", "Repetir Quantidade Calculada" ou "Enquanto... Fizer" para sair mais cedo quando alguma condição especial acontecer (por exemplo, um SE... ENTÃO detectando um sensor).',
    dependencyNotes: ['Só tem efeito dentro de um bloco de repetição; fora disso, o Bloquin avisa que ele está sendo ignorado.'],
  },

  // ── CONDIÇÕES ────────────────────────────────────────────────────────────
  se_entao: {
    summary: 'Executa os blocos de dentro só quando a condição for verdadeira.',
    whatItDoes: 'Testa a condição plugada nele; se for verdadeira, roda o que está encaixado dentro; se for falsa, pula e não faz nada.',
    whenToUse: 'A forma mais comum de fazer o robô "decidir" algo — ligar um LED se um sensor passar de um valor, mover o motor se um botão for pressionado, etc.',
    exampleIds: ['sensor-liga-led', 'sensor-distancia', 'esp-now-receptor'],
  },
  se_entao_senao: {
    summary: 'Executa um caminho se a condição for verdadeira, e outro caminho diferente se for falsa.',
    whatItDoes: 'Igual ao SE... ENTÃO, mas garante que sempre algo roda: um bloco de ações para o caso verdadeiro e outro, separado, para o caso falso.',
    whenToUse: 'Use quando existem duas ações diferentes dependendo da condição (por exemplo, "se estiver escuro, ligue o LED, senão desligue"), em vez de escrever dois SE... ENTÃO separados.',
  },
  comparar_valores: {
    summary: 'Compara dois números e devolve verdadeiro ou falso (maior, menor, igual, etc.).',
    whatItDoes: 'Recebe dois números e um tipo de comparação (é maior que, é menor que, é igual a, é maior ou igual a, é menor ou igual a, é diferente de) e devolve o resultado como verdadeiro/falso.',
    whenToUse: 'Encaixe na entrada de condição de um SE... ENTÃO, ENQUANTO ou de outro bloco que espera um valor verdadeiro/falso, sempre que precisar comparar dois números (um sensor com um limite, por exemplo).',
    exampleIds: ['sensor-liga-led'],
  },
  e_ou_logico: {
    summary: 'Combina duas condições com E (as duas precisam ser verdadeiras) ou OU (basta uma ser verdadeira).',
    whatItDoes: 'Recebe dois valores verdadeiro/falso e devolve o resultado da combinação lógica escolhida.',
    whenToUse: 'Use quando uma decisão depende de mais de uma condição ao mesmo tempo — por exemplo, "se o sensor de distância detectar algo perto E o botão estiver pressionado".',
  },
  nao_logico: {
    summary: 'Inverte um valor verdadeiro/falso.',
    whatItDoes: 'Se a entrada for verdadeira, devolve falso; se for falsa, devolve verdadeiro.',
    whenToUse: 'Use para testar o caso contrário de uma condição sem precisar reescrevê-la — por exemplo, "NÃO tem objeto perto" a partir de "Objeto Está Perto?".',
  },
  valor_booleano_fixo: {
    summary: 'Um valor fixo, verdadeiro ou falso, escolhido no próprio bloco.',
    whatItDoes: 'Representa diretamente verdadeiro ou falso, sem calcular nada.',
    whenToUse: 'Use para preencher uma entrada que espera verdadeiro/falso com um valor fixo — por exemplo, sempre mandar "parar = falso" num pacote ESP-NOW, ou testar um SE... ENTÃO com um valor fixo antes de conectar o sensor de verdade.',
    exampleIds: ['sensor-liga-led', 'esp-now-transmissor'],
  },
  numero_para_booleano: {
    summary: 'Converte zero em falso e qualquer outro número em verdadeiro.',
    whatItDoes: 'Pega um número e devolve falso apenas quando ele é exatamente zero; qualquer outro valor (positivo ou negativo) vira verdadeiro.',
    whenToUse: 'Use quando você tem um número (por exemplo, de "Ler Pino Digital", que pode devolver número ou verdadeiro/falso) e precisa dele como condição verdadeiro/falso explícita.',
  },
  booleano_para_numero: {
    summary: 'Converte falso em 0 e verdadeiro em 1.',
    whatItDoes: 'Pega um valor verdadeiro/falso e devolve o número correspondente: 0 para falso, 1 para verdadeiro.',
    whenToUse: 'Use quando precisa somar, guardar numa variável numérica, ou mostrar como número o resultado de uma condição.',
  },

  // ── MATEMÁTICA ───────────────────────────────────────────────────────────
  numero_fixo: {
    summary: 'Um número fixo, escolhido no próprio bloco.',
    whatItDoes: 'Representa diretamente o número digitado nele, sem calcular nada.',
    whenToUse: 'É o bloco de número mais usado — plugue em qualquer entrada que espera um número quando o valor já é conhecido e não precisa ser calculado ou lido de um sensor.',
    exampleIds: ['sensor-liga-led', 'contador-serial', 'robo-anda-e-para', 'servo-vai-e-volta', 'robo-motor-individual'],
  },
  operacao_matematica: {
    summary: 'Soma, subtrai, multiplica, divide ou tira o resto de dois números.',
    whatItDoes: 'Recebe dois números e a operação escolhida (+, −, ×, ÷, % resto) e devolve o resultado. Divisão por zero e resto por zero são tratados com segurança (não travam o programa).',
    whenToUse: 'Use sempre que precisar fazer uma conta simples entre dois valores — somar duas leituras, calcular uma média (com divisão), etc.',
  },
  potencia: {
    summary: 'Calcula uma base elevada a um expoente (base^expoente).',
    whatItDoes: 'Multiplica a base por ela mesma o número de vezes indicado pelo expoente (aceita expoentes fracionários também, já que o cálculo é feito com números decimais).',
    whenToUse: 'Use em cálculos que precisam de potenciação, por exemplo em fórmulas físicas ou de conversão mais elaboradas.',
  },
  minimo_maximo: {
    summary: 'Devolve o menor ou o maior entre dois números, conforme escolhido.',
    whatItDoes: 'Compara dois números e devolve um deles: o menor valor ou o maior valor, dependendo da opção selecionada no bloco.',
    whenToUse: 'Use para garantir um piso ou teto simples entre dois valores, ou para descobrir qual de dois sensores está lendo mais/menos.',
  },
  funcao_matematica: {
    summary: 'Arredonda um número (para o mais próximo, para baixo, para cima) ou calcula a raiz quadrada.',
    whatItDoes: 'Aplica a operação matemática escolhida sobre o número de entrada e devolve o resultado.',
    whenToUse: 'Use quando um cálculo devolve um número decimal, mas você precisa dele arredondado (por exemplo, antes de mostrar no monitor serial ou usar como quantidade de repetições).',
  },
  valor_absoluto: {
    summary: '|%1| valor positivo — devolve o número sem o sinal negativo.',
    whatItDoes: 'Se o número for negativo, devolve o mesmo valor positivo; se já for positivo (ou zero), devolve sem mudança.',
    whenToUse: 'Use quando o que importa é o tamanho da diferença, não a direção — por exemplo, "quão longe" um valor está de outro, mesmo que a subtração dê negativo.',
  },
  mapear_valor: {
    summary: 'Converte um número de uma faixa (ex. 0–1023) para outra faixa (ex. 0–255).',
    whatItDoes: 'Recebe um valor e as faixas de origem e destino, e recalcula proporcionalmente o valor equivalente na nova faixa.',
    whenToUse: 'O caso mais comum: converter a leitura de um sensor analógico (0–1023 no Uno/Nano, 0–4095 no ESP32) para a faixa 0–255 aceita por "Força do Pino (PWM)" ou para os graus de um servo (0–180).',
    exampleIds: ['funcao-com-resposta', 'converter-escala-pwm'],
  },
  constrain_valor: {
    summary: 'Limita um número para não passar de um mínimo e um máximo.',
    whatItDoes: 'Se o valor for menor que o mínimo, devolve o mínimo; se for maior que o máximo, devolve o máximo; caso contrário, devolve o próprio valor sem mudança.',
    whenToUse: 'Use para proteger um cálculo de sair da faixa segura antes de mandar para um motor ou servo — por exemplo, depois de somar/multiplicar valores que poderiam ultrapassar 255.',
  },
  random_valor: {
    summary: 'Sorteia um número inteiro entre um mínimo e um máximo (os dois incluídos).',
    whatItDoes: 'Gera um número aleatório dentro da faixa escolhida, diferente a cada vez que o bloco é executado.',
    whenToUse: 'Use para dar variedade a um comportamento — um tempo de espera diferente a cada volta, uma direção de movimento sorteada, etc.',
    exampleIds: ['espera-aleatoria'],
  },
  millis_atual: {
    summary: 'Quanto tempo (em milissegundos) o robô está ligado desde que foi energizado.',
    whatItDoes: 'Devolve um número que só cresce, contando os milissegundos desde que a placa ligou (ou foi resetada).',
    whenToUse: 'Use para medir intervalos de tempo sem travar o programa — é exatamente o mecanismo por trás do bloco "A cada X ms", mas também pode ser usado diretamente para cronômetros e medições próprias.',
    exampleIds: ['temporizador-sem-travar'],
  },
  util_map_float: {
    summary: 'Versão antiga de "Converter Escala", mantida só para abrir projetos salvos antes da atualização.',
    whatItDoes: 'Faz exatamente a mesma conversão de faixa que "Converter Escala".',
    whenToUse: 'Não aparece mais na paleta de blocos — use "Converter Escala" em projetos novos.',
  },
  util_fabsf: {
    summary: 'Versão antiga de "Valor Positivo", mantida só para abrir projetos salvos antes da atualização.',
    whatItDoes: 'Faz exatamente o mesmo cálculo que "Valor Positivo".',
    whenToUse: 'Não aparece mais na paleta de blocos — use "Valor Positivo" em projetos novos.',
  },

  // ── VARIÁVEIS ────────────────────────────────────────────────────────────
  declarar_variavel_global: {
    summary: 'Cria uma variável com um nome, um tipo (Número Inteiro, Número Decimal ou Verdadeiro/Falso) e um valor inicial.',
    whatItDoes: 'Reserva um espaço na memória do robô com o nome escolhido, capaz de guardar um valor daquele tipo, começando com o valor inicial indicado.',
    whenToUse: 'Use no PREPARAR sempre que precisar "lembrar" de um valor entre uma volta e outra do AGIR — um contador, um estado ligado/desligado, uma última leitura de sensor.',
    exampleIds: ['contador-serial'],
  },
  atribuir_variavel: {
    summary: 'Guarda um novo valor numa variável já criada.',
    whatItDoes: 'Substitui o valor atual da variável (pelo nome) pelo valor calculado na entrada.',
    whenToUse: 'Use sempre que precisar atualizar o valor de uma variável para algo diferente do que ela tinha antes (não apenas somar — para somar, "Aumentar Variável" é mais direto).',
  },
  ler_variavel: {
    summary: 'Devolve o valor atual guardado numa variável.',
    whatItDoes: 'Busca, pelo nome, o valor que está guardado na variável naquele momento.',
    whenToUse: 'Use em qualquer lugar que precise do valor atual de uma variável já criada com "Variável" — comparações, cálculos, mostrar no monitor serial.',
    exampleIds: ['contador-serial'],
  },
  incrementar_variavel: {
    summary: 'Soma um valor ao que já está guardado numa variável (aumenta o contador).',
    whatItDoes: 'Pega o valor atual da variável, soma o valor da entrada, e guarda o resultado de volta na mesma variável.',
    whenToUse: 'O jeito mais direto de fazer um contador — some 1 a cada volta do AGIR, por exemplo. Também funciona com números negativos (na prática, diminui a variável).',
    exampleIds: ['contador-serial'],
  },

  // ── FUNÇÕES ──────────────────────────────────────────────────────────────
  definir_funcao: {
    summary: 'Agrupa vários blocos numa função com nome, para executá-los juntos depois.',
    whatItDoes: 'Cria um bloco de ações reutilizável: tudo que estiver encaixado dentro só roda quando a função for chamada por "Executar Função", em qualquer lugar do programa.',
    whenToUse: 'Use para organizar sequências de blocos que se repetem em vários lugares do programa (por exemplo, uma rotina de "piscar 3 vezes") ou só para deixar o AGIR mais curto e legível.',
    exampleIds: ['funcao-piscar'],
  },
  chamar_funcao: {
    summary: 'Executa uma função já definida com "Definir Função".',
    whatItDoes: 'Roda, naquele exato ponto do programa, todos os blocos que estão dentro da função com o nome indicado.',
    whenToUse: 'Use sempre que quiser repetir uma sequência já organizada numa função, em vez de copiar os mesmos blocos de novo.',
    dependencyNotes: ['Precisa existir uma "Definir Função" com o mesmo nome em algum lugar do programa.'],
    exampleIds: ['funcao-piscar'],
  },
  definir_funcao_retorno: {
    summary: 'Igual a "Definir Função", mas termina devolvendo um valor calculado.',
    whatItDoes: 'Agrupa uma sequência de blocos que termina calculando e "devolvendo" um número — esse valor pode ser usado por quem chamou a função.',
    whenToUse: 'Use quando quiser reaproveitar um cálculo (não só uma ação) em vários lugares — por exemplo, uma função que lê um sensor e já devolve o valor convertido, pronta para plugar onde for preciso.',
    exampleIds: ['funcao-com-resposta'],
  },
  chamar_funcao_retorno: {
    summary: 'Executa uma "Função com Resposta" e devolve o valor calculado por ela.',
    whatItDoes: 'Roda a função com o nome indicado e usa o número que ela devolveu no lugar deste próprio bloco — ou seja, pode ser plugado em qualquer entrada que espere um número.',
    whenToUse: 'Use para reaproveitar um cálculo já organizado numa "Função com Resposta", em vez de repetir a mesma sequência de contas em vários lugares.',
    dependencyNotes: ['Precisa existir uma "Definir Função com Resposta" com o mesmo nome em algum lugar do programa.'],
    exampleIds: ['funcao-com-resposta'],
  },

  // ── ULTRASSÔNICO ─────────────────────────────────────────────────────────
  configurar_ultrassonico: {
    summary: 'Prepara um sensor ultrassônico HC-SR04, indicando os pinos Trigger e Echo usados.',
    whatItDoes: 'Configura os dois pinos do sensor de distância (Trigger como saída, Echo como entrada) para que os outros blocos de distância funcionem.',
    whenToUse: 'Use uma vez no PREPARAR, para cada sensor ultrassônico conectado, antes de usar "Distância em cm", "Mostrar Distância", "Objeto Está Perto?" ou "Distância Entre".',
    dependencyNotes: ['Precisa de um sensor ultrassônico HC-SR04 (ou compatível) conectado nos pinos Trigger e Echo escolhidos.'],
    exampleIds: ['sensor-distancia'],
  },
  ler_distancia_cm: {
    summary: 'Devolve a distância medida pelo sensor ultrassônico, em centímetros.',
    whatItDoes: 'Dispara o pulso ultrassônico e calcula a distância até o objeto mais próximo à frente do sensor, em centímetros.',
    whenToUse: 'Use quando precisar do valor exato da distância — para mostrar, comparar com um número específico, ou guardar numa variável.',
    dependencyNotes: ['O par de pinos Trigger/Echo usado aqui precisa ter sido configurado antes com "Configurar Sensor de Distância".'],
  },
  mostrar_distancia: {
    summary: 'O robô diz a distância em cm — mostra a leitura do sensor no monitor serial.',
    whatItDoes: 'Mede a distância com o sensor ultrassônico e imprime o valor (em centímetros) no monitor serial, sem precisar de um bloco separado para ler e outro para mostrar.',
    whenToUse: 'Use para depurar ou acompanhar em tempo real o que o sensor de distância está enxergando.',
    dependencyNotes: ['O par de pinos Trigger/Echo usado aqui precisa ter sido configurado antes com "Configurar Sensor de Distância".'],
    exampleIds: ['sensor-distancia'],
  },
  objeto_esta_perto: {
    summary: 'Verdadeiro se houver algo a menos de X centímetros do sensor.',
    whatItDoes: 'Mede a distância e compara com o limite escolhido, devolvendo verdadeiro quando o objeto está mais perto do que esse limite.',
    whenToUse: 'Use direto na condição de um SE... ENTÃO para reagir a "algo perto" sem precisar montar a comparação manualmente com "Distância em cm".',
    dependencyNotes: ['O par de pinos Trigger/Echo usado aqui precisa ter sido configurado antes com "Configurar Sensor de Distância".'],
    exampleIds: ['sensor-distancia'],
  },
  distancia_entre: {
    summary: 'Verdadeiro se a distância medida estiver entre dois valores escolhidos.',
    whatItDoes: 'Mede a distância e verifica se ela está dentro da faixa (mínimo a máximo) indicada no bloco.',
    whenToUse: 'Use quando a reação do robô depende de uma faixa de distância, não só de "perto/longe" — por exemplo, "só siga o objeto se ele estiver entre 10 e 20 cm".',
    dependencyNotes: ['O par de pinos Trigger/Echo usado aqui precisa ter sido configurado antes com "Configurar Sensor de Distância".'],
  },

  // ── COMUNICAÇÃO ──────────────────────────────────────────────────────────
  texto_fixo: {
    summary: 'Um texto fixo, escrito no próprio bloco.',
    whatItDoes: 'Representa diretamente o texto digitado nele.',
    whenToUse: 'Use para plugar um texto em uma entrada que aceita valores, como "O Robô Diz (valor)" — útil quando você quer combinar texto com outros usos dessa mesma entrada, ou só para reaproveitar o mesmo bloco de saída de texto.',
    exampleIds: ['texto-fixo-serial'],
  },
  escrever_serial: {
    summary: 'O robô diz um texto fixo, escrito diretamente no bloco, no monitor serial.',
    whatItDoes: 'Envia o texto digitado no bloco para o monitor serial, numa linha própria.',
    whenToUse: 'Use para mensagens fixas que não mudam — avisos, rótulos, textos de depuração simples. Para mostrar um valor calculado (número, verdadeiro/falso ou texto vindo de outro bloco), use "O Robô Diz (valor)".',
  },
  escrever_serial_valor: {
    summary: 'O robô diz: mostra um número, verdadeiro/falso ou texto calculado no monitor serial.',
    whatItDoes: 'Envia para o monitor serial o valor plugado na entrada, seja ele um número, um verdadeiro/falso ou um texto — o bloco aceita qualquer um dos três tipos.',
    whenToUse: 'É a principal ferramenta para "ver o que o robô está pensando": mostrar leituras de sensor, resultados de cálculos, valores de variáveis, enquanto o programa roda.',
    exampleIds: ['contador-serial', 'funcao-com-resposta', 'temporizador-sem-travar', 'acelerometro-leitura', 'texto-fixo-serial'],
  },

  // ── SERVO MOTOR ──────────────────────────────────────────────────────────
  servo_configurar: {
    summary: 'Conecta um servo motor a um pino, deixando-o pronto para ser movido.',
    whatItDoes: 'Prepara o pino escolhido para controlar um servo motor (usa a biblioteca Servo no Arduino Uno/Nano, e ESP32Servo no ESP32).',
    whenToUse: 'Use uma vez no PREPARAR, para cada servo conectado, antes de usar "Mover Servo" ou "Posição do Servo" naquele pino.',
    dependencyNotes: ['Precisa de um servo motor conectado ao pino escolhido.'],
    exampleIds: ['servo-vai-e-volta'],
  },
  servo_mover: {
    summary: 'Move um servo já conectado para um ângulo entre 0° e 180°.',
    whatItDoes: 'Gira o eixo do servo motor para a posição (em graus) indicada na entrada, entre 0 e 180 — valores fora dessa faixa são ajustados automaticamente para o limite mais próximo.',
    whenToUse: 'Use sempre que quiser posicionar o servo — abrir uma garra, virar uma "cabeça", apontar um sensor.',
    dependencyNotes: ['O pino usado aqui precisa ter sido conectado antes com "Conectar Servo".'],
    exampleIds: ['servo-vai-e-volta'],
  },
  servo_ler: {
    summary: 'Devolve o último ângulo (em graus) para o qual o servo foi movido.',
    whatItDoes: 'Consulta a posição que foi mandada mais recentemente pelo bloco "Mover Servo" (não é uma leitura física do servo, é o valor lembrado pelo programa).',
    whenToUse: 'Use quando precisar saber ou reagir à posição atual do servo, por exemplo para calcular o próximo movimento a partir de onde ele já está.',
    dependencyNotes: ['O pino usado aqui precisa ter sido conectado antes com "Conectar Servo".'],
  },

  // ── BUZZER ───────────────────────────────────────────────────────────────
  buzzer_tocar: {
    summary: 'Toca um som contínuo numa frequência escolhida (em Hz), sem parar sozinho.',
    whatItDoes: 'Faz o buzzer emitir um tom na frequência indicada, que continua tocando até um "Parar Som" ser executado (ou outro som substituí-lo).',
    whenToUse: 'Use para sons de duração indefinida — um alarme que só para quando uma condição mudar, por exemplo.',
    dependencyNotes: ['Precisa de um buzzer (ativo ou passivo compatível com tone()) conectado ao pino escolhido.'],
  },
  buzzer_tocar_tempo: {
    summary: 'Toca um som numa frequência escolhida (Hz) por um tempo determinado (ms), sem travar o resto do programa.',
    whatItDoes: 'Inicia o som e, sozinho, já para automaticamente depois do tempo indicado.',
    whenToUse: 'Use para bipes curtos e sons de aviso, quando você já sabe a duração desejada e não precisa de um "Parar Som" separado.',
    dependencyNotes: ['Precisa de um buzzer (ativo ou passivo compatível com tone()) conectado ao pino escolhido.'],
    exampleIds: ['bipe-repetido'],
  },
  buzzer_parar: {
    summary: 'Para imediatamente qualquer som tocando naquele pino.',
    whatItDoes: 'Interrompe o som do buzzer no pino indicado, mesmo que ele tenha sido iniciado com "Tocar Som" (que não para sozinho).',
    whenToUse: 'Use em conjunto com "Tocar Som", quando o som precisa parar em resposta a alguma condição, em vez de tocar por um tempo fixo.',
  },
  buzzer_tocar_musica: {
    summary: 'Toca uma melodia completa no buzzer. O programa fica parado até a música terminar.',
    whatItDoes: 'Reproduz, nota por nota, uma das melodias prontas do Bloquin (Super Mario Bros ou Parabéns a Você) no pino escolhido. Diferente dos outros blocos de som, este bloqueia o programa até a música terminar de tocar.',
    whenToUse: 'Use para celebrar um evento (o robô completou uma tarefa, por exemplo) com uma música pronta, sem precisar montar a sequência de notas manualmente.',
    dependencyNotes: ['Precisa de um buzzer (ativo ou passivo compatível com tone()) conectado ao pino escolhido.'],
  },

  // ── ESP-NOW (SEM FIO) ────────────────────────────────────────────────────
  espnow_iniciar_wifi: {
    summary: 'Preparar comunicação sem fio (Wi-Fi) — primeiro passo antes de qualquer bloco de ESP-NOW.',
    whatItDoes: 'Coloca o rádio Wi-Fi do ESP32 no modo necessário para o ESP-NOW funcionar (sem se conectar a nenhuma rede Wi-Fi de verdade).',
    whenToUse: 'Sempre o primeiro bloco de comunicação sem fio do PREPARAR, antes de "Preparar como Transmissor", "Preparar como Receptor" ou "Mostrar Código deste Dispositivo".',
    dependencyNotes: ['Disponível apenas para placas ESP32 (usa a biblioteca WiFi.h).'],
    exampleIds: ['esp-now-transmissor', 'esp-now-receptor', 'mostrar-mac'],
  },
  espnow_mac_serial: {
    summary: 'Mostra o código (endereço MAC) deste dispositivo no monitor serial.',
    whatItDoes: 'Imprime, no monitor serial, o endereço MAC do ESP32 — o "código" que identifica esse dispositivo na rede.',
    whenToUse: 'Use uma vez, no robô que vai ser o receptor, para descobrir o código a copiar no bloco "Conectar ao Receptor" da luva/transmissor.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar Comunicação Sem Fio" já tenha rodado antes.'],
    exampleIds: ['mostrar-mac'],
  },
  espnow_transmissor_init: {
    summary: 'Preparar Luva (Transmissor) — inicia este dispositivo como o lado que envia dados.',
    whatItDoes: 'Ativa o ESP-NOW no papel de transmissor, deixando pronto para adicionar o receptor e enviar pacotes.',
    whenToUse: 'Use no PREPARAR do dispositivo que vai enviar dados (por exemplo, a "luva" de controle), depois de "Preparar Comunicação Sem Fio".',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_adicionar_receptor: {
    summary: 'Conecta este transmissor ao código (MAC) de um receptor específico.',
    whatItDoes: 'Registra o endereço MAC informado como o destino para onde os pacotes de dados serão enviados.',
    whenToUse: 'Use uma vez no PREPARAR do transmissor, com o código MAC mostrado pelo robô receptor (via "Mostrar Código deste Dispositivo").',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" já tenha rodado antes.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_enviar_pacote: {
    summary: 'Envia para o robô os valores de inclinação frente/trás, esquerda/direita e um sinal de parar.',
    whatItDoes: 'Monta um pacote com os três valores plugados nas entradas e envia por ESP-NOW para o receptor já conectado.',
    whenToUse: 'Use no AGIR do transmissor, geralmente enviando valores lidos do acelerômetro (MPU-6050), para controlar o robô à distância.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" e "Conectar ao Receptor" já tenham rodado antes.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_receptor_init: {
    summary: 'Preparar Robô (Receptor) — inicia este dispositivo como o lado que recebe dados.',
    whatItDoes: 'Ativa o ESP-NOW no papel de receptor, deixando pronto para escutar pacotes enviados por um transmissor.',
    whenToUse: 'Use no PREPARAR do dispositivo que vai receber comandos (por exemplo, o robô controlado pela luva), depois de "Preparar Comunicação Sem Fio".',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_tem_dados_novos: {
    summary: 'Verdadeiro quando chegou uma mensagem nova do transmissor que ainda não foi lida.',
    whatItDoes: 'Consulta se um novo pacote ESP-NOW chegou desde a última vez que foi marcado como lido.',
    whenToUse: 'Use na condição de um SE... ENTÃO para só processar os dados recebidos quando realmente houver algo novo.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_ler_pitch: {
    summary: 'Devolve o valor de inclinação frente/trás recebido no último pacote.',
    whatItDoes: 'Lê o campo "pitch" do pacote mais recente recebido por ESP-NOW.',
    whenToUse: 'Use depois de confirmar "Chegou Mensagem Nova?", geralmente para mover o robô com "Mover por Dois Valores (A e B)".',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_ler_roll: {
    summary: 'Devolve o valor de inclinação esquerda/direita recebido no último pacote.',
    whatItDoes: 'Lê o campo "roll" do pacote mais recente recebido por ESP-NOW.',
    whenToUse: 'Use depois de confirmar "Chegou Mensagem Nova?", geralmente para mover o robô com "Mover por Dois Valores (A e B)".',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_ler_flag_parar: {
    summary: 'Verdadeiro se o último pacote recebido pediu para parar.',
    whatItDoes: 'Lê o campo "parar" do pacote mais recente recebido por ESP-NOW.',
    whenToUse: 'Use para dar ao transmissor um jeito de mandar o robô parar imediatamente, por exemplo com um botão dedicado na luva.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_timeout_ms: {
    summary: 'Verdadeiro se já faz mais tempo que o indicado desde a última mensagem recebida.',
    whatItDoes: 'Compara o tempo desde o último pacote recebido com o limite escolhido (em milissegundos).',
    whenToUse: 'Use como segurança: se o sinal da luva sumir (por distância, interferência, etc.), detecte isso e pare o robô automaticamente.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_marcar_lido: {
    summary: 'Reseta o flag de dados novos. Coloque como primeiro bloco dentro de "SE Chegou mensagem da luva?".',
    whatItDoes: 'Marca a mensagem atual como já processada, para que "Chegou Mensagem Nova?" volte a ser falso até a próxima mensagem chegar.',
    whenToUse: 'Sempre como o primeiro bloco dentro do SE... ENTÃO que verifica "Chegou Mensagem Nova?" — evita processar a mesma mensagem repetidas vezes.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },

  // ── MPU-6050 (ACELERÔMETRO) ──────────────────────────────────────────────
  mpu_iniciar: {
    summary: 'Inicia o sensor acelerômetro/giroscópio MPU-6050, indicando os pinos SDA e SCL (I²C).',
    whatItDoes: 'Liga a comunicação I²C com o sensor MPU-6050 e confirma se ele respondeu corretamente (mostra no monitor serial se deu certo ou não).',
    whenToUse: 'Use uma vez no PREPARAR, antes de "Ler Inclinação Frente/Trás" ou "Ler Inclinação Lateral".',
    dependencyNotes: ['Precisa de um sensor MPU-6050 conectado nos pinos SDA/SCL escolhidos.'],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },
  mpu_ler_pitch: {
    summary: 'Inclinação frente/trás (graus) — lê o quanto o sensor está inclinado para frente ou para trás.',
    whatItDoes: 'Devolve, em graus, a inclinação atual do MPU-6050 no eixo frente/trás.',
    whenToUse: 'Use para controlar algo pela inclinação — mover um robô, ou enviar essa leitura por ESP-NOW para controlar outro robô à distância.',
    dependencyNotes: ['Precisa que "Iniciar Acelerômetro" já tenha rodado antes.'],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },
  mpu_ler_roll: {
    summary: 'Inclinação esquerda/direita (graus) — lê o quanto o sensor está inclinado para os lados.',
    whatItDoes: 'Devolve, em graus, a inclinação atual do MPU-6050 no eixo esquerda/direita.',
    whenToUse: 'Use para controlar algo pela inclinação lateral — mover um robô, ou enviar essa leitura por ESP-NOW para controlar outro robô à distância.',
    dependencyNotes: ['Precisa que "Iniciar Acelerômetro" já tenha rodado antes.'],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },

  // ── PONTE H (L298N / MOTOR DC) ───────────────────────────────────────────
  l298n_configurar_simples: {
    summary: 'Configura os pinos dos dois motores do robô (força e direção de cada lado) de uma vez.',
    whatItDoes: 'Prepara todos os pinos usados pelo controlador L298N — força (PWM) e direção de cada motor — para que os blocos de movimento funcionem.',
    whenToUse: 'Use uma vez no PREPARAR, antes de "Mover (Frente, Trás, Esq, Dir)", "Parar Motores", "Girar Motor Individual" ou "Mover por Dois Valores (A e B)".',
    dependencyNotes: ['Precisa de um módulo controlador de motor L298N (ou compatível) conectado aos pinos indicados, com dois motores DC.'],
    exampleIds: ['robo-anda-e-para', 'esp-now-receptor'],
  },
  l298n_mover_robo: {
    summary: 'Move os dois motores do robô numa direção com uma força de 0 a 255.',
    whatItDoes: 'Aplica a força indicada aos dois motores de forma coordenada para o robô ir para Frente, Trás, Esquerda, Direita, ou Parar.',
    whenToUse: 'A forma mais simples de mover o robô inteiro numa direção, sem controlar cada motor separadamente.',
    dependencyNotes: ['Precisa que "Configurar Motor DC" já tenha rodado antes.'],
    exampleIds: ['robo-anda-e-para'],
  },
  l298n_mover_motor: {
    summary: 'Gira um motor específico (esquerdo ou direito) numa direção, com uma força de 0 a 255.',
    whatItDoes: 'Controla um único motor por vez — direção Frente, Trás ou Parar, com a força indicada — sem afetar o outro motor.',
    whenToUse: 'Use quando os dois motores precisam de comandos diferentes ao mesmo tempo, por exemplo para girar o robô no próprio eixo.',
    dependencyNotes: ['Precisa que "Configurar Motor DC" já tenha rodado antes.'],
    exampleIds: ['robo-motor-individual'],
  },
  l298n_parar: {
    summary: 'Para os dois motores do robô imediatamente.',
    whatItDoes: 'Zera a força dos dois motores, parando o robô na hora.',
    whenToUse: 'Use ao final de um movimento, ou como reação de segurança (por exemplo, quando um sensor detecta um obstáculo muito próximo).',
    dependencyNotes: ['Precisa que "Configurar Motor DC" já tenha rodado antes.'],
    exampleIds: ['robo-anda-e-para'],
  },
  l298n_velocidade_por_pitch_roll: {
    summary: 'Move o robô combinando dois valores de inclinação (frente/trás e esquerda/direita) num único comando.',
    whatItDoes: 'Calcula automaticamente a força de cada motor a partir dos dois valores de entrada, permitindo movimentos combinados (por exemplo, virar enquanto anda) numa única chamada.',
    whenToUse: 'O bloco pensado para controle por inclinação — normalmente ligado direto às leituras vindas de "Valor A Recebido"/"Valor B Recebido" (ESP-NOW) ou de um acelerômetro local.',
    dependencyNotes: ['Precisa que "Configurar Motor DC" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
};
