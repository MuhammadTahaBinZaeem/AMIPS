import { AccessType } from "../memory/MemoryMap";

export class AddressError extends Error {
  readonly address: number;
  readonly access: AccessType;

  constructor(address: number, access: AccessType, message?: string) {
    super(message ?? `Unaligned ${access} access at 0x${address.toString(16)}`);
    this.address = address >>> 0;
    this.access = access;
    this.name = "AddressError";
  }
}

export class PrivilegeViolation extends Error {
  readonly address: number;
  readonly access: AccessType;

  constructor(address: number, access: AccessType, message?: string) {
    super(message ?? `Privilege violation on ${access} access at 0x${address.toString(16)}`);
    this.address = address >>> 0;
    this.access = access;
    this.name = "PrivilegeViolation";
  }
}
