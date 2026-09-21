"use client";

import { useEffect, useState, useRef } from "react";
import { Home } from "@/components/screens/Home";
import { Upload } from "@/components/screens/Upload";
import { Framing } from "@/components/screens/Framing";
import { Processing } from "@/components/screens/Processing";
import { Review } from "@/components/screens/Review";
import { Result } from "@/components/screens/Result";
import { THEMES, useTheme } from "@/lib/theme";
import { SAMPLES } from "@/lib/data";
import { API, jobDataset, jobPrepBase, recut, runJob } from "@/lib/api";
import type { CutPlane, SampleDataset, Screen } from "@/lib/types";

export default function Page() {
  const { theme, setTheme } = useTheme();
  const [screen, setScreenRaw] = useState<Screen>("home");
  const [dataset, setDataset] = useState<SampleDataset>(SAMPLES[0]);
  const [job, setJob] = useState<{ id: string; frames: number } | null>(null);
  const [afterRun, setAfterRun] = useState<Screen>("review");
  const [phase, setPhase] = useState<"measure" | "cut">("measure");

  const navRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ transform: "translateX(0)", width: 0, opacity: 0 });

  const setScreen = (s: Screen, d?: SampleDataset) => {
    setScreenRaw(s);
    const ds = d ?? dataset;
    const q = new URLSearchParams({ screen: s, dataset: ds.id });
    window.history.replaceState(null, "", `?${q}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("screen") as Screen | null;
    const d = SAMPLES.find((x) => x.id === q.get("dataset"));
    if (d) setDataset(d);
    if (s && ["home", "upload", "framing", "processing", "review", "result"].includes(s)) {
      setScreenRaw(s);
    }
  }, []);
  
  const [backendUp, setBackendUp] = useState(false);

  useEffect(() => {
    if (!API) return;
    fetch(`${API}/health`, { signal: AbortSignal.timeout(2500) })
      .then((r) => setBackendUp(r.ok))
      .catch(() => setBackendUp(false));
  }, []);

  // Effect สำหรับคำนวณการสไลด์ของแคปซูลใน Navbar
  useEffect(() => {
    const updateIndicator = () => {
      if (!navRef.current) return;
      const activeBtn = navRef.current.querySelector(".nav-link.active") as HTMLElement;
      if (activeBtn) {
        setIndicator({
          transform: `translateX(${activeBtn.offsetLeft}px)`,
          width: activeBtn.offsetWidth,
          opacity: 1,
        });
      }
    };
    
    // เรียกใช้ตอนโหลดแรกเริ่ม
    updateIndicator();
    // เรียกซ้ำเล็กน้อยเผื่อฟอนต์โหลดช้าแล้วขนาดกล่องเปลี่ยน
    const timeoutId = setTimeout(updateIndicator, 50);

    // ให้คำนวณใหม่เสมอเวลาผู้ใช้ปรับขนาดหน้าจอ
    window.addEventListener("resize", updateIndicator);
    return () => {
      window.removeEventListener("resize", updateIndicator);
      clearTimeout(timeoutId);
    };
  }, [screen]); // สั่งให้ทำงานทุกครั้งที่เปลี่ยนหน้า (ตัวแปร screen เปลี่ยน)

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* ── Floating Navbar (Apple Vision OS Style) ── */}
      <nav className="floating-nav">
        <div className="nav-pill" ref={navRef}>
          <div className="nav-brand">ICT</div>
          <div className="nav-divider"></div>

          {/* แคปซูลไฮไลต์ (The Sliding Pill) */}
          <div
            className="nav-indicator"
            style={{
              transform: indicator.transform,
              width: `${indicator.width}px`,
              opacity: indicator.opacity,
            }}
          />

          <button 
            onClick={() => setScreen("home")} 
            className={`nav-link ${screen === "home" ? "active" : ""}`}>
            Home
          </button>
          <button 
            onClick={() => setScreen("upload")} 
            className={`nav-link ${screen === "upload" ? "active" : ""}`}>
            Input
          </button>
          <button 
            onClick={() => setScreen("processing")} 
            className={`nav-link ${(screen === "processing" || screen === "framing" || screen === "review") ? "active" : ""}`}>
            Processing
          </button>
          <button 
            onClick={() => setScreen("result")} 
            className={`nav-link ${screen === "result" ? "active" : ""}`}>
            Result
          </button>
        </div>
      </nav>

<main style={{ flex: 1, width: "100%" }}>
        <div
          style={{
            maxWidth: screen === "home" ? "none" : 1180,
            margin: "0 auto",
            /* ── ปรับระยะ Padding Top จาก 80px เป็น 140px เพื่อดันเนื้อหาหนี Navbar ── */
            padding:
              screen === "home"
                ? 0
                : "140px clamp(14px, 2.5vw, 28px) 60px",
          }}
        >
          {screen === "home" && (
            <Home onStartPipeline={() => setScreen("upload")} />
          )}
          {screen === "upload" && (
            <Upload
              backendUp={backendUp}
              onBack={() => setScreen("home")}
              onStart={(id, frames) => {
                setJob({ id, frames });
                setDataset(jobDataset(id, frames));
                setScreen("framing");
              }}
            />
          )}
          {screen === "framing" && (
            <Framing
              jobId={job?.id ?? null}
              reportUrl={
                job ? `${jobPrepBase(job.id)}/framing.json`
                    : `/samples/${dataset.id}/prep/framing.json`
              }
              baseUrl={job ? jobPrepBase(job.id) : `/samples/${dataset.id}/prep`}
              onBack={() => setScreen("upload")}
              onContinue={async (strict) => {
                if (!job) return setScreen("result");
                await runJob(job.id, strict);
                setPhase("measure");
                setAfterRun("review");
                setScreen("processing");
              }}
            />
          )}
          {screen === "processing" && (
            <Processing
              jobId={job?.id ?? null}
              phase={phase}
              onDone={() => setScreen(afterRun)}
              onBack={() => setScreen("upload")}
            />
          )}
          {screen === "review" && (
            <Review
              dataset={dataset}
              live={job !== null}
              onBack={() => setScreen("home")}
              onConfirm={async (planes: CutPlane[]) => {
                if (!job) return setScreen("result");
                await recut(job.id, planes);
                setPhase("cut");
                setAfterRun("result");
                setScreen("processing");
              }}
            />
          )}
          {screen === "result" && (
            <Result dataset={dataset} onBack={() => setScreen("home")} />
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <span className="footer-name">ICT</span>
            <p className="footer-text">Senior Capstone Project — Software Engineering</p>
            <div className="footer-links">
              <a href="https://github.com" target="_blank" rel="noreferrer">
                <i className="fab fa-github" /> GitHub
              </a>
              <button
                onClick={() => {
                  if (screen !== "home") setScreen("home");
                  setTimeout(
                    () =>
                      document
                        .getElementById("pipeline-overview")
                        ?.scrollIntoView({ behavior: "smooth" }),
                    50,
                  );
                }}
                style={{ background: "none", border: 0, font: "inherit", color: "inherit", padding: 0 }}
              >
                <i className="fas fa-file-alt" /> Documentation
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}