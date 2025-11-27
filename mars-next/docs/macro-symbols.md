# Macro Symbols

Macro substitutions let you describe how a pseudo-op expands into one or more basic instructions inside `resources/PseudoOps.txt`. These helpers mirror the legacy MARS behavior so custom pseudo-ops can reuse the same template language.

## Reading `PseudoOps.txt`
- Each line describes one pseudo-op: a sample source statement (using the example-style syntax), followed by a tab-separated list of instruction templates to emit.
- Template tokens refer to positions in the source statement: operator/token 0, operands 1–3, etc. Parentheses count as tokens; commas do not.
- Unless noted, the template content is copied verbatim into the generated instructions. Register names in templates must be numeric (typically `$0` or `$1`), not aliases like `$t1`.
- Optional help text can be appended after the templates using a tab, `#`, and the description text with no intervening spaces.

## Template substitution symbols
Use these markers inside template instructions to pull values from the source pseudo-op. The `n` placeholder is the token index from the source line, and `m` represents an added constant (only the values 1–4 are valid for `m`).

| Symbol | Meaning |
| --- | --- |
| `RGn` | Substitute the register from source token `n`. |
| `NRn` | Substitute the next higher register after the one in token `n`. |
| `OPn` | Substitute the raw text of token `n`. |
| `IMM` | Substitute the first immediate (numeric) token from the source statement. If none are found, the last token is used. |
| `LLn` | Low-order 16 bits of the label address found in token `n`. |
| `LLnU` | Unsigned low-order 16 bits of the label address in token `n`. |
| `LLnPm` | Low-order 16 bits of the label address in token `n`, after adding `m`. |
| `LHn` | High-order 16 bits of the label address in token `n`; add 1 if address bit 15 is 1. |
| `LHnPm` | High-order 16 bits of the label address in token `n`, after adding `m`; then add 1 if bit 15 is 1. |
| `VLn` | Low-order 16 bits of the 32-bit value in token `n`. |
| `VLnU` | Unsigned low-order 16 bits of the 32-bit value in token `n`. |
| `VLnPm` | Low-order 16 bits of the 32-bit value in token `n`, after adding `m` to the value. |
| `VLnPmU` | Unsigned low-order 16 bits of the 32-bit value in token `n`, after adding `m` to the value. |
| `VHLn` | High-order 16 bits of the 32-bit value in token `n`. Use this if the low half is later combined with `VLnU` (e.g., with `ori $1,$1,VLnU`). |
| `VHn` | High-order 16 bits of the 32-bit value in token `n`; add 1 if the value's bit 15 is 1. Use when a later instruction uses `VLn($1)` to compute a 32-bit address. |
| `VHLnPm` | High-order 16 bits of the 32-bit value in token `n`, after adding `m` to the value (see `VHLn`). |
| `VHnPm` | High-order 16 bits of the 32-bit value in token `n`, after adding `m`; then add 1 if bit 15 is 1 (see `VHn`). |
| `LLP` | Low-order 16 bits of a label-plus-immediate expression (e.g., `label+100000`); the immediate is added before truncation. |
| `LLPU` | Unsigned variant of `LLP`. |
| `LLPPm` | Low-order 16 bits of a label-plus-immediate expression with the additional `m` addend applied before truncation. |
| `LHPA` | High-order 16 bits of a label-plus-immediate expression. |
| `LHPN` | High-order 16 bits of a label-plus-immediate expression when used by `la`; do **not** add 1 for bit 15 because the address is resolved by `ori`. |
| `LHPAPm` | High-order 16 bits of a label-plus-immediate expression with the `m` addend applied. |
| `LHL` | High-order 16 bits from the label address in token 2 of an `la` (load address) statement. |
| `LAB` | Substitute the textual label from the last token of the source statement (used by branch pseudo-ops). |
| `S32` | Substitute `32 - <last-token-constant>`; used by `ror` and `rol`. |
| `DBNOP` | Insert a delayed-branching NOP if delayed branching is enabled. |
| `BROFFnm` | Substitute `n` if delayed branching is disabled, otherwise `m`; both `n` and `m` are constant branch offsets (in words). |
| `COMPACT` | Separator between the default template and an optional 16-bit-address-optimized template. |

### Tips for defining pseudo-ops
- Place the pseudo-op mnemonic in the first column; lines that begin with whitespace are skipped.
- Give the example operand tokens realistic shapes so the parser can infer the intended token sequence (e.g., `$t1`/`$f1` for registers, `10` for 5-bit immediates, `100` for 16-bit immediates, `100000` for 32-bit immediates, and `label` for label operands).
- Remember that `$t1`-style registers in the example input are placeholders; numeric registers in templates are emitted literally unless you use `RGn`/`NRn` to mirror the caller's operands.
