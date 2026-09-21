"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Button, Caveat, Panel, ScreenHeader, Stat } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { linearScale, loadVolumes, REFERENCE_CM } from "@/lib/data";
import type { SampleDataset, VolumeRow } from "@/lib/types";

const Viewport = dynamic(
  () => import("@/components/three/Viewport").then((m) => m.Viewport),
  { ssr: false },
);
const MeshView = dynamic(
  () => import("@/components/three/MeshView").then((m) => m.MeshView),
  { ssr: false },
);

type View = "object" | "scene";

function outputFiles(dataset: SampleDataset) {
  const stl = (url: string) => url.replace(".ply", ".stl");
  return [
    { name: "leg_mesh.ply", url: dataset.meshes.leg },
    { name: "leg_mesh.stl", url: stl(dataset.meshes.leg) },
    { name: "box_mesh.ply", url: dataset.meshes.box },
    { name: "box_mesh.stl", url: stl(dataset.meshes.box) },
    { name: "scene_mesh.ply", url: dataset.meshes.scene },
    { name: "scene_mesh.stl", url: stl(dataset.meshes.scene) },
    { name: "volumes.csv", url: dataset.volumesCsv },
  ];
}

export function Result({
  dataset,
  onBack,
}: {
  dataset: SampleDataset;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<VolumeRow[] | null>(null);
  const [view, setView] = useState<View>("object");
  const [err, setErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isPlaceholder = dataset.id === "small_leg" || dataset.id === "est_325";

  useEffect(() => {
    if (isPlaceholder) return;
    loadVolumes(dataset.volumesCsv).then(setRows).catch((e) => setErr(String(e)));
  }, [dataset, isPlaceholder]);

  const scale = useMemo(() => (rows ? linearScale(rows) : null), [rows]);
  const scaleError =
    rows && scale === null
      ? "This run was measured by a Stage 6 that does not report the reference cube's edge " +
        "length, so the scene cannot be drawn to scale."
      : null;
  const obj = rows?.find((r) => !r.is_ref);
  const ref = rows?.find((r) => r.is_ref);

  const url = view === "object" ? dataset.meshes.leg : dataset.meshes.scene;
  const awaitingCut = rows != null && rows.length > 0 && obj == null;

  if (isPlaceholder) {
    return (
      <div className="fadein">
        <ScreenHeader tag="Results" title="Reconstruction Results" onBack={onBack} />
        <div style={{ display: "grid", placeItems: "center", minHeight: "55vh" }}>
          <div style={{
            background: "var(--glass)",
            backdropFilter: "blur(var(--blur))",
            WebkitBackdropFilter: "blur(var(--blur))",
            border: "1px solid var(--glass-border)",
            borderRadius: "32px",
            padding: "48px 40px",
            textAlign: "center",
            maxWidth: "520px",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ fontSize: "3.5rem", color: "var(--muted)", marginBottom: "24px", opacity: 0.4 }}>
              <i className="fas fa-box-open"></i>
            </div>
            <h3 style={{ font: "600 22px/1.2 var(--sans)", color: "var(--ink)", marginBottom: "12px", letterSpacing: "-0.02em" }}>
              No Data to Display
            </h3>
            <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--muted)", marginBottom: "32px" }}>
              There are no 3D reconstruction results available yet. Please upload your clinical images and run the pipeline to generate a volume measurement.
            </p>
            <Button variant="primary" onClick={onBack} style={{ padding: "14px 28px", fontSize: "15px", borderRadius: "999px" }}>
              <i className="fas fa-cloud-arrow-up" style={{ marginRight: "8px" }}></i>
              Go to Upload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (awaitingCut) {
    return (
      <div className="fadein">
        <ScreenHeader tag="Results" title={dataset.label} onBack={onBack} />
        <Panel style={{ maxWidth: 640, margin: "0 auto", padding: "32px", textAlign: "center", borderRadius: "24px" }}>
          <div style={{ fontSize: "2rem", color: "#b8860b", marginBottom: "16px" }}>
            <i className="fas fa-scissors"></i>
          </div>
          <div style={{ font: "600 18px/1.4 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
            Pending Manual Cut
          </div>
          <div style={{ font: "400 14px/1.7 var(--sans)", color: "var(--muted)", marginBottom: "24px" }}>
            The 3D scene is reconstructed, but the object boundaries have not been confirmed. Please go back to the <strong>Review</strong> tab, adjust the cutting plane, and confirm it to generate the final volume.
          </div>
          {ref && (
            <div style={{ font: "500 13px/1.6 var(--mono)", color: "var(--ink)", background: "var(--soft)", padding: "12px", borderRadius: "12px" }}>
              Reference Cube Scale Locked: {ref.real_vol_cm3.toFixed(0)} cm³ · {ref.height_cm.toFixed(2)} cm tall
            </div>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="fadein">
      <ScreenHeader
        tag="Results"
        title="Reconstruction Results"
        desc={`Patient Data · ${dataset.subject}`}
        onBack={onBack}
      />

      {obj && (
        <div className="result-summary" style={{ marginBottom: 24 }}>
          <Reveal index={0}>
            <div className="summary-card" style={{ borderRadius: "20px" }}>
              <div className="summary-icon">
                <i className="fas fa-ruler-combined" />
              </div>
              <div>
                <span className="summary-value" style={{ color: "var(--accent)" }}>{obj.real_vol_cm3.toFixed(1)}</span>
                <span className="summary-label">Volume (cm³)</span>
              </div>
            </div>
          </Reveal>
          <Reveal index={1}>
            <div className="summary-card" style={{ borderRadius: "20px" }}>
              <div className="summary-icon">
                <i className="fas fa-cube" />
              </div>
              <div>
                <span className="summary-value" style={{ fontSize: "1.05rem" }}>
                  {obj.height_cm.toFixed(1)}×{obj.width_cm.toFixed(1)}×{obj.depth_cm.toFixed(1)}
                </span>
                <span className="summary-label">H × W × D (cm)</span>
              </div>
            </div>
          </Reveal>
          <Reveal index={2}>
            <div className="summary-card" style={{ borderRadius: "20px" }}>
              <div className="summary-icon" style={{ color: obj.method === "watertight" ? "var(--ok)" : "var(--warn)" }}>
                <i className={obj.method === "watertight" ? "fas fa-check-circle" : "fas fa-exclamation-circle"} />
              </div>
              <div>
                <span className="summary-value" style={{ fontSize: "1.05rem" }}>
                  {obj.method === "watertight" ? "Yes" : obj.method}
                </span>
                <span className="summary-label">Watertight</span>
              </div>
            </div>
          </Reveal>
          <Reveal index={3}>
            <div className="summary-card" style={{ borderRadius: "20px" }}>
              <div className="summary-icon">
                <i className="fas fa-images" />
              </div>
              <div>
                <span className="summary-value">{dataset.frames}</span>
                <span className="summary-label">Photos Used</span>
              </div>
            </div>
          </Reveal>
        </div>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20 }}
        className="result-grid"
      >
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          {/* 3D viewer */}
          <div className="viewer-panel" style={{ borderRadius: "24px", overflow: "hidden" }}>
            <div className="viewer-header" style={{ padding: "16px 24px" }}>
              <h3 style={{ font: "600 15px/1 var(--sans)" }}>
                <i className="fas fa-cube" style={{ opacity: 0.5, marginRight: "8px" }} /> 3D Mesh Viewer
              </h3>
              <div className="viewer-controls">
                {(["object", "scene"] as View[]).map((v) => (
                  <button
                    key={v}
                    className={`viewer-btn${view === v ? " active" : ""}`}
                    onClick={() => setView(v)}
                    style={{ borderRadius: "999px", padding: "6px 14px", font: "500 12px/1 var(--sans)" }}
                  >
                    <i className={`fas ${v === "object" ? "fa-cube" : "fa-earth-americas"}`} style={{ marginRight: "6px" }} />
                    {v === "object" ? "Object Only" : "With Reference"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: "clamp(360px, 54vh, 560px)", background: "var(--soft)" }}>
              <Viewport error={scaleError ?? loadError}>
                {rows && scale !== null && (
                  <MeshView url={url} scale={scale} onLoadError={setLoadError} />
                )}
              </Viewport>
            </div>
            <div
              style={{
                padding: "12px 24px",
                borderTop: "1px solid var(--glass-border)",
                font: "400 12px/1.4 var(--sans)",
                color: "var(--muted)",
                background: "var(--glass)",
                display: "flex",
                gap: "16px"
              }}
            >
              <span><i className="fas fa-arrows-rotate" style={{ marginRight: 6 }} /> Drag to orbit</span>
              <span><i className="fas fa-search-plus" style={{ marginRight: 6 }} /> Scroll to zoom</span>
            </div>
          </div>

          {/* Volume table */}
          {rows && rows.length > 0 && (
            <div className="volume-panel" style={{ borderRadius: "24px" }}>
              <div className="volume-header" style={{ padding: "16px 24px" }}>
                <h3 style={{ font: "600 15px/1 var(--sans)" }}>
                  <i className="fas fa-table" style={{ opacity: 0.5, marginRight: "8px" }} /> Measurements
                </h3>
                <span className="volume-badge" style={{ borderRadius: "999px" }}>ArUco-calibrated</span>
              </div>
              <div className="volume-table-wrapper" style={{ padding: "0 24px 24px" }}>
                <table className="volume-table">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Height</th>
                      <th>Width</th>
                      <th>Depth</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.name}>
                        <td>
                          <span className={`object-tag ${r.is_ref ? "ref" : "obj"}`} style={{ borderRadius: "6px" }}>
                            {r.is_ref ? "Cube" : "Subject"}
                          </span>
                        </td>
                        <td>{r.height_cm.toFixed(1)}</td>
                        <td>{r.width_cm.toFixed(1)}</td>
                        <td>{r.depth_cm.toFixed(1)}</td>
                        <td>
                          <strong style={{ color: r.is_ref ? "var(--ink)" : "var(--accent)" }}>{r.real_vol_cm3.toFixed(1)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="output-panel" style={{ borderRadius: "24px", background: "var(--glass)" }}>
            <div className="output-header" style={{ padding: "16px 24px" }}>
              <h3 style={{ font: "600 15px/1 var(--sans)" }}>
                <i className="fas fa-download" style={{ opacity: 0.5, marginRight: "8px", color: "var(--accent)" }} /> Download Assets
              </h3>
            </div>
            <div className="file-tree" style={{ padding: "20px 24px 24px" }}>
              <div className="folder-children" style={{ marginLeft: 0, border: "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: 0 }}>
                {outputFiles(dataset).map((f) => (
                  <div className="file-item" key={f.name} style={{ 
                    background: "var(--panel)", 
                    padding: "10px 14px", 
                    borderRadius: "10px", 
                    border: "1px solid var(--glass-border)",
                    boxShadow: "var(--shadow-sm)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "transform 0.2s ease, border-color 0.2s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--glass-border)"}
                  >
                    <i className="fas fa-file-code" style={{ color: "var(--muted)", opacity: 0.7 }} />
                    <a href={f.url} download style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "var(--mono)", flex: 1 }}>
                      {f.name}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Reference check + errors */}
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          {err && (
            <Panel style={{ borderColor: "var(--bad)" }}>
              <div style={{ color: "var(--bad-ink)", font: "400 13px/1.5 var(--sans)" }}><i className="fas fa-times-circle"></i> {err}</div>
            </Panel>
          )}

          {obj && (
            <Panel style={{ borderRadius: "24px" }}>
              <Stat
                label="Final Computed Volume"
                value={obj.real_vol_cm3.toFixed(1)}
                unit="cm³"
                big
              />
              <div style={{ marginTop: 8 }}>
                <span style={{ font: "500 14px/1 var(--mono)", color: "var(--accent)", padding: "4px 8px", background: "color-mix(in srgb, var(--accent) 10%, transparent)", borderRadius: "6px" }}>
                  ≈ {obj.real_vol_L.toFixed(3)} L
                </span>
              </div>
            </Panel>
          )}

          {ref && (
            <Panel style={{ borderRadius: "24px", background: "color-mix(in srgb, var(--soft) 50%, transparent)" }}>
              <div style={{ font: "600 11px/1.3 var(--sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                <i className="fas fa-scale-balanced" style={{ marginRight: "4px" }}></i> Calibration Check
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
                <span style={{ font: "600 24px/1 var(--mono)", color: "var(--ink)" }}>
                  {ref.real_vol_cm3.toFixed(0)}
                </span>
                <span style={{ font: "400 13px/1 var(--mono)", color: "var(--muted)" }}>
                  vs {(REFERENCE_CM ** 3).toFixed(0)} cm³ nominal
                </span>
              </div>
              <div style={{ font: "400 12px/1.6 var(--sans)", color: "var(--muted)", marginTop: 12 }}>
                The scale factor is derived directly from the reference cube. The gap between the nominal and measured cube volume represents the system&apos;s inherent error margin.
              </div>
            </Panel>
          )}

          {dataset.nominalMl && (
            <Caveat>
              This object is labelled {dataset.nominalMl} ml, but that is its <em>fill</em>{" "}
              volume — the pipeline measures external displacement, which is a larger quantity.
              The two are not directly comparable, so no error percentage is quoted.
            </Caveat>
          )}
        </div>
      </div>

      <div className="result-actions" style={{ marginTop: 40, textAlign: "center" }}>
        <Button variant="primary" onClick={onBack} style={{ padding: "16px 32px", fontSize: "16px", borderRadius: "999px" }}>
          <i className="fas fa-rotate-left" style={{ marginRight: 8 }} />
          Process New Patient
        </Button>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .result-grid { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </div>
  );
}