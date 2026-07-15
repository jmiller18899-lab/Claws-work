export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

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
  /** ms timestamp the lead form first rendered — required by the server's spam guard. */
  pageRenderedAt: number;
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

export interface LeadSubmitResult {
  status: string;
  message: string;
  lead: { id: string; name: string; email: string; website: string; captured_at: string };
  audit?: { status: string };
  alert?: { status: string };
}

export async function submitLead(payload: LeadPayload) {
  const res = await fetch(`${API_BASE}/api/claw/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      website: payload.website,
      page_rendered_at: payload.pageRenderedAt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.message || data.reason || res.statusText);
  }
  return data as LeadSubmitResult;
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

// ClawAgent Sales Associate (xAI Grok Voice realtime). The browser never sees
// XAI_API_KEY: it fetches non-secret config, mints a short-lived ephemeral
// token, then opens the realtime WebSocket directly against XAI_REALTIME_WSS_URL.
export interface SalesAssociateConfig {
  enabled: boolean;
  ready: boolean;
  keyConfigured: boolean;
  agentId?: string;
  model?: string;
  voice?: string;
  realtimeUrl: string;
  tokenTtlSeconds?: number;
  tokenEndpoint: string;
  conversationEndpoint: string;
  inboxPath?: string;
  phoneNumber?: string | null;
  phoneNumberDisplay?: string | null;
  phoneHref?: string | null;
  wsProtocolPrefix: string;
}

export async function fetchSalesAssociateConfig(): Promise<SalesAssociateConfig> {
  const res = await fetch(`${API_BASE}/api/claw/sales-associate/config`);
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  return res.json();
}

export interface SalesAssociateToken {
  token: { value: string; expiresAt: number };
  agentId?: string;
  model?: string;
  voice?: string;
  realtimeUrl: string;
  wsProtocolPrefix: string;
}

export async function mintSalesAssociateToken(): Promise<SalesAssociateToken> {
  const res = await fetch(`${API_BASE}/api/claw/sales-associate/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token?.value) {
    throw new ApiError(res.status, data.message || data.reason || 'Could not start the sales associate right now.');
  }
  return data;
}

export interface SalesConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  at?: string;
}

export interface SalesConversationSaved {
  id: string;
  extracted?: { emails?: string[]; phones?: string[]; websites?: string[] };
}

export async function saveSalesConversation(payload: {
  turns: SalesConversationTurn[];
  channel: string;
  reason: string;
  started_at: string | null;
  ended_at: string;
  agent_id?: string;
  model?: string;
}): Promise<SalesConversationSaved> {
  const res = await fetch(`${API_BASE}/api/claw/sales-associate/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || data.reason || `HTTP ${res.status}`);
  return data.conversation;
}

// Text chat with the ClawAgent sales associate — a stateless-per-call
// OpenRouter completion, distinct from the xAI Grok Voice realtime call
// above. The client sends the full running message history each time;
// the server persists only the newest user turn + the generated reply.
export interface SalesChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendSalesChatMessage(sessionId: string, messages: SalesChatMessage[]) {
  const res = await fetch(`${API_BASE}/api/sales/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.reply) {
    throw new ApiError(res.status, data.message || data.error || 'Sales associate is unavailable right now.');
  }
  return data as { ok: boolean; reply: string; session_id: string };
}

// "Text or call any number" outreach tool (Twilio, server-side).
export interface OutreachSend {
  id: string;
  kind: 'sms' | 'call';
  to_number: string;
  status: string;
}

async function outreachRequest(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || data.error || res.statusText);
  return data.send as OutreachSend;
}

export function sendOutreachSms(to: string, body: string, idempotencyKey: string) {
  return outreachRequest('/api/outreach/sms', { to, body, idempotency_key: idempotencyKey });
}

export function sendOutreachCall(to: string, idempotencyKey: string) {
  return outreachRequest('/api/outreach/call', { to, idempotency_key: idempotencyKey });
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
