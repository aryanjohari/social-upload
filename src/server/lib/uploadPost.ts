import { z } from "zod";
import {
  coverField,
  mediaUpstreamFields,
  optionFields,
  type PostFormat,
  type PostOptions,
} from "./postFormats";
import { googleBusinessMethods } from "./googleBusiness";

export const PLATFORMS = ["instagram", "facebook"] as const;
export type Platform = (typeof PLATFORMS)[number];

const socialAccountSchema = z
  .object({
    display_name: z.string().nullish(),
    handle: z.string().nullish(),
    social_images: z.string().nullish(),
    reauth_required: z.boolean().nullish(),
  })
  .passthrough();

const profileSchema = z.object({
  username: z.string(),
  display_name: z.string().nullish(),
  social_accounts: z.record(z.union([socialAccountSchema, z.string(), z.null()])).default({}),
});

const profilesResponseSchema = z.object({ profiles: z.array(profileSchema) });
const profileResponseSchema = z.object({ profile: profileSchema });
const startResponseSchema = z.object({ authorize_url: z.string().url() });

const pagesResponseSchema = z.object({
  pages: z.array(
    z.object({ id: z.string(), name: z.string(), picture: z.string().nullish() }),
  ),
  selected_page_id: z.string().nullish(),
  selected_page_name: z.string().nullish(),
});

const platformResultSchema = z
  .object({
    platform: z.string(),
    success: z.boolean().nullish(),
    status: z.string().nullish(),
    message: z.string().nullish(),
    error: z.string().nullish(),
    post_url: z.string().nullish(),
  })
  .passthrough();

const statusResponseSchema = z.object({
  status: z.string(),
  completed: z.number().nullish(),
  total: z.number().nullish(),
  message: z.string().nullish(),
  results: z.array(platformResultSchema).default([]),
});

export type ConnectedAccount = {
  displayName: string | null;
  handle: string | null;
  imageUrl: string | null;
  reauthRequired: boolean;
};

export type Profile = {
  username: string;
  displayName: string | null;
  accounts: Partial<Record<Platform, ConnectedAccount>>;
  // Kept apart from accounts: the post form posts to every key of accounts, and Google Business has its own flow.
  googleBusiness?: ConnectedAccount;
};

const GOOGLE_BUSINESS_ACCOUNT_KEY = "google_business";

export type FacebookPages = {
  pages: { id: string; name: string; picture: string | null }[];
  selectedPageId: string | null;
};

export type PlatformResult = {
  platform: string;
  ok: boolean | null;
  message: string | null;
  postUrl: string | null;
};

export type UploadStatus = {
  status: string;
  done: boolean;
  completed: number;
  total: number;
  message: string | null;
  results: PlatformResult[];
};

export type PhotoUpload = {
  profile: string;
  platforms: Platform[];
  format: PostFormat;
  file: Blob;
  fileName: string;
  caption: string;
  requestId: string;
  facebookPageId?: string;
};

export type VideoUpload = PhotoUpload & {
  description: string;
  options: PostOptions;
  cover?: { file: Blob; fileName: string };
};

function uploadForm(upload: PhotoUpload, kind: "image" | "video"): FormData {
  const form = new FormData();
  form.set("user", upload.profile);
  for (const platform of upload.platforms) form.append("platform[]", platform);
  for (const [field, value] of Object.entries(mediaUpstreamFields(upload.platforms, kind, upload.format))) {
    form.set(field, value);
  }
  if (upload.caption) form.set("title", upload.caption);
  if (upload.facebookPageId) form.set("facebook_page_id", upload.facebookPageId);
  form.set("async_upload", "true");
  form.set("request_id", upload.requestId);
  return form;
}

export class UploadPostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

type ClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function toAccount(raw: z.infer<typeof socialAccountSchema>): ConnectedAccount {
  return {
    displayName: raw.display_name ?? null,
    handle: raw.handle ?? null,
    imageUrl: raw.social_images ?? null,
    reauthRequired: raw.reauth_required ?? false,
  };
}

function toProfile(raw: z.infer<typeof profileSchema>): Profile {
  const accounts: Profile["accounts"] = {};
  for (const platform of PLATFORMS) {
    const entry = raw.social_accounts[platform];
    if (entry && typeof entry === "object") accounts[platform] = toAccount(entry);
  }
  const googleBusiness = raw.social_accounts[GOOGLE_BUSINESS_ACCOUNT_KEY];
  return {
    username: raw.username,
    displayName: raw.display_name ?? null,
    accounts,
    ...(googleBusiness && typeof googleBusiness === "object"
      ? { googleBusiness: toAccount(googleBusiness) }
      : {}),
  };
}

const FINISHED = new Set(["completed", "failed", "not_found"]);

export function createUploadPostClient({ apiKey, baseUrl, fetchImpl }: ClientOptions) {
  const root = (baseUrl ?? "https://api.upload-post.com").replace(/\/$/, "");
  const doFetch = fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Apikey ${apiKey}`);
    const response = await doFetch(`${root}${path}`, { ...init, headers });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const record = (body ?? {}) as Record<string, unknown>;
      const message =
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : `Upload-Post request failed (${response.status})`;
      const code = typeof record.error_code === "string" ? record.error_code : null;
      throw new UploadPostError(message, response.status, code);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UploadPostError("Unexpected response from Upload-Post", 502, "bad_response");
    }
    return parsed.data;
  }

  async function submitUpload(path: string, form: FormData, requestId: string): Promise<void> {
    await request(path, z.object({}).passthrough(), {
      method: "POST",
      headers: { "Idempotency-Key": requestId },
      body: form,
    });
  }

  function json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    ...googleBusinessMethods({ request, json, submitUpload }),

    async listProfiles(): Promise<Profile[]> {
      const data = await request("/api/uploadposts/users", profilesResponseSchema);
      return data.profiles.map(toProfile);
    },

    async getProfile(username: string): Promise<Profile> {
      const data = await request(
        `/api/uploadposts/users/${encodeURIComponent(username)}`,
        profileResponseSchema,
      );
      return toProfile(data.profile);
    },

    async createProfile(username: string, displayName?: string): Promise<Profile> {
      const data = await request(
        "/api/uploadposts/users",
        profileResponseSchema,
        json({ username, ...(displayName ? { display_name: displayName } : {}) }),
      );
      return toProfile(data.profile);
    },

    async startConnect(profile: string, platform: Platform, redirectUrl: string): Promise<string> {
      const data = await request(
        `/api/uploadposts/oauth/${platform}/start`,
        startResponseSchema,
        json({ profile, redirect_url: redirectUrl }),
      );
      return data.authorize_url;
    },

    async listFacebookPages(profile: string): Promise<FacebookPages> {
      const data = await request(
        `/api/uploadposts/users/facebook-page?profile_username=${encodeURIComponent(profile)}`,
        pagesResponseSchema,
      );
      return {
        pages: data.pages.map((page) => ({
          id: page.id,
          name: page.name,
          picture: page.picture ?? null,
        })),
        selectedPageId: data.selected_page_id ?? null,
      };
    },

    async pinFacebookPage(profile: string, pageId: string): Promise<void> {
      await request(
        "/api/uploadposts/users/facebook-page",
        z.object({ success: z.boolean() }),
        json({ profile_username: profile, facebook_page_id: pageId }),
      );
    },

    async uploadPhoto(upload: PhotoUpload): Promise<void> {
      const form = uploadForm(upload, "image");
      form.append("photos[]", upload.file, upload.fileName);
      await submitUpload("/api/upload_photos", form, upload.requestId);
    },

    async uploadVideo(upload: VideoUpload): Promise<void> {
      const form = uploadForm(upload, "video");
      form.append("video", upload.file, upload.fileName);
      for (const [field, value] of Object.entries(
        optionFields(upload.platforms, upload.format, upload.options),
      )) {
        form.set(field, value);
      }
      if (upload.format === "video" && upload.description) {
        form.set("description", upload.description);
      }
      if (upload.cover) {
        const fields = new Set(
          upload.platforms.map((platform) => coverField(platform, upload.format)),
        );
        for (const field of fields) {
          if (field) form.append(field, upload.cover.file, upload.cover.fileName);
        }
      }
      await submitUpload("/api/upload", form, upload.requestId);
    },

    async getStatus(requestId: string): Promise<UploadStatus> {
      const data = await request(
        `/api/uploadposts/status?request_id=${encodeURIComponent(requestId)}`,
        statusResponseSchema,
      ).catch((error: unknown) => {
        if (error instanceof UploadPostError && error.status === 404) {
          return { status: "not_found", results: [] } as z.infer<typeof statusResponseSchema>;
        }
        throw error;
      });
      return {
        status: data.status,
        done: FINISHED.has(data.status),
        completed: data.completed ?? 0,
        total: data.total ?? 0,
        message: data.message ?? null,
        results: data.results.map((result) => ({
          platform: result.platform,
          ok: result.success ?? (result.status ? result.status === "completed" : null),
          message: result.error ?? result.message ?? null,
          postUrl: result.post_url ?? null,
        })),
      };
    },
  };
}

export type UploadPostClient = ReturnType<typeof createUploadPostClient>;
