# Sistema de blocos do Bloquin

O editor registra 78 tipos de bloco: os dois blocos-raiz (`PREPARAR` e `AGIR`),
74 opções visíveis na toolbox e dois aliases antigos mantidos apenas para abrir
projetos existentes (`util_map_float` e `util_fabsf`).

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
- `scripts/blockly-audit.ts`: regressões de definição, composição, geração e
  matriz de sketches.
- `scripts/run-blockly-audit.mjs`: empacota a suíte e, opcionalmente, compila os
  sketches com `arduino-cli`.

A toolbox apresenta primeiro os fundamentos (Lógica, Controle, Matemática,
Variáveis, Funções e Tempo), depois Entradas e Saídas, sensores, atuadores e
comunicação.

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
- Includes, objetos e funções auxiliares são emitidos uma única vez por sketch.
- A auditoria detecta dependências ausentes, ordem de setup, componentes
  singleton, colisões de pino, modos de I/O incompatíveis e limitações da placa.

No ESP32, GPIO 34–39 continuam restritos conforme sua capacidade de saída e
leituras ADC2 são recusadas quando Wi-Fi/ESP-NOW está ativo. Projetos ESP-NOW
devem assumir um papel por vez (transmissor ou receptor).

## Validação

```bash
npm run test:blocks
npm run test:blocks:compile
```

O primeiro comando testa os 78 blocos nas três placas, round-trip de
serialização, contratos de conexão, projetos legados, presets, combinações e
deduplicação. O segundo também compila seis sketches reais:

| Cenário | Placa/FQBN | Cobertura principal |
| --- | --- | --- |
| `uno-fundamentals` | `arduino:avr:uno` | lógica, variáveis, matemática, tempo e I/O |
| `uno-hardware` | `arduino:avr:uno` | ultrassônico, MPU, L298N, servo e buzzer |
| `nano-io` | `arduino:avr:nano` | A7, serial e PWM |
| `esp32-io` | `esp32:esp32:esp32` | ADC 12 bits, PWM e servo |
| `esp32-transmitter` | `esp32:esp32:esp32` | ESP-NOW TX e MPU |
| `esp32-receiver` | `esp32:esp32:esp32` | ESP-NOW RX e L298N |

Para inspecionar os `.ino` sem compilar:

```bash
node scripts/run-blockly-audit.mjs --emit-fixtures /tmp/bloquin-sketches
```

## Limites deliberados

Funções continuam sem parâmetros para preservar o modelo pedagógico e a
serialização atual. O suporte específico mantém uma instância de MPU-6050, uma
configuração L298N e um peer ESP-NOW por projeto. Texto é um valor reutilizável
para saída serial, mas ainda não é um tipo de variável global.
