import type { PostFormat, PostOptions } from "../server/lib/postFormats";
import type { GoogleBusinessLocations } from "../server/lib/googleBusiness";
import type { CtaType } from "../server/lib/googleBusinessRules";
import type {
  ConnectedAccount,
  FacebookPages,
  Platform,
  Profile,
  UploadStatus,
} from "../server/lib/uploadPost";

export type {
  ConnectedAccount,
  FacebookPages,
  GoogleBusinessLocations,
  Platform,
  PostFormat,
  PostOptions,
  Profile,
  UploadStatus,
};

export class ApiError extends Error {}

export type UploadInput = {
  profile: string;
  platforms: Platform[];
  format: PostFormat;
  file: File;
  caption: string;
  description: string;
  options: PostOptions;
  cover: File | null;
};

export type GoogleBusinessPostInput = {
  profile: string;
  summary: string;
  ctaType: CtaType | null;
  ctaUrl: string;
  file: File;
};

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

  startGoogleBusinessConnect: (profile: string) =>
    call<{ authorizeUrl: string }>("/google-business/connect", jsonBody({ profile })).then(
      (data) => data.authorizeUrl,
    ),

  postToGoogleBusiness: (input: GoogleBusinessPostInput) => {
    const form = new FormData();
    form.set("profile", input.profile);
    form.set("summary", input.summary);
    form.set("ctaType", input.ctaType ?? "");
    form.set("ctaUrl", input.ctaUrl);
    form.set("file", input.file);
    return call<{ requestId: string }>("/google-business/post", { method: "POST", body: form }).then(
      (data) => data.requestId,
    );
  },

  googleBusinessLocations: (profile: string) =>
    call<GoogleBusinessLocations>(`/google-business/locations?profile=${encodeURIComponent(profile)}`),

  pinGoogleBusinessLocation: (profile: string, locationId: string) =>
    call<{ ok: true }>("/google-business/locations", jsonBody({ profile, locationId })),

  facebookPages: (profile: string) =>
    call<FacebookPages>(`/facebook-pages?profile=${encodeURIComponent(profile)}`),

  pinFacebookPage: (profile: string, pageId: string) =>
    call<{ ok: true }>("/facebook-pages", jsonBody({ profile, pageId })),

  upload: (input: UploadInput) => {
    const form = new FormData();
    form.set("profile", input.profile);
    for (const platform of input.platforms) form.append("platforms", platform);
    form.set("format", input.format);
    form.set("file", input.file);
    form.set("caption", input.caption);
    form.set("description", input.description);
    form.set("shareToFeed", String(input.options.shareToFeed));
    form.set("aiGenerated", String(input.options.aiGenerated));
    form.set("videoState", input.options.videoState);
    if (input.cover) form.set("cover", input.cover);
    return call<{ requestId: string }>("/upload", { method: "POST", body: form }).then(
      (data) => data.requestId,
    );
  },

  status: (requestId: string) => call<UploadStatus>(`/status/${requestId}`),
};
