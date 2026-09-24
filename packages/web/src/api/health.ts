import { useQuery } from "@tanstack/react-query";

/**
 * `GET /health` through the dev server's `/api` proxy. Resolves only when io
 * itself answers `{"ok":true}`: a proxy error, or the page Vite serves when the
 * proxy is missing, rejects instead of passing for healthy.
 */
export async function fetchHealth(): Promise<true> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error(`io answered ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("ok" in body) || body.ok !== true) {
    throw new Error("io did not answer ok");
  }
  return true;
}

/**
 * Whether io is up. TanStack Query retries a failed check a few times with
 * backoff, which also covers io still booting while `pnpm dev` starts.
 */
export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: fetchHealth });
}
