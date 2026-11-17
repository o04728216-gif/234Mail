export class ApiError extends Error {
  public status: number;
  public rateLimited?: boolean;
  public retryAfterSeconds?: number;
  public lockedUntil?: number;

  constructor(
    message: string,
    status: number,
    meta?: { rateLimited?: boolean; retryAfterSeconds?: number; lockedUntil?: number }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.rateLimited = meta?.rateLimited;
    this.retryAfterSeconds = meta?.retryAfterSeconds;
    this.lockedUntil = meta?.lockedUntil;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`, response.status, {
      rateLimited: Boolean(data.rateLimited),
      retryAfterSeconds:
        typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
      lockedUntil: typeof data.lockedUntil === 'number' ? data.lockedUntil : undefined,
    });
  }
  return data as T;
}

export function downloadCsvReport(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJsonReport(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
