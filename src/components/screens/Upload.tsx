"use client";

import { useRef, useState } from "react";
import { createJob } from "@/lib/api";
import { Button, Caveat, ScreenHeader } from "@/components/ui/primitives";

const MIN_FILES = 6;
const MAX_FILES = 12;
const VALID_EXT = [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp", ".heic", ".heif"];

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function Upload({
  onStart,
  onBack,
  backendUp,
}: {
  onStart: (jobId: string, frames: number) => void;
  onBack: () => void;
  backendUp: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragover, setDragover] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ok = files.length >= MIN_FILES && files.length <= MAX_FILES;

  function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return VALID_EXT.includes(ext);
    });
    setFiles((prev) => [...prev, ...picked]);
    setError(null);
  }

  async function send() {
    setSending(true);
    setError(null);
    setProgress(0);
    try {
      const { job_id, frames } = await createJob(files, setProgress);
      onStart(job_id, frames);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }

  const totalMB = files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);

  return (
    <div className="fadein">
      <ScreenHeader
        tag="Step 1"
        title="Upload Input Images"
        desc="Provide multi-view photographs of the target object alongside an ArUco reference cube."
        onBack={onBack}
      />

      <div style={{ display: "grid", gap: 24, maxWidth: 720, margin: "32px auto 0" }}>
        
      
        <div
          className={`upload-zone${dragover ? " dragover" : ""}`}
          onClick={() => !sending && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!sending) setDragover(true);
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragover(false);
            if (!sending) addFiles(e.dataTransfer.files);
          }}
          style={{ 
            opacity: sending ? 0.6 : 1, 
            cursor: sending ? "default" : "pointer",
            background: dragover ? "color-mix(in srgb, var(--accent) 10%, var(--glass))" : "var(--glass)",
            backdropFilter: "blur(var(--blur)) saturate(180%)",
            WebkitBackdropFilter: "blur(var(--blur)) saturate(180%)",
            border: `2px dashed ${dragover ? "var(--accent)" : "var(--glass-border)"}`,
            borderRadius: "28px",
            padding: "56px 24px",
            transition: "all 0.3s var(--ease-spring)", 
            boxShadow: dragover ? "0 20px 50px color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--shadow-sm)",
            transform: dragover ? "scale(1.01)" : "scale(1)",
          }}
        >
          <div className="upload-icon" style={{ fontSize: "2.5rem", color: dragover ? "var(--accent)" : "var(--muted)", transition: "transform 0.3s var(--ease-spring), color 0.3s ease", transform: dragover ? "translateY(-6px) scale(1.1)" : "translateY(0)" }}>
            <i className="fas fa-cloud-arrow-up" />
          </div>
          <h3 style={{ font: "600 18px/1 var(--sans)", color: "var(--ink)", marginBottom: "8px" }}>
            Drop images here
          </h3>
          <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--muted)", marginBottom: "16px" }}>
            or click to browse your files
          </p>
          <span style={{ font: "500 11px/1 var(--mono)", color: "var(--muted)", padding: "6px 12px", background: "var(--soft)", borderRadius: "999px", letterSpacing: "0.04em" }}>
            JPG, PNG, HEIC, TIFF, WEBP
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            disabled={sending}
            accept="image/*,.heic,.HEIC"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <div className="preview-grid fadein">
            {files.map((f, idx) => (
              <div className="preview-item" key={`${f.name}-${idx}`} style={{ transition: "transform 0.2s ease" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt={f.name} />
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((_, i) => i !== idx));
                  }}
                >
                  <i className="fas fa-times" />
                </button>
                <span className="preview-name">{f.name}</span>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="upload-info fadein" style={{ background: "var(--glass)", border: "1px solid var(--glass-border)", borderRadius: "20px", padding: "14px 20px", backdropFilter: "blur(var(--blur))" }}>
            <div className="info-item">
              <i className="fas fa-images" />
              <span>
                {files.length} image{files.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="info-item">
              <i className="fas fa-weight-hanging" />
              <span>{totalMB.toFixed(1)} MB</span>
            </div>
            {!ok && (
              <div className="info-item" style={{ color: "var(--warn)", fontWeight: 500 }}>
                <i className="fas fa-triangle-exclamation" />
                <span>{MIN_FILES}–{MAX_FILES} photos expected</span>
              </div>
            )}
            <Button
              variant="quiet"
              disabled={sending}
              onClick={() => setFiles([])}
              style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 13, color: "var(--bad)" }}
            >
              <i className="fas fa-trash-alt" style={{ marginRight: 6 }} />
              Clear all
            </Button>
          </div>
        )}

        {sending && (
          <div className="progress-bar-container fadein" style={{ marginTop: 8 }}>
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {sending && (
          <div style={{ font: "400 12px/1.5 var(--sans)", color: "var(--muted)", marginTop: -4, textAlign: "center" }}>
            {Math.round(progress * 100)}% — uploading full-resolution photos...
          </div>
        )}

        {error && (
          <Caveat>
            <strong style={{ color: "var(--bad)" }}>Upload Failed:</strong> {error}
          </Caveat>
        )}

        {!backendUp && (
          <Caveat>
            The compute service is not reachable right now. Processing runs on a single local
            GPU — browse the precomputed sample results on Home instead, they need no server.
          </Caveat>
        )}

        <div style={{ textAlign: "center", marginTop: "24px", paddingBottom: "32px" }}>
          <Button
            variant="primary"
            onClick={send}
            disabled={!ok || !backendUp || sending}
            style={{ padding: "16px 32px", fontSize: 16, borderRadius: "999px" }}
          >
            <i className="fas fa-rocket" style={{ marginRight: 8 }} />
            {sending ? "Uploading…" : "Run Pipeline"}
          </Button>
          
        </div>
      </div>
    </div>
    
  );
}
