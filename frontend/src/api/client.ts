import type {
  AnalyzeResponse,
  ProfileCreatePayload,
  ProfileCreateResponse,
  ProfileResponse,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (err) {
    console.error("Network error:", err);
    throw new Error("Couldn't reach the server. Is the backend running?");
  }

  if (!res.ok) {
    let rawBody: unknown = null;
    try {
      rawBody = await res.json();
    } catch {
      // body wasn't JSON; ignore
    }
    console.error(`API error ${res.status}:`, rawBody);

    const body = (rawBody as { detail?: unknown }) ?? {};
    let detail: string;
    if (res.status === 404 || res.status === 422) {
      // 404 = no such profile; 422 = malformed UUID in URL. Both feel the same to a user.
      detail =
        typeof body.detail === "string" ? body.detail : "Profile not found.";
    } else if (res.status >= 500) {
      detail = "Something went wrong. Please try again.";
    } else if (typeof body.detail === "string") {
      detail = body.detail;
    } else {
      detail = res.statusText || "Request failed.";
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export function createProfile(
  data: ProfileCreatePayload
): Promise<ProfileCreateResponse> {
  return request("/api/profiles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getProfile(id: string): Promise<ProfileResponse> {
  return request(`/api/profiles/${id}`);
}

export function analyzeProfile(id: string): Promise<AnalyzeResponse> {
  return request(`/api/profiles/${id}/analyze`, { method: "POST" });
}

export function listProfiles(): Promise<ProfileResponse[]> {
  return request("/api/profiles");
}
