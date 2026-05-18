import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getEndpointSequence } from "@/api/endpoints";
import { cn } from "@/lib/cn";

interface SequenceChartProps {
  endpointId: string;
  anomalyFlag?: boolean;
  anomalyScore?: number | null;
}

/**
 * The 30-day telemetry the anomaly model actually scored on — call_count,
 * auth_fail_rate, p95_latency. Three small stacked panels share the same x
 * scale so a behavior shift on day 12 lines up visually across all three.
 *
 * The anomaly score is shown as a chip in the header so the analyst can see
 * the model's own confidence in the step-change verdict.
 */
export function SequenceChart({ endpointId, anomalyFlag, anomalyScore }: SequenceChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["endpoint-sequence", endpointId],
    queryFn: () => getEndpointSequence(endpointId),
    staleTime: 60_000,
  });

  return (
    <section className="px-[24px] py-[16px] border-b border-hairline">
      <div className="mb-[12px] flex items-baseline justify-between">
        <h3 className="font-mono text-[14px] leading-[1.4] font-semibold text-bone lowercase">
          telemetry · 30d
        </h3>
        <span className="font-mono text-[11px] leading-none">
          <span className="text-sediment">anomaly · </span>
          <span
            className={cn(
              "mono-tab",
              anomalyFlag ? "text-critical" : "text-bone-dim",
            )}
          >
            {anomalyFlag ? "flagged" : "clean"}
          </span>
          {typeof anomalyScore === "number" ? (
            <>
              <span className="px-[8px] text-sediment">·</span>
              <span className="text-sediment">score </span>
              <span className="mono-tab text-bone">{anomalyScore.toFixed(3)}</span>
            </>
          ) : null}
        </span>
      </div>

      {isLoading || !data ? (
        <div className="h-[200px] w-full skeleton-pulse" aria-hidden />
      ) : (
        <div className="flex flex-col gap-[8px]">
          <Panel
            label="call_count"
            data={data.points.map((p) => ({ x: p.day, y: p.call_count }))}
            stroke="var(--blueprint)"
            format={(v) => compact(v as number)}
          />
          <Panel
            label="auth_fail_rate"
            data={data.points.map((p) => ({ x: p.day, y: p.auth_fail_rate }))}
            stroke="var(--tier-high)"
            format={(v) => `${((v as number) * 100).toFixed(1)}%`}
          />
          <Panel
            label="p95_latency_ms"
            data={data.points.map((p) => ({ x: p.day, y: p.p95_latency_ms }))}
            stroke="var(--severity-warning)"
            format={(v) => `${Math.round(v as number)}ms`}
          />
        </div>
      )}
    </section>
  );
}

function Panel({
  label,
  data,
  stroke,
  format,
}: {
  label: string;
  data: { x: number; y: number }[];
  stroke: string;
  format: (v: number | string) => string;
}) {
  const last = data[data.length - 1]?.y ?? 0;
  return (
    <div className="grid grid-cols-[110px_1fr_70px] items-center gap-[8px]">
      <span className="font-mono text-[11px] leading-none text-bone-dim lowercase truncate">
        {label}
      </span>
      <div className="h-[40px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <XAxis dataKey="x" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--hairline-strong)" }}
              contentStyle={{
                background: "var(--stratum-raised)",
                border: "1px solid var(--hairline-strong)",
                fontFamily: "IBM Plex Mono, ui-monospace, monospace",
                fontSize: 11,
                padding: "4px 8px",
              }}
              labelFormatter={(d) => `day ${d}`}
              formatter={(v: number | string) => [format(v), label]}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke={stroke}
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span className="text-right mono-tab font-mono text-[11px] text-bone">
        {format(last)}
      </span>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}
