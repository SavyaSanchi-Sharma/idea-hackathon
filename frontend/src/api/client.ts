const PIPE_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const AI_ENGINE_BASE_URL = import.meta.env.VITE_AI_ENGINE_BASE_URL ?? "http://localhost:8001";

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

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function _request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(base, path, opts.query);
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

export const apiRequest = <T>(path: string, opts: RequestOptions = {}) =>
  _request<T>(PIPE_BASE_URL, path, opts);

export const aiEngineRequest = <T>(path: string, opts: RequestOptions = {}) =>
  _request<T>(AI_ENGINE_BASE_URL, path, opts);

export const apiConfig = {
  pipeBaseUrl: PIPE_BASE_URL,
  aiEngineBaseUrl: AI_ENGINE_BASE_URL,
  // Kept for back-compat with anything that read this field.
  baseUrl: PIPE_BASE_URL,
};
