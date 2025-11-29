import { MemoryMap } from "../../../core";

export interface MemorySegmentDescriptor {
  key: string;
  label: string;
  start: number;
  end: number;
}

export class MemoryConfiguration {
  private readonly configurationIdentifier: string;
  private readonly configurationName: string;
  private readonly configurationItemNames: string[];
  private readonly configurationItemValues: number[];

  constructor(identifier: string, name: string, items: string[], values: number[]) {
    this.configurationIdentifier = identifier;
    this.configurationName = name;
    this.configurationItemNames = items;
    this.configurationItemValues = values;
  }

  static fromMemoryMap(map: MemoryMap, identifier = "default", name = "Default"): MemoryConfiguration {
    const items = [
      "Text base address",
      "Data segment base address",
      "Extern base address",
      "Global pointer",
      "Data base address",
      "Heap base address",
      "Stack pointer",
      "Stack base address",
      "User high address",
      "Kernel base address",
      "Kernel text base address",
      "Exception handler address",
      "Kernel data base address",
      "Memory map base address",
      "Kernel high address",
      "Data segment limit address",
      "Text limit address",
      "Kernel data segment limit address",
      "Kernel text limit address",
      "Stack limit address",
      "Memory map limit address",
    ];

    const stackPointer = map.stackBase - 4;
    const kernelBase = map.ktextBase;
    const kernelHigh = map.kdataBase + map.kdataSize - 1;

    const values = [
      map.textBase,
      map.dataBase,
      map.dataBase,
      map.dataBase + 0x8000,
      map.dataBase,
      map.heapBase,
      stackPointer,
      map.stackBase,
      map.stackBase,
      kernelBase,
      map.ktextBase,
      map.ktextBase + 0x180,
      map.kdataBase,
      map.mmioBase,
      kernelHigh,
      map.dataBase + map.dataSize - 1,
      map.textBase + map.textSize - 1,
      map.kdataBase + map.kdataSize - 1,
      map.ktextBase + map.ktextSize - 1,
      map.stackBase - map.stackSize + 1,
      map.mmioBase + map.mmioSize - 1,
    ];

    return new MemoryConfiguration(identifier, name, items, values);
  }

  static createDefault(): MemoryConfiguration {
    return MemoryConfiguration.fromMemoryMap(new MemoryMap());
  }

  getConfigurationIdentifier(): string {
    return this.configurationIdentifier;
  }

  getConfigurationName(): string {
    return this.configurationName;
  }

  getConfigurationItemValues(): number[] {
    return this.configurationItemValues;
  }

  getConfigurationItemNames(): string[] {
    return this.configurationItemNames;
  }

  getTextBaseAddress(): number {
    return this.configurationItemValues[0];
  }

  getDataSegmentBaseAddress(): number {
    return this.configurationItemValues[1];
  }

  getExternBaseAddress(): number {
    return this.configurationItemValues[2];
  }

  getGlobalPointer(): number {
    return this.configurationItemValues[3];
  }

  getDataBaseAddress(): number {
    return this.configurationItemValues[4];
  }

  getHeapBaseAddress(): number {
    return this.configurationItemValues[5];
  }

  getStackPointer(): number {
    return this.configurationItemValues[6];
  }

  getStackBaseAddress(): number {
    return this.configurationItemValues[7];
  }

  getUserHighAddress(): number {
    return this.configurationItemValues[8];
  }

  getKernelBaseAddress(): number {
    return this.configurationItemValues[9];
  }

  getKernelTextBaseAddress(): number {
    return this.configurationItemValues[10];
  }

  getExceptionHandlerAddress(): number {
    return this.configurationItemValues[11];
  }

  getKernelDataBaseAddress(): number {
    return this.configurationItemValues[12];
  }

  getMemoryMapBaseAddress(): number {
    return this.configurationItemValues[13];
  }

  getKernelHighAddress(): number {
    return this.configurationItemValues[14];
  }

  getDataSegmentLimitAddress(): number {
    return this.configurationItemValues[15];
  }

  getTextLimitAddress(): number {
    return this.configurationItemValues[16];
  }

  getKernelDataSegmentLimitAddress(): number {
    return this.configurationItemValues[17];
  }

  getKernelTextLimitAddress(): number {
    return this.configurationItemValues[18];
  }

  getStackLimitAddress(): number {
    return this.configurationItemValues[19];
  }

  getMemoryMapLimitAddress(): number {
    return this.configurationItemValues[20];
  }

  describeSegments(): MemorySegmentDescriptor[] {
    return [
      {
        key: "text",
        label: "Text",
        start: this.getTextBaseAddress(),
        end: this.getTextLimitAddress(),
      },
      {
        key: "data",
        label: "Static Data",
        start: this.getDataBaseAddress(),
        end: Math.max(this.getDataBaseAddress(), this.getHeapBaseAddress() - 1),
      },
      {
        key: "heap",
        label: "Heap",
        start: this.getHeapBaseAddress(),
        end: this.getStackBaseAddress() - 1,
      },
      {
        key: "stack",
        label: "Stack",
        start: this.getStackLimitAddress(),
        end: this.getStackBaseAddress(),
      },
      {
        key: "kdata",
        label: "Kernel Data",
        start: this.getKernelDataBaseAddress(),
        end: this.getKernelDataSegmentLimitAddress(),
      },
      {
        key: "mmio",
        label: "MMIO",
        start: this.getMemoryMapBaseAddress(),
        end: this.getMemoryMapLimitAddress(),
      },
    ];
  }
}
