// Metadados das placas, separados da definição dos blocos para evitar
// carregar Blockly em telas que só exibem projetos.
export const BOARDS = {
  uno: { name: 'Arduino Uno', pins: [['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5', '5'], ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'], ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'], ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5']] },
  nano: { name: 'Arduino Nano', pins: [['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'], ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'], ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'], ['D13 (LED Interno)', '13'], ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5']] },
  esp32: { name: 'ESP32 DevKit V1', pins: [['GPIO 0  ⚠️ boot', '0'], ['GPIO 2  (LED)', '2'], ['GPIO 4', '4'], ['GPIO 5  ⚠️ boot', '5'], ['GPIO 12 ⚠️ boot', '12'], ['GPIO 13', '13'], ['GPIO 14', '14'], ['GPIO 15 ⚠️ boot', '15'], ['GPIO 16', '16'], ['GPIO 17', '17'], ['GPIO 18', '18'], ['GPIO 19', '19'], ['GPIO 21', '21'], ['GPIO 22', '22'], ['GPIO 23', '23'], ['GPIO 25', '25'], ['GPIO 26', '26'], ['GPIO 27', '27'], ['GPIO 32', '32'], ['GPIO 33', '33'], ['GPIO 34 (leitura)', '34'], ['GPIO 35 (leitura)', '35'], ['GPIO 36 (leitura)', '36'], ['GPIO 39 (leitura)', '39']] },
} as const;

export type BoardKey = keyof typeof BOARDS;
export const BOARD_UNSET = 'unset';
