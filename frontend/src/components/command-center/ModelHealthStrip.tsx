import { useQuery } from "@tanstack/react-query";
import { getModelMetrics } from "@/api/endpoints";
import { cn } from "@/lib/cn";

/**
 * A 32px-tall instrument strip showing the three model components and their
 * test-set scores. Sits between the classification cards and the working
 * surface — quietly attests to the trustworthiness of every number above it.
 *
 * Each readout follows the project's mono-tab convention: short label, fixed
 * unit, dotted-leader to the scalar. No charts, no animations.
 */
export function ModelHealthStrip() {
  const { data } = useQuery({
    queryKey: ["model-metrics"],
    queryFn: getModelMetrics,
    staleTime: 5 * 60_000,
  });

  if (!data) {
    return (
      <div
        className="h-[32px] flex items-center justify-between gap-[24px] border-b border-hairline bg-stratum px-[24px]"
        aria-hidden
      >
        <div className="h-[14px] w-full skeleton-pulse" />
      </div>
    );
  }

  const classifier = data.classifier;
  const regressor = data.regressor;
  const anomaly = data.anomaly;

  return (
    <div
      className="flex h-[32px] items-center gap-[24px] border-b border-hairline bg-stratum px-[24px] font-mono text-[11px] leading-none"
      role="region"
      aria-label="model health"
    >
      <span className="text-bone-dim lowercase tracking-wide">model health</span>

      <Pip
        label="classifier"
        value={classifier ? `${(classifier.accuracy * 100).toFixed(1)}%` : "—"}
        sub={classifier ? `macro-f1 ${classifier.macro_f1.toFixed(3)}` : ""}
        tone={pipTone(classifier?.accuracy ?? 0, 0.95, 0.85)}
        title="classifier test-set accuracy on a 384-row held-out split"
      />

      <Sep />

      <Pip
        label="regressor"
        value={regressor ? `R² ${regressor.r2.toFixed(2)}` : "—"}
        sub={regressor ? `MAE ${regressor.mae.toFixed(1)}` : ""}
        tone={pipTone(regressor?.r2 ?? 0, 0.85, 0.7)}
        title="risk regressor R² on held-out split (mean absolute error on the 0–100 scale)"
      />

      <Sep />

      <Pip
        label="anomaly"
        value={anomaly ? `auc ${anomaly.roc_auc.toFixed(2)}` : "—"}
        sub={anomaly ? `f1 ${anomaly.f1.toFixed(2)}` : ""}
        tone={pipTone(anomaly?.roc_auc ?? 0, 0.85, 0.7)}
        title="isolation forest ROC-AUC and F1 on injected step-change anomalies"
      />

      <span className="ml-auto text-sediment-strong lowercase">
        scikit-learn · trained on synthetic banking telemetry · n=1920
      </span>
    </div>
  );
}

type PipTone = "ok" | "warn" | "bad";

function pipTone(value: number, okThreshold: number, warnThreshold: number): PipTone {
  if (value >= okThreshold) return "ok";
  if (value >= warnThreshold) return "warn";
  return "bad";
}

function Pip({
  label,
  value,
  sub,
  tone,
  title,
}: {
  label: string;
  value: string;
  sub: string;
  tone: PipTone;
  title: string;
}) {
  const valueColor =
    tone === "ok" ? "text-active" : tone === "warn" ? "text-tier-high" : "text-critical";
  const dot =
    tone === "ok" ? "bg-active" : tone === "warn" ? "bg-tier-high" : "bg-critical";
  return (
    <span className="flex items-baseline gap-[8px]" title={title}>
      <span aria-hidden className={cn("inline-block h-[6px] w-[6px] rounded-full", dot)} />
      <span className="text-sediment lowercase">{label}</span>
      <span className={cn("mono-tab font-medium", valueColor)}>{value}</span>
      <span className="text-sediment-strong mono-tab">· {sub}</span>
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden className="h-[14px] w-[1px] bg-hairline-strong" />
  );
}
