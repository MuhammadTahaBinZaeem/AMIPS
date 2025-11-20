export class Lexer {
  tokenize(source: string): string[] {
    return source.split(/\s+/).filter(Boolean);
  }
}
