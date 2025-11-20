export type EventHandler = (...args: unknown[]) => void;

export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }
}
