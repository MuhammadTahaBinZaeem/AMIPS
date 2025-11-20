# AMIPS

This repository now hosts the original Java-based MARS implementation inside [`legacy/`](legacy/).
Keeping the Java source in its own folder ensures future TypeScript work can live alongside it without interference.

## Legacy Java MARS
- Location: [`legacy/`](legacy/)
- Build: run `CreateMarsJar.bat` from the `legacy` directory (or invoke it directly; it will change into its own folder before building).

No Java sources were modified during the move; they were only relocated under the `legacy/` directory.
