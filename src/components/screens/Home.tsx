"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { How } from "./How";

/** The 7 stages this app actually runs, stage 0 first. Kept in sync with
 *  README.md's own stage list rather than the old static app's copy, which
 *  numbered from 1 and described a "Stage 6 — Evaluation" screenshot pass
 *  that was never part of this pipeline. */
const REAL_STAGES = [
  {
    n: 0,
    icon: "fa-camera-retro",
    title: "Framing Gate",
    desc: "Checks the cube, limb, and marker band are visible before reconstruction starts.",
  },
  {
    n: 1,
    icon: "fa-brain",
    title: "VGGT Inference",
    desc: "One neural network pass predicts 3D points and camera poses from your photos.",
  },
  {
    n: 2,
    icon: "fa-cloud",
    title: "Point Cloud Export",
    desc: "Filters points by confidence into a single coloured cloud of the scene.",
  },
  {
    n: 3,
    icon: "fa-scissors",
    title: "Clean & Segment",
    desc: "Removes the floor, finds the reference cube, and locates the cut for you to confirm.",
  },
  {
    n: 4,
    icon: "fa-cubes",
    title: "Poisson Reconstruction",
    desc: "Turns the point cloud into a solid triangle mesh.",
  },
  {
    n: 5,
    icon: "fa-shield-halved",
    title: "Watertight Repair",
    desc: "Closes gaps until the mesh forms one sealed, measurable solid.",
  },
  {
    n: 6,
    icon: "fa-ruler-combined",
    title: "Volume Measurement",
    desc: "Computes real-world volume from the mesh, scaled by the reference cube.",
  },
];

const TECH = [
  { icon: "fab fa-python", name: "Python", sub: "Core pipeline" },
  { icon: "fas fa-fire", name: "PyTorch", sub: "VGGT model" },
  { icon: "fas fa-cube", name: "Open3D", sub: "3D processing" },
  { icon: "fas fa-vector-square", name: "Trimesh", sub: "Mesh analysis" },
  { icon: "fas fa-microchip", name: "CUDA / Warp", sub: "GPU acceleration" },
  { icon: "fas fa-qrcode", name: "ArUco", sub: "Scale reference" },
];

export function Home({
  onStartPipeline,
}: {
  onStartPipeline: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const center = el.scrollLeft + el.clientWidth / 2;
      let closest = 0;
      let closestDist = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement;
        const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setActive(closest);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function goToStage(i: number) {
    const el = trackRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  return (
    <div className="fadein">
      {/* ── Hero ── */}
      <div className="container">
      <div className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <i className="fas fa-graduation-cap" />
            <span>Senior Project</span>
          </div>
          <h1 className="hero-title">
            <span className="title-line">Volume from</span>
            <span className="title-line gradient-text">Photographs</span>
          </h1>
          <p className="hero-subtitle">
            Photograph objects next to a cube of known size and create a
            closed 3D mesh with real-world volume measurements, powered by 
            a <strong>VGGT</strong> (Visual Geometry Grounded Transformer).
            No depth sensor or turntable required.
          </p>
          <div className="hero-actions">
            <Button
              variant="primary"
              onClick={onStartPipeline}
              style={{ padding: "13px 22px", fontSize: 14 }}
            >
              <i className="fas fa-play" style={{ marginRight: 8 }} />
              Start Pipeline
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                document
                  .getElementById("pipeline-overview")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              style={{ padding: "13px 22px", fontSize: 14 }}
            >
              <i className="fas fa-book-open" style={{ marginRight: 8 }} />
              Learn More
            </Button>
          </div>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">7</span>
              <span className="stat-label">Pipeline Stages</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">1.7%</span>
              <span className="stat-label">Mean Volume Error</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-cube">
            <div className="cube">
              <div className="cube-face front" />
              <div className="cube-face back" />
              <div className="cube-face right" />
              <div className="cube-face left" />
              <div className="cube-face top" />
              <div className="cube-face bottom" />
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* ── Pipeline overview ── */}
      <div className="section" id="pipeline-overview">
        <div className="container">
        <div className="section-header">
          <span className="section-tag">How It Works</span>
          <h2 className="section-title">Pipeline Overview</h2>
          <p className="section-desc">
            From raw images to a measured 3D volume in seven automated
            stages — the same stages this app actually runs, in order.
          </p>
        </div>
        <div className="pipeline-carousel">
          <button
            className="carousel-arrow prev"
            onClick={() => goToStage(Math.max(0, active - 1))}
            aria-label="Previous stage"
            style={{ opacity: active === 0 ? 0.35 : 1 }}
          >
            <i className="fas fa-chevron-left" />
          </button>

          <div className="pipeline-flow" ref={trackRef}>
            {REAL_STAGES.map((s) => (
              <div className="pipeline-step" key={s.n}>
                <div className="step-icon">
                  <i className={`fas ${s.icon}`} />
                </div>
                <div className="step-info">
                  <span className="step-number">Stage {s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            className="carousel-arrow next"
            onClick={() => goToStage(Math.min(REAL_STAGES.length - 1, active + 1))}
            aria-label="Next stage"
            style={{ opacity: active === REAL_STAGES.length - 1 ? 0.35 : 1 }}
          >
            <i className="fas fa-chevron-right" />
          </button>
        </div>

        <div className="carousel-dots">
          {REAL_STAGES.map((s, i) => (
            <button
              key={s.n}
              className={`carousel-dot${i === active ? " active" : ""}`}
              onClick={() => goToStage(i)}
              aria-label={`Go to stage ${s.n}`}
            />
          ))}
        </div>
        </div>
      </div>

      {/* ── In-depth explanation — collapsed by default so this page reads as
           an overview, not a manual. The full breakdown is one click away
           for anyone who wants it. ── */}
      <div className="section" style={{ paddingTop: 0, textAlign: "center" }}>
        <div className="container">
          <Button
            variant="ghost"
            onClick={() => setShowDetails((v) => !v)}
            style={{ padding: "11px 22px" }}
          >
            <i
              className={`fas fa-chevron-${showDetails ? "up" : "down"}`}
              style={{ marginRight: 8 }}
            />
            {showDetails ? "Hide technical details" : "View technical details"}
          </Button>
          {showDetails && (
            <div className="fadein" style={{ textAlign: "left", marginTop: 32 }}>
              <How />
            </div>
          )}
        </div>
      </div>

      {/* ── Tech stack ── */}
      <div className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Built With</span>
            <h2 className="section-title">Technology Stack</h2>
          </div>
          <div className="tech-grid">
            {TECH.map((t, i) => (
              <Reveal key={t.name} index={i}>
                <div className="tech-card">
                  <div className="tech-icon">
                    <i className={t.icon} />
                  </div>
                  <h3>{t.name}</h3>
                  <p>{t.sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
