const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const USE_FIXTURE = import.meta.env.VITE_USE_FIXTURE === "true";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // body may not be JSON
    }
    throw new ApiError(`${res.status} ${res.statusText}`, res.status, body);
  }
  return (await res.json()) as T;
}

export const apiConfig = {
  baseUrl: BASE_URL,
  useFixture: USE_FIXTURE,
};

// Run `real()` against the backend; on any failure (including USE_FIXTURE=true)
// fall back to `fallback()`. Keeps the rest of the app agnostic.
export async function withFixtureFallback<T>(
  real: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (USE_FIXTURE) {
    return await fallback();
  }
  try {
    return await real();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[api] backend unreachable, using fixture", err);
    }
    return await fallback();
  }
}
