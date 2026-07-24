// Metadados e capacidades elétricas das placas. Manter listas específicas por
// função impede, por exemplo, oferecer um pino apenas de entrada do ESP32 para
// um motor ou um pino sem PWM para o bloco de potência.
const UNO_PINS = [
  ['D2', '2'], ['D3 (PWM)', '3'], ['D4', '4'], ['D5 (PWM)', '5'],
  ['D6 (PWM)', '6'], ['D7', '7'], ['D8', '8'], ['D9 (PWM)', '9'],
  ['D10 (PWM)', '10'], ['D11 (PWM)', '11'], ['D12', '12'],
  ['D13 (LED Interno)', '13'], ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'],
  ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5'],
] as const;

const UNO_PWM_PINS = [
  ['D3 (PWM)', '3'], ['D5 (PWM)', '5'], ['D6 (PWM)', '6'],
  ['D9 (PWM)', '9'], ['D10 (PWM)', '10'], ['D11 (PWM)', '11'],
] as const;

const AVR_ANALOG_PINS = [
  ['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2'],
  ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5'],
] as const;

const NANO_ANALOG_PINS = [
  ...AVR_ANALOG_PINS,
  ['A6', 'A6'],
  ['A7', 'A7'],
] as const;

const AVR_I2C_SDA_PINS = [['A4 (SDA)', 'A4']] as const;
const AVR_I2C_SCL_PINS = [['A5 (SCL)', 'A5']] as const;

const ESP32_PINS = [
  ['GPIO 0  ⚠️ boot', '0'], ['GPIO 2  (LED)', '2'], ['GPIO 4', '4'],
  ['GPIO 5  ⚠️ boot', '5'], ['GPIO 12 ⚠️ boot', '12'], ['GPIO 13', '13'],
  ['GPIO 14', '14'], ['GPIO 15 ⚠️ boot', '15'], ['GPIO 16', '16'],
  ['GPIO 17', '17'], ['GPIO 18', '18'], ['GPIO 19', '19'], ['GPIO 21', '21'],
  ['GPIO 22', '22'], ['GPIO 23', '23'], ['GPIO 25', '25'], ['GPIO 26', '26'],
  ['GPIO 27', '27'], ['GPIO 32', '32'], ['GPIO 33', '33'],
  ['GPIO 34 (somente leitura)', '34'], ['GPIO 35 (somente leitura)', '35'],
  ['GPIO 36 (somente leitura)', '36'], ['GPIO 39 (somente leitura)', '39'],
] as const;

const ESP32_OUTPUT_PINS = ESP32_PINS.filter(
  ([, value]) => !['34', '35', '36', '39'].includes(value),
);

const ESP32_ANALOG_PINS = ESP32_PINS.filter(
  ([, value]) => [
    '0', '2', '4', '12', '13', '14', '15', '25', '26', '27',
    '32', '33', '34', '35', '36', '39',
  ].includes(value),
);

// O ESP32 permite remapear I²C, mas 21/22 são os pinos convencionais. Eles
// aparecem primeiro para garantir defaults diferentes e seguros no bloco.
const ESP32_I2C_SDA_PINS = [
  ['GPIO 21 (SDA recomendado)', '21'],
  ...ESP32_OUTPUT_PINS.filter(([, value]) => value !== '21'),
] as const;

const ESP32_I2C_SCL_PINS = [
  ['GPIO 22 (SCL recomendado)', '22'],
  ...ESP32_OUTPUT_PINS.filter(([, value]) => value !== '22'),
] as const;

export const BOARDS = {
  uno: {
    name: 'Arduino Uno',
    pins: UNO_PINS,
    outputPins: UNO_PINS,
    pwmPins: UNO_PWM_PINS,
    analogPins: AVR_ANALOG_PINS,
    i2cSdaPins: AVR_I2C_SDA_PINS,
    i2cSclPins: AVR_I2C_SCL_PINS,
  },
  nano: {
    name: 'Arduino Nano',
    pins: UNO_PINS,
    outputPins: UNO_PINS,
    pwmPins: UNO_PWM_PINS,
    analogPins: NANO_ANALOG_PINS,
    i2cSdaPins: AVR_I2C_SDA_PINS,
    i2cSclPins: AVR_I2C_SCL_PINS,
  },
  esp32: {
    name: 'ESP32 DevKit V1',
    pins: ESP32_PINS,
    outputPins: ESP32_OUTPUT_PINS,
    pwmPins: ESP32_OUTPUT_PINS,
    analogPins: ESP32_ANALOG_PINS,
    i2cSdaPins: ESP32_I2C_SDA_PINS,
    i2cSclPins: ESP32_I2C_SCL_PINS,
  },
} as const;

export type BoardKey = keyof typeof BOARDS;
export const BOARD_UNSET = 'unset';
