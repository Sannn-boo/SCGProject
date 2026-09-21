"use client";

import { STAGES } from "@/lib/data";

const DETAIL: Record<number, string> = {
  1: "One forward pass of VGGT-1B produces a 3D point and a confidence value for every pixel of every photo, plus camera poses. This is the only neural step and where all the uncertainty originates.",
  2: "Points are filtered by confidence — about 55% survive — and statistical outliers removed. The result is one coloured cloud of the whole scene: floor, object, cube.",
  3: "The floor plane is removed (without it everything is connected through the ground and cannot be separated), the rest is clustered into objects, and the reference cube is identified by how cube-like and how black-and-white it is. The duplicated surface VGGT emits is collapsed and the survivors projected onto a locally fitted quadratic surface. The marker band is found using the colour Stage 0 measured from your own photographs rather than a fixed threshold, and a plane is fitted through it — which you confirm before anything is cut.",
  4: "The point cloud becomes a triangle mesh by Poisson reconstruction, which follows the points closely. Poisson carries no guarantee that the result is a single solid, so if the repair stage cannot bring the mesh to Euler characteristic 2, this stage runs again with an alpha shape — whose search selects on that property and therefore cannot fail it.",
  5: "PyMeshFix closes the boundary and removes self-intersections and non-manifold edges, then the mesh is checked: closed, and Euler characteristic 2. This is not insurance — it is what makes a Poisson mesh usable, and a mesh that still fails sends Stage 4 back to the alpha shape.",
  6: "A closed mesh has an exact volume: sum the signed tetrahedron volumes over its triangles, no voxel approximation. Real-world size comes from the reference cube — the ratio of its true 2744 cm³ to its measured mesh volume. If a mesh is not closed the stage falls back to flooding a voxel grid, which over-reads and can leak.",
};

export function How() {
  return (
    <div className="fadein" style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: 900, margin: "0 auto" }}>
      
      {/* ── Header ── */}
      <div style={{ textAlign: "center", padding: "0 20px" }}>
        <h2 style={{ font: "600 28px/1.2 var(--sans)", letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 12px 0" }}>
          Technical Deep Dive
        </h2>
        <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--muted)", margin: "0 auto", maxWidth: "600px" }}>
          A framing gate reads your photographs first, then six stages run. Only the first of them uses a neural network; everything after is geometry.
        </p>
      </div>

      {/* ── Stages List (Apple-style single sleek card with dividers) ── */}
      <div 
        style={{ 
          background: "var(--glass)", 
          backdropFilter: "blur(var(--blur))", 
          WebkitBackdropFilter: "blur(var(--blur))",
          borderRadius: "24px", 
          padding: "16px 40px", 
          boxShadow: "var(--shadow-sm)", 
          border: "1px solid var(--glass-border)" 
        }}
      >
        {STAGES.map((s, i) => (
          <div
            key={s.n}
            className="stage-detail-row"
            style={{
              padding: "32px 0",
              borderBottom: i < STAGES.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div className="stage-detail-label" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ font: "700 12px/1 var(--sans)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Stage {s.n}
              </span>
              <div style={{ font: "600 17px/1.3 var(--sans)", color: "var(--ink)" }}>
                {s.label}
              </div>
            </div>
            <p style={{ font: "400 14px/1.65 var(--sans)", color: "var(--muted)", margin: 0, maxWidth: "70ch" }}>
              {DETAIL[s.n]}
            </p>
          </div>
        ))}
      </div>

      {/* ── What this cannot yet do (Minimalist Note) ── */}
      <div 
        style={{ 
          marginTop: "16px", 
          padding: "32px", 
          background: "color-mix(in srgb, var(--warn) 5%, transparent)", 
          borderRadius: "24px", 
          border: "1px solid color-mix(in srgb, var(--warn) 20%, transparent)", 
          textAlign: "center" 
        }}
      >
        <div style={{ font: "600 12px/1 var(--sans)", color: "#b8860b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <i className="fas fa-info-circle"></i> What this cannot yet do
        </div>
        <p style={{ font: "400 14px/1.65 var(--sans)", color: "var(--muted)", margin: "0 auto", maxWidth: "700px" }}>
          Scale cannot be validated. With only one object of known size, the cube defines the scale — so it can never disagree with itself. Confirming accuracy needs a second known object: calibrate on the cube, predict the second object&apos;s size, and compare against a caliper measurement. That measurement does not exist yet.
        </p>
      </div>

    </div>
  );
}