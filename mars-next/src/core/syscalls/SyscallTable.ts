export class SyscallTable {
  register(name: string, handler: () => void): void {
    void name;
    handler();
  }
}
