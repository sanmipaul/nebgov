export function backendBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") ||
    "http://localhost:3001"
  );
}

export const LS_AUTH_TOKEN = "nebgov-auth-token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_AUTH_TOKEN);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!token) localStorage.removeItem(LS_AUTH_TOKEN);
    else localStorage.setItem(LS_AUTH_TOKEN, token);
  } catch {
    /* ignore */
  }
}

export async function backendFetch<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const url = `${backendBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");

  if (opts.auth) {
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface ProposalVote {
  id: number;
  proposal_id: number;
  voter: string;
  support: number;
  weight: string;
  created_at: string;
  reason?: string | null;
  ledger?: number | string | null;
}

export interface VotesResponse {
  votes: ProposalVote[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function fetchProposalVotes(
  proposalId: string,
  page: number = 0,
  pageSize: number = 20,
  sort: "newest" | "weight" | "address" = "newest"
): Promise<VotesResponse> {
  return backendFetch<VotesResponse>(
    `/api/proposals/${proposalId}/votes?page=${page}&pageSize=${pageSize}&sort=${sort}`
  );
}
