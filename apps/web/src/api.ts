import type { ApiErrorBody, GeoFilesResponse, GeoSeriesSummary } from "@omics-to-art/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean,
    public diagnosticId?: string,
  ) { super(message); }
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...(signal ? { signal } : {}), headers: { Accept: "application/json" } });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiError(
      body?.error.message ?? `请求失败（${response.status}）`,
      body?.error.code ?? "HTTP_ERROR",
      body?.error.retryable ?? response.status >= 500,
      body?.error.diagnosticId,
    );
  }
  return data as T;
}

export function fetchSeries(accession: string, signal?: AbortSignal): Promise<GeoSeriesSummary> {
  return requestJson(`/api/geo/series/${encodeURIComponent(accession)}`, signal);
}

export function fetchFiles(accession: string, signal?: AbortSignal): Promise<GeoFilesResponse> {
  return requestJson(`/api/geo/series/${encodeURIComponent(accession)}/files`, signal);
}
