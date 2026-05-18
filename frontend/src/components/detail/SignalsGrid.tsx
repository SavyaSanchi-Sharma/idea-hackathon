import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { Endpoint } from "@/types/models";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

interface SignalsGridProps {
  endpoint: Endpoint;
}

function KV({ label, value, full = false }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-[12px]", full && "col-span-2")}>
      <span className="font-mono text-[11px] leading-[1.35] text-bone-dim font-medium w-[120px] shrink-0 lowercase">
        {label}
      </span>
      <span className="font-mono text-[12px] leading-[1.35] text-bone mono-tab break-words">
        {value}
      </span>
    </div>
  );
}

/**
 * Two-column key/value with the n=N±M readout pattern, Δ trend, and a 90-day
 * sparkline (recharts LineChart, no axes/tooltip — just the line).
 */
export function SignalsGrid({ endpoint }: SignalsGridProps) {
  const { auth, traffic, data_classes, last_commit, last_deploy, cve_matches, owasp_tags } = endpoint;
  const sparkData = traffic.sparkline.map((v, i) => ({ x: i, y: v }));
  const trendNeg = traffic.trend_pct < 0;

  return (
    <section className="px-[24px] py-[16px] border-b border-hairline">
      <h3 className="mb-[12px] font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
        signals
      </h3>
      <div className="grid grid-cols-2 gap-x-[24px] gap-y-[8px]">
        <KV label="auth type" value={auth.type} />
        <KV
          label="auth fail rate"
          value={
            endpoint.signals
              ? `${(endpoint.signals.auth_fail_rate_7d * 100).toFixed(2)}% / 7d`
              : auth.rate_limited ? "rate-limited" : "—"
          }
        />
        <KV
          label="p95 latency"
          value={endpoint.signals ? `${endpoint.signals.p95_latency_ms} ms` : "—"}
        />
        <KV label="mfa" value={auth.mfa ? "yes" : "no"} />
        <KV
          label="runtime"
          value={
            endpoint.signals
              ? `${endpoint.signals.runtime} ${endpoint.signals.runtime_version}`
              : "—"
          }
        />
        <KV
          label="schema count"
          value={endpoint.signals ? `${endpoint.signals.schema_count}` : "—"}
        />
        <KV label="data classes" value={data_classes.length > 0 ? data_classes.join(", ") : "—"} />
        <KV
          label="finding count"
          value={
            typeof endpoint.finding_count === "number" ? `${endpoint.finding_count}` : "—"
          }
        />
        <KV label="last commit" value={last_commit ? `${last_commit.slice(0, 10)} · ${formatRelativeTime(last_commit)}` : "—"} />
        <KV label="last deploy" value={last_deploy ? `${last_deploy.slice(0, 10)} · ${formatRelativeTime(last_deploy)}` : "—"} />
        <KV
          label="calls (30d)"
          value={
            <span>
              <span className="text-sediment">n = </span>
              {compact(traffic.calls_30d)}
              <span className="text-sediment"> ± </span>
              {compact(Math.max(1, Math.round(traffic.calls_30d * 0.05)))}
            </span>
          }
        />
        <KV
          label="trend"
          value={
            <span>
              <span className="text-sediment">Δ = </span>
              <span className={trendNeg ? "text-critical" : "text-active"}>
                {trendNeg ? "" : "+"}
                {traffic.trend_pct.toFixed(1)}%
              </span>
            </span>
          }
        />
        {cve_matches.length > 0 ? (
          <KV
            full
            label="cve matches"
            value={
              <span className="flex flex-wrap gap-[12px]">
                {cve_matches.map((c) => (
                  <span key={c.id} className="text-critical">
                    {c.id}
                    <span className="text-sediment"> (CVSS </span>
                    {c.score.toFixed(1)}
                    <span className="text-sediment">)</span>
                  </span>
                ))}
              </span>
            }
          />
        ) : null}
        {owasp_tags.length > 0 ? (
          <KV
            full
            label="owasp tags"
            value={
              <span className="flex flex-wrap gap-[12px] text-deprecated">
                {owasp_tags.join(", ")}
              </span>
            }
          />
        ) : null}
      </div>

      <div className="mt-[16px]">
        <div className="font-mono text-[11px] leading-[1.35] text-bone-dim font-medium lowercase mb-[6px]">
          traffic (90d)
        </div>
        <div className="h-[40px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <Line
                type="monotone"
                dataKey="y"
                stroke="var(--blueprint)"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-[4px] flex justify-between font-mono text-[10px] leading-none text-sediment-strong">
          <span>jul</span>
          <span>oct</span>
          <span>jan</span>
          <span>apr</span>
        </div>
      </div>
    </section>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
