import { UndoManager } from "./UndoManager";

export class RedoAction {
  constructor(private readonly undoManager: UndoManager) {}

  trigger(): string | null {
    return this.undoManager.redo();
  }
}
