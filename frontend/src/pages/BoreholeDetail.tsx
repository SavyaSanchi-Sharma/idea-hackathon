/**
 * BOREHOLE DETAIL — 3-pane live monitor for one registered probe.
 *
 *   ┌──────────────────────┬────────────────────────────────────┐
 *   │                      │ ─── boring log (live raw readings) │
 *   │  horizons             │                                    │
 *   │  (live SpecimenCard) │────────────────────────────────────│
 *   │                      │ ─── interrogate the strata          │
 *   │                      │     (LLM chat, log-grounded)        │
 *   └──────────────────────┴────────────────────────────────────┘
 *
 * Endpoint cards reuse SpecimenCard (row layout) so a live horizon reads as
 * identical kin to a static catalog endpoint — the inference plane doesn't
 * distinguish them, and the UI shouldn't either.
 *
 * Chat citations like [L42] are rendered as inline chips; clicking one scrolls
 * the boring log to that line and flashes it briefly. The whole grounding
 * loop is visible: question → numbered evidence → cited answer → click → see.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import {
  getChatHealth,
  getSite,
  postChat,
  type ChatResponse,
  type WireLogEvent,
} from "@/api/sitesApi";
import { SpecimenCard } from "@/components/common/SpecimenCard";
import { SpecimenFrame } from "@/components/common/SpecimenFrame";
import { useSiteFeed } from "@/hooks/useSiteFeed";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/cn";

const CITE_GROUP_RE = /\[([^\[\]]*?L\d+[^\[\]]*?)\]/g;

export default function BoreholeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const openEndpoint = useUiStore((s) => s.openEndpoint);

  const siteQuery = useQuery({
    queryKey: ["site", id],
    queryFn: () => getSite(id!),
    enabled: !!id,
    refetchInterval: 4_000,
  });

  const feed = useSiteFeed(id);
  const [highlightSeq, setHighlightSeq] = useState<number | null>(null);

  // Build a stable index of seq -> log row for citation scroll-into-view.
  const lineRefs = useRef<Record<number, HTMLLIElement | null>>({});

  function scrollToLine(seq: number) {
    setHighlightSeq(seq);
    const el = lineRefs.current[seq];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // clear highlight after a beat
    window.setTimeout(() => setHighlightSeq((s) => (s === seq ? null : s)), 2400);
  }

  if (!id) return null;

  return (
    <div
      className="grid h-full min-h-0 gap-[12px] px-[16px] py-[12px]"
      style={{ gridTemplateColumns: "minmax(420px, 1fr) minmax(420px, 1fr)" }}
    >
      {/* LEFT — horizons (live endpoints) */}
      <section className="flex min-h-0 flex-col gap-[10px]">
        <SiteHeader
          name={siteQuery.data?.name ?? "…"}
          status={siteQuery.data?.status ?? "active"}
          wsStatus={feed.status}
          subtitle={subtitleOf(siteQuery.data)}
          onBack={() => navigate("/boreholes")}
          ingestError={feed.ingestError}
        />
        <HorizonsList
          hydrated={feed.hydrated}
          endpoints={feed.endpoints}
          onOpen={(epId) => openEndpoint(epId)}
        />
      </section>

      {/* RIGHT — boring log + chat */}
      <section
        className="grid min-h-0 gap-[12px]"
        style={{ gridTemplateRows: "1fr minmax(280px, 1fr)" }}
      >
        <BoringLogPanel
          logs={feed.logs}
          highlightSeq={highlightSeq}
          lineRefs={lineRefs}
        />
        <InterrogatePanel
          siteId={id}
          onCiteClick={(snapshotIndex, snapshot) => {
            // map snapshot index back to current log seq (raw text match)
            const line = snapshot[snapshotIndex];
            if (!line) return;
            const match = feed.logs.find(
              (l) => l.raw === line.raw && l.ts === line.ts,
            );
            if (match) scrollToLine(match.seq);
          }}
        />
      </section>
    </div>
  );
}

// ─── header strip ──────────────────────────────────────────────────────────

function subtitleOf(s: ReturnType<typeof getSite> extends Promise<infer R> ? R | undefined : undefined): string {
  if (!s) return "…";
  const src = s.source_type === "docker"
    ? `docker · ${(s.source_config as { container: string }).container}`
    : `file replay · ${(s.source_config as { path: string }).path}`;
  return `${src} · ${s.service_lane} · ${s.runtime} ${s.runtime_version}`;
}

function SiteHeader({
  name,
  status,
  wsStatus,
  subtitle,
  onBack,
  ingestError,
}: {
  name: string;
  status: string;
  wsStatus: "connecting" | "open" | "closed";
  subtitle: string;
  onBack: () => void;
  ingestError: string | null;
}) {
  const statusGlyph = status === "error" ? "✕" : "◉";
  const statusTone =
    status === "error" ? "text-critical" : status === "active" ? "text-active" : "text-sediment";
  const wsLabel =
    wsStatus === "open" ? "stream open" : wsStatus === "connecting" ? "connecting…" : "stream closed";
  const wsTone =
    wsStatus === "open" ? "text-active" : wsStatus === "connecting" ? "text-sediment" : "text-critical";
  return (
    <SpecimenFrame
      decay={status === "error" ? "critical" : "solid"}
      scanline={status === "error"}
      className="px-[16px] py-[12px]"
    >
      <div className="flex items-center gap-[14px]">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[11px] text-sediment hover:text-bone lowercase"
          title="back to boreholes"
        >
          ← boreholes
        </button>
        <span aria-hidden className={cn("font-mono text-[18px] leading-none", statusTone)}>
          {statusGlyph}
        </span>
        <div className="flex flex-col leading-tight min-w-0 flex-1">
          <span className="font-mono text-[15px] font-semibold text-bone truncate">{name}</span>
          <span className="font-mono text-[11px] text-sediment-strong lowercase truncate" title={subtitle}>
            {subtitle}
          </span>
        </div>
        <div className={cn("font-mono text-[11px] lowercase", wsTone)}>
          ⏚ {wsLabel}
        </div>
      </div>
      {ingestError ? (
        <div className="mt-[10px] border border-critical bg-critical-wash px-[10px] py-[6px]">
          <span className="font-mono text-[11px] text-critical lowercase">
            ingest error · {ingestError}
          </span>
        </div>
      ) : null}
    </SpecimenFrame>
  );
}

// ─── horizons (live endpoints list) ────────────────────────────────────────

function HorizonsList({
  hydrated,
  endpoints,
  onOpen,
}: {
  hydrated: boolean;
  endpoints: ReturnType<typeof useSiteFeed>["endpoints"];
  onOpen: (id: string) => void;
}) {
  return (
    <SpecimenFrame decay="solid" className="flex min-h-0 flex-col p-0">
      <header className="flex items-baseline justify-between px-[14px] py-[10px] border-b border-hairline">
        <span className="font-mono text-section-title text-bone lowercase">
          horizons <span className="text-sediment-strong">· n = {endpoints.length}</span>
        </span>
        <span className="font-mono text-[10px] text-sediment-strong lowercase">
          live · sorted by posture
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hydrated ? (
          <div className="px-[14px] py-[18px] font-mono text-[12px] text-sediment-strong lowercase">
            warming up · waiting for first sample…
          </div>
        ) : endpoints.length === 0 ? (
          <div className="px-[14px] py-[18px] font-mono text-[12px] text-sediment-strong lowercase">
            no horizons surfaced yet · the probe needs ~5s of telemetry to classify
          </div>
        ) : (
          <ul className="flex flex-col list-none p-0 m-0">
            {endpoints.map((ep) => (
              <li key={ep.id} className="border-b border-hairline last:border-b-0">
                <SpecimenCard
                  endpoint={ep}
                  layout="row"
                  reducedTilt
                  onOpen={onOpen}
                  className="border-0"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SpecimenFrame>
  );
}

// ─── boring log (raw live tail) ────────────────────────────────────────────

function BoringLogPanel({
  logs,
  highlightSeq,
  lineRefs,
}: {
  logs: WireLogEvent[];
  highlightSeq: number | null;
  lineRefs: React.MutableRefObject<Record<number, HTMLLIElement | null>>;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showParsed, setShowParsed] = useState(false);

  // Stick to bottom while autoFollow is on AND user hasn't scrolled up.
  useEffect(() => {
    if (!autoFollow) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, autoFollow]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoFollow(atBottom);
  }

  return (
    <SpecimenFrame decay="solid" className="flex min-h-0 flex-col p-0">
      <header className="flex items-baseline justify-between px-[14px] py-[10px] border-b border-hairline">
        <span className="font-mono text-section-title text-bone lowercase">
          boring log
          <span className="ml-[8px] text-sediment-strong">· raw live readings</span>
        </span>
        <div className="flex items-center gap-[10px]">
          <ToggleChip
            label="parsed"
            on={showParsed}
            onClick={() => setShowParsed((v) => !v)}
          />
          <ToggleChip
            label={autoFollow ? "↓ tail" : "paused"}
            on={autoFollow}
            onClick={() => setAutoFollow((v) => !v)}
          />
        </div>
      </header>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-tar font-mono text-[12px] leading-[1.45]"
      >
        {logs.length === 0 ? (
          <div className="px-[14px] py-[18px] text-sediment-strong lowercase">
            no readings yet · probe is warming up
          </div>
        ) : (
          <ul className="list-none m-0 p-0">
            {logs.map((line) => (
              <BoringLogLine
                key={line.seq}
                line={line}
                showParsed={showParsed}
                highlight={highlightSeq === line.seq}
                refCb={(el) => {
                  if (el) lineRefs.current[line.seq] = el;
                  else delete lineRefs.current[line.seq];
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </SpecimenFrame>
  );
}

function BoringLogLine({
  line,
  showParsed,
  highlight,
  refCb,
}: {
  line: WireLogEvent;
  showParsed: boolean;
  highlight: boolean;
  refCb: (el: HTMLLIElement | null) => void;
}) {
  const tone = statusTone(line.status);
  return (
    <li
      ref={refCb}
      className={cn(
        "px-[14px] py-[3px] border-l-[2px]",
        highlight ? "bg-blueprint-wash border-blueprint" : "border-transparent",
        "transition-colors duration-fast",
      )}
    >
      {showParsed && line.parsed ? (
        <span className="flex items-baseline gap-[8px]">
          <TsBadge ts={line.ts} />
          <span className={cn("min-w-[40px] font-semibold", tone)}>
            {line.method ?? "—"}
          </span>
          <span className="text-bone flex-1 truncate" title={line.path ?? ""}>
            {line.path ?? "—"}
          </span>
          <span className={cn("mono-tab", tone)}>{line.status ?? "—"}</span>
          <span className="mono-tab text-sediment">
            {line.latency_ms != null ? `${Math.round(line.latency_ms)}ms` : ""}
          </span>
        </span>
      ) : (
        <span className="flex items-baseline gap-[8px]">
          <TsBadge ts={line.ts} />
          <span className={cn("flex-1 truncate text-bone-dim", tone)} title={line.raw}>
            {line.raw}
          </span>
        </span>
      )}
    </li>
  );
}

function TsBadge({ ts }: { ts: number }) {
  return (
    <span className="font-mono text-[10px] text-sediment-strong shrink-0 mono-tab">
      {formatTs(ts)}
    </span>
  );
}

function formatTs(ts: number): string {
  if (!ts) return "--:--:--";
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function statusTone(status: number | null): string {
  if (status == null) return "text-sediment";
  if (status >= 500) return "text-critical";
  if (status === 401 || status === 403) return "text-critical";
  if (status >= 400) return "text-tier-high";
  if (status >= 300) return "text-deprecated";
  return "text-active";
}

function ToggleChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-[24px] px-[10px] rounded-xs border font-mono text-[11px] leading-none lowercase",
        "transition-colors duration-fast",
        on
          ? "border-blueprint bg-blueprint-wash text-bone"
          : "border-hairline bg-stratum text-sediment hover:text-bone",
      )}
    >
      {label}
    </button>
  );
}

// ─── interrogate (chat over logs) ──────────────────────────────────────────

interface ChatTurn {
  q: string;
  resp?: ChatResponse;
  error?: string;
  pending?: boolean;
}

function InterrogatePanel({
  siteId,
  onCiteClick,
}: {
  siteId: string;
  onCiteClick: (snapshotIndex: number, snapshot: ChatResponse["log_snapshot"]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const healthQuery = useQuery({
    queryKey: ["chat-health", siteId],
    queryFn: () => getChatHealth(siteId),
    enabled: !!siteId,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (q: string) => postChat(siteId, { q, max_lines: 120 }),
  });

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length, mutation.isPending]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    const idx = turns.length;
    setTurns((cur) => [...cur, { q, pending: true }]);
    try {
      const resp = await mutation.mutateAsync(q);
      setTurns((cur) => cur.map((t, i) => (i === idx ? { q, resp } : t)));
    } catch (err) {
      let msg = "request failed";
      if (err instanceof ApiError) {
        const body = err.body as { detail?: { hint?: string; error?: string; message?: string } } | null;
        msg = body?.detail?.hint || body?.detail?.message || body?.detail?.error || `${err.status} ${err.message}`;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setTurns((cur) => cur.map((t, i) => (i === idx ? { q, error: msg } : t)));
    }
  }

  const llmConfigured = healthQuery.data?.llm.configured ?? false;
  const modelLabel = healthQuery.data?.llm
    ? `${healthQuery.data.llm.host || "llm"} · ${healthQuery.data.llm.model || "(unset)"}`
    : "checking…";

  return (
    <SpecimenFrame decay="solid" className="flex min-h-0 flex-col p-0">
      <header className="flex items-baseline justify-between px-[14px] py-[10px] border-b border-hairline">
        <span className="font-mono text-section-title text-bone lowercase">
          <span aria-hidden className="text-blueprint mr-[6px]">⍰</span>
          interrogate the strata
        </span>
        <span
          className={cn(
            "font-mono text-[10px] lowercase",
            llmConfigured ? "text-active" : "text-sediment-strong",
          )}
        >
          {modelLabel}
        </span>
      </header>

      <div
        ref={transcriptRef}
        className="flex-1 min-h-0 overflow-y-auto px-[14px] py-[10px] flex flex-col gap-[14px]"
      >
        {turns.length === 0 ? (
          <EmptyChat configured={llmConfigured} />
        ) : (
          turns.map((t, i) => <ChatTurnView key={i} turn={t} onCite={onCiteClick} />)
        )}
        {mutation.isPending && turns[turns.length - 1]?.pending ? (
          <span className="font-mono text-[11px] text-sediment lowercase">
            ⌛ querying the formation…
          </span>
        ) : null}
      </div>

      <form onSubmit={send} className="border-t border-hairline px-[14px] py-[10px] flex gap-[8px]">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            llmConfigured
              ? "ask the logs · e.g. 'which endpoint is failing auth?'"
              : "configure ZH_LLM_API_KEY in .env to enable"
          }
          disabled={!llmConfigured || mutation.isPending}
          className={cn(
            "flex-1 h-[34px] px-[10px] border border-hairline bg-stratum text-bone",
            "font-mono text-[13px] rounded-xs placeholder:text-sediment-strong",
            "focus:outline-none focus:border-blueprint",
            "disabled:opacity-60",
          )}
        />
        <button
          type="submit"
          disabled={!llmConfigured || mutation.isPending || !question.trim()}
          className={cn(
            "h-[34px] px-[16px] rounded-xs",
            "border border-blueprint bg-tar text-blueprint",
            "font-mono text-[12px] leading-none font-medium lowercase",
            "hover:bg-blueprint-wash transition-colors duration-fast",
            "disabled:opacity-50 disabled:cursor-progress",
          )}
        >
          interrogate
        </button>
      </form>
    </SpecimenFrame>
  );
}

function EmptyChat({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <div className="font-mono text-[12px] text-sediment-strong lowercase leading-relaxed">
        <span className="block text-deprecated">interrogator offline</span>
        no LLM key configured. add a Groq or Gemini key to
        <code className="mx-[4px] px-[4px] py-[1px] bg-stratum text-bone">.env</code>
        as <code className="mx-[4px] px-[4px] py-[1px] bg-stratum text-bone">ZH_LLM_API_KEY</code>
        and restart the backend.
      </div>
    );
  }
  return (
    <div className="font-mono text-[12px] text-sediment-strong lowercase leading-relaxed">
      ask a question grounded in the boring log. citations like <span className="text-bone">[L42]</span> in the
      answer become clickable chips that scroll the log to that line.
      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        <SuggestionChip text="which endpoint is failing auth right now?" />
        <SuggestionChip text="what's the riskiest horizon you see?" />
        <SuggestionChip text="is the auth failure rate stable or spiking?" />
      </div>
    </div>
  );
}

function SuggestionChip({ text }: { text: string }) {
  return (
    <span className="font-mono text-[10px] px-[8px] py-[3px] border border-hairline text-sediment lowercase rounded-xs">
      “{text}”
    </span>
  );
}

function ChatTurnView({
  turn,
  onCite,
}: {
  turn: ChatTurn;
  onCite: (snapshotIndex: number, snapshot: ChatResponse["log_snapshot"]) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-baseline gap-[8px]">
        <span className="font-mono text-[10px] text-sediment-strong lowercase">you ·</span>
        <span className="font-mono text-[12px] text-bone">{turn.q}</span>
      </div>
      {turn.pending ? (
        <span className="font-mono text-[11px] text-sediment-strong lowercase">…thinking</span>
      ) : turn.error ? (
        <span className="font-mono text-[11px] text-critical lowercase">error · {turn.error}</span>
      ) : turn.resp ? (
        <AnswerBlock resp={turn.resp} onCite={onCite} />
      ) : null}
    </div>
  );
}

function AnswerBlock({
  resp,
  onCite,
}: {
  resp: ChatResponse;
  onCite: (snapshotIndex: number, snapshot: ChatResponse["log_snapshot"]) => void;
}) {
  const rendered = useMemo(
    () => renderCitedAnswer(resp.answer, resp.log_snapshot, onCite),
    [resp.answer, resp.log_snapshot, onCite],
  );
  return (
    <div className="border-l-2 border-blueprint bg-stratum px-[10px] py-[8px]">
      <span className="font-mono text-[10px] text-sediment-strong lowercase">strata ·</span>
      <p className="font-mono text-[12px] leading-[1.55] text-bone mt-[4px] whitespace-pre-wrap">
        {rendered}
      </p>
      <div className="mt-[6px] flex items-baseline gap-[6px] flex-wrap">
        <span className="font-mono text-[10px] text-sediment-strong lowercase">
          {resp.cited_lines.length} citation{resp.cited_lines.length === 1 ? "" : "s"} ·
        </span>
        {resp.cited_lines.slice(0, 8).map((idx) => (
          <CitationChip
            key={idx}
            idx={idx}
            snapshot={resp.log_snapshot}
            onClick={() => onCite(idx, resp.log_snapshot)}
          />
        ))}
        {resp.cited_lines.length > 8 ? (
          <span className="font-mono text-[10px] text-sediment-strong">+{resp.cited_lines.length - 8} more</span>
        ) : null}
      </div>
    </div>
  );
}

function CitationChip({
  idx,
  snapshot,
  onClick,
}: {
  idx: number;
  snapshot: ChatResponse["log_snapshot"];
  onClick: () => void;
}) {
  const line = snapshot.find((s) => s.index === idx);
  const tone = statusTone(line?.status ?? null);
  return (
    <button
      type="button"
      onClick={onClick}
      title={line?.raw ?? ""}
      className={cn(
        "font-mono text-[10px] leading-none px-[6px] py-[3px] border rounded-xs",
        "border-hairline bg-tar hover:border-blueprint transition-colors duration-fast",
        tone,
      )}
    >
      [L{idx}]
    </button>
  );
}

function renderCitedAnswer(
  text: string,
  snapshot: ChatResponse["log_snapshot"],
  onCite: (snapshotIndex: number, snapshot: ChatResponse["log_snapshot"]) => void,
): React.ReactNode {
  // Replace [L<n>] / [L1,L2,L3] / [L1-L3] occurrences with inline buttons.
  const out: React.ReactNode[] = [];
  let cursor = 0;
  const matches = Array.from(text.matchAll(CITE_GROUP_RE));
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    if (start > cursor) out.push(text.slice(cursor, start));
    const indices = expandCitations(m[1] ?? "");
    out.push(
      <span key={`cite-${i}`} className="inline-flex items-baseline gap-[3px] mx-[2px]">
        {indices.map((idx) => (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onCite(idx, snapshot);
            }}
            className={cn(
              "inline-flex items-baseline px-[5px] py-[0] border rounded-xs",
              "border-blueprint bg-blueprint-wash text-bone hover:bg-blueprint",
              "font-mono text-[10px] leading-[1.4] font-medium",
              "transition-colors duration-fast",
            )}
            style={{ verticalAlign: "baseline" } as CSSProperties}
          >
            L{idx}
          </button>
        ))}
      </span>,
    );
    cursor = start + m[0].length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function expandCitations(group: string): number[] {
  const found = new Set<number>();
  const rangeRe = /L(\d+)\s*-\s*L(\d+)/g;
  let g = group;
  let rm: RegExpExecArray | null;
  while ((rm = rangeRe.exec(group)) !== null) {
    let a = Number(rm[1]);
    let b = Number(rm[2]);
    if (a > b) [a, b] = [b, a];
    for (let i = a; i <= b; i++) found.add(i);
  }
  g = g.replace(/L\d+\s*-\s*L\d+/g, "");
  const singleRe = /L(\d+)/g;
  let sm: RegExpExecArray | null;
  while ((sm = singleRe.exec(g)) !== null) {
    found.add(Number(sm[1]));
  }
  return Array.from(found).sort((a, b) => a - b);
}
