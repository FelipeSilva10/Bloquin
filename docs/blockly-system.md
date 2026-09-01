# Sistema de blocos do Bloquin

O editor registra 137 tipos de bloco: os dois blocos-raiz (`PREPARAR` e
`AGIR`), 133 opções visíveis na toolbox e dois aliases antigos mantidos
apenas para abrir projetos existentes (`util_map_float`, `util_fabsf` — os
blocos ESP-NOW de pitch/roll/parar continuam visíveis na toolbox como um
alias de conveniência, ver "Comunicação sem fio" abaixo).

## Organização

- `src/blockly/blocks.ts`: definições visuais, extensões e tipagem dinâmica de
  variáveis.
- `src/blockly/contracts.ts`: contratos compartilhados de contexto, placa,
  pinos, dependências e tipos.
- `src/blockly/variableTypes.ts`: propagação leve dos tipos de variáveis sem
  carregar antecipadamente todas as definições visuais.
- `src/blockly/generators.ts`: geração C/C++, helpers e deduplicação.
- `src/blockly/audit.ts`: validação semântica do workspace e dos dados
  serializados.
- `src/blockly/toolbox.ts`: organização pedagógica, presets e defaults por
  placa.
- `scripts/blockly-audit.ts`: regressões de definição, composição, geração,
  matriz de sketches e carregamento real dos exemplos da Documentação.
- `scripts/run-blockly-audit.mjs`: empacota a suíte e, opcionalmente, compila os
  sketches com `arduino-cli`.

A toolbox apresenta primeiro os fundamentos (Lógica, Controle, Matemática,
Variáveis, Listas, Armazenamento, Funções e Tempo), depois Entradas e
Saídas, sensores (distância, temperatura/umidade, infravermelho, MPU6050),
atuadores (Servo, Buzzer, Display LCD, LED Endereçável, Motor DC), Texto e
Serial e, por fim, as três camadas de comunicação sem fio (ESP-NOW, Wi-Fi,
Bluetooth).

## Filosofia: composição, não blocos monolíticos

Cada camada de um projeto é um grupo de blocos independente, combinável com
qualquer outro grupo — nenhuma camada conhece as demais:

```text
Hardware/Sensor        MPU6050 (aceleração, giroscópio, temperatura, inclinação)
        ↓
Dados                   um número, um texto, um verdadeiro/falso
        ↓
Lógica                  SE...ENTÃO, comparações, variáveis
        ↓
Transporte              ESP-NOW, Wi-Fi ou Bluetooth (mensagem genérica)
        ↓
Atuador                 GPIO, servo, buzzer, motor DC
```

Na prática isso significa: o MPU6050 não "conhece" o ESP-NOW, o ESP-NOW não
"conhece" o L298N, e nenhum dos dois foi desenhado só para controle de robô.
A mesma leitura de inclinação pode ir para um display, um servo, um motor,
Bluetooth, Wi-Fi ou ESP-NOW; a mesma mensagem ESP-NOW pode carregar leitura de
sensor, comando de motor, aviso de LED ou telemetria qualquer — quem decide o
significado é o projeto, não o bloco. Quando duas abstrações realmente
precisam ficar juntas (por exemplo, os seis pinos de um L298N, que é
fisicamente um driver de dois canais), elas ficam juntas; quando não
precisam, elas são blocos separados.

### Exemplo de referência: MPU6050 → ESP-NOW → motores

`src/features/blockDocs/examples.ts` mantém dois exemplos completos
(`esp-now-transmissor-generico` e `esp-now-receptor-generico`) que resolvem o
caso de uso "luva com MPU6050 controla um robô com L298N por ESP-NOW"
inteiramente por composição — nenhum bloco novo foi criado para esse
cenário. No transmissor, a inclinação lida vira uma decisão através de um
`SE...SENÃO` comum; no receptor, o "tipo" da mensagem decide a direção
também com `SE...SENÃO`, e o fail-safe é o bloco genérico "Sem sinal por mais
de X ms?" combinado com "Parar Motores" — o mesmo mecanismo que qualquer
outro projeto ESP-NOW já tinha disponível, aplicado aqui sem nenhuma
alteração. `scripts/blockly-audit.ts` compila essa mesma composição de
verdade nos cenários `esp32-generic-transmitter`/`esp32-generic-receiver`.

## Texto e Serial

`String` já circulava por vários blocos (`bt_ler_texto`, `wifi_endereco_ip`,
`espnow_mensagem_remetente`) sem nenhum bloco capaz de operar sobre ela — a
categoria **Texto** fecha esse ciclo: `comparar_texto`, `concatenar_texto`,
`comprimento_texto` e `texto_contem` aceitam `Number`/`Boolean`/`String` nas
entradas (mesmo contrato de "O Robô Diz (valor)") e convertem tudo para
`String` antes de operar; `texto_para_numero`/`numero_para_texto` fazem a
ponte com o mundo numérico. `declarar_variavel_global` ganhou o tipo
`Texto`, então um comando recebido por Serial/Bluetooth pode ser guardado e
reaproveitado entre voltas do `AGIR`, não só usado no instante em que chega.

A categoria **Serial** separa E/S por USB (`escrever_serial`,
`escrever_serial_valor`, `serial_disponivel`, `serial_ler_texto`) do resto
do que antes era "Comunicação". `Serial.begin(115200)` já roda
incondicionalmente em todo sketch (independente de haver bloco de Serial ou
não), então `serial_disponivel`/`serial_ler_texto` funcionam em **Uno, Nano
e ESP32** sem exigir nenhum bloco de "iniciar" — ao contrário de
Bluetooth/Wi-Fi/ESP-NOW, que exigem ESP32. `serial_ler_texto` usa o mesmo
padrão de buffer que `bt_ler_texto` já usava: devolve o que já chegou até
agora, então texto digitado aos poucos pode exigir mais de uma leitura.

Também na Lógica: `mudou_para_verdadeiro` detecta borda de subida
(`falso`→`verdadeiro`) de qualquer booleano, não só de um botão — cada
instância do bloco lembra seu próprio valor anterior numa variável global
gerada a partir do id do bloco. Borda de descida não ganhou um segundo
bloco: `NÃO(x) mudou de falso para verdadeiro?` já detecta
`verdadeiro`→`falso` por composição.

## Listas e Armazenamento permanente

**Listas** (`declarar_lista_global`/`lista_definir_item`/`lista_ler_item`/
`lista_tamanho`) são vetores de tamanho fixo — `TAMANHO` é `field_number`
(escolhido no bloco), não `input_value`, porque um array em C++
(`float lista[N]`) exige `N` constante em tempo de compilação. **Sem tipo
Texto** (só Número Inteiro/Decimal/Verdadeiro-Falso): uma lista de `String`
reatribuída repetidamente em loop no AVR (2 KB de RAM) é um risco real de
fragmentação de heap — diferente da variável de texto única da Fase 1, que
só existe uma vez, não em N cópias reescritas o tempo todo. Simplificação
deliberada e documentada, não esquecimento.

Índice sempre protegido: como o nome de uma lista já é um array C++ de
verdade, `sizeof(nome)/sizeof(nome[0])` calcula o tamanho declarado em
tempo de compilação — o gerador JS não precisa de nenhum mapa nome→tamanho.
Toda leitura/escrita passa por `_bloquin_indiceLista(idx, tamanho)`, que
limita (*clamp*, não *wrap*) o índice para `[0, tamanho-1]`, mesmo padrão
de `_bloquin_limitar` já usado no resto do código gerado — nunca existe
acesso fora dos limites do array. A tipagem dinâmica de
`lista_definir_item`/`lista_ler_item` segue exatamente
`synchronizeVariableTypes` (agora `synchronizeListTypes`, em
`variableTypes.ts`), com seu próprio mapa nome→tipo — listas e variáveis
não compartilham esse mapa, mas compartilham o mesmo espaço de
identificador C++, então a auditoria rejeita uma lista com o mesmo nome de
uma variável (ou vice-versa).

**Armazenamento permanente** (`armazenamento_salvar`/`armazenamento_ler`,
só `Number`) usa chave + valor, com duas implementações bem diferentes por
trás do mesmo par de blocos — mesmo padrão de `Servo.h`/`ESP32Servo.h`:
- **AVR** (`EEPROM.h`, já embutido no core): como EEPROM não tem noção de
  "chave", o gerador varre todos os blocos de armazenamento do workspace,
  monta uma tabela `_bloquin_eepromChaves[]` com as chaves distintas
  usadas, e resolve o deslocamento de cada uma por busca (`strcmp`) nessa
  tabela pequena em tempo de execução — nenhum bloco individual precisa
  saber o deslocamento das outras chaves. As chaves entram na tabela em
  ordem alfabética (não na ordem em que os blocos aparecem no workspace):
  o deslocamento de cada uma depende só do CONJUNTO de chaves usadas no
  projeto, nunca de como os blocos estão organizados no canvas — só
  reorganizar blocos, sem mudar o programa, não pode fazer uma chave
  "roubar" o espaço gravado de outra. Ainda assim, **adicionar ou remover**
  uma chave desloca as chaves seguintes (em ordem alfabética) — os dados já
  salvos sob elas ficam ilegíveis até salvar de novo (o byte de marca evita
  ler lixo, mas não evita ler o valor salvo de outra chave). Um byte de
  marca (`0xA5`, gravado com `EEPROM.update`, que só grava se o valor
  mudou) resolve o problema do chip novo (EEPROM de fábrica tem lixo, não
  zero): sem marca, devolve o valor padrão em vez de decodificar bytes
  aleatórios. A auditoria avisa se o número de chaves distintas for grande
  o bastante para não caber na EEPROM da placa.
- **ESP32** (`Preferences.h`, já embutido no core): a própria chave vira
  chave do NVS, com valor padrão nativo (`getFloat(chave, padrao)`) — sem
  tabela de deslocamento. Limite de plataforma: chaves do `Preferences` não
  podem passar de 15 caracteres.

Nenhuma das duas famílias tem bloco de "iniciar": `EEPROM.h` não tem
`begin()`, e o `Preferences` do ESP32 abre/fecha o namespace dentro do
próprio helper a cada chamada, em vez de manter um handle global aberto
pelo sketch inteiro. Nota física, não bug: EEPROM tem vida útil limitada
(dezenas de milhares de gravações) — salvar a cada volta do `AGIR` sem
necessidade desgasta o chip; o padrão recomendado é salvar só dentro de um
`SE` que compara com o valor anterior.

## Comunicação sem fio

### ESP-NOW: transporte genérico, não exclusivo de robôs

O envelope de mensagem do ESP-NOW é `{ tipo, valorA, valorB, valorC, sinal }`
— um número de 0 a 255 para o tipo (o significado é definido pelo projeto),
até três valores numéricos e um sinal verdadeiro/falso. O mesmo formato serve
para telemetria de sensor, comando de motor, aviso de LED ou qualquer outra
troca de dados entre dois ESP32. Os blocos "Valor A/B Recebido" e "Enviar
Dados (legado)" — a API original, pensada só para pitch/roll/parar — leem e
escrevem os MESMOS campos (`valorA`→pitch, `valorB`→roll, `sinal`→parar): são
um alias de conveniência sobre o protocolo genérico, mantidos por
compatibilidade, não um segundo protocolo concorrente. Um projeto pode
misturar blocos legados e genéricos livremente; ambos compartilham a mesma
struct, o mesmo callback de recepção e o mesmo `esp_now_send`.

Diagnóstico disponível: "ESP-NOW Iniciou com Sucesso?" (inicialização e
registro de peer — não trava mais o sketch num `while(true)` silencioso em
caso de falha, ao contrário da versão anterior), "Envio Confirmado pelo
Rádio?" (usa `esp_now_register_send_cb`, o callback de status de envio da
própria API), "Remetente da Mensagem" (MAC de quem enviou, via
`esp_now_recv_info_t::src_addr`) e "Mensagens Inválidas Recebidas" (contador
de pacotes descartados por tamanho incompatível). Retransmissão automática
não foi implementada como bloco: o ESP-NOW/Wi-Fi já faz ACK e retentativa no
nível do rádio para unicast: seria inventar um mecanismo que a plataforma já
resolve.

### Wi-Fi e Bluetooth seguem a mesma filosofia

`wifi_conectar`/`wifi_esta_conectado`/`wifi_endereco_ip`/`wifi_desconectar`
conectam a uma rede comum (roteador/internet), independente do ESP-NOW —
compartilham o mesmo `#include <WiFi.h>` quando os dois aparecem no mesmo
projeto, sem duplicar o include. `wifi_conectar` é o único bloco de
"iniciar" que não é singleton nem exclusivo de `PREPARAR`: como uma rede
pode cair, o projeto precisa poder chamá-lo de novo a partir de `AGIR`.

`wifi_http_get`/`wifi_http_sucesso`/`wifi_http_resposta` completam a metade
do Wi-Fi que faltava: até aqui o Bloquin só conseguia confirmar que a placa
estava na rede, sem trocar dado algum. Seguem o mesmo padrão "ação → blocos
de leitura" do ESP-NOW/MPU6050: `wifi_http_get` faz a requisição e guarda o
resultado (`_wifi_http_ok`/`_wifi_http_resposta`), os outros dois só
consultam. A URL é `input_value` (não campo fixo, diferente de SSID/senha em
`wifi_conectar`) de propósito — é a primeira composição real entre a Fase 1
e a Fase 2: `concatenar_texto` monta uma URL com um valor de sensor dentro.
Usa `#include <HTTPClient.h>`, embutido no core do ESP32 (mesma categoria de
`WiFi.h`/`esp_now.h`/`BluetoothSerial.h`, sem instalação extra). Servidor
web (controlar a placa por um navegador) ficou de fora desta fase: o modelo
de callback do `WebServer` do ESP32 não cabe no loop síncrono do Bloquin sem
um bloco de corpo condicional novo — decisão registrada em
`docs/blockly-library-audit.md`.

`bt_iniciar`/`bt_conectado`/`bt_disponivel`/`bt_ler_texto`/`bt_enviar_texto`
usam Bluetooth clássico (`BluetoothSerial`, já incluído no core do ESP32 —
nenhuma biblioteca externa precisa ser instalada) para uma porta serial sem
fio, útil para parear com um app como "Serial Bluetooth Terminal".
**Limitação de plataforma verificada por compilação real:** o stack
Bluetooth clássico (Bluedroid) é grande; combinar Bluetooth com Wi-Fi e
ESP-NOW no mesmo sketch pode ultrapassar o espaço de programa da partição
padrão da placa, dependendo do resto do projeto. Isolado, um sketch com
Bluetooth usa cerca de 79% do espaço padrão; um sketch com Wi-Fi + ESP-NOW +
MPU6050 + Bluetooth juntos já ultrapassa 100%. Os cenários de compilação
mantêm Bluetooth isolado por esse motivo.

Todos os blocos de ESP-NOW, Wi-Fi e Bluetooth exigem uma placa ESP32 — a
auditoria (workspace e projeto serializado) e a toolbox por placa aplicam essa
regra a partir de um único conjunto (`ESP32_ONLY_TYPES`, em `contracts.ts`).

## MPU6050: acelerômetro e giroscópio não são a mesma coisa

Um único burst de 14 bytes (registradores `0x3B`–`0x48`) lê aceleração nos
três eixos, temperatura interna do chip e velocidade de rotação nos três
eixos numa só transação I²C, cacheada por 10 ms para todos os blocos de
leitura. A inclinação pronta ("Ler Inclinação Frente/Trás"/"Ler Inclinação
Lateral") usa só o acelerômetro, com a fórmula padrão do sensor (sem nenhuma
correção de eixo específica de um projeto). "Aceleração X/Y/Z" e "Rotação
X/Y/Z (Giroscópio)" expõem os dados brutos de cada sensor separadamente, para
quem precisa montar seu próprio cálculo, detectar vibração ou combinar
acelerômetro com giroscópio. `mpu_iniciar` também aceita o endereço I²C
(0x68 ou 0x69, conforme o pino AD0 do módulo) — não existe um bloco dedicado
de calibração/offset porque isso já é totalmente expressável compondo
"Variável" + "Operação Matemática" (guardar uma leitura inicial e subtraí-la
depois), sem precisar de um bloco novo.

## Display LCD e Sensor DHT11/DHT22: protocolos escritos à mão, sem biblioteca externa

Igual ao ultrassônico (`pulseIn`) e ao MPU6050 (`Wire` cru), estas duas
famílias reimplementam o protocolo do datasheet diretamente no gerador, em
vez de depender de `LiquidCrystal_I2C` ou de uma biblioteca `DHT` — o
sketch gerado só pode contar com o que já vem instalado com o pacote da
placa (`arduino:avr`/`esp32:esp32`), nunca uma biblioteca que o aluno
precisaria instalar à parte no Arduino IDE.

**Display LCD** (`lcd_iniciar`/`lcd_limpar`/`lcd_posicionar_cursor`/
`lcd_escrever_texto`/`lcd_escrever_valor`) fala com o expansor I²C PCF8574
soldado atrás de qualquer LCD "I2C 16x2" comum de kit de robótica,
implementando a sequência padrão de inicialização de 4 bits do HD44780
(nibble alto e baixo por byte, pulso no pino de Enable, offsets de linha
`{0x00,0x40,0x14,0x54}` para até 4 linhas) sobre `Wire.h`. Segue o mesmo
modelo mental de `escrever_serial`/`escrever_serial_valor` — só que 2D:
escrever sempre acontece na posição atual do cursor, movida por
`lcd_posicionar_cursor`. Como I²C é um barramento físico único, um projeto
com MPU6050 **e** Display LCD ao mesmo tempo precisa usar os mesmos pinos
SDA/SCL nos dois — a auditoria avisa quando não bate.

**Sensor DHT11/DHT22** (`dht_iniciar`/`dht_ler_temperatura`/
`dht_ler_umidade`) lê o protocolo de 1 fio do datasheet inteiramente com
`pulseIn()`: sinal de início de 18 ms em nível baixo, resposta do sensor,
40 bits medidos pela duração do nível alto de cada bit, checksum. Cacheado
por 2000 ms — os dois sensores são fisicamente lentos (não suportam mais de
~1 leitura por segundo) — mesmo espírito do cache de 10 ms do MPU6050, só
que numa escala de tempo bem maior. A diferença entre DHT11 (bytes inteiros)
e DHT22 (16 bits com sinal, dividido por 10) mora inteira dentro do helper
de leitura; os blocos de temperatura/umidade não sabem qual modelo está
conectado.

Nenhuma das duas famílias foi validada em hardware físico — só por geração
de código e compilação real via `arduino-cli` (cenário `uno-lcd-dht`), a
mesma ressalva já feita para MPU6050/HC-SR04 em "Limites deliberados"
abaixo.

## LED Endereçável e Receptor Infravermelho

**LED Endereçável** (`neopixel_iniciar`/`neopixel_definir_cor`/
`neopixel_limpar`/`neopixel_mostrar`) é a única família do Bloquin que
depende de uma biblioteca externa (`Adafruit_NeoPixel`, instalada junto com
o resto do ambiente de compilação) — exceção deliberada, não descuido: o
protocolo do WS2812 exige pulsos de ~350–900 ns com tolerância de dezenas
de nanossegundos, algo que só se consegue de forma confiável com timing
ciclo-a-ciclo específico de cada arquitetura (AVR 16 MHz vs. Xtensa 240 MHz
do ESP32) — bem diferente da folga de microssegundos a milissegundos que
permitiu reimplementar HC-SR04/MPU6050/DHT/LCD à mão. Mesmo raciocínio já
usado para `ESP32Servo.h`. `neopixel_definir_cor` só guarda a cor no buffer
da biblioteca (`setPixelColor`); só `neopixel_mostrar` (`show()`) manda a
tira física atualizar — não é complicação artificial, é o modelo real do
protocolo: o fio de dados é serial, não dá para atualizar "um LED só" sem
retransmitir a tira inteira.

**Receptor Infravermelho** (`ir_iniciar`/`ir_disponivel`/`ir_ler_codigo`)
decodifica o protocolo NEC (o mais comum em controles pequenos de kit
iniciante) inteiramente à mão sobre `pulseIn` — mesmo espírito do DHT, e
aqui por um motivo a mais: a única biblioteca de IR disponível no ambiente
(`IRremoteESP8266`) só funciona em ESP32, não em AVR; reimplementar à mão é
a única forma de oferecer o bloco também em Uno/Nano. `ir_disponivel` faz a
tentativa de decodificação de verdade (marca de liderança ~9 ms, espaço de
liderança ~4,5 ms, 32 bits medidos pela duração do espaço de cada bit) e
guarda o código; `ir_ler_codigo` só devolve o que já foi decodificado —
mesmo padrão de `bt_disponivel`/`bt_ler_texto`. O código de 32 bits é
devolvido como `unsigned long`, sem nenhuma conversão para `float` (mesmo
cuidado já usado em `millis_atual`), então comparar com "Comparar Valores"
não perde precisão. Não decodifica o quadro de repetição do NEC (botão
segurado) e, por ser 100% *polling* (sem interrupção), pode perder um
código se o `AGIR` estiver ocupado no instante exato do aperto — aceito
pelo mesmo motivo que o ESP-NOW não reinventa retransmissão.

Nenhuma das duas famílias foi validada em hardware físico — só por geração
de código e compilação real via `arduino-cli` (cenário `uno-led-ir`).

## Contratos importantes

- Entradas numéricas, lógicas e de texto recusam encaixes incompatíveis.
- O tipo da declaração de uma variável é propagado para atribuições e leituras.
  Conexões incompatíveis de projetos antigos são preservadas para recuperação,
  mas recebem um aviso e impedem o envio até serem corrigidas.
- Inicializadores que dependem do hardware são executados em `setup()`, depois
  das configurações e antes das demais ações, nunca durante a
  inicialização global do microcontrolador. Dependências entre variáveis são
  ordenadas e ciclos são recusados.
- Blocos de configuração precisam ficar diretamente em `PREPARAR`; o gerador
  os organiza antes das ações para evitar uso prematuro do hardware.
- Escritas genéricas configuram automaticamente o pino como saída quando não
  existe uma configuração explícita.
- PWM é limitado a 0–255, servo a 0–180 graus e divisão/resto por zero têm
  fallback seguro.
- Includes, objetos e funções auxiliares são emitidos uma única vez por sketch
  — inclusive `#include <WiFi.h>` quando ESP-NOW e Wi-Fi genérico coexistem.
- A auditoria detecta dependências ausentes, ordem de setup, componentes
  singleton, colisões de pino, modos de I/O incompatíveis e limitações da
  placa (inclusive para os novos blocos de Wi-Fi/Bluetooth).

No ESP32, GPIO 34–39 continuam restritos conforme sua capacidade de saída e
leituras ADC2 são recusadas quando Wi-Fi/ESP-NOW está ativo. Projetos ESP-NOW
devem assumir um papel por vez (transmissor ou receptor) — essa regra vale só
para o papel ESP-NOW; usar Wi-Fi genérico ou Bluetooth junto não é afetado.

## Validação

```bash
npm run test:blocks
npm run test:blocks:compile
```

O primeiro comando testa os 137 blocos nas três placas, round-trip de
serialização, contratos de conexão, projetos legados, presets, combinações,
deduplicação e o carregamento real (`Blockly.serialization.workspaces.load`)
de todos os 31 exemplos da Documentação de Blocos — não só a validação
textual dos IDs. O segundo também compila quinze sketches reais com
`arduino-cli` (core `esp32:esp32` e `arduino:avr` instalados localmente):

| Cenário | Placa/FQBN | Cobertura principal |
| --- | --- | --- |
| `uno-fundamentals` | `arduino:avr:uno` | lógica, variáveis, matemática, tempo e I/O |
| `uno-hardware` | `arduino:avr:uno` | ultrassônico, MPU, L298N, servo e buzzer |
| `uno-texto-serial` | `arduino:avr:uno` | variável de texto, comparar/concatenar/medir/conter texto, conversão número↔texto, leitura de Serial e detecção de borda |
| `uno-lcd-dht` | `arduino:avr:uno` | Display LCD (protocolo HD44780 à mão) e sensor DHT11/DHT22 (protocolo de 1 fio à mão) |
| `uno-led-ir` | `arduino:avr:uno` | LED endereçável (`Adafruit_NeoPixel`) e receptor infravermelho (protocolo NEC à mão) |
| `uno-listas-armazenamento` | `arduino:avr:uno` | lista de tamanho fixo (índice protegido) e armazenamento permanente (tabela de chaves do EEPROM) |
| `nano-io` | `arduino:avr:nano` | A7, serial e PWM |
| `esp32-io` | `esp32:esp32:esp32` | ADC 12 bits, PWM e servo |
| `esp32-transmitter` | `esp32:esp32:esp32` | ESP-NOW TX legado (pitch/roll) e MPU |
| `esp32-receiver` | `esp32:esp32:esp32` | ESP-NOW RX legado e L298N |
| `esp32-generic-transmitter` | `esp32:esp32:esp32` | MPU6050 → lógica → mensagem ESP-NOW genérica |
| `esp32-generic-receiver` | `esp32:esp32:esp32` | mensagem genérica → lógica → L298N → fail-safe |
| `esp32-wifi` | `esp32:esp32:esp32` | conectar, status e IP do Wi-Fi |
| `esp32-http` | `esp32:esp32:esp32` | cliente HTTP (URL montada com `concatenar_texto`) e armazenamento permanente via `Preferences` |
| `esp32-bluetooth` | `esp32:esp32:esp32` | Bluetooth clássico isolado |

Para inspecionar os `.ino` sem compilar:

```bash
node scripts/run-blockly-audit.mjs --emit-fixtures /tmp/bloquin-sketches
```

## Limites deliberados (o que ainda não existe, e por quê)

Funções continuam sem parâmetros para preservar o modelo pedagógico e a
serialização atual. O suporte específico mantém uma instância de MPU-6050,
uma configuração L298N e **um peer ESP-NOW** por projeto — múltiplos peers ou
broadcast exigiriam uma UI de lista de dispositivos, fora do escopo desta
revisão. A mensagem ESP-NOW genérica transporta números e um
verdadeiro/falso, mas não texto (`String`) — os casos de uso mapeados
(sensor, comando, telemetria) não precisaram disso, e o envelope foi
desenhado para poder crescer depois sem quebrar projetos existentes. Texto
já é um tipo de variável global (`Variável Texto`) e tem sua própria
categoria (comparar, unir, medir, conter, converter — ver "Texto e Serial"
acima), mas continua fora do envelope binário do ESP-NOW por esse mesmo
motivo. Nenhum destes limites foi validado em hardware
físico — apenas por geração de código e compilação real via `arduino-cli`;
ver o relatório da auditoria arquitetural para o que precisa de teste em
placas de verdade antes de considerar o suporte "pronto para produção".
