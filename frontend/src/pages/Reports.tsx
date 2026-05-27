import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateCompliance,
  generateNarrative,
  generatePlaybook,
  getEndpointReports,
  getEndpoints,
  type ComplianceFramework,
  type ReportResponse,
} from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { MethodPill } from "@/components/common/MethodPill";
import { cn } from "@/lib/cn";

type ReportKind = "threat_narrative" | "remediation_playbook" | "compliance_summary";

const KIND_LABEL: Record<ReportKind, string> = {
  threat_narrative: "threat narrative",
  remediation_playbook: "remediation playbook",
  compliance_summary: "compliance summary",
};

export default function Reports() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [framework, setFramework] = useState<ComplianceFramework>("rbi_2024");
  const [latest, setLatest] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: ["report-endpoints"],
    queryFn: () => getEndpoints({ page_size: 100, sort: "posture_score:desc" }),
    refetchInterval: 10_000,
  });

  const endpoints = endpointsQuery.data?.items ?? [];
  const selected = useMemo(
    () => endpoints.find((e) => e.id === selectedId) ?? endpoints[0],
    [endpoints, selectedId],
  );
  const endpointId = selected?.id ?? "";

  const reportsQuery = useQuery({
    queryKey: ["reports", endpointId],
    queryFn: () => getEndpointReports(endpointId),
    enabled: endpointId.length > 0,
    refetchOnWindowFocus: false,
  });

  function handleResult(resp: ReportResponse) {
    setLatest(resp);
    setError(null);
    qc.invalidateQueries({ queryKey: ["reports", resp.endpoint_id] });
  }

  function handleError(e: unknown) {
    if (e instanceof ApiError) {
      const body = e.body as { error?: string; message?: string } | null;
      setError(body?.message ?? body?.error ?? `${e.status} ${e.message}`);
    } else if (e instanceof Error) {
      setError(e.message);
    } else {
      setError("generation failed");
    }
  }

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

  const pending =
    narrativeMutation.isPending || playbookMutation.isPending || complianceMutation.isPending;
  const cached = reportsQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[24px] py-[20px] gap-[16px]">
      <section className="border border-hairline bg-tar px-[20px] py-[16px]">
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-baseline gap-[10px]">
            <span aria-hidden className="font-mono text-blueprint">▷</span>
            <h1 className="font-mono text-page-title text-bone lowercase">reports</h1>
            <span className="font-mono text-[11px] text-sediment-strong lowercase">
              · slm compliance and response pack
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-[12px] items-end">
            <label className="flex flex-col gap-[6px] min-w-0">
              <span className="font-mono text-readout text-sediment-strong lowercase">
                endpoint specimen
              </span>
              <select
                value={endpointId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setLatest(null);
                  setError(null);
                }}
                disabled={endpointsQuery.isLoading || endpoints.length === 0}
                className="h-[36px] border border-hairline bg-stratum text-bone font-mono text-[12px] px-[10px] rounded-xs focus:outline-none focus:border-blueprint"
              >
                {endpoints.length === 0 ? (
                  <option value="">no endpoints discovered</option>
                ) : (
                  endpoints.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.method} {e.path} · {e.service} · {e.risk_tier}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="font-mono text-readout text-sediment-strong lowercase">
                framework
              </span>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value as ComplianceFramework)}
                disabled={pending}
                className="h-[36px] min-w-[140px] border border-hairline bg-stratum text-bone font-mono text-[12px] px-[10px] rounded-xs focus:outline-none focus:border-blueprint"
              >
                <option value="rbi_2024">rbi 2024</option>
                <option value="pci_dss">pci dss</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {selected ? (
        <section className="border border-hairline bg-stratum px-[16px] py-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-[12px]">
            <div className="flex items-center gap-[10px] min-w-0">
              <MethodPill method={selected.method} />
              <span className="font-mono text-[13px] text-bone truncate">{selected.path}</span>
              <span className="font-mono text-[11px] text-sediment-strong lowercase">
                {selected.service} · {selected.risk_tier} · score {selected.posture_score}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-[8px]">
              <ReportButton
                label="threat narrative"
                loading={narrativeMutation.isPending}
                disabled={pending || !endpointId}
                onClick={() => narrativeMutation.mutate()}
              />
              <ReportButton
                label="remediation playbook"
                loading={playbookMutation.isPending}
                disabled={pending || !endpointId}
                onClick={() => playbookMutation.mutate()}
              />
              <ReportButton
                label="compliance summary"
                loading={complianceMutation.isPending}
                disabled={pending || !endpointId}
                onClick={() => complianceMutation.mutate()}
              />
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="border border-critical bg-critical-wash px-[12px] py-[8px]">
          <span className="font-mono text-[11px] text-critical lowercase">{error}</span>
        </div>
      ) : null}

      {endpointsQuery.isError ? (
        <div className="border border-critical bg-critical-wash px-[12px] py-[8px]">
          <span className="font-mono text-[11px] text-critical lowercase">
            rust backend unavailable at the configured api base url
          </span>
        </div>
      ) : null}

      {latest ? (
        <ReportPanel
          kind={latest.report_kind}
          framework={latest.framework}
          output={latest.output}
          model={latest.model}
          generationMs={latest.generation_ms}
        />
      ) : (
        <div className="flex min-h-[180px] items-center justify-center border border-hairline bg-tar">
          <span className="font-mono text-[12px] text-sediment-strong lowercase">
            choose an endpoint and generate a report
          </span>
        </div>
      )}

      <section className="flex flex-col gap-[10px]">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-section-title text-bone lowercase">
            cached reports
            <span className="ml-[8px] text-sediment-strong">· n = {cached.length}</span>
          </h2>
          {reportsQuery.isFetching ? (
            <span className="font-mono text-[10px] text-sediment-strong lowercase">refreshing</span>
          ) : null}
        </header>
        {cached.length > 0 ? (
          <ul className="flex flex-col gap-[10px] list-none p-0 m-0">
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
          </ul>
        ) : (
          <div className="border border-hairline bg-tar px-[14px] py-[12px]">
            <span className="font-mono text-[11px] text-sediment-strong lowercase">
              no cached reports for this endpoint
            </span>
          </div>
        )}
      </section>
    </div>
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
        "h-[32px] px-[12px] rounded-xs border border-blueprint bg-tar text-blueprint",
        "font-mono text-[11px] leading-none lowercase",
        "hover:bg-blueprint-wash transition-colors duration-fast",
        "disabled:opacity-50 disabled:cursor-progress",
      )}
    >
      {loading ? `${label}...` : label}
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
  return (
    <article className="border border-hairline bg-stratum px-[14px] py-[12px] flex flex-col gap-[8px]">
      <header className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <span className="font-mono text-readout text-bone lowercase">
          {KIND_LABEL[kind] ?? kind}
          {framework ? <span className="text-sediment-strong"> · {framework}</span> : null}
        </span>
        <span className="font-mono text-[10px] text-sediment-strong lowercase">
          {model} · {generationMs}ms
          {generatedAt ? ` · ${new Date(generatedAt).toLocaleTimeString()}` : ""}
        </span>
      </header>
      <pre className="font-mono text-[11px] text-bone-dim whitespace-pre-wrap break-words leading-relaxed max-h-[420px] overflow-y-auto">
        {output}
      </pre>
    </article>
  );
}
