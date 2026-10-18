import type { FacebookPages, Platform, Profile, UploadStatus } from "../server/lib/uploadPost";

export type { FacebookPages, Platform, Profile, UploadStatus };

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/social${path}`, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed";
    throw new ApiError(message);
  }
  return body as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  listProfiles: () => call<{ profiles: Profile[] }>("/profiles").then((data) => data.profiles),

  createProfile: (username: string, displayName: string) =>
    call<{ profile: Profile }>("/profiles", jsonBody({ username, displayName })).then(
      (data) => data.profile,
    ),

  getProfile: (profile: string) =>
    call<{ profile: Profile }>(`/accounts?profile=${encodeURIComponent(profile)}`).then(
      (data) => data.profile,
    ),

  startConnect: (profile: string, platform: Platform) =>
    call<{ authorizeUrl: string }>(`/connect/${platform}`, jsonBody({ profile })).then(
      (data) => data.authorizeUrl,
    ),

  facebookPages: (profile: string) =>
    call<FacebookPages>(`/facebook-pages?profile=${encodeURIComponent(profile)}`),

  pinFacebookPage: (profile: string, pageId: string) =>
    call<{ ok: true }>("/facebook-pages", jsonBody({ profile, pageId })),

  upload: (profile: string, platforms: Platform[], file: File, caption: string) => {
    const form = new FormData();
    form.set("profile", profile);
    for (const platform of platforms) form.append("platforms", platform);
    form.set("file", file);
    form.set("caption", caption);
    return call<{ requestId: string }>("/upload", { method: "POST", body: form }).then(
      (data) => data.requestId,
    );
  },

  status: (requestId: string) => call<UploadStatus>(`/status/${requestId}`),
};
