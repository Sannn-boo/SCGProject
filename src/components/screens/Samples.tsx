"use client";

import { Button, Panel } from "@/components/ui/primitives";
import { SAMPLES } from "@/lib/data";
import type { SampleDataset } from "@/lib/types";

/** The "precomputed runs" grid — embedded in Home rather than being its own
 *  routed screen, since the old design's nav has no place for it. These are
 *  real pipeline outputs and need no backend at all. */
export function Samples({ onOpen }: { onOpen: (d: SampleDataset) => void }) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {SAMPLES.map((d) => (
          <Panel key={d.id} pad={16}>
            <div style={{ font: "700 15px/1.3 var(--sans)", color: "var(--ink)" }}>
              {d.label}
            </div>
            <div
              style={{
                font: "400 12.5px/1.5 var(--sans)",
                color: "var(--muted)",
                marginTop: 4,
              }}
            >
              {d.subject} · {d.frames} photos
            </div>
            <Button
              variant="ghost"
              onClick={() => onOpen(d)}
              style={{ marginTop: 14, width: "100%" }}
            >
              Open result
            </Button>
          </Panel>
        ))}
      </div>
      <div
        style={{
          font: "400 11.5px/1.6 var(--sans)",
          color: "var(--muted)",
          marginTop: 14,
          textAlign: "center",
        }}
      >
        These are real pipeline outputs and need no server. Uploading new
        photos requires the compute machine to be reachable.
      </div>
    </div>
  );
}
