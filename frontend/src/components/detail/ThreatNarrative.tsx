import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface ThreatNarrativeProps {
  text: string;
  specimenId: string;
}

/**
 * The signature wow-moment of the drawer. Streams the narrative char-by-char
 * at 22ms ± 6ms inside a box-drawing frame, with a trailing blinking caret.
 *
 * IMPORTANT: This is the ONE place in STRATA that uses IBM Plex Sans. The
 * `font-sans` class on the streamed paragraph below is the deliberate
 * type-voice shift — instrument outside, AI reasoning inside.
 */
export function ThreatNarrative({ text, specimenId }: ThreatNarrativeProps) {
  const [shown, setShown] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (!text) {
      setShown("");
      setStreaming(false);
      return;
    }
    setSkipped(false);
    setStreaming(true);
    setShown("");
    let i = 0;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) {
        const jitter = Math.random() * 12 - 6;
        window.setTimeout(tick, 22 + jitter);
      } else {
        setStreaming(false);
      }
    }
    window.setTimeout(tick, 22);
    return () => {
      cancelled = true;
    };
  }, [text]);

  function skip() {
    setShown(text);
    setStreaming(false);
    setSkipped(true);
  }

  if (!text) {
    return (
      <section className="px-[24px] py-[16px] border-b border-hairline">
        <FrameHeader specimenId={specimenId} />
        <div className="border-l border-sediment pl-[16px] py-[8px]">
          <p
            className="font-sans italic text-[13px] leading-[1.55] text-bone-dim"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            no narrative available. specimen is active and below the ai-reasoning threshold
            (score &lt; 40).
          </p>
        </div>
        <FrameBottom />
      </section>
    );
  }

  return (
    <section className="px-[24px] py-[16px] border-b border-hairline">
      <div className="relative">
        <FrameHeader specimenId={specimenId} />
        {streaming && !skipped ? (
          <button
            type="button"
            onClick={skip}
            className={cn(
              "absolute right-0 top-0 font-mono text-[10px] leading-none",
              "text-bone-dim hover:text-bone",
            )}
            aria-label="skip typewriter"
          >
            (skip ▶)
          </button>
        ) : null}
      </div>
      <div
        className="border-l border-sediment pl-[16px] py-[8px]"
        aria-busy={streaming}
        aria-live="polite"
      >
        <p
          className="text-[14px] leading-[1.65] text-bone"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {shown}
          {streaming ? (
            <span
              className="ml-[2px] inline-block caret-blink text-blueprint"
              style={{ fontFamily: "var(--font-mono)" }}
              aria-hidden
            >
              ▮
            </span>
          ) : null}
        </p>
      </div>
      <FrameBottom />
    </section>
  );
}

function FrameHeader({ specimenId }: { specimenId: string }) {
  return (
    <div className="flex items-center gap-[6px] font-mono text-[12px] leading-none">
      <span className="frame-line">┌─</span>
      <span className="text-bone-dim font-medium">field notes / {specimenId.toLowerCase()}</span>
      <span className="frame-line flex-1 truncate" aria-hidden>
        {"─".repeat(120)}
      </span>
    </div>
  );
}

function FrameBottom() {
  return (
    <div className="frame-line font-mono text-[12px] leading-none truncate" aria-hidden>
      └{"─".repeat(140)}
    </div>
  );
}
