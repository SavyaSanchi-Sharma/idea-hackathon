import { cn } from "@/lib/cn";
import type { HttpMethod } from "@/types/models";

const TONES: Record<HttpMethod, { text: string; bg: string }> = {
  GET: { text: "text-method-get", bg: "bg-method-get-wash" },
  POST: { text: "text-method-post", bg: "bg-method-post-wash" },
  PUT: { text: "text-method-put", bg: "bg-method-put-wash" },
  DELETE: { text: "text-method-delete", bg: "bg-method-delete-wash" },
  PATCH: { text: "text-method-patch", bg: "bg-method-patch-wash" },
};

/**
 * 18px mono uppercase pill. Method is metadata — colors are desaturated washes.
 * Uppercase is the ONLY place uppercase appears in STRATA (HTTP verbs are spec).
 */
export function MethodPill({
  method,
  className,
}: {
  method: HttpMethod;
  className?: string;
}) {
  const tone = TONES[method];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-[18px] px-[6px] rounded-xs",
        "font-mono text-[10px] leading-none font-semibold tracking-wide",
        tone.text,
        tone.bg,
        className,
      )}
    >
      {method}
    </span>
  );
}
