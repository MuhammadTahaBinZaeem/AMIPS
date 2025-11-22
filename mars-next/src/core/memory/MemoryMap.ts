import { Device } from "../devices/Device";

type Mapping = {
  start: number;
  end: number;
  device: Device;
};

export class MemoryMap {
  private readonly mappings: Mapping[] = [];

  registerDevice(startAddress: number, length: number, device: Device): void {
    if (length <= 0) {
      throw new Error("Device length must be positive");
    }
    const end = startAddress + length - 1;

    const overlap = this.mappings.find(
      (mapping) => startAddress <= mapping.end && end >= mapping.start,
    );
    if (overlap) {
      throw new Error(
        `Address range 0x${startAddress.toString(16)}-0x${end.toString(16)} overlaps with existing device range 0x${overlap.start.toString(16)}-0x${overlap.end.toString(16)}`,
      );
    }

    this.mappings.push({ start: startAddress, end, device });
  }

  resolve(address: number): { device: Device; offset: number } | null {
    const mapping = this.mappings.find(
      (entry) => address >= entry.start && address <= entry.end,
    );

    if (!mapping) {
      return null;
    }

    return { device: mapping.device, offset: address - mapping.start };
  }

  read(address: number) {
    const mapping = this.resolve(address);
    if (!mapping) {
      throw new Error(`No device mapped at address 0x${address.toString(16)}`);
    }
    return mapping.device.read(mapping.offset);
  }

  write(address: number, value: number | string | Uint8Array): void {
    const mapping = this.resolve(address);
    if (!mapping) {
      throw new Error(`No device mapped at address 0x${address.toString(16)}`);
    }
    mapping.device.write(mapping.offset, value);
  }

  map(address: number): number {
    const mapping = this.resolve(address);
    return mapping ? mapping.offset : address;
  }
}
