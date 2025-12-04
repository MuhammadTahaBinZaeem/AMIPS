export class UndoManager {
  private history: string[] = [];
  private index = -1;

  registerChange(newContent: string): void {
    if (this.history[this.index] === newContent) return;

    if (this.index < this.history.length - 1) {
      this.history = this.history.slice(0, this.index + 1);
    }

    this.history.push(newContent);
    this.index = this.history.length - 1;
  }

  undo(): string | null {
    if (this.index <= 0) {
      return this.history[0] ?? null;
    }

    this.index -= 1;
    return this.history[this.index] ?? null;
  }

  redo(): string | null {
    if (this.index >= this.history.length - 1) return this.history[this.index] ?? null;

    this.index += 1;
    return this.history[this.index] ?? null;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.history.length - 1;
  }

  peek(): string | null {
    if (this.index < 0) return null;
    return this.history[this.index];
  }
}
