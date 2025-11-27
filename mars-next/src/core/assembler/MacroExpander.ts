import { Lexer } from "./Lexer";
import { MacroProcessor } from "./MacroProcessor";

export class MacroExpander {
  private readonly lexer: Lexer;
  private readonly processor: MacroProcessor;

  constructor(lexer = new Lexer()) {
    this.lexer = lexer;
    this.processor = new MacroProcessor(this.lexer);
  }

  expand(source: string): string {
    const lexed = this.lexer.tokenize(source);
    const expandedLines = this.processor.process(lexed);
    return expandedLines.join("\n");
  }
}
