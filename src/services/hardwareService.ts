import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export const HardwareService = {
  // Listar portas USB
  async getAvailablePorts(): Promise<string[]> {
    return await invoke<string[]>('get_available_ports');
  },

  // Enviar código para a placa
  async uploadCode(codigo: string, placa: string, porta: string): Promise<void> {
    await invoke('upload_code', { codigo, placa, porta });
  },

  // Controlo do Monitor Serial
  async startSerial(porta: string): Promise<void> {
    await invoke('start_serial', { porta });
  },

  async stopSerial(): Promise<void> {
    await invoke('stop_serial');
  },

  // Escutar eventos (Listeners)
  async listenSerialMessages(callback: (payload: string) => void): Promise<UnlistenFn> {
    return await listen<string>('serial-message', (event) => callback(event.payload));
  },

  async listenSerialError(callback: (payload: string) => void): Promise<UnlistenFn> {
    return await listen<string>('serial-error', (event) => callback(event.payload));
  },

  async listenSerialReady(callback: () => void): Promise<UnlistenFn> {
    return await listen('serial-ready', () => callback());
  },

  async listenUploadResult(callback: (payload: string) => void): Promise<UnlistenFn> {
    return await listen<string>('upload-result', (event) => callback(event.payload));
  }
};
