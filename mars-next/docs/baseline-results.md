# Baseline runs against legacy MARS vs. mars-next

The `scripts/run-baseline.ts` harness collects console output, selected register snapshots, and memory dumps for a handful of reference programs. It assembles and executes the same sources with the legacy Java MARS CLI (`java -cp ../legacy Mars ...`) and the mars-next core engine, then writes the combined report to `docs/baseline-results.json`.

## How to refresh the report

```sh
# Requires Java in PATH for the legacy Mars classes
npx tsx scripts/run-baseline.ts
```

Sample sources live under `resources/samples/` and mirror the programs published on the official MARS page plus small additions to exercise syscalls, file I/O, floating-point operations, and MMIO devices.

## Summary of current results

| Sample | MARS output | mars-next result |
| --- | --- | --- |
| `fibonacci.asm` | Prints twelve Fibonacci numbers and exits with registers `$t0=0x90`, `$t1=0xe9`, `$v0=0xa`. | Fails to assemble: `Unknown instruction 'bgtz'` (no output or register state captured). |
| `syscall-mixed.asm` | Prompts, echoes `123` in decimal/hex/char, registers `$t0=0x7b`, `$v0=0xa`. | Fails to assemble due to `andi` being unrecognized. |
| `floating-point.asm` | Prints `3.75`, `-15.0`, `1.75`; floating registers set accordingly. | Assembly fails with `Unknown register f0` when loading floats. |
| `file-io.asm` | Writes and rereads `File I/O sample\n`; registers `$s0=$s1=3`, `$t0=0x10`; data and file contents match. | Runs to completion (exit via syscall 10). Register `$s1` differs (`0x4`), but the echoed buffer and virtual file contents match MARS. |
| `device-mmio.asm` | Writes to the UART display and bitmap MMIO ranges; memory dumps show control/data words and framebuffer color. | Throws `DisplayDevice write offset out of range: 1` when storing to the display control register, so no device state captured. |

Full dumps (console output, registers, memory words, and device snapshots) are recorded in `docs/baseline-results.json` for each sample.【F:docs/baseline-results.json†L1-L76】【F:docs/baseline-results.json†L125-L191】 The JSON file is meant to be regenerated whenever the simulator changes to track parity gaps over time.
