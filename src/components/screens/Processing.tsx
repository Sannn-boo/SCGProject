"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ScreenHeader } from "@/components/ui/primitives";
import { getJob, type JobStatus } from "@/lib/api";
import { CUT_STAGES, MEASURE_STAGES } from "@/lib/data";

const POLL_MS = 1000;

const STAGE_ICON: Record<number, string> = {
  1: "fa-brain",
  2: "fa-cloud",
  3: "fa-scissors",
  4: "fa-cubes",
  5: "fa-shield-halved",
  6: "fa-ruler-combined",
};

export function Processing({
  jobId,
  phase,
  onDone,
  onBack,
}: {
  jobId: string | null;
  phase: "measure" | "cut";
  onDone: () => void;
  onBack: () => void;
}) {
  const stages = phase === "cut" ? CUT_STAGES : MEASURE_STAGES;
  const first = stages[0].n;
  const last = stages[stages.length - 1].n;
  const [job, setJob] = useState<JobStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const done = useRef(false);

  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    if (!jobId) return;
    let live = true;

    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!live) return;
        setJob(j);
        setUnreachable(false);
        if ((j.state === "done" || j.state === "awaiting-cut") && !done.current) {
          done.current = true;
          setTimeout(onDone, 400);
        }
      } catch {
        if (live) setUnreachable(true);
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [jobId, onDone]);

  const failed = job?.state === "failed";
  const current =
    job == null || job.state === "queued"
      ? first - 1
      : job.state === "done" || job.state === "awaiting-cut"
        ? last + 1
        : job.stage;

  
  const doneCount = stages.filter((s) => s.n < current).length;
  const overallPct = Math.round((doneCount / stages.length) * 100);

  useEffect(() => {
    setAnimatedPct((prev) => Math.max(prev, overallPct));
  }, [overallPct]);

 
  useEffect(() => {
    if (failed || current > last || job?.state === "queued") return;

    const currentStageObj = stages.find((s) => s.n === current);
    if (!currentStageObj) return;

    const stepPct = 100 / stages.length; 
    const maxCreep = overallPct + stepPct - 1; 
    
    const tickRate = 0.1;
    
    const msPerTick = (currentStageObj.seconds * 1000) / (stepPct / tickRate);

    const interval = setInterval(() => {
      setAnimatedPct((prev) => {
        if (prev < maxCreep) return prev + tickRate;
        return prev;
      });
    }, msPerTick);

    return () => clearInterval(interval);
  }, [current, overallPct, failed, last, stages, job?.state]);

  return (
    <div className="fadein">
      <ScreenHeader
        tag="Processing"
        title={phase === "cut" ? "Applying Your Cut" : "Pipeline Execution"}
        desc={
          phase === "cut"
            ? "Stages 1 and 2 are not repeated — reconstruction does not depend on where the cut goes."
            : "Running automated stages — from raw images to a reconstructed, measured reference."
        }
        onBack={onBack}
      />

      <div style={{ display: "grid", gap: 16, maxWidth: 680, margin: "0 auto" }}>
        {job?.state === "queued" && job.queue > 0 && (
          <div style={{ font: "500 12px/1 var(--sans)", color: "var(--warn)", textAlign: "center", background: "color-mix(in srgb, var(--warn) 10%, transparent)", padding: "8px 16px", borderRadius: "999px", width: "fit-content", margin: "0 auto" }}>
            <i className="fas fa-hourglass-half" style={{ marginRight: "6px" }}></i>
            Queued behind {job.queue} process(es)
          </div>
        )}

        <div className="progress-bar-container" style={{ marginTop: "8px" }}>
          <div className="progress-bar" style={{ 
            width: `${animatedPct}%`, 
            background: failed ? "var(--bad)" : "var(--grad-accent)", 
            transition: "width 0.1s linear, background 0.3s ease" 
          }} />
        </div>
        <div className="progress-stats" style={{ marginTop: -8, marginBottom: 8 }}>
          <span className="progress-percent" style={{ color: failed ? "var(--bad-ink)" : "var(--ink)" }}>
            {Math.floor(animatedPct)}%
          </span>
          <span className="progress-eta" style={{ font: "500 13px/1 var(--sans)", color: failed ? "var(--bad-ink)" : "var(--muted)" }}>
            {failed
              ? `Stage ${job?.stage} failed`
              : current > last
                ? "Complete"
                : `Running stage ${current}…`}
          </span>
        </div>

        <div className="stages-grid">
          {stages.map((s, i) => {
            const finished =
              s.n < current || job?.state === "done" || job?.state === "awaiting-cut";
            const running = s.n === current && !failed;
            const broke = failed && s.n === job?.stage;
            const cls = broke ? "broke" : finished ? "completed" : running ? "active" : "";
            
            return (
              <div key={s.n}>
                <div className={`stage-card ${cls}`}>
                  <div className={`status-indicator ${cls}`}>
                    {broke ? "!" : finished ? <i className="fas fa-check"></i> : s.n}
                  </div>
                  <div className="stage-icon">
                    <i className={`fas ${STAGE_ICON[s.n] ?? "fa-gear"}`} />
                  </div>
                  <div className="stage-content">
                    <h3>
                      Stage {s.n} — {s.label}
                    </h3>
                    <p style={{ fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: "0.02em" }}>{s.out}</p>
                  </div>
                </div>
                
                {i < stages.length - 1 && (
                  <div className="stage-connector">
                    <div className="connector-line" style={{ background: finished ? "var(--ok)" : "var(--line)" }} />
                    <div className="connector-arrow" style={{ color: finished ? "var(--ok)" : "var(--muted)" }}>
                      <i className="fas fa-arrow-down" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Error Panels ── */}
        {failed && (
          <div className="fadein" style={{
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
            marginTop: "16px"
          }}>
            <div style={{ fontSize: "1.5rem", color: "var(--bad-ink)", marginTop: "2px" }}>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 16px/1.4 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
                Stage {job?.stage} Failed
              </div>
              <div style={{ font: "400 14px/1.6 var(--sans)", color: "var(--muted)", marginBottom: "16px" }}>
                {job?.error}
              </div>
              {job?.log?.length ? (
                <pre
                  style={{
                    font: "400 12px/1.5 var(--mono)",
                    color: "var(--bad-ink)",
                    background: "color-mix(in srgb, var(--bad) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--bad) 15%, transparent)",
                    borderRadius: "12px",
                    padding: "16px",
                    margin: 0,
                    maxHeight: "240px",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {job.log.join("\n")}
                </pre>
              ) : null}
              <div style={{ marginTop: "20px" }}>
                <Button variant="ghost" onClick={onBack}>← Back to Input</Button>
              </div>
            </div>
          </div>
        )}

        {unreachable && !failed && (
          <div className="fadein" style={{
            background: "color-mix(in srgb, var(--warn) 5%, var(--glass))",
            backdropFilter: "blur(var(--blur))",
            WebkitBackdropFilter: "blur(var(--blur))",
            border: "1px solid color-mix(in srgb, var(--warn) 20%, transparent)",
            borderRadius: "24px",
            padding: "24px 32px",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            marginTop: "16px"
          }}>
            <div style={{ fontSize: "1.5rem", color: "#b8860b", marginTop: "2px" }}>
              <i className="fas fa-wifi"></i>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 16px/1.4 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
                Connection Lost
              </div>
              <div style={{ font: "400 14px/1.6 var(--sans)", color: "var(--muted)" }}>
                The compute service stopped answering. The run may still be going in the background — this page will automatically pick it up again if the connection returns.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}