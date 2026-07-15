const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface LeadPayload {
  name: string;
  email: string;
  website: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  website: string;
  status: string;
  run_id?: string;
  created_at: string;
}

export function submitLead(payload: LeadPayload) {
  return request<{ ok: boolean; lead?: Lead; run_id?: string }>('/api/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchOpsLeads(opsKey: string) {
  return request<{ ok: boolean; rows: Lead[] }>('/api/ops/leads', {
    headers: { 'x-ops-key': opsKey },
  });
}

export function approveLead(id: string, opsKey: string) {
  return request<{ ok: boolean }>(`/api/ops/leads/${id}/approve`, {
    method: 'POST',
    headers: { 'x-ops-key': opsKey },
  });
}

export interface SalesChatResponse {
  ok: boolean;
  reply: string;
}

export function sendSalesMessage(sessionId: string, message: string) {
  return request<SalesChatResponse>('/api/sales/chat', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export function endSalesSession(sessionId: string) {
  return request<{ ok: boolean }>('/api/sales/end', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export type GatewayStatus = 'checking' | 'online' | 'offline';

export async function checkGatewayStatus(): Promise<GatewayStatus> {
  try {
    // Any HTTP response (even 401 from a missing ops key) proves the gateway
    // is reachable and CORS is configured correctly; only a network-level
    // failure (unreachable host, CORS block) means it's actually offline.
    await fetch(`${API_BASE}/api/ops/leads`, { method: 'GET' });
    return 'online';
  } catch {
    return 'offline';
  }
}
