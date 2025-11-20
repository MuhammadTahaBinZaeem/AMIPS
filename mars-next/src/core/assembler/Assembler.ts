import { Lexer } from "./Lexer";
import { Parser } from "./Parser";

export class Assembler {
  private readonly lexer = new Lexer();
  private readonly parser = new Parser();

  assemble(source: string): object {
    const tokens = this.lexer.tokenize(source);
    return this.parser.parse(tokens);
  }
}
