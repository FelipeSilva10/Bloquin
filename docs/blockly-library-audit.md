# Auditoria da biblioteca de blocos do Bloquin (2026-08-31)

Revisão estrutural da cobertura atual de blocos, feita a partir da leitura de
`src/blockly/blocks.ts`, `toolbox.ts`, `contracts.ts`, `boards.ts`,
`generators.ts` e `src/features/components/catalog.ts` — não de suposição.
Este documento é uma **auditoria/brainstorming**, não um plano de
implementação: nada aqui deve virar código sem uma decisão explícita de
priorização separada.

A pergunta que orienta cada item não é "que blocos podemos adicionar", e sim:

> **Que projeto um usuário comum do Bloquin tentaria montar e hoje não
> consegue — ou só consegue de um jeito artificialmente limitado?**

## 1. O que já existe hoje (linha de base)

104 tipos de bloco registrados (2 raízes + 100 na toolbox + 2 aliases legados
de matemática + 3 aliases legados de ESP-NOW), organizados em 13 categorias:

| Categoria | Blocos | Cobertura |
|---|---|---|
| Lógica | 8 | SE/SE-SENÃO, comparação numérica, E/OU, NÃO, número↔booleano |
| Controle | 4 | repetir N vezes (fixo/calculado), enquanto, parar repetição |
| Matemática | 9 + 2 legados | aritmética, potência, min/máx, arredondar/raiz, mapear escala, abs, limitar, aleatório |
| Variáveis | 4 | declarar (int/float/bool), atribuir, ler, incrementar |
| Funções | 4 | definir/chamar, com e sem retorno — **sem parâmetros** (decisão deliberada) |
| Tempo | 4 | esperar, esperar calculado, a cada X ms, millis() |
| Entradas e Saídas | 6 | configurar pino, ligar/desligar, escrever condicional, ler digital, PWM, ler analógico |
| Sensor de Distância | 5 | família completa do HC-SR04 |
| MPU6050 | 10 | acelerômetro+giroscópio, inclinação pronta e eixos brutos, temperatura |
| Servo | 3 | conectar, mover, ler posição |
| Buzzer | 4 | tocar, tocar por tempo, parar, músicas prontas |
| Motor DC (L298N) | 5 | configurar, mover robô, girar motor individual, parar, mover por dois valores |
| Comunicação | 3 | texto fixo, serial texto, serial valor — **isto é tudo que existe de "texto" no Bloquin** |
| ESP-NOW | ~20 | envelope genérico (tipo+A+B+C+sinal), diagnóstico de envio/recepção/erro, alias legado pitch/roll/parar |
| Wi-Fi | 4 | conectar, status, IP, desconectar — **sem enviar/receber dado nenhum** |
| Bluetooth | 5 | iniciar, conectado?, disponível?, ler texto, enviar texto |

Catálogo de componentes: **11 itens** em 9 categorias declaradas — ESP32,
Uno, LED, resistor, botão tátil, buzzer passivo, LDR, HC-SR04, MPU6050,
L298N, motor DC. As categorias `power`, `communication` e `tools` existem na
estrutura (`COMPONENT_CATEGORIES`) mas **não têm nenhum componente
cadastrado**.

### O que já está bem resolvido (não mexer)

- **Fluxo de controle e lógica booleana**: SE/SENÃO, E/OU/NÃO, comparação,
  laços — cobertura equivalente a qualquer linguagem de bloco de referência.
- **Matemática de projeto real**: mapear escala, limitar, aleatório,
  min/máx — exatamente o que HC-SR04/LDR/potenciômetro precisam, sem inventar
  blocos por sensor.
- **E/S genérica de pino**: um único conjunto de blocos (configurar/ler/
  escrever/PWM) atende led, botão, buzzer ativo, relé, LDR, etc. sem exigir
  bloco dedicado — a composição já funciona bem aqui.
- **ESP-NOW**: é a família mais madura do Bloquin — envelope genérico,
  diagnóstico de rádio, contagem de erro, timeout de sinal, compatibilidade
  com versão legada. Modelo a copiar para outras famílias de mensagem.
- **Filosofia de composição**: MPU6050 → lógica → transporte → atuador já é
  validado por exemplo real e por compilação (`esp32-generic-transmitter/
  receiver`). O padrão está certo; falta aplicá-lo a mais domínios (texto,
  display, Wi-Fi).

## 2. Cenários concretos: o que não dá para construir hoje

Isto é o núcleo da auditoria — cada linha é um projeto plausível de sala de
aula, não uma feature abstrata.

| Cenário | Situação hoje |
|---|---|
| Digitar "ligar" no Monitor Serial (Uno/Nano/ESP32) e acender um LED | **Impossível.** Não existe bloco de leitura de Serial em nenhuma placa — só escrita. |
| Parear por Bluetooth e mandar "ESQUERDA"/"DIREITA" como texto para dirigir um robô | **Impossível de fechar o ciclo.** `bt_ler_texto` devolve texto, mas não há bloco para comparar texto — `comparar_valores` só aceita `Number`. |
| Mostrar a distância ou a temperatura em um display LCD | **Impossível.** Zero blocos e zero componente de display no catálogo. |
| Guardar as últimas 5 leituras de distância e calcular a média | **Impossível.** Não existe lista/vetor — só variáveis escalares (int/float/bool). |
| Guardar um recorde/contagem que sobrevive a desligar a placa | **Impossível.** Sem EEPROM/Preferences. |
| Controlar um LED a partir de uma página no celular (ESP32 como servidor) | **Impossível.** Wi-Fi só conecta e informa IP; não envia nem recebe dado algum. |
| Fazer o projeto reagir a "botão foi apertado agora" (borda), não "está apertado" (nível) | **Tecnicamente possível**, mas exige o aluno compor manualmente uma variável de "estado anterior" — construção avançada para o público-alvo, quando o conceito (borda) é fundamental e reaproveitável. |
| Usar um sensor de temperatura/umidade DHT11/22 numa estação meteorológica | **Impossível.** Protocolo próprio (timing de 1 fio), sem blocos. |
| Fazer efeito de cor num LED endereçável (NeoPixel/WS2812) — item comum em kits | **Impossível.** Só há PWM simples de 3 pinos separados; sem biblioteca/protocolo. |
| Usar o controle remoto IV que vem em quase todo kit iniciante | **Impossível.** Sem blocos de receptor infravermelho. |
| Escrever "Distância: 23 cm" numa única linha (texto + valor juntos) | **Parcialmente limitado.** Dá para mandar duas linhas separadas (`escrever_serial` + `escrever_serial_valor`), mas não concatenar texto e número numa só mensagem/linha. |

Esses onze pontos — não uma lista de "blocos legais para ter" — são a base
das recomendações abaixo.

## 3. Lacunas por família

### 3.1 Texto — categoria inexistente, apesar de já haver `String` circulando

`String` já é tipo de saída de `texto_fixo`, `bt_ler_texto`,
`wifi_endereco_ip` e `espnow_mensagem_remetente`, e tipo de entrada aceito
por `escrever_serial_valor` e `bt_enviar_texto`. Mas não existe **nenhum**
bloco para operar sobre texto:

- comparar texto ("igual a"/"diferente de"), essencial para decidir a partir
  de um comando recebido;
- concatenar texto ("junte A e B"), essencial para formatar uma linha de
  display/serial;
- comprimento de texto, comparação parcial ("contém"), conversão
  número↔texto.

Sem isso, **os blocos de Bluetooth e ESP-NOW que devolvem texto já
implementados hoje são pouco úteis na prática**: dá para ler o dado, mas não
para agir sobre ele com lógica. Classificação: **ESSENCIAL**. Isto não é uma
"nova feature" — é fechar um ciclo que já foi aberto (entrada de texto) em
três famílias diferentes sem a saída lógica correspondente.

Consequência direta: `declarar_variavel_global`/`atribuir_variavel` também
precisam aceitar tipo texto (hoje só int/float/bool) para permitir guardar
"o último comando recebido" entre iterações do loop — sem isso, o dado de
texto só pode ser usado no instante em que chega, nunca lembrado.

### 3.2 Ler Serial — universal, não depende de ESP32

`Serial.begin(115200)` já é emitido incondicionalmente em `setup()`
(`generators.ts:151`), então o hardware **já está pronto**; falta só o
bloco. O padrão a copiar é exatamente o par que já existe para Bluetooth
(`bt_disponivel` / `bt_ler_texto`): "Chegou dado pela Serial?" / "Ler texto
recebido pela Serial". Diferente de Bluetooth/Wi-Fi/ESP-NOW, isto funciona
em **Uno, Nano e ESP32** sem hardware adicional — é provavelmente o primeiro
projeto "interativo" que um professor monta antes mesmo de comprar um módulo
sem fio. Classificação: **ESSENCIAL**.

### 3.3 Detecção de borda — abstração genérica, não um bloco de botão

Em vez de um bloco "botão foi pressionado" (específico demais — amarra o
conceito a um componente), a abstração correta é genérica sobre qualquer
valor booleano: **"X mudou de falso para verdadeiro desde a última vez que
este bloco rodou?"**. Isso resolve de uma vez: debounce conceitual de botão,
"passou a ficar perto" no ultrassônico, "sinal ESP-NOW acabou de cair",
"Wi-Fi acabou de conectar". Ensina um conceito fundamental de computação
física (nível vs. borda) através de um único bloco reaproveitável — exatamente
o oposto de um bloco monolítico "botão". Classificação: **IMPORTANTE**.

### 3.4 Listas/vetores — lacuna estrutural, mas de maior custo de design

Hoje só existem variáveis escalares. Sem lista, não dá para: média móvel de
sensor, guardar sequência de posições de servo, ciclo de padrões de LED,
histórico de comandos recebidos. É um conceito de programação fundamental
("Funcionalidades fundamentais que deveriam existir mas não existem" da
pauta original) e o próximo degrau natural depois de dominar variável — mas,
diferente dos itens 3.1–3.3, exige desenho cuidadoso (Bloquin gera C++
estático, sem alocação dinâmica; a modelagem mais provável é lista de
tamanho fixo declarado, no mesmo espírito de `declarar_variavel_global`).
Classificação: **IMPORTANTE**, mas trate como projeto de design à parte, não
como adição incremental.

### 3.5 Armazenamento persistente (EEPROM/Preferences)

Guardar um valor que sobrevive a desligar a placa (recorde de jogo,
calibração salva) é um conceito pedagogicamute interessante (memória
não-volátil) mas não crítico para a maioria dos projetos de sala de aula.
Classificação: **ÚTIL**, não prioritário.

### 3.6 Matemática adicional (trigonometria etc.)

Seno/cosseno/tangente já são usados **internamente** no cálculo de pitch/roll
do MPU6050, mas nunca expostos como bloco. Utilidade real apenas em projetos
mais avançados (movimento ondulatório, desenho por servo) — a maioria dos
efeitos "legais" (respiração de LED, varredura de servo) já é construível
hoje com `mapear_valor` + `millis_atual` + `operacao_matematica`.
Classificação: **ÚTIL/ESPECÍFICO**, baixa prioridade.

## 4. LCD e displays — qual é a abstração certa

O pedido do usuário para não implementar já, só decidir a abstração. A
proposta é modelar o display de caracteres (LCD 16x2/20x4 I2C —
`LiquidCrystal_I2C`, o kit mais comum em sala de aula) **no mesmo molde já
validado pela Comunicação Serial**, porque o mental model é idêntico
("escrever uma mensagem numa saída de texto"), só que bidimensional:

| Operação | Paralelo já existente | Tipo de bloco |
|---|---|---|
| Inicializar (endereço I²C, colunas, linhas) | `mpu_iniciar` (init com endereço) | setup-only, statement |
| Limpar tela | — (novo, mas trivial) | statement |
| Posicionar cursor (coluna, linha) | — (novo — é o que faz o LCD ser 2D) | statement, dois `input_value` numéricos |
| Escrever texto na posição atual | `escrever_serial` | statement, `input_value` texto |
| Escrever valor na posição atual | `escrever_serial_valor` | statement, `input_value` number/boolean/string |

Cinco blocos, todos composição — nenhum "mostrar distância no LCD" pronto
(isso seria o mesmo erro conceitual do exemplo "detectar objeto e acender
LED" que o usuário deu). Quem decide o que escrever e onde é o projeto,
compondo com os blocos de posicionar cursor + escrever texto/valor + a
categoria de Texto do item 3.1 (para montar "Distância: " + valor).

**Não** incluir agora: OLED gráfico (SSD1306) — pixel buffer, formas,
fontes, é um escopo de "desenho" muito maior que texto em grade, e merece
avaliação própria depois. Também não incluir controle de caracteres
customizados (glifos definidos pelo usuário) — recurso real do
`LiquidCrystal_I2C`, mas específico demais para o núcleo.

Classificação da família LCD de caracteres: **IMPORTANTE** (era o exemplo
que o próprio usuário deu como lacuna clara).

Consequência de ecossistema: exigiria pelo menos um componente novo no
catálogo (`lcd-i2c-16x2`), com página de componente (como o `hc-sr04`),
entradas em `relatedBlocks`, e entrada em `COMPONENT_CATEGORIES` —
provavelmente em `modules`, já que é um breakout I2C como o MPU6050.

## 5. Comunicação sem fio — auditoria do ciclo configurar→conectar→enviar→receber→processar→responder

| Família | configurar | conectar | enviar | receber | diagnóstico | Avaliação |
|---|---|---|---|---|---|---|
| **ESP-NOW** | ✅ | ✅ (peer único) | ✅ envelope genérico | ✅ com tipo/A/B/C/sinal | ✅ iniciou?/confirmado?/inválidas/timeout | **Completo e maduro** para o escopo de 1 peer. |
| **Bluetooth clássico** | ✅ | ✅ (implícito, pareamento) | ✅ texto | ✅ texto | ✅ conectado?/disponível? | **Quase completo** — só falta a Categoria Texto (3.1) para o texto recebido virar decisão. Sem essa peça, a família está tecnicamente presente mas praticamente manca. |
| **Wi-Fi** | ✅ | ✅ | ❌ **nenhum bloco envia dado** | ❌ **nenhum bloco recebe dado** | ✅ conectado?/IP | **Incompleta.** Hoje Wi-Fi só serve para "confirmar que a placa está na rede" — não transporta informação nenhuma. É a lacuna de comunicação mais séria encontrada nesta auditoria. |

Detalhe do Wi-Fi: o ciclo pedido pelo usuário
(configurar→conectar→enviar→receber→processar→responder) está com metade
faltando. Dois caminhos plausíveis, ambos **IMPORTANTE** mas exigindo desenho
dedicado (não incremental):

1. **Cliente HTTP simples** — "fazer requisição para um endereço, guardar a
   resposta em texto" — permite consumir qualquer API/webhook, unidirecional
   e simples de expor com poucos blocos.
2. **Servidor Web simples embutido no ESP32** — provavelmente o projeto mais
   pedido por quem chega ao Wi-Fi ("controlar o LED pelo navegador do
   celular"). O modelo mais coerente com o resto do Bloquin seria
   evento/polling como o ESP-NOW: "iniciar servidor" (setup) + "chegou
   pedido em /caminho?" (booleano, como `espnow_tem_dados_novos`) +
   "responder com texto" — evitando o erro de um bloco monolítico
   "servidor web pronto com botões".

Não incluir agora: MQTT completo, portal cativo, atualização OTA, HTTPS com
certificados — infraestrutura de produção, não pedagógica.

## 6. Novos componentes de hardware a considerar

Critério do próprio usuário: comum o bastante para valer uma abstração, sem
virar catálogo de todo módulo do mercado.

| Componente | Por que é comum | Precisa de bloco dedicado? | Classificação |
|---|---|---|---|
| DHT11/DHT22 (temperatura+umidade) | Presente na maioria dos kits iniciantes; protocolo de 1 fio não é composto de I/O genérico | Sim (nova família pequena: iniciar + ler temperatura + ler umidade) | **IMPORTANTE** |
| LED endereçável (NeoPixel/WS2812) | Altamente motivador para o público infantojuvenil; comum em kits e projetos "criativos" | Sim (protocolo serial de 1 fio, biblioteca própria) | **IMPORTANTE** |
| Receptor infravermelho + controle remoto | Vem embutido em quase todo kit iniciante tipo Elegoo/SunFounder | Sim (timing de pulso, biblioteca IRremote) | **IMPORTANTE** |
| Display LCD I2C 16x2/20x4 | Ver seção 4 | Sim | **IMPORTANTE** (já coberto acima) |
| LDR, potenciômetro, sensor de chama, sensor de gás (MQ-x), sensor de umidade de solo | Todos resolvidos por leitura analógica genérica (já é o caso do LDR hoje) | **Não** — só cadastro no catálogo de componentes, sem bloco novo | Catálogo: **ÚTIL**; bloco: **DESNECESSÁRIO** |
| PIR (sensor de presença), relé, fotointerruptor | Resolvidos por leitura/escrita digital genérica | **Não** | Catálogo: **ÚTIL**; bloco: **DESNECESSÁRIO** |
| Display de 7 segmentos (TM1637) | Comum para contadores/relógios simples | Talvez, no mesmo molde de "display" da seção 4, mas depois do LCD | **ÚTIL**, prioridade menor que LCD |
| Motor de passo (28BYJ-48 + ULN2003) | Presente em alguns kits de robótica | Sequenciamento de passos não é trivialmente composto de PWM/digital | **ÚTIL**, avaliar depois dos itens essenciais |
| Teclado matricial 4x4 | Comum em kits de "cofre"/senha | Varredura de matriz não é composta de I/O genérico sem ficar avançado demais | **ÚTIL/ESPECÍFICO** |
| Cartão SD (data logging) | Útil para projetos de "coletar dados" | Depende de listas (3.4) para fazer sentido pedagógico | **ÚTIL**, depois de listas |
| Leitor RFID (RC522) | Presente em alguns kits, mas tema (controle de acesso) é nicho | Protocolo SPI específico, biblioteca própria pouco genérica | **ESPECÍFICO** |
| Câmera (ESP32-CAM) | Variante de placa específica; processamento de imagem foge do escopo pedagógico | — | **DESNECESSÁRIO** para o núcleo |
| BLE (Bluetooth Low Energy) com GATT customizado | Moderno, mas exige modelar serviços/características/UUIDs | Complexidade descartaria o "simples de usar" | **DESNECESSÁRIO** por ora — Bluetooth clássico já resolve o caso de uso pedagógico |

## 7. Abstrações genéricas que resolvem vários problemas de uma vez

Em vez de família por família, estas quatro abstrações — se bem desenhadas —
destravam a maior parte dos cenários da seção 2 de uma vez só:

1. **Categoria Texto** (comparar, concatenar, comprimento, converter) — sem
   isso, todo bloco que já devolve `String` (Bluetooth, Serial nova, MAC do
   ESP-NOW, IP do Wi-Fi) fica pela metade.
2. **Ler Serial**, no molde exato de `bt_disponivel`/`bt_ler_texto` — mesma
   API mental, zero conceito novo para o aluno que já aprendeu Bluetooth.
3. **Detecção de borda genérica** sobre qualquer booleano — resolve botão,
   threshold de sensor, mudança de conexão, tudo com um bloco.
4. **Família "display"** (posicionar cursor + escrever texto/valor) — se
   desenhada de forma agnóstica ao hardware (place cursor row/col, write),
   um display de 7 segmentos ou outro display de caractere futuro reaproveita
   o mesmo modelo mental sem reinventar uma família do zero.

## 8. Ideias explicitamente rejeitadas (fora do núcleo)

- Bloco monolítico "detectar objeto e acender LED" (ou qualquer bloco que
  funda sensor+lógica+atuador numa única peça) — contraria a filosofia
  central, esconde exatamente o raciocínio que o Bloquin quer ensinar.
- Bloco dedicado por sensor analógico simples (chama, gás, solo, LDR) — a
  leitura analógica genérica + comparação já resolve; um bloco por sensor
  infla a toolbox sem ensinar nada novo.
- Interrupções de hardware (`attachInterrupt`) — poderoso, mas foge do
  modelo de `loop()` simples e sequencial que sustenta todo o resto do
  Bloquin; risco de causar bugs incompreensíveis para o público-alvo.
- Múltiplos peers/broadcast no ESP-NOW — já documentado como fora de escopo;
  exigiria UI de lista de dispositivos.
- BLE com GATT customizado, MQTT completo, portal cativo, OTA — infra de
  produção, não de aprendizado.
- Câmera / visão computacional — processamento pesado, fora do escopo de
  "peça de eletrônica + lógica" que define o Bloquin hoje.
- Criptografia / armazenamento seguro de credenciais — tema de segurança,
  não de eletrônica educacional.
- OLED gráfico com desenho de formas/fontes — escopo de "canvas gráfico" é
  ordem de grandeza maior que texto em grade; reavaliar só depois do LCD de
  caracteres estar validado.

## 9. Blocos/famílias existentes que merecem revisão (não criação — reorganização)

- **`declarar_variavel_global` / `atribuir_variavel`**: o campo `VALOR` do
  bloco de declaração está fixado em `check: 'Number'`, mas o dropdown
  `TIPO` já oferece "Verdadeiro/Falso". Vale conferir se a extensão
  `tipagem_variavel_ext` cobre esse caso de fato ou se é uma inconsistência
  latente — e é o ponto de entrada natural para adicionar o tipo texto do
  item 3.1.
- **Categoria "Comunicação"**: hoje mistura `texto_fixo` (um valor genérico,
  reutilizado por Bluetooth/display futuro) com `escrever_serial`/
  `escrever_serial_valor` (ações específicas de Serial). Quando "Ler Serial"
  for adicionado, vale considerar se essa categoria devia se chamar "Texto"
  e abrigar os blocos de manipulação de texto (item 3.1) puros, deixando
  Serial como sua própria pequena categoria — mesmo padrão já usado para
  separar ESP-NOW/Wi-Fi/Bluetooth.
- **Catálogo de componentes vs. biblioteca de blocos**: 11 componentes
  documentados contra 100 blocos — várias famílias de bloco maduras
  (Buzzer, Servo, L298N) já têm componente correspondente, mas os próprios
  blocos genéricos de E/S (usados por LED, botão, relé) não apontam para
  nenhum componente além de LED/botão. Se novos componentes analógicos
  (LDR-like) forem cadastrados só para documentação (seção 6), vale garantir
  que `relatedBlocks` aponte para os blocos genéricos corretos, não crie a
  falsa impressão de que precisam de bloco próprio.
- **Categorias vazias do catálogo** (`power`, `communication`, `tools`):
  existem na estrutura de dados mas não têm nenhum item — decidir se são
  aspiracionais (mantidas para quando houver conteúdo) ou se devem sair até
  terem uso real.

## 10. Prioridades sugeridas (não é cronograma — é ordem de alavancagem)

**Fase 1 — fecha ciclos já abertos, custo baixo, alavancagem altíssima**
1. Categoria Texto (comparar/concatenar/comprimento/converter) — item 3.1
2. Ler Serial (Uno/Nano/ESP32) — item 3.2
3. Tipo texto em variáveis — consequência direta de (1)
4. Detecção de borda genérica — item 3.3

**Fase 2 — fecha a lacuna de hardware mais citada e a de Wi-Fi**
5. Família LCD de caracteres (I2C) — seção 4
6. Wi-Fi: cliente HTTP simples **ou** servidor web simples (escolher um; ver seção 5)
7. DHT11/DHT22 (temperatura/umidade)

**Fase 3 — expande o catálogo de componentes "motivacionais"**
8. LED endereçável (NeoPixel/WS2828)
9. Receptor infravermelho + controle remoto
10. Cadastro de componentes já cobertos por blocos genéricos (LDR-like, PIR, relé) — só documentação, sem bloco novo

**Fase 4 — conceitos de programação mais avançados, exigem design próprio**
11. Listas/vetores de tamanho fixo — item 3.4
12. Armazenamento persistente (EEPROM/Preferences) — item 3.5
13. A outra metade do Wi-Fi (o que não foi escolhido na Fase 2)

Itens de matemática adicional (trig etc.), 7-segmentos, motor de passo,
teclado matricial e cartão SD ficam como backlog "quando fizer sentido",
sem entrar em fase por não resolverem nenhum dos cenários "impossível" da
seção 2 — só ampliam cenários que já são "possíveis, mesmo que artesanais".

## 11. Impacto no ecossistema, por item de Fase 1–2 (checklist ao implementar)

Qualquer item acima que vire trabalho real precisa tocar, no mínimo:

- `src/blockly/blocks.ts` — definição visual do bloco.
- `src/blockly/contracts.ts` — se for setup-only, singleton, ou exigir ESP32,
  entrar nos conjuntos certos (`SETUP_ONLY_TYPES`, `SINGLETON_BLOCKS`,
  `ESP32_ONLY_TYPES`, `PIN_RULES`) para a auditoria de fato validar.
- `src/blockly/generators.ts` — geração de C/C++, includes deduplicados.
- `src/blockly/toolbox.ts` — categoria, posição, `BLOCK_NAMES`.
- `src/features/blockDocs/registry.ts` — `summary`/`whatItDoes`/`whenToUse`
  de cada bloco novo (a tooltip nativa do Blockly vem daqui, não de
  `blocks.ts`).
- `src/features/blockDocs/examples.ts` — pelo menos um exemplo carregável
  mostrando o bloco em uso via composição real (não só citado em texto).
- `src/features/components/catalog.ts` (+ `types.ts`) — se envolver hardware
  novo (LCD, DHT11, NeoPixel, receptor IV): entrada completa de componente
  (não só o bloco), com `relatedBlocks` apontando de volta.
- `scripts/blockly-audit.ts` / cenários de `docs/blockly-system.md` — cobrir
  o bloco novo nos testes de composição, serialização e (quando fizer
  sentido) compilação real via `arduino-cli`.
- `docs/blockly-system.md` — atualizar contagem de blocos e, se for uma
  família nova relevante, uma seção própria como já existe para MPU6050 e
  comunicação sem fio.

Um bloco "existir só no código" (sem entrada em `registry.ts`, sem exemplo,
sem componente correspondente cadastrado) é precisamente o problema que o
usuário pediu para evitar.
