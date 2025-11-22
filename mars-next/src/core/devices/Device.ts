export type DeviceData = number | string | Uint8Array | null;

export interface Device {
  read(offset: number): DeviceData;
  write(offset: number, value: number | string | Uint8Array): void;
}
