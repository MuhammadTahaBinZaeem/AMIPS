export type DeviceData = number | string | Uint8Array | null;

export type InterruptHandler = () => void;

export interface Device {
  read(offset: number): DeviceData;
  write(offset: number, value: number | string | Uint8Array): void;
  onInterrupt?(handler: InterruptHandler): void;
}
