import React, { useMemo, useState } from "react";
import { MemoryTable } from "../features/memory-view";
import { RegisterTable } from "../features/register-view";
import { RunToolbar } from "../features/run-control";
import { EditorView } from "../features/editor";
import { MachineState, assembleAndLoad } from "../core";

const SAMPLE_PROGRAM = `# Simple hello-style program
.data
msg: .asciiz "Hello, MARS Next!"

.text
main:
  li $v0, 4       # print string syscall
  li $a0, msg
  syscall

  li $v0, 10      # exit
  syscall`;

export function App(): React.JSX.Element {
  const [source, setSource] = useState(SAMPLE_PROGRAM);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [registers, setRegisters] = useState<number[]>(() => Array(MachineState.REGISTER_COUNT).fill(0));
  const [hi, setHi] = useState(0);
  const [lo, setLo] = useState(0);
  const [pc, setPc] = useState(0);
  const [memoryEntries, setMemoryEntries] = useState<Array<{ address: number; value: number }>>([]);

  const editor = useMemo(
    () => <EditorView value={source} onChange={setSource} />,
    [source],
  );

  const handleRun = (): void => {
    setError(null);
    try {
      setStatus("Assembling...");
      const { engine } = assembleAndLoad(source);
      setStatus("Running...");
      engine.run(2_000);

      const state = engine.getState();
      setRegisters(Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)));
      setHi(state.getHi());
      setLo(state.getLo());
      setPc(state.getProgramCounter());
      setMemoryEntries(engine.getMemory().entries());

      setStatus(state.isTerminated() ? "Program terminated" : "Execution halted");
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setError(message);
      setStatus("Encountered an error");
    }
  };

  return (
    <main
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "2rem",
        background: "#0b1220",
        minHeight: "100vh",
        color: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>MARS Next – Prototype</h1>
        <span style={{ color: "#9ca3af" }}>Dark mode by default</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <RunToolbar onRun={handleRun} status={status} />
        {error && (
          <div
            style={{
              backgroundColor: "#2b0f1c",
              color: "#fca5a5",
              border: "1px solid #7f1d1d",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
            }}
          >
            {error}
          </div>
        )}

        {editor}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <RegisterTable registers={registers} hi={hi} lo={lo} pc={pc} />
          <MemoryTable entries={memoryEntries} />
        </div>
      </div>
    </main>
  );
}
