"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Fades its child in from 20px below the first time it scrolls into view,
 *  then leaves it alone — the same one-shot IntersectionObserver pattern the
 *  old app.js used for `.tech-card`/`.summary-card`/`.pipeline-step`, just
 *  written once instead of copy-pasted per section.
 *
 *  Deliberately a plain wrapper with no class of its own: the animation
 *  lives on this outer div so the real card underneath keeps its own
 *  `:hover` transform untouched — an inline style here would otherwise
 *  permanently win over a CSS `:hover` rule on the same element and the
 *  card's hover-lift would stop working the moment it had ever revealed. */
export function Reveal({
  children,
  index = 0,
  step = 80,
}: {
  children: ReactNode;
  index?: number;
  step?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const delay = (index * step) / 1000;

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ${delay}s var(--ease-out), transform 0.5s ${delay}s var(--ease-out)`,
      }}
    >
      {children}
    </div>
  );
}
