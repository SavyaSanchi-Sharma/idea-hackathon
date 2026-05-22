import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateCompliance,
  generateNarrative,
  generatePlaybook,
  getEndpointReports,
  type ComplianceFramework,
  type ReportResponse,
  type ReportRow,
} from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { cn } from "@/lib/cn";

type ReportKind = "threat_narrative" | "remediation_playbook" | "compliance_summary";

interface Props {
  endpointId: string;
}

const KIND_LABEL: Record<ReportKind, string> = {
  threat_narrative: "Threat narrative",
  remediation_playbook: "Remediation playbook",
  compliance_summary: "Compliance summary",
};

export function SlmReportsPanel({ endpointId }: Props) {
  const qc = useQueryClient();
  const [framework, setFramework] = useState<ComplianceFramework>("rbi_2024");
  const [latest, setLatest] = useState<ReportResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ["reports", endpointId],
    queryFn: () => getEndpointReports(endpointId),
    refetchOnWindowFocus: false,
  });

  const handleResult = (resp: ReportResponse) => {
    setErr(null);
    setLatest(resp);
    qc.invalidateQueries({ queryKey: ["reports", endpointId] });
  };

  const handleError = (e: unknown) => {
    if (e instanceof ApiError) {
      const body = e.body as { error?: string; message?: string } | null;
      setErr(body?.message ?? body?.error ?? `${e.status} ${e.message}`);
    } else if (e instanceof Error) {
      setErr(e.message);
    } else {
      setErr("generation failed");
    }
  };

  const narrativeMutation = useMutation({
    mutationFn: () => generateNarrative(endpointId),
    onSuccess: handleResult,
    onError: handleError,
  });

  const playbookMutation = useMutation({
    mutationFn: () => generatePlaybook(endpointId),
    onSuccess: handleResult,
    onError: handleError,
  });

  const complianceMutation = useMutation({
    mutationFn: () => generateCompliance(endpointId, framework),
    onSuccess: handleResult,
    onError: handleError,
  });

  const anyPending =
    narrativeMutation.isPending ||
    playbookMutation.isPending ||
    complianceMutation.isPending;

  const cached: ReportRow[] = reportsQuery.data ?? [];

  return (
    <section className="flex flex-col gap-[12px] border-t border-hairline pt-[16px]">
      <header className="flex items-baseline justify-between">
        <h3 className="font-mono text-section-title text-bone lowercase">
          <span aria-hidden className="text-blueprint mr-[6px]">⌖</span>
          slm reports
        </h3>
        <span className="font-mono text-[10px] text-sediment-strong lowercase">
          gemma 3 · grounded on context
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-[8px]">
        <ReportButton
          label="threat narrative"
          loading={narrativeMutation.isPending}
          disabled={anyPending}
          onClick={() => narrativeMutation.mutate()}
        />
        <ReportButton
          label="remediation playbook"
          loading={playbookMutation.isPending}
          disabled={anyPending}
          onClick={() => playbookMutation.mutate()}
        />
        <div className="flex items-center gap-[6px]">
          <ReportButton
            label="compliance summary"
            loading={complianceMutation.isPending}
            disabled={anyPending}
            onClick={() => complianceMutation.mutate()}
          />
          <select
            value={framework}
            onChange={(e) => setFramework(e.target.value as ComplianceFramework)}
            disabled={anyPending}
            className="h-[28px] px-[8px] border border-hairline bg-stratum text-bone font-mono text-[11px] rounded-xs focus:outline-none focus:border-blueprint"
          >
            <option value="rbi_2024">rbi 2024</option>
            <option value="pci_dss">pci dss</option>
          </select>
        </div>
      </div>

      {err ? (
        <div className="border border-critical bg-critical-wash px-[10px] py-[6px]">
          <span className="font-mono text-[11px] text-critical lowercase">
            {err}
          </span>
        </div>
      ) : null}

      {latest ? (
        <ReportPanel
          kind={latest.report_kind as ReportKind}
          framework={latest.framework}
          output={latest.output}
          model={latest.model}
          generationMs={latest.generation_ms}
        />
      ) : null}

      <details className="border-t border-hairline pt-[10px]">
        <summary className="font-mono text-readout text-sediment-strong lowercase cursor-pointer">
          cached reports · {cached.length}
        </summary>
        <ul className="flex flex-col gap-[8px] mt-[10px] list-none p-0 m-0">
          {cached.map((r, i) => (
            <li key={`${r.report_kind}-${r.framework}-${i}`}>
              <ReportPanel
                kind={r.report_kind as ReportKind}
                framework={r.framework}
                output={r.model_output}
                model={r.model_name}
                generationMs={r.generation_ms}
                generatedAt={r.generated_at}
              />
            </li>
          ))}
          {cached.length === 0 ? (
            <li className="font-mono text-[11px] text-sediment-strong lowercase">
              no cached reports yet
            </li>
          ) : null}
        </ul>
      </details>
    </section>
  );
}

function ReportButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-[28px] px-[12px] rounded-xs",
        "border border-blueprint bg-tar text-blueprint",
        "font-mono text-[11px] leading-none lowercase",
        "hover:bg-blueprint-wash transition-colors duration-fast",
        "disabled:opacity-50 disabled:cursor-progress",
      )}
    >
      {loading ? `${label}…` : label}
    </button>
  );
}

function ReportPanel({
  kind,
  framework,
  output,
  model,
  generationMs,
  generatedAt,
}: {
  kind: ReportKind;
  framework: string;
  output: string;
  model: string;
  generationMs: number;
  generatedAt?: number;
}) {
  const isJsonKind =
    kind === "remediation_playbook" || kind === "compliance_summary";
  return (
    <article className="border border-hairline bg-stratum px-[12px] py-[10px] flex flex-col gap-[8px]">
      <header className="flex items-baseline justify-between gap-[8px]">
        <span className="font-mono text-readout text-bone lowercase">
          {KIND_LABEL[kind] ?? kind}
          {framework ? (
            <span className="text-sediment-strong"> · {framework}</span>
          ) : null}
        </span>
        <span className="font-mono text-[10px] text-sediment-strong lowercase">
          {model} · {generationMs}ms
          {generatedAt
            ? ` · ${new Date(generatedAt).toLocaleTimeString()}`
            : ""}
        </span>
      </header>
      {isJsonKind ? (
        <pre className="font-mono text-[11px] text-bone whitespace-pre-wrap break-words leading-relaxed max-h-[300px] overflow-y-auto">
          {output}
        </pre>
      ) : (
        <p className="font-mono text-narrative text-bone-dim whitespace-pre-wrap leading-relaxed">
          {output}
        </p>
      )}
    </article>
  );
}
