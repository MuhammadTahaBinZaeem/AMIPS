import { UndoManager } from "./UndoManager";

export class UndoAction {
  constructor(private readonly undoManager: UndoManager) {}

  trigger(): string | null {
    return this.undoManager.undo();
  }
}
