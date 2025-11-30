export class PipelineRegister<T> {
  private current: T;
  private next: T;

  constructor(private readonly emptyValue: T) {
    this.current = emptyValue;
    this.next = emptyValue;
  }

  getCurrent(): T {
    return this.current;
  }

  setNext(value: T): void {
    this.next = value;
  }

  advance(): void {
    this.current = this.next;
    this.next = this.emptyValue;
  }

  clear(): void {
    this.current = this.emptyValue;
    this.next = this.emptyValue;
  }

  isEmpty(): boolean {
    return this.current === this.emptyValue;
  }
}
