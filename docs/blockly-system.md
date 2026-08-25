# Sistema de blocos do Bloquin

O editor registra 104 tipos de bloco: os dois blocos-raiz (`PREPARAR` e
`AGIR`), 100 opções visíveis na toolbox e quatro aliases antigos mantidos
apenas para abrir projetos existentes (`util_map_float`, `util_fabsf` e os
blocos ESP-NOW de pitch/roll/parar — ver "Comunicação sem fio" abaixo).

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
Variáveis, Funções e Tempo), depois Entradas e Saídas, sensores, atuadores e,
por fim, as três camadas de comunicação sem fio (ESP-NOW, Wi-Fi, Bluetooth).

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

O primeiro comando testa os 104 blocos nas três placas, round-trip de
serialização, contratos de conexão, projetos legados, presets, combinações,
deduplicação e o carregamento real (`Blockly.serialization.workspaces.load`)
de todos os 22 exemplos da Documentação de Blocos — não só a validação
textual dos IDs. O segundo também compila dez sketches reais com
`arduino-cli` (core `esp32:esp32` e `arduino:avr` instalados localmente):

| Cenário | Placa/FQBN | Cobertura principal |
| --- | --- | --- |
| `uno-fundamentals` | `arduino:avr:uno` | lógica, variáveis, matemática, tempo e I/O |
| `uno-hardware` | `arduino:avr:uno` | ultrassônico, MPU, L298N, servo e buzzer |
| `nano-io` | `arduino:avr:nano` | A7, serial e PWM |
| `esp32-io` | `esp32:esp32:esp32` | ADC 12 bits, PWM e servo |
| `esp32-transmitter` | `esp32:esp32:esp32` | ESP-NOW TX legado (pitch/roll) e MPU |
| `esp32-receiver` | `esp32:esp32:esp32` | ESP-NOW RX legado e L298N |
| `esp32-generic-transmitter` | `esp32:esp32:esp32` | MPU6050 → lógica → mensagem ESP-NOW genérica |
| `esp32-generic-receiver` | `esp32:esp32:esp32` | mensagem genérica → lógica → L298N → fail-safe |
| `esp32-wifi` | `esp32:esp32:esp32` | conectar, status e IP do Wi-Fi |
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
desenhado para poder crescer depois sem quebrar projetos existentes. Texto é
um valor reutilizável para saída serial e para Bluetooth, mas ainda não é um
tipo de variável global. Nenhum destes limites foi validado em hardware
físico — apenas por geração de código e compilação real via `arduino-cli`;
ver o relatório da auditoria arquitetural para o que precisa de teste em
placas de verdade antes de considerar o suporte "pronto para produção".
