import React, { useEffect, useMemo, useRef } from "react";
import type { DirtyRegion } from "../../../core";

export interface BitmapDisplayWindowProps {
  width: number;
  height: number;
  buffer: Uint8Array;
  dirtyRegions: DirtyRegion[];
  onClose: () => void;
}

export function BitmapDisplayWindow({ width, height, buffer, dirtyRegions, onClose }: BitmapDisplayWindowProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  const scale = useMemo(() => {
    const maxDimension = Math.max(width, height, 1);
    return Math.max(1, Math.floor(512 / maxDimension));
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const current = imageDataRef.current;
    if (!current || current.width !== width || current.height !== height) {
      const replacement = new ImageData(width, height);
      replacement.data.set(buffer);
      imageDataRef.current = replacement;
      context.putImageData(replacement, 0, 0);
      return;
    }

    const data = current.data;
    dirtyRegions.forEach((region) => {
      for (let row = 0; row < region.height; row++) {
        const y = region.y + row;
        const start = (y * width + region.x) * 4;
        const end = start + region.width * 4;
        data.set(buffer.subarray(start, end), start);
      }
    });

    context.putImageData(current, 0, 0);
  }, [buffer, dirtyRegions, height, width]);

  const statusText = useMemo(() => `${width} × ${height} (${buffer.length / 4} pixels)`, [width, height, buffer.length]);

  return (
    <div style={overlayStyle}>
      <div style={windowStyle}>
        <header style={headerStyle}>
          <h2 style={{ margin: 0 }}>Bitmap Display</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>{statusText}</span>
            <button style={closeButtonStyle} onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0" }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
              width: width * scale,
              height: height * scale,
              imageRendering: "pixelated",
              borderRadius: "0.5rem",
              border: "1px solid #1f2937",
              backgroundColor: "#0b1220",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 20,
};

const windowStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.75rem",
  padding: "1rem",
  minWidth: "320px",
  maxWidth: "min(90vw, 1000px)",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.4)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid #1f2937",
  paddingBottom: "0.75rem",
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid #374151",
  backgroundColor: "#1f2937",
  color: "#e5e7eb",
  borderRadius: "0.5rem",
  padding: "0.35rem 0.75rem",
  cursor: "pointer",
};
