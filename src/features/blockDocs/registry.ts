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
  mudou_para_verdadeiro: {
    summary: 'Verdadeiro só no instante em que o valor plugado passa de falso para verdadeiro.',
    whatItDoes: 'Lembra o valor da última vez que este bloco rodou e compara com o valor atual: devolve verdadeiro apenas quando ele acabou de virar verdadeiro, nunca enquanto continua verdadeiro.',
    whenToUse: 'Use para distinguir "o botão foi apertado agora" de "o botão está apertado" — encaixe a leitura do sensor (botão, "Objeto Está Perto?", etc.) direto na entrada. Para detectar o momento em que um valor deixa de ser verdadeiro, combine com NÃO: "NÃO(valor) mudou de falso para verdadeiro?" equivale a "valor mudou de verdadeiro para falso?".',
    exampleIds: ['borda-contador-botao'],
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
    summary: 'Cria uma variável com um nome, um tipo (Número Inteiro, Número Decimal, Verdadeiro/Falso ou Texto) e um valor inicial.',
    whatItDoes: 'Reserva um espaço na memória do robô com o nome escolhido, capaz de guardar um valor daquele tipo, começando com o valor inicial indicado.',
    whenToUse: 'Use no PREPARAR sempre que precisar "lembrar" de um valor entre uma volta e outra do AGIR — um contador, um estado ligado/desligado, uma última leitura de sensor, ou o último comando de texto recebido pela Serial/Bluetooth.',
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

  // ── LISTAS ───────────────────────────────────────────────────────────────
  declarar_lista_global: {
    summary: 'Cria uma lista de tamanho fixo, com um nome e um tipo (Números Inteiros, Números Decimais ou Verdadeiro/Falso).',
    whatItDoes: 'Reserva na memória do robô uma sequência de espaços do tamanho escolhido, todos do mesmo tipo, começando zerados (ou falsos). Cada posição é numerada a partir de 0.',
    whenToUse: 'Use quando precisar guardar vários valores do mesmo tipo, não só um — as últimas leituras de um sensor para calcular uma média, uma sequência de posições de servo, um histórico de comandos.',
    dependencyNotes: [
      'O tamanho é escolhido no próprio bloco e não muda depois — diferente de uma variável, uma lista não pode crescer.',
      'Não existe lista de texto: uma lista de texto reatribuída durante o AGIR é um risco real de travamento em placas com pouca memória (Uno/Nano). Guarde números ou verdadeiro/falso.',
      'Listas grandes em Uno/Nano (só 2 KB de memória) podem não caber — nesse caso a compilação falha com um aviso de memória, não trava em silêncio.',
    ],
    exampleIds: ['media-distancia-lista'],
  },
  lista_definir_item: {
    summary: 'Guarda um valor numa posição escolhida da lista.',
    whatItDoes: 'Substitui o valor que estava na posição indicada pelo novo valor. Se a posição pedida for menor que 0 ou maior que o fim da lista, o Bloquin usa a posição válida mais próxima (primeira ou última) em vez de causar um erro.',
    whenToUse: 'Use para preencher a lista — por exemplo, guardar uma nova leitura de sensor numa posição calculada, ou inicializar todas as posições num "Repetir Vezes".',
    dependencyNotes: ['Precisa de uma lista já criada com "Lista" antes.'],
    exampleIds: ['media-distancia-lista'],
  },
  lista_ler_item: {
    summary: 'Lê o valor guardado numa posição escolhida da lista.',
    whatItDoes: 'Devolve o valor guardado na posição indicada. Como em "Guardar na Lista", uma posição fora dos limites é ajustada para a posição válida mais próxima.',
    whenToUse: 'Use para reaproveitar um valor guardado antes — por exemplo, somar todos os itens de uma lista dentro de um "Repetir Vezes" para calcular uma média.',
    dependencyNotes: ['Precisa de uma lista já criada com "Lista" antes.'],
    exampleIds: ['media-distancia-lista'],
  },
  lista_tamanho: {
    summary: 'Quantas posições a lista tem.',
    whatItDoes: 'Devolve o tamanho escolhido quando a lista foi criada — sempre o mesmo número, já que listas não mudam de tamanho.',
    whenToUse: 'Use como limite de um "Repetir Vezes" ao percorrer a lista inteira, em vez de escrever o número de posições à mão duas vezes.',
    dependencyNotes: ['Precisa de uma lista já criada com "Lista" antes.'],
    exampleIds: ['media-distancia-lista'],
  },

  // ── ARMAZENAMENTO (MEMÓRIA PERMANENTE) ──────────────────────────────────
  armazenamento_salvar: {
    summary: 'Salva um número numa memória que sobrevive a desligar a placa, associado a uma chave (um nome curto).',
    whatItDoes: 'Grava o valor na memória permanente da placa (EEPROM no Uno/Nano, um espaço reservado próprio no ESP32), identificado pela chave escolhida — a próxima vez que a placa ligar, o valor ainda estará lá.',
    whenToUse: 'Use para lembrar um valor entre uma sessão e outra — um recorde de jogo, uma calibração, uma contagem que não pode zerar ao desligar.',
    dependencyNotes: [
      'Chame só quando o valor realmente mudar (por exemplo, dentro de um SE que compara com um recorde anterior) — a memória EEPROM do Uno/Nano tem vida útil limitada (dezenas de milhares de gravações); salvar a cada volta do AGIR sem necessidade desgasta o chip.',
      'No ESP32, a chave não pode ter mais de 15 caracteres.',
    ],
    exampleIds: ['recorde-permanente'],
  },
  armazenamento_ler: {
    summary: 'Lê um número salvo anteriormente com a mesma chave — ou o valor padrão, se nada foi salvo ainda.',
    whatItDoes: 'Procura na memória permanente um valor salvo com a chave indicada. Se a placa nunca salvou nada com essa chave (por exemplo, na primeira vez que liga), devolve o valor padrão em vez de um número aleatório.',
    whenToUse: 'Use no PREPARAR para recuperar um valor guardado numa sessão anterior — por exemplo, mostrar o último recorde salvo assim que a placa liga.',
    dependencyNotes: ['A chave precisa ser exatamente igual (mesmo texto) à usada em "Salvar Valor Permanente" para encontrar o valor certo.'],
    exampleIds: ['recorde-permanente'],
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

  // ── DHT11/DHT22 (TEMPERATURA E UMIDADE) ─────────────────────────────────
  dht_iniciar: {
    summary: 'Prepara o sensor DHT11 ou DHT22, indicando o pino e o modelo.',
    whatItDoes: 'Guarda qual pino e qual modelo de sensor (DHT11 ou DHT22) o projeto vai usar; os dois modelos usam o mesmo fio de dados, só o jeito de calcular temperatura/umidade é diferente por dentro.',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer bloco de leitura de temperatura ou umidade.',
    dependencyNotes: [
      'Precisa de um sensor DHT11 ou DHT22 conectado ao pino escolhido (normalmente com um resistor de pull-up de 10 kΩ entre o fio de dados e a alimentação, dependendo do módulo).',
      'DHT11 e DHT22 parecem iguais, mas têm precisão e faixa de leitura diferentes — confira a serigrafia do módulo antes de escolher o modelo.',
    ],
    exampleIds: ['estacao-temperatura-umidade'],
  },
  dht_ler_temperatura: {
    summary: 'Lê a temperatura medida pelo sensor DHT, em graus Celsius.',
    whatItDoes: 'Devolve a última temperatura lida do sensor. As leituras são naturalmente lentas (o sensor não responde mais rápido que cerca de uma vez por segundo), então o valor pode ficar "parado" por um instante entre uma leitura de verdade e outra.',
    whenToUse: 'Use para mostrar, comparar ou reagir à temperatura do ambiente — por exemplo, ligar um ventilador quando passar de um valor escolhido.',
    dependencyNotes: ['Precisa de "Configurar Sensor DHT11/DHT22" no PREPARAR antes.'],
    exampleIds: ['estacao-temperatura-umidade'],
  },
  dht_ler_umidade: {
    summary: 'Lê a umidade do ar medida pelo sensor DHT, em porcentagem.',
    whatItDoes: 'Devolve a última umidade relativa lida do sensor, de 0 a 100%.',
    whenToUse: 'Use junto com a temperatura para montar uma estação meteorológica simples, ou para decidir algo a partir da umidade do ambiente.',
    dependencyNotes: ['Precisa de "Configurar Sensor DHT11/DHT22" no PREPARAR antes.'],
    exampleIds: ['estacao-temperatura-umidade'],
  },

  // ── RECEPTOR INFRAVERMELHO (PROTOCOLO NEC) ──────────────────────────────
  ir_iniciar: {
    summary: 'Prepara o receptor infravermelho, indicando o pino de saída do módulo.',
    whatItDoes: 'Guarda o pino onde o receptor infravermelho (o modulozinho preto de três pernas que vem com o controle remoto do kit) está conectado.',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer bloco de leitura do controle remoto.',
    dependencyNotes: [
      'Precisa de um módulo receptor infravermelho (tipo TSOP ou VS1838B) conectado ao pino escolhido.',
      'Decodifica o protocolo NEC, o mais comum nos controles pequenos que vêm com kits iniciantes — controles de outros protocolos podem não funcionar.',
      'A leitura é feita por consulta (sem interrupção): se o "AGIR" estiver ocupado fazendo outra coisa bem no instante em que o botão for apertado, o código pode ser perdido — aperte de novo se não funcionar na primeira vez.',
    ],
    exampleIds: ['controle-remoto-leds'],
  },
  ir_disponivel: {
    summary: 'Verdadeiro quando um código válido do controle remoto acabou de ser recebido.',
    whatItDoes: 'Escuta o pino do receptor à espera de um quadro completo do protocolo NEC; se detectar um código válido (com a conferência de erro correta), guarda esse código e devolve verdadeiro.',
    whenToUse: 'Use na condição de um SE... ENTÃO, e leia "Código Recebido do Controle Remoto" dentro dele — mesmo padrão de "Chegou Dado pela Serial?"/"Chegou Dado pelo Bluetooth?".',
    dependencyNotes: ['Precisa de "Configurar Receptor Infravermelho" no PREPARAR antes.'],
    exampleIds: ['controle-remoto-leds'],
  },
  ir_ler_codigo: {
    summary: 'Código numérico do último botão recebido do controle remoto.',
    whatItDoes: 'Devolve o código de 32 bits do último botão decodificado com sucesso. Cada botão do MESMO controle tem um código diferente; controles diferentes podem usar códigos diferentes para o mesmo desenho de botão.',
    whenToUse: 'Use depois de confirmar "Chegou um Código do Controle Remoto?", comparando com "Comparar Valores" contra os códigos dos botões que interessam (descubra o código de cada botão mostrando-o primeiro no monitor serial).',
    dependencyNotes: ['Precisa de "Configurar Receptor Infravermelho" no PREPARAR antes.'],
    exampleIds: ['controle-remoto-leds'],
  },

  // ── COMUNICAÇÃO ──────────────────────────────────────────────────────────
  texto_fixo: {
    summary: 'Um texto fixo, escrito no próprio bloco.',
    whatItDoes: 'Representa diretamente o texto digitado nele.',
    whenToUse: 'Use para plugar um texto em uma entrada que aceita valores, como "O Robô Diz (valor)" — útil quando você quer combinar texto com outros usos dessa mesma entrada, ou só para reaproveitar o mesmo bloco de saída de texto.',
    exampleIds: ['texto-fixo-serial'],
  },
  comparar_texto: {
    summary: 'Compara dois textos e devolve verdadeiro ou falso (igual ou diferente).',
    whatItDoes: 'Recebe dois valores (texto, número ou verdadeiro/falso), converte os dois para texto e compara se são iguais ou diferentes, letra por letra.',
    whenToUse: 'Encaixe na condição de um SE... ENTÃO para decidir a partir de um comando de texto recebido — por exemplo, "o texto lido da Serial é igual a \'ligar\'?".',
    exampleIds: ['serial-comando-texto', 'bluetooth-comando-texto'],
  },
  concatenar_texto: {
    summary: 'Junta dois valores num único texto.',
    whatItDoes: 'Converte as duas entradas (texto, número ou verdadeiro/falso) para texto e devolve as duas coladas, uma em seguida da outra.',
    whenToUse: 'Use para montar uma mensagem com texto fixo e um valor calculado juntos numa única linha, como "Distância: " unido com o número lido do sensor.',
  },
  comprimento_texto: {
    summary: 'Quantidade de caracteres de um texto.',
    whatItDoes: 'Converte a entrada para texto e devolve quantos caracteres ela tem.',
    whenToUse: 'Use para verificar se um comando recebido tem o tamanho esperado antes de processá-lo, por exemplo.',
  },
  texto_contem: {
    summary: 'Verdadeiro se um texto aparece dentro do outro.',
    whatItDoes: 'Converte as duas entradas para texto e verifica se a segunda aparece em algum lugar dentro da primeira.',
    whenToUse: 'Use quando não precisa que o texto recebido seja exatamente igual, só que contenha uma palavra-chave — por exemplo, aceitar "ligar led" e "por favor ligar" do mesmo jeito.',
  },
  texto_para_numero: {
    summary: 'Converte um texto (como "23") no número que ele representa.',
    whatItDoes: 'Lê o texto da entrada como se fosse um número decimal; se o texto não começar com um número válido, devolve 0.',
    whenToUse: 'Use quando um valor chega como texto (Serial, Bluetooth) mas você precisa dele como número para comparar, calcular ou guardar numa variável numérica.',
  },
  numero_para_texto: {
    summary: 'Converte um número no texto que o representa.',
    whatItDoes: 'Transforma o número da entrada no texto correspondente, pronto para unir com outro texto ou comparar.',
    whenToUse: 'Use junto com "Unir Texto" para montar uma mensagem que mistura texto fixo com um valor numérico calculado.',
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
  serial_disponivel: {
    summary: 'Verdadeiro quando chegou algum dado pela porta Serial (USB) que ainda não foi lido.',
    whatItDoes: 'Consulta se há bytes esperando para serem lidos no buffer de recepção da Serial (o mesmo cabo USB usado para gravar o programa e abrir o Monitor Serial).',
    whenToUse: 'Use na condição de um SE... ENTÃO antes de "Ler Texto da Serial", para não ler quando não há nada novo. Funciona em qualquer placa (Uno, Nano ou ESP32), sem precisar de nenhum bloco de "iniciar" antes.',
    exampleIds: ['serial-comando-texto'],
  },
  serial_ler_texto: {
    summary: 'Lê e devolve como texto tudo o que chegou pela Serial (USB) até agora.',
    whatItDoes: 'Junta os bytes disponíveis no buffer de recepção da Serial num texto e devolve. Se o texto for digitado aos poucos no Monitor Serial, pode ser necessário ler mais de uma vez.',
    whenToUse: 'Use depois de confirmar "Chegou Dado pela Serial?", para processar um comando digitado no Monitor Serial — por exemplo, comparar com "Comparar Texto" e decidir o que fazer.',
    exampleIds: ['serial-comando-texto'],
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

  // ── DISPLAY LCD (I²C, HD44780 4 BITS) ───────────────────────────────────
  lcd_iniciar: {
    summary: 'Prepara o Display LCD I²C: pinos SDA/SCL, endereço e tamanho (colunas × linhas).',
    whatItDoes: 'Liga a comunicação I²C com o expansor do display (o pequeno módulo azul ou verde colado atrás do LCD) e envia a sequência de inicialização do display, incluindo apagar a tela.',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer outro bloco de Display LCD.',
    dependencyNotes: [
      'Precisa de um display de caracteres 16x2 ou 20x4 com um módulo I²C (expansor PCF8574) já soldado atrás — os dois fios SDA/SCL substituem os vários fios de um LCD sem I²C.',
      'O endereço mais comum é 0x27; se o display não responder, tente 0x3F (o outro endereço de fábrica mais usado nesses módulos).',
      'Se o projeto também usar o MPU6050, os pinos SDA/SCL do MPU6050 e do Display LCD precisam ser os mesmos — é o mesmo barramento físico.',
    ],
    exampleIds: ['lcd-distancia'],
  },
  lcd_limpar: {
    summary: 'Apaga todo o texto do Display LCD.',
    whatItDoes: 'Limpa a tela do display e volta o cursor para a posição coluna 0, linha 0.',
    whenToUse: 'Use antes de escrever uma tela nova, para não misturar texto antigo com o novo — por exemplo, dentro de "A cada X ms" antes de atualizar uma leitura de sensor.',
    dependencyNotes: ['Precisa de "Iniciar Display LCD" no PREPARAR antes.'],
  },
  lcd_posicionar_cursor: {
    summary: 'Move o cursor do Display LCD para uma coluna e linha escolhidas, antes de escrever.',
    whatItDoes: 'Define onde o próximo texto/valor escrito no display vai aparecer. Coluna e linha começam em 0 (a primeira coluna é 0, a primeira linha é 0).',
    whenToUse: 'Use antes de "Display LCD Escreve" sempre que precisar controlar onde o texto aparece — por exemplo, um rótulo na linha 0 e um valor que muda na linha 1.',
    dependencyNotes: ['Precisa de "Iniciar Display LCD" no PREPARAR antes.'],
    exampleIds: ['lcd-distancia'],
  },
  lcd_escrever_texto: {
    summary: 'Display LCD escreve um texto fixo, a partir da posição atual do cursor.',
    whatItDoes: 'Envia o texto digitado no bloco para o display, começando na posição atual do cursor (coluna/linha).',
    whenToUse: 'Use para rótulos fixos, como "Temp: " antes de um valor calculado — mesma lógica de "O Robô Diz (texto)", só que na tela do LCD em vez do monitor serial.',
  },
  lcd_escrever_valor: {
    summary: 'Display LCD escreve um número, verdadeiro/falso ou texto calculado, a partir da posição atual do cursor.',
    whatItDoes: 'Envia o valor plugado na entrada para o display, começando na posição atual do cursor — o bloco aceita número, verdadeiro/falso ou texto, igual a "O Robô Diz (valor)".',
    whenToUse: 'Use para mostrar uma leitura de sensor, o resultado de um cálculo ou uma variável no display — combine com "Unir Texto" (categoria Texto) para montar uma linha com rótulo e valor juntos.',
    exampleIds: ['lcd-distancia'],
  },

  // ── LED ENDEREÇÁVEL (NEOPIXEL/WS2812) ───────────────────────────────────
  neopixel_iniciar: {
    summary: 'Prepara a tira de LEDs endereçáveis, indicando o pino e quantos LEDs ela tem.',
    whatItDoes: 'Liga a comunicação com a tira (um único fio de dados serial) e apaga todos os LEDs para começar.',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer outro bloco de LED Endereçável.',
    dependencyNotes: [
      'Precisa de uma tira/anel de LEDs endereçáveis (NeoPixel, WS2812, WS2812B ou compatível) conectada ao pino escolhido.',
      'Tiras de 5 V precisam de um conversor de nível no fio de dados quando ligadas num ESP32 (lógica de 3,3 V) para funcionar de forma confiável.',
      'Alimente a tira por uma fonte à parte quando tiver muitos LEDs — o regulador da placa não aguenta muitos LEDs no branco/brilho máximo ao mesmo tempo.',
    ],
    exampleIds: ['controle-remoto-leds'],
  },
  neopixel_definir_cor: {
    summary: 'Guarda a cor de um LED da tira, na memória — só aparece de verdade depois de "Atualizar Tira de LEDs".',
    whatItDoes: 'Define, para o LED de índice escolhido (0 é o primeiro), a quantidade de vermelho, verde e azul (cada um de 0 a 255). Essa mudança fica só na memória até o próximo "Atualizar Tira de LEDs".',
    whenToUse: 'Use para desenhar um padrão de cores, um LED por vez, antes de mostrar tudo de uma vez com "Atualizar Tira de LEDs" — igual a pintar um quadro inteiro antes de virar a página, em vez de mostrar cada pincelada.',
    dependencyNotes: ['Precisa de "Configurar Tira de LEDs" no PREPARAR antes.'],
  },
  neopixel_limpar: {
    summary: 'Apaga a cor de todos os LEDs na memória — só aparece de verdade depois de "Atualizar Tira de LEDs".',
    whatItDoes: 'Zera a cor guardada de todos os LEDs (equivale a "Definir Cor" com vermelho, verde e azul em 0 para cada um).',
    whenToUse: 'Use antes de desenhar um padrão novo, para não misturar cores de uma atualização anterior.',
    dependencyNotes: ['Precisa de "Configurar Tira de LEDs" no PREPARAR antes.'],
  },
  neopixel_mostrar: {
    summary: 'Envia para a tira física as cores definidas na memória, todas de uma vez.',
    whatItDoes: 'Manda pelo fio de dados as cores de todos os LEDs guardadas por "Definir Cor"/"Apagar Todos os LEDs" — é o único momento em que a tira física realmente muda.',
    whenToUse: 'Use depois de uma ou mais chamadas a "Definir Cor"/"Apagar Todos os LEDs", sempre que quiser que a mudança apareça na tira de verdade.',
    dependencyNotes: ['Precisa de "Configurar Tira de LEDs" no PREPARAR antes.'],
    exampleIds: ['controle-remoto-leds'],
  },

  // ── ESP-NOW (SEM FIO) ────────────────────────────────────────────────────
  // ESP-NOW é um TRANSPORTE genérico entre ESP32s, não um recurso exclusivo
  // de controle de robô: a mensagem "tipo + valor A/B/C + sinal" pode
  // carregar leitura de sensor, comando de motor, aviso de LED ou
  // telemetria qualquer. Os blocos "pitch/roll/parar" abaixo são um alias
  // antigo sobre os mesmos campos, mantido para abrir projetos salvos.
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
  espnow_iniciou_com_sucesso: {
    summary: 'Verdadeiro se o transmissor ou receptor ESP-NOW iniciou (e, no transmissor, conectou ao peer) sem erro.',
    whatItDoes: 'Consulta o resultado da última inicialização do ESP-NOW. Diferente de outros blocos de configuração, uma falha aqui NÃO trava o programa: você decide o que fazer.',
    whenToUse: 'Use logo depois de "Preparar como Transmissor"/"Preparar como Receptor" (e, no transmissor, depois de "Conectar ao Receptor") para mostrar um aviso, acender um LED de erro ou tentar de novo, em vez de deixar o sketch travado silenciosamente.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" ou "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_transmissor_init: {
    summary: 'Preparar Luva (Transmissor) — inicia este dispositivo como o lado que envia dados.',
    whatItDoes: 'Ativa o ESP-NOW no papel de transmissor, deixando pronto para adicionar o receptor e enviar mensagens. Se a inicialização falhar, o programa continua rodando (consulte "ESP-NOW Iniciou com Sucesso?" para reagir ao erro).',
    whenToUse: 'Use no PREPARAR do dispositivo que vai enviar dados (por exemplo, a "luva" de controle), depois de "Preparar Comunicação Sem Fio".',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_adicionar_receptor: {
    summary: 'Conecta este transmissor ao código (MAC) de um receptor específico.',
    whatItDoes: 'Registra o endereço MAC informado como o destino para onde as mensagens serão enviadas.',
    whenToUse: 'Use uma vez no PREPARAR do transmissor, com o código MAC mostrado pelo robô receptor (via "Mostrar Código deste Dispositivo").',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" já tenha rodado antes.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_enviar_mensagem: {
    summary: 'Envia uma mensagem genérica: um número de tipo (0–255), até três valores numéricos e um sinal verdadeiro/falso.',
    whatItDoes: 'Monta uma mensagem com os campos plugados nas entradas e envia por ESP-NOW para o receptor já conectado. O significado de "tipo" e de cada valor é definido por você — o mesmo formato serve para telemetria de sensor, comando de motor, aviso de LED, etc.',
    whenToUse: 'Use no AGIR do transmissor sempre que precisar mandar dados para o outro ESP32 — não é exclusivo de controle de robô.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" e "Conectar ao Receptor" já tenham rodado antes.'],
    exampleIds: ['esp-now-transmissor-generico'],
  },
  espnow_envio_confirmado: {
    summary: 'Verdadeiro se o último envio foi confirmado pelo rádio Wi-Fi do destinatário.',
    whatItDoes: 'Consulta o resultado do callback de status de envio do ESP-NOW (esp_now_register_send_cb): o rádio confirma no nível do link se o pacote chegou ao destino, mesmo sem qualquer confirmação no nível da sua aplicação.',
    whenToUse: 'Use depois de "Enviar Mensagem" para saber se aquele envio específico teve sucesso — por exemplo, para contar falhas ou repetir um envio importante.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" já tenha rodado antes.', 'O resultado só é válido depois de pelo menos um envio.'],
  },
  espnow_enviar_pacote: {
    summary: '[Legado] Envia para o robô os valores de inclinação frente/trás, esquerda/direita e um sinal de parar.',
    whatItDoes: 'Monta um pacote com os três valores plugados nas entradas e envia por ESP-NOW para o receptor já conectado. Usa por baixo dos panos o mesmo formato de mensagem genérica de "Enviar Mensagem".',
    whenToUse: 'Mantido para abrir projetos salvos antes da mensagem genérica existir. Em projetos novos, prefira "Enviar Mensagem", que serve para qualquer tipo de dado, não só inclinação.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Transmissor" e "Conectar ao Receptor" já tenham rodado antes.'],
    exampleIds: ['esp-now-transmissor'],
  },
  espnow_receptor_init: {
    summary: 'Preparar Robô (Receptor) — inicia este dispositivo como o lado que recebe dados.',
    whatItDoes: 'Ativa o ESP-NOW no papel de receptor, deixando pronto para escutar mensagens enviadas por um transmissor. Se a inicialização falhar, o programa continua rodando (consulte "ESP-NOW Iniciou com Sucesso?" para reagir ao erro).',
    whenToUse: 'Use no PREPARAR do dispositivo que vai receber comandos (por exemplo, o robô controlado pela luva), depois de "Preparar Comunicação Sem Fio".',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_tem_dados_novos: {
    summary: 'Verdadeiro quando chegou uma mensagem nova do transmissor que ainda não foi lida.',
    whatItDoes: 'Consulta se uma nova mensagem ESP-NOW chegou desde a última vez que foi marcada como lida.',
    whenToUse: 'Use na condição de um SE... ENTÃO para só processar os dados recebidos quando realmente houver algo novo.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_mensagem_tipo: {
    summary: 'Devolve o número de tipo (0–255) da última mensagem recebida.',
    whatItDoes: 'Lê o campo "tipo" da mensagem mais recente recebida por ESP-NOW — o rótulo que o transmissor escolheu para dizer do que se trata aquele dado.',
    whenToUse: 'Use num SE... ENTÃO/SENÃO para decidir o que fazer com a mensagem conforme o tipo (por exemplo, tipo 1 = comando de movimento, tipo 2 = leitura de sensor).',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor-generico'],
  },
  espnow_mensagem_valor_a: {
    summary: 'Devolve o primeiro valor numérico da última mensagem recebida.',
    whatItDoes: 'Lê o campo "valor A" da mensagem mais recente recebida por ESP-NOW. O significado é o que o transmissor decidiu mandar ali — inclinação, temperatura, velocidade, etc.',
    whenToUse: 'Use depois de confirmar "Chegou Mensagem Nova?", combinando com "Tipo da Mensagem Recebida" quando o projeto envia mais de um tipo de dado.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor-generico'],
  },
  espnow_mensagem_valor_b: {
    summary: 'Devolve o segundo valor numérico da última mensagem recebida.',
    whatItDoes: 'Lê o campo "valor B" da mensagem mais recente recebida por ESP-NOW.',
    whenToUse: 'Use depois de confirmar "Chegou Mensagem Nova?", junto com "Valor A Recebido" quando a mensagem carrega dois números relacionados (como X/Y ou inclinação/velocidade).',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor-generico'],
  },
  espnow_mensagem_valor_c: {
    summary: 'Devolve o terceiro valor numérico da última mensagem recebida.',
    whatItDoes: 'Lê o campo "valor C" da mensagem mais recente recebida por ESP-NOW.',
    whenToUse: 'Use quando a mensagem precisa de um terceiro número — por exemplo, um identificador, uma velocidade separada da direção, ou uma segunda leitura de sensor.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_mensagem_sinal: {
    summary: 'Devolve o sinal verdadeiro/falso da última mensagem recebida.',
    whatItDoes: 'Lê o campo "sinal" da mensagem mais recente recebida por ESP-NOW — um valor lógico cujo significado é livre (parar, ligar/desligar, confirmar, etc.).',
    whenToUse: 'Use para transportar um comando de dois estados junto com os valores numéricos, sem precisar de uma mensagem separada.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_mensagem_remetente: {
    summary: 'Devolve o código (MAC) de quem enviou a última mensagem recebida, como texto.',
    whatItDoes: 'Lê o endereço MAC de origem capturado pelo ESP-NOW no momento da última mensagem recebida e devolve como texto no formato AA:BB:CC:DD:EE:FF.',
    whenToUse: 'Use para identificar o remetente quando o receptor pode ouvir mais de um transmissor, ou para registrar/depurar de onde veio cada mensagem.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_ler_pitch: {
    summary: '[Legado] Devolve o valor de inclinação frente/trás recebido na última mensagem.',
    whatItDoes: 'Lê o campo "valor A" da mensagem mais recente recebida por ESP-NOW (o mesmo campo genérico de "Valor A Recebido").',
    whenToUse: 'Mantido para abrir projetos salvos antes da mensagem genérica existir. Em projetos novos, prefira "Valor A Recebido".',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_ler_roll: {
    summary: '[Legado] Devolve o valor de inclinação esquerda/direita recebido na última mensagem.',
    whatItDoes: 'Lê o campo "valor B" da mensagem mais recente recebida por ESP-NOW (o mesmo campo genérico de "Valor B Recebido").',
    whenToUse: 'Mantido para abrir projetos salvos antes da mensagem genérica existir. Em projetos novos, prefira "Valor B Recebido".',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },
  espnow_ler_flag_parar: {
    summary: '[Legado] Verdadeiro se a última mensagem recebida pediu para parar.',
    whatItDoes: 'Lê o campo "sinal" da mensagem mais recente recebida por ESP-NOW (o mesmo campo genérico de "Sinal Recebido").',
    whenToUse: 'Mantido para abrir projetos salvos antes da mensagem genérica existir. Em projetos novos, prefira "Sinal Recebido".',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_timeout_ms: {
    summary: 'Verdadeiro se já faz mais tempo que o indicado desde a última mensagem recebida.',
    whatItDoes: 'Compara o tempo desde a última mensagem recebida com o limite escolhido (em milissegundos).',
    whenToUse: 'Use como segurança: se o sinal do transmissor sumir (por distância, interferência, dispositivo desligado, etc.), detecte isso e leve o receptor a um estado seguro (por exemplo, parar os motores) automaticamente.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor-generico'],
  },
  espnow_contagem_invalidas: {
    summary: 'Quantidade de mensagens recebidas com tamanho inválido e descartadas desde que o programa ligou.',
    whatItDoes: 'Conta quantas vezes o ESP-NOW recebeu dados no tamanho errado (mensagem corrompida ou de um protocolo diferente) e os descartou automaticamente, sem afetar a última mensagem válida guardada.',
    whenToUse: 'Use para diagnosticar problemas de comunicação — se esse número cresce muito rápido, algo está enviando dados incompatíveis nesse canal.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
  },
  espnow_marcar_lido: {
    summary: 'Reseta o flag de dados novos. Coloque como primeiro bloco dentro de "SE Chegou mensagem nova?".',
    whatItDoes: 'Marca a mensagem atual como já processada, para que "Chegou Mensagem Nova?" volte a ser falso até a próxima mensagem chegar.',
    whenToUse: 'Sempre como o primeiro bloco dentro do SE... ENTÃO que verifica "Chegou Mensagem Nova?" — evita processar a mesma mensagem repetidas vezes.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Preparar como Receptor" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor'],
  },

  // ── WI-FI (REDE) ─────────────────────────────────────────────────────────
  // Conexão comum a um roteador/internet — independente do ESP-NOW. Um
  // projeto pode usar só Wi-Fi, só ESP-NOW, ou os dois (nesse caso os dois
  // compartilham o mesmo rádio e a mesma inclusão de biblioteca).
  wifi_conectar: {
    summary: 'Conecta a placa a uma rede Wi-Fi comum (roteador), pelo nome e senha.',
    whatItDoes: 'Tenta conectar à rede indicada por até 10 segundos e mostra no monitor serial se conseguiu (com o endereço IP) ou não. Não trava o programa se falhar — use "Wi-Fi Está Conectado?" para decidir o que fazer.',
    whenToUse: 'Use no PREPARAR para a conexão inicial, ou também dentro de AGIR (por exemplo, num "SE NÃO estiver conectado, ENTÃO conectar de novo") para reconectar depois de uma queda de sinal.',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['wifi-status'],
  },
  wifi_esta_conectado: {
    summary: 'Verdadeiro se a placa está conectada a uma rede Wi-Fi neste momento.',
    whatItDoes: 'Consulta o estado atual da conexão Wi-Fi.',
    whenToUse: 'Use para verificar antes de tentar algo que precisa de internet, ou para decidir quando chamar "Conectar ao Wi-Fi" de novo depois de uma queda de sinal.',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['wifi-status'],
  },
  wifi_endereco_ip: {
    summary: 'Devolve o endereço IP atual da placa na rede, como texto.',
    whatItDoes: 'Lê o endereço IP dado pelo roteador quando a conexão Wi-Fi está ativa.',
    whenToUse: 'Use para mostrar/registrar o IP da placa, por exemplo no monitor serial logo depois de conectar.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Só tem um valor útil enquanto "Wi-Fi Está Conectado?" for verdadeiro.'],
    exampleIds: ['wifi-status'],
  },
  wifi_desconectar: {
    summary: 'Desconecta a placa da rede Wi-Fi atual.',
    whatItDoes: 'Encerra a conexão Wi-Fi ativa.',
    whenToUse: 'Use quando o projeto não precisa mais de rede e quiser economizar energia, ou antes de conectar a uma rede diferente.',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
  },
  wifi_http_get: {
    summary: 'Faz uma requisição HTTP (GET) para um endereço e guarda a resposta.',
    whatItDoes: 'Conecta ao endereço (URL) indicado, pede a página/dado (método GET) e guarda o resultado — sucesso ou falha, e o texto da resposta — para os blocos "Requisição HTTP Teve Sucesso?" e "Resposta da Requisição HTTP" lerem depois.',
    whenToUse: 'Use para buscar informação da internet — uma API de previsão do tempo, um webhook, uma planilha publicada como texto. O endereço aceita qualquer bloco de texto, incluindo "Unir Texto" para montar uma URL com um valor calculado.',
    dependencyNotes: [
      'Disponível apenas para placas ESP32.',
      'Precisa que o Wi-Fi já esteja conectado ("Conectar ao Wi-Fi").',
      'O programa espera a resposta chegar antes de continuar (pode levar alguns segundos, ou até travar por um tempo se o endereço não responder) — evite colocar dentro de um trecho que precisa ser rápido, como uma animação de LED.',
    ],
    exampleIds: ['wifi-http-consulta'],
  },
  wifi_http_sucesso: {
    summary: 'Verdadeiro se a última requisição HTTP teve resposta de sucesso.',
    whatItDoes: 'Consulta se a última chamada a "Fazer Requisição HTTP" recebeu uma resposta de sucesso do servidor (código 200–299).',
    whenToUse: 'Use logo depois de "Fazer Requisição HTTP" antes de ler a resposta, para não usar um texto vazio quando a requisição falhou.',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['wifi-http-consulta'],
  },
  wifi_http_resposta: {
    summary: 'Texto devolvido pela última requisição HTTP.',
    whatItDoes: 'Devolve o corpo da resposta da última chamada a "Fazer Requisição HTTP" como texto; fica vazio quando a requisição não teve sucesso.',
    whenToUse: 'Use depois de confirmar "Requisição HTTP Teve Sucesso?" para mostrar ou processar o que o servidor respondeu.',
    dependencyNotes: ['Disponível apenas para placas ESP32.'],
    exampleIds: ['wifi-http-consulta'],
  },

  // ── BLUETOOTH (CLÁSSICO) ─────────────────────────────────────────────────
  // Porta serial sem fio (BluetoothSerial) — mesma filosofia de
  // iniciar/status/enviar/receber do Wi-Fi e do ESP-NOW, agora para parear
  // com um celular (ex.: um app como "Serial Bluetooth Terminal").
  bt_iniciar: {
    summary: 'Liga o Bluetooth clássico da placa com o nome escolhido, para outros dispositivos encontrarem ao parear.',
    whatItDoes: 'Inicia o rádio Bluetooth clássico (BluetoothSerial) com o nome informado, deixando a placa visível para pareamento.',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer outro bloco de Bluetooth.',
    dependencyNotes: [
      'Disponível apenas para placas ESP32.',
      'O Bluetooth clássico usa bastante memória de programa: combiná-lo com Wi-Fi e ESP-NOW no mesmo projeto pode ultrapassar o espaço disponível na placa, dependendo do restante do programa.',
    ],
    exampleIds: ['bluetooth-eco'],
  },
  bt_conectado: {
    summary: 'Verdadeiro se algum celular/computador está pareado e conectado por Bluetooth agora.',
    whatItDoes: 'Consulta se existe um cliente Bluetooth conectado à placa neste momento.',
    whenToUse: 'Use para só enviar dados quando realmente há alguém ouvindo, ou para mostrar um aviso de conexão/desconexão.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Iniciar Bluetooth" já tenha rodado antes.'],
  },
  bt_disponivel: {
    summary: 'Verdadeiro quando chegou algum dado pelo Bluetooth que ainda não foi lido.',
    whatItDoes: 'Consulta se há bytes esperando para serem lidos no buffer de recepção do Bluetooth.',
    whenToUse: 'Use na condição de um SE... ENTÃO antes de "Ler Texto do Bluetooth", para não ler quando não há nada novo.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Iniciar Bluetooth" já tenha rodado antes.'],
    exampleIds: ['bluetooth-eco'],
  },
  bt_ler_texto: {
    summary: 'Lê e devolve como texto tudo o que chegou pelo Bluetooth até agora.',
    whatItDoes: 'Junta os bytes disponíveis no buffer de recepção do Bluetooth num texto e devolve.',
    whenToUse: 'Use depois de confirmar "Chegou Dado pelo Bluetooth?", para processar um comando enviado por um app no celular.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Iniciar Bluetooth" já tenha rodado antes.'],
    exampleIds: ['bluetooth-eco'],
  },
  bt_enviar_texto: {
    summary: 'Envia um texto pelo Bluetooth, como uma linha.',
    whatItDoes: 'Manda o texto plugado na entrada para o dispositivo conectado por Bluetooth.',
    whenToUse: 'Use para responder a um comando recebido, mostrar uma leitura de sensor no celular, ou qualquer mensagem de texto para o app pareado.',
    dependencyNotes: ['Disponível apenas para placas ESP32.', 'Precisa que "Iniciar Bluetooth" já tenha rodado antes.'],
    exampleIds: ['bluetooth-eco'],
  },

  // ── MPU-6050 (ACELERÔMETRO + GIROSCÓPIO) ─────────────────────────────────
  // O MPU-6050 tem DOIS sensores num só chip: um acelerômetro (força linear
  // nos 3 eixos, usada para calcular inclinação) e um giroscópio (velocidade
  // de rotação nos 3 eixos). Não são a mesma coisa nem medem a mesma
  // grandeza — por isso existem blocos brutos separados para cada um, além
  // dos blocos prontos de inclinação (que usam só o acelerômetro).
  mpu_iniciar: {
    summary: 'Inicia o sensor acelerômetro/giroscópio MPU-6050, indicando os pinos SDA/SCL (I²C) e o endereço.',
    whatItDoes: 'Liga a comunicação I²C com o sensor MPU-6050 no endereço escolhido e confirma se ele respondeu corretamente (mostra no monitor serial se deu certo ou não).',
    whenToUse: 'Use uma vez no PREPARAR, antes de qualquer bloco de leitura do MPU6050 (inclinação, aceleração, giroscópio ou temperatura).',
    dependencyNotes: [
      'Precisa de um sensor MPU-6050 conectado nos pinos SDA/SCL escolhidos.',
      'O endereço é 0x68 quando o pino AD0 do módulo está em GND (padrão da maioria dos breakouts) ou 0x69 quando AD0 está em VCC — útil para usar dois MPU-6050 no mesmo barramento I²C.',
    ],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },
  mpu_ler_pitch: {
    summary: 'Inclinação frente/trás (graus) — lê o quanto o sensor está inclinado para frente ou para trás.',
    whatItDoes: 'Devolve, em graus, a inclinação atual do MPU-6050 no eixo frente/trás, calculada a partir do acelerômetro.',
    whenToUse: 'Use para controlar algo pela inclinação — mover um robô, ou enviar essa leitura por ESP-NOW para controlar outro robô à distância.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },
  mpu_ler_roll: {
    summary: 'Inclinação esquerda/direita (graus) — lê o quanto o sensor está inclinado para os lados.',
    whatItDoes: 'Devolve, em graus, a inclinação atual do MPU-6050 no eixo esquerda/direita, calculada a partir do acelerômetro.',
    whenToUse: 'Use para controlar algo pela inclinação lateral — mover um robô, ou enviar essa leitura por ESP-NOW para controlar outro robô à distância.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
    exampleIds: ['acelerometro-leitura', 'esp-now-transmissor'],
  },
  mpu_ler_aceleracao_x: {
    summary: 'Aceleração bruta no eixo X, em g (1 g ≈ força da gravidade).',
    whatItDoes: 'Devolve o valor bruto do acelerômetro no eixo X, sem nenhuma conversão para ângulo.',
    whenToUse: 'Use quando precisar do dado bruto do acelerômetro — para montar seu próprio cálculo de inclinação, detectar batida/vibração (variação brusca) ou registrar dados. Para inclinação pronta em graus, use "Ler Inclinação Frente/Trás" ou "Ler Inclinação Lateral".',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_aceleracao_y: {
    summary: 'Aceleração bruta no eixo Y, em g (1 g ≈ força da gravidade).',
    whatItDoes: 'Devolve o valor bruto do acelerômetro no eixo Y, sem nenhuma conversão para ângulo.',
    whenToUse: 'Use quando precisar do dado bruto do acelerômetro — para montar seu próprio cálculo de inclinação, detectar batida/vibração (variação brusca) ou registrar dados.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_aceleracao_z: {
    summary: 'Aceleração bruta no eixo Z, em g (1 g ≈ força da gravidade).',
    whatItDoes: 'Devolve o valor bruto do acelerômetro no eixo Z, sem nenhuma conversão para ângulo. Com o sensor parado e na horizontal, este valor fica perto de 1 g (a gravidade "empurrando" para baixo).',
    whenToUse: 'Use quando precisar do dado bruto do acelerômetro — para montar seu próprio cálculo de inclinação, detectar batida/vibração (variação brusca) ou registrar dados.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_giro_x: {
    summary: 'Velocidade de rotação no eixo X, em graus por segundo — não é o mesmo dado do acelerômetro.',
    whatItDoes: 'Devolve a velocidade angular medida pelo giroscópio no eixo X: o quão rápido o sensor está girando naquele instante, não o ângulo em si.',
    whenToUse: 'Use para detectar movimento de rotação (giro rápido) em vez de inclinação estática. Combine com "Ler Inclinação" quando precisar tanto de ângulo quanto de velocidade de giro.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_giro_y: {
    summary: 'Velocidade de rotação no eixo Y, em graus por segundo — não é o mesmo dado do acelerômetro.',
    whatItDoes: 'Devolve a velocidade angular medida pelo giroscópio no eixo Y: o quão rápido o sensor está girando naquele instante, não o ângulo em si.',
    whenToUse: 'Use para detectar movimento de rotação (giro rápido) em vez de inclinação estática.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_giro_z: {
    summary: 'Velocidade de rotação no eixo Z, em graus por segundo — não é o mesmo dado do acelerômetro.',
    whatItDoes: 'Devolve a velocidade angular medida pelo giroscópio no eixo Z: o quão rápido o sensor está girando naquele instante, não o ângulo em si (esse é o eixo de uma "rodinha" vista de cima).',
    whenToUse: 'Use para detectar movimento de rotação (giro rápido) em vez de inclinação estática.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
  },
  mpu_ler_temperatura: {
    summary: 'Temperatura interna do chip MPU-6050, em graus Celsius.',
    whatItDoes: 'Devolve a temperatura medida pelo sensor de temperatura embutido no próprio chip MPU-6050.',
    whenToUse: 'Use para um registro aproximado da temperatura do ambiente/placa. É a temperatura do chip, não um termômetro de precisão calibrado.',
    dependencyNotes: ['Precisa que "Iniciar MPU6050" já tenha rodado antes.'],
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
    whatItDoes: 'Calcula automaticamente a força de cada motor a partir dos dois valores de entrada, permitindo movimentos combinados e proporcionais (por exemplo, virar mais forte quanto maior a inclinação) numa única chamada.',
    whenToUse: 'Para controle CONTÍNUO e proporcional por inclinação — normalmente ligado direto às leituras vindas de "Valor A Recebido"/"Valor B Recebido" (ESP-NOW) ou de um acelerômetro local. Se preferir decidir a direção você mesmo (por exemplo, com SE/SENÃO comparando a inclinação a um limite) e mover em estados discretos, "Mover (Frente, Trás, Esq, Dir)" combinado com blocos de condição alcança o mesmo resultado por composição — veja "esp-now-receptor-generico" nos exemplos deste bloco.',
    dependencyNotes: ['Precisa que "Configurar Motor DC" já tenha rodado antes.'],
    exampleIds: ['esp-now-receptor', 'esp-now-receptor-generico'],
  },
};
