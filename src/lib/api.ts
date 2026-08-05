export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers:
      options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json", ...(options?.headers || {}) }
        : options?.headers,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    throw new ApiError((data as { error?: string })?.error || res.statusText, res.status);
  }
  return data as T;
}
