"use client";

import { useEffect, useState } from "react";
import { Button, Caveat, Label, ScreenHeader } from "@/components/ui/primitives";
import { getJob } from "@/lib/api";
import type { FramingReport } from "@/lib/types";

const POLL_MS = 1000;

function displayName(source: string) {
  return source.replace(/^\d+_/, "");
}

function describeMode(mode?: string): { text: string; ideal: boolean } | null {
  if (!mode) return null;
  if (mode.includes("uncropped") || mode === "original")
    return { text: "Auto-cropped by model", ideal: false };
  if (mode === "crop-clipped")
    return { text: "Centered on reference", ideal: true };
  if (mode === "crop") return { text: "Perfectly framed", ideal: true };
  if (mode === "unbounded") return { text: "Bounds not recoverable", ideal: false };
  return { text: mode, ideal: false };
}

export function Framing({
  jobId,
  reportUrl,
  baseUrl,
  onBack,
  onContinue,
}: {
  jobId: string | null;
  reportUrl: string;
  baseUrl: string;
  onBack: () => void;
  onContinue?: (strict: boolean) => void | Promise<void>;
}) {
  const [report, setReport] = useState<FramingReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [crashed, setCrashed] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (jobId) return;
    let live = true;
    fetch(reportUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: FramingReport) => live && setReport(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [jobId, reportUrl]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;

    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!live) return;
        if (j.framing) setReport(j.framing);
        setState(j.state);
        if (j.state === "failed") setCrashed(j.error ?? "stage 0 failed");
      } catch {
        // retry on next tick
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [jobId]);

  if (crashed) {
    return (
      <div className="fadein">
        <ScreenHeader
          tag="System Error"
          title="Image Check Failed"
          desc="The pipeline process crashed unexpectedly while reading your photos."
          onBack={onBack}
        />
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div
            style={{
              background: "color-mix(in srgb, var(--bad) 5%, var(--glass))",
              backdropFilter: "blur(var(--blur))",
              WebkitBackdropFilter: "blur(var(--blur))",
              border: "1px solid color-mix(in srgb, var(--bad) 25%, transparent)",
              borderRadius: "24px",
              padding: "24px 32px",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              gap: "16px",
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "1.5rem", color: "var(--bad-ink)", marginTop: "2px" }}>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 16px/1.4 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
                System Exception
              </div>
              <div style={{ font: "400 14px/1.6 var(--sans)", color: "var(--muted)", marginBottom: "16px" }}>
                The backend service reported an execution error. This usually happens if a required dependency is missing or an internal script failed.
              </div>
              <div
                style={{
                  background: "color-mix(in srgb, var(--bad) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--bad) 15%, transparent)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  font: "400 13px/1.5 var(--mono)",
                  color: "var(--bad-ink)",
                  wordBreak: "break-all",
                }}
              >
                {crashed}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (jobId && !report) {
    return (
      <div className="fadein" style={{ display: "grid", gap: 16, maxWidth: 720, margin: "0 auto", textAlign: "center", padding: "60px 0" }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: "2rem", color: "var(--accent)", marginBottom: "16px" }}></i>
        <Label>Analyzing Image Quality...</Label>
        <div style={{ font: "400 14px/1.7 var(--sans)", color: "var(--muted)" }}>
          Locating the reference cube and target object in your photos to ensure the highest 3D accuracy.
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="fadein">
        <ScreenHeader
          tag="Connection Error"
          title="Unable to Load Report"
          desc="The framing report could not be retrieved from the server."
          onBack={onBack}
        />
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div
            style={{
              background: "var(--glass)",
              backdropFilter: "blur(var(--blur))",
              WebkitBackdropFilter: "blur(var(--blur))",
              border: "1px solid var(--glass-border)",
              borderRadius: "24px",
              padding: "24px 32px",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              gap: "16px",
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "1.5rem", color: "var(--warn)", marginTop: "2px" }}>
              <i className="fas fa-wifi"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 16px/1.4 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
                Connection Lost
              </div>
              <div style={{ font: "400 14px/1.6 var(--sans)", color: "var(--muted)" }}>
                Could not load the framing report. The server might have restarted or disconnected. Please try uploading your photos again.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const rejected = report.frames.filter((f) => (f.verdict ? f.verdict === "reject" : !f.accepted));
  const warned = report.frames.filter((f) => f.verdict === "warning");
  const shortfall = report.accepted < report.required;
  const ready = !jobId || state === "awaiting-framing";

  // Determine overall status
  const hasErrors = rejected.length > 0 || shortfall;
  const hasWarnings = warned.length > 0;
  
  // Apple-style Minimalist Theme Mapping
  let statusTheme = { 
    ink: "var(--ok-ink)", 
    icon: "fa-check-circle", 
    title: "READY FOR PROCESSING", 
    bg: "color-mix(in srgb, var(--ok) 6%, transparent)", 
    border: "color-mix(in srgb, var(--ok) 25%, transparent)"
  };
  if (hasErrors) {
    statusTheme = { 
      ink: "var(--bad-ink)", 
      icon: "fa-times-circle", 
      title: "ACTION REQUIRED", 
      bg: "color-mix(in srgb, var(--bad) 6%, transparent)", 
      border: "color-mix(in srgb, var(--bad) 25%, transparent)"
    };
  } else if (hasWarnings) {
    statusTheme = { 
      ink: "#b8860b", 
      icon: "fa-exclamation-circle", 
      title: "READY WITH WARNINGS", 
      bg: "color-mix(in srgb, var(--warn) 5%, transparent)", 
      border: "color-mix(in srgb, var(--warn) 20%, transparent)"
    };
  }

  async function go(strict: boolean) {
    if (!onContinue) return;
    setSending(true);
    setRefused(null);
    try {
      await onContinue(strict);
    } catch (e) {
      setRefused(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }

  return (
    <div className="fadein">
      <ScreenHeader
        tag="Image Quality Check"
        title="Review Selected Frames"
        desc="Our AI has evaluated your images. Please review the results below before proceeding."
        onBack={onBack}
      />

      <div style={{ display: "grid", gap: 24, maxWidth: 1040, margin: "0 auto" }}>
        
        {/* ── 1. Minimalist Center-Aligned Summary Box (Apple Style) ── */}
        <div style={{
          background: statusTheme.bg,
          border: `1px solid ${statusTheme.border}`,
          borderRadius: "24px",
          padding: "32px",
          textAlign: "center"
        }}>
          <div style={{ font: "600 12px/1 var(--sans)", color: statusTheme.ink, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <i className={`fas ${statusTheme.icon}`}></i> {statusTheme.title}
          </div>
          
          <div style={{ font: "400 14px/1.65 var(--sans)", color: "var(--ink)", margin: "0 auto", maxWidth: "700px" }}>
            <strong>{report.accepted} out of {report.submitted} photos</strong> meet the quality standards. (Minimum required: {report.required})
          </div>

          {/* Actionable Advice List - Centered */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px", alignItems: "center" }}>
            {hasErrors && (
              <div style={{ color: "var(--bad-ink)", font: "400 13.5px/1.5 var(--sans)", maxWidth: "600px" }}>
                Some photos are missing the reference cube or are too blurry. Please remove the rejected photos and re-take them.
              </div>
            )}
            {shortfall && !hasErrors && (
              <div style={{ color: "var(--bad-ink)", font: "400 13.5px/1.5 var(--sans)", maxWidth: "600px" }}>
                You need {report.required - report.accepted} more quality views to generate a complete 3D model.
              </div>
            )}
            {hasWarnings && !hasErrors && (
              <div style={{ color: "#8a6a00", font: "400 13.5px/1.5 var(--sans)", maxWidth: "600px" }}>
                {warned.length} photo(s) have minor issues (e.g., missing marker band). You can proceed, but manual cutting may be needed.
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Clean Image Grid ── */}
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {report.frames.map((f) => {
            const isReject = f.verdict === "reject" || !f.accepted;
            const isWarn = f.verdict === "warning";
            
            const badgeBg = isReject ? "var(--bad)" : isWarn ? "var(--warn)" : "var(--ok)";
            const badgeColor = isReject ? "var(--bad-ink)" : isWarn ? "#6b5200" : "var(--ok-ink)";
            const badgeText = isReject ? "REJECTED" : isWarn ? "WARNING" : "PASSED";
            const badgeIcon = isReject ? "fa-times" : isWarn ? "fa-exclamation" : "fa-check";

            return (
              <div key={f.index} style={{
                background: "var(--glass)",
                backdropFilter: "blur(var(--blur))",
                WebkitBackdropFilter: "blur(var(--blur))",
                borderRadius: "20px",
                overflow: "hidden",
                border: "1px solid var(--glass-border)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                transition: "transform 0.2s ease, box-shadow 0.2s ease"
              }}>
                {/* Image Area with Overlay Badge */}
                <div style={{ position: "relative", aspectRatio: "4/3", background: "#000" }}>
                  {f.overlay ? (
                    <button
                      onClick={() => setZoom(`${baseUrl}/${f.overlay}`)}
                      style={{ display: "block", width: "100%", height: "100%", border: 0, padding: 0, background: "transparent", cursor: "zoom-in" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${baseUrl}/${f.overlay}`}
                        alt={`${f.source} framing`}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: isReject ? 0.6 : 1 }}
                      />
                    </button>
                  ) : (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--soft)", color: "var(--muted)", fontSize: "13px" }}>
                      <i className="fas fa-image-slash" style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}></i>
                      Image unavailable
                    </div>
                  )}

                  {/* Apple-style Floating Badge */}
                  <div style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: badgeBg,
                    color: badgeColor,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    font: "700 11px/1 var(--sans)",
                    letterSpacing: "0.04em",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    backdropFilter: "blur(4px)",
                  }}>
                    <i className={`fas ${badgeIcon}`}></i> {badgeText}
                  </div>
                </div>
                
                {/* Text Description Area (Minimalist) */}
                <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                    <span style={{ font: "600 15px/1 var(--sans)", color: "var(--ink)" }}>Frame {f.index}</span>
                    <span style={{ font: "400 11px/1 var(--mono)", color: "var(--muted)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName(f.source)}
                    </span>
                  </div>

                  {f.accepted && describeMode(f.mode) && (
                    <div style={{ font: "400 13px/1.5 var(--sans)", color: "var(--muted)", marginTop: "4px" }}>
                      {describeMode(f.mode)!.text}
                    </div>
                  )}

                  {/* Clean Error/Warning Display */}
                  {f.reasons.length > 0 && (
                    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                      {f.reasons.map((reason, idx) => (
                        <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "flex-start", font: "400 12.5px/1.4 var(--sans)", color: isReject ? "var(--bad-ink)" : "#8a6a00" }}>
                          <i className="fas fa-circle" style={{ fontSize: "5px", marginTop: "6px", opacity: 0.6 }}></i>
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {refused && (
          <div style={{
            background: "color-mix(in srgb, var(--bad) 5%, var(--glass))",
            border: "1px solid var(--bad)",
            borderRadius: "16px",
            padding: "16px",
            color: "var(--bad-ink)",
            textAlign: "center",
            font: "500 14px/1.5 var(--sans)"
          }}>
            <i className="fas fa-hand-paper" style={{ marginRight: "8px" }}></i>
            Action Refused: {refused}
          </div>
        )}

        {/* ── 3. Call to Action Buttons ── */}
        {onContinue && (
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "24px", flexWrap: "wrap" }}>
            {(report.usable ?? report.all_passed) ? (
              <>
                <Button variant="ghost" onClick={onBack} disabled={sending}>
                  <i className="fas fa-camera" style={{ marginRight: "6px" }}></i> Re-take Photos
                </Button>
                <Button variant="primary" disabled={!ready || sending} onClick={() => go(true)}>
                  {ready ? "Proceed to 3D Generation →" : "Processing..."}
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={onBack} disabled={sending}>
                  <i className="fas fa-camera" style={{ marginRight: "6px" }}></i> Re-take Missing Photos
                </Button>
                <Button variant="ghost" disabled={!ready || sending} onClick={() => go(false)}>
                  {ready ? `Force Proceed (Not Recommended)` : "Processing..."}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lightbox for zooming */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "grid", placeItems: "center", zIndex: 1000, cursor: "zoom-out", padding: 24, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="framing detail" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "16px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }} />
          <div style={{ position: "absolute", bottom: "40px", color: "white", font: "500 14px var(--sans)", background: "rgba(255,255,255,0.2)", padding: "10px 20px", borderRadius: "999px", backdropFilter: "blur(4px)" }}>
            Click anywhere to close
          </div>
        </div>
      )}
    </div>
  );
}