/**
 * BOREHOLES — the Live Ingest landing page.
 *
 * Sticks to the STRATA metaphor: a "borehole" is a probe drilled into a live
 * service so the inference plane can sample its log telemetry continuously.
 * Each registered site is rendered as an instrument station with stats; the
 * deploy panel below registers a new probe.
 *
 * Visual language reuses SpecimenFrame / decay styles / mono-tab readouts so
 * this page reads as part of the same instrument suite, not a generic CRUD
 * dashboard.
 */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SpecimenFrame } from "@/components/common/SpecimenFrame";
import { ApiError } from "@/api/client";
import {
  createSite,
  deleteSite,
  listSites,
  type FileReplaySourceConfig,
  type DockerSourceConfig,
  type Site,
  type SiteCreatePayload,
  type SourceType,
} from "@/api/sitesApi";
import type { ServiceLane } from "@/types/models";
import { cn } from "@/lib/cn";

const SERVICE_LANES: Array<ServiceLane | "general"> = [
  "payments", "core", "kyc", "cards", "upi", "imps", "neft", "rtgs",
  "auth", "aml", "internal", "legacy", "general",
];

const RUNTIMES = ["python", "node", "java", "go", "ruby", "dotnet", "rust", "php"];

const PARSER_GLYPH: Record<string, string> = {
  json: "{·}",
  nginx: "▤",
  unknown: "?",
};

const STATUS_GLYPH: Record<string, string> = {
  active: "◉",
  stopped: "○",
  error: "✕",
};

export default function Boreholes() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: listSites,
    refetchInterval: 4_000, // gentle poll so the stats counters tick visibly
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteSite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-[20px] overflow-y-auto px-[24px] py-[20px]">
      <PageHero total={sitesQuery.data?.total ?? 0} />
      <DeployProbePanel onDeployed={(s) => navigate(`/boreholes/${s.id}`)} />
      <section className="flex flex-col gap-[12px]">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-section-title text-bone lowercase">
            active probes
            <span className="ml-[8px] text-sediment-strong">
              · n = {sitesQuery.data?.total ?? "··"}
            </span>
          </h2>
          {sitesQuery.isFetching ? (
            <span className="font-mono text-[11px] text-sediment-strong lowercase">refreshing…</span>
          ) : null}
        </header>
        {sitesQuery.isLoading ? (
          <LoadingRow />
        ) : (sitesQuery.data?.items ?? []).length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-[10px] list-none p-0 m-0">
            {sitesQuery.data!.items.map((s) => (
              <BoreholeRow
                key={s.id}
                site={s}
                onOpen={() => navigate(`/boreholes/${s.id}`)}
                onRemove={() => removeMutation.mutate(s.id)}
                removing={removeMutation.isPending && removeMutation.variables === s.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PageHero({ total }: { total: number }) {
  return (
    <SpecimenFrame
      decay="solid"
      className="px-[20px] py-[18px]"
    >
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-baseline gap-[10px]">
          <span aria-hidden className="font-mono text-[20px] text-blueprint">◉</span>
          <h1 className="font-mono text-page-title text-bone lowercase">borehole monitoring</h1>
          <span className="font-mono text-[11px] text-sediment-strong lowercase">
            · phase 2 · live formation probes
          </span>
        </div>
        <p className="font-mono text-narrative text-bone-dim max-w-[760px]">
          A borehole streams raw log telemetry from a live service into the inference
          plane. Every new endpoint that surfaces is classified continuously — same
          models as the static catalog, same posture scoring, but the readings move.
          <span className="text-sediment"> ·</span> {total} probe{total === 1 ? "" : "s"} active.
        </p>
      </div>
    </SpecimenFrame>
  );
}

function EmptyState() {
  return (
    <SpecimenFrame decay="solid" className="px-[20px] py-[24px]">
      <div className="flex flex-col items-start gap-[6px]">
        <span className="font-mono text-readout text-sediment lowercase">no probes deployed</span>
        <span className="font-mono text-[11px] text-sediment-strong lowercase">
          deploy your first borehole using the panel above
        </span>
      </div>
    </SpecimenFrame>
  );
}

function LoadingRow() {
  return (
    <SpecimenFrame decay="solid" className="px-[20px] py-[16px]">
      <span className="font-mono text-readout text-sediment-strong lowercase">
        sampling registry…
      </span>
    </SpecimenFrame>
  );
}

// ─── one borehole row ──────────────────────────────────────────────────────

function BoreholeRow({
  site,
  onOpen,
  onRemove,
  removing,
}: {
  site: Site;
  onOpen: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const decay = site.status === "error" ? "critical" : "solid";
  const statusTone =
    site.status === "active"
      ? "text-active"
      : site.status === "error"
        ? "text-critical"
        : "text-sediment";
  const sourceLabel =
    site.source_type === "docker"
      ? `docker · ${(site.source_config as DockerSourceConfig).container}`
      : `file replay · ${truncateMid((site.source_config as FileReplaySourceConfig).path, 48)}`;

  return (
    <SpecimenFrame
      asLi
      decay={decay}
      scanline={decay === "critical"}
      className="px-[16px] py-[12px] cursor-pointer hover:bg-stratum-raised transition-colors duration-fast"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="grid grid-cols-[auto_1fr_auto] gap-[16px] items-center focus:outline-none"
      >
        <span aria-hidden className={cn("font-mono text-[20px] leading-none", statusTone)}>
          {STATUS_GLYPH[site.status] ?? "◉"}
        </span>

        <div className="flex flex-col gap-[6px] min-w-0">
          <div className="flex items-baseline gap-[8px] min-w-0">
            <span className="font-mono text-[14px] font-semibold text-bone truncate">{site.name}</span>
            <span className="font-mono text-[11px] text-sediment-strong lowercase shrink-0">
              · {site.service_lane} · {site.runtime} {site.runtime_version}
            </span>
          </div>
          <span className="font-mono text-[11px] text-sediment truncate" title={sourceLabel}>
            {sourceLabel}
          </span>
        </div>

        <div className="flex items-center gap-[16px] shrink-0">
          <StatCounter label="lines" value={site.stats.lines_ingested} />
          <StatCounter label="endpoints" value={site.stats.endpoints_discovered} />
          <StatBadge
            label="parser"
            value={
              <>
                <span className="mr-[4px]">{PARSER_GLYPH[site.stats.parser_format] ?? "?"}</span>
                {site.stats.parser_format}
              </>
            }
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Retract probe "${site.name}"? Its live state will be cleared.`)) {
                onRemove();
              }
            }}
            disabled={removing}
            className={cn(
              "h-[28px] px-[10px] border border-hairline bg-tar text-sediment",
              "font-mono text-[11px] leading-none lowercase",
              "hover:border-critical hover:text-critical transition-colors duration-fast",
              "disabled:opacity-50 disabled:cursor-progress rounded-xs",
            )}
            title="retract probe (deletes registration)"
          >
            {removing ? "retracting…" : "retract"}
          </button>
        </div>
      </div>
    </SpecimenFrame>
  );
}

function StatCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="font-mono mono-tab text-[16px] font-semibold text-bone">
        {compactNum(value)}
      </span>
      <span className="font-mono text-[10px] text-sediment-strong lowercase mt-[2px]">{label}</span>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="font-mono text-readout text-bone lowercase">{value}</span>
      <span className="font-mono text-[10px] text-sediment-strong lowercase mt-[2px]">{label}</span>
    </div>
  );
}

// ─── deploy panel ──────────────────────────────────────────────────────────

function DeployProbePanel({ onDeployed }: { onDeployed: (s: Site) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("file_replay");
  const [name, setName] = useState("");
  const [container, setContainer] = useState("");
  const [path, setPath] = useState("docs/demo/synthetic-bank-logs.jsonl");
  const [replaySpeed, setReplaySpeed] = useState<number>(50);
  const [loop, setLoop] = useState(true);
  const [serviceLane, setServiceLane] = useState<SiteCreatePayload["service_lane"]>("payments");
  const [runtime, setRuntime] = useState("python");
  const [runtimeVersion, setRuntimeVersion] = useState("3.11");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: SiteCreatePayload) => createSite(body),
    onSuccess: (site) => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["sites"] });
      onDeployed(site);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        const body = e.body as { detail?: { error?: string; hint?: string; message?: string } } | null;
        const detail = body?.detail;
        if (detail?.error && detail?.hint) {
          setError(`${detail.error} — ${detail.hint}`);
        } else if (detail?.message) {
          setError(detail.message);
        } else {
          setError(`${e.status} ${e.message}`);
        }
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("deploy failed");
      }
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("name is required");
      return;
    }
    let source_config: DockerSourceConfig | FileReplaySourceConfig;
    if (sourceType === "docker") {
      if (!container.trim()) {
        setError("container id/name is required for a docker source");
        return;
      }
      source_config = { container: container.trim() };
    } else {
      if (!path.trim()) {
        setError("file path is required for a file_replay source");
        return;
      }
      source_config = {
        path: path.trim(),
        replay_speed: replaySpeed > 0 ? replaySpeed : null,
        loop,
      };
    }
    mutation.mutate({
      name: trimmedName,
      source_type: sourceType,
      source_config,
      service_lane: serviceLane,
      runtime,
      runtime_version: runtimeVersion,
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "self-start h-[36px] px-[16px] rounded-xs",
          "border border-blueprint bg-tar text-blueprint",
          "font-mono text-[13px] leading-none font-medium lowercase",
          "hover:bg-blueprint-wash transition-colors duration-fast",
        )}
      >
        + deploy new probe
      </button>
    );
  }

  return (
    <SpecimenFrame decay="solid" className="px-[20px] py-[18px]">
      <form onSubmit={submit} className="flex flex-col gap-[14px]">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-section-title text-bone lowercase">
            <span aria-hidden className="text-blueprint mr-[6px]">⌖</span>
            deploy probe
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="font-mono text-[11px] text-sediment hover:text-bone lowercase"
          >
            cancel
          </button>
        </header>

        <FormRow label="name">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. order-svc-staging"
            autoFocus
          />
        </FormRow>

        <FormRow label="source type">
          <div className="flex gap-[8px]">
            <RadioPill
              label="file replay"
              hint="tail / replay a file on disk"
              checked={sourceType === "file_replay"}
              onClick={() => setSourceType("file_replay")}
            />
            <RadioPill
              label="docker"
              hint="tail container stdout via docker.sock"
              checked={sourceType === "docker"}
              onClick={() => setSourceType("docker")}
            />
          </div>
        </FormRow>

        {sourceType === "docker" ? (
          <FormRow label="container">
            <TextInput
              value={container}
              onChange={setContainer}
              placeholder="container id or name"
            />
          </FormRow>
        ) : (
          <>
            <FormRow label="file path">
              <TextInput
                value={path}
                onChange={setPath}
                placeholder="docs/demo/synthetic-bank-logs.jsonl"
              />
            </FormRow>
            <FormRow label="replay speed">
              <div className="flex items-center gap-[10px]">
                <select
                  value={replaySpeed}
                  onChange={(e) => setReplaySpeed(Number(e.target.value))}
                  className={selectClasses}
                >
                  <option value={1}>1× (real-time)</option>
                  <option value={10}>10× (fast demo)</option>
                  <option value={50}>50× (rapid demo)</option>
                  <option value={0}>tail -f (no replay)</option>
                </select>
                <label className="flex items-center gap-[6px] font-mono text-[11px] text-sediment lowercase">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    className="accent-blueprint"
                  />
                  loop at EOF
                </label>
              </div>
            </FormRow>
          </>
        )}

        <FormRow label="service lane">
          <select
            value={serviceLane}
            onChange={(e) =>
              setServiceLane(e.target.value as SiteCreatePayload["service_lane"])
            }
            className={selectClasses}
          >
            {SERVICE_LANES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="runtime">
          <div className="flex items-center gap-[10px]">
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              className={selectClasses}
            >
              {RUNTIMES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <TextInput
              value={runtimeVersion}
              onChange={setRuntimeVersion}
              placeholder="version"
            />
          </div>
        </FormRow>

        {error ? (
          <div className="border border-critical bg-critical-wash px-[12px] py-[8px]">
            <span className="font-mono text-[11px] text-critical lowercase">{error}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-[12px]">
          <button
            type="submit"
            disabled={mutation.isPending}
            className={cn(
              "h-[36px] px-[18px] rounded-xs",
              "border border-blueprint bg-blueprint-wash text-bone",
              "font-mono text-[13px] leading-none font-medium lowercase",
              "hover:bg-blueprint transition-colors duration-fast",
              "disabled:opacity-50 disabled:cursor-progress",
            )}
          >
            {mutation.isPending ? "deploying…" : "drill it"}
          </button>
          <span className="font-mono text-[10px] text-sediment-strong lowercase">
            once deployed, the probe begins sampling immediately
          </span>
        </div>
      </form>
    </SpecimenFrame>
  );
}

const selectClasses = cn(
  "h-[32px] min-w-[140px] border border-hairline bg-stratum text-bone",
  "font-mono text-[13px] px-[10px] rounded-xs",
  "focus:outline-none focus:border-blueprint",
);

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-[12px]">
      <span className="font-mono text-readout text-sediment-strong lowercase">{label} ·</span>
      <div>{children}</div>
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={cn(
        "h-[32px] w-full border border-hairline bg-stratum text-bone",
        "font-mono text-[13px] px-[10px] rounded-xs",
        "placeholder:text-sediment-strong",
        "focus:outline-none focus:border-blueprint",
      )}
    />
  );
}

function RadioPill({
  label,
  hint,
  checked,
  onClick,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "h-[40px] px-[14px] rounded-xs",
        "border font-mono text-[12px] lowercase",
        "transition-colors duration-fast",
        checked
          ? "border-blueprint bg-blueprint-wash text-bone"
          : "border-hairline bg-stratum text-bone-dim hover:border-hairline-strong",
      )}
    >
      <span className="block font-medium">{label}</span>
      <span className="block text-[10px] text-sediment-strong mt-[2px]">{hint}</span>
    </button>
  );
}

// ─── utilities ─────────────────────────────────────────────────────────────

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`;
}
