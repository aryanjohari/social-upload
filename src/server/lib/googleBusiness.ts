import { z } from "zod";

const startResponseSchema = z.object({ authorize_url: z.string().url() });

const locationsResponseSchema = z.object({
  locations: z.array(z.object({ name: z.string(), title: z.string() }).passthrough()),
  selected_location_id: z.string().nullish(),
});

export type GoogleBusinessLocations = {
  locations: { id: string; name: string }[];
  selectedLocationId: string | null;
};

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init?: RequestInit,
) => Promise<T>;

type JsonInit = (body: unknown) => RequestInit;
type SubmitUpload = (path: string, form: FormData, requestId: string) => Promise<void>;

export const MAX_LOCAL_POST_SUMMARY = 1500;
export const CTA_TYPES = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"] as const;
export type CtaType = (typeof CTA_TYPES)[number];
export const CTA_LABELS: Record<CtaType, string> = {
  BOOK: "Book",
  ORDER: "Order",
  SHOP: "Shop",
  LEARN_MORE: "Learn more",
  SIGN_UP: "Sign up",
  CALL: "Call",
};
export const LOCAL_POST_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

export type LocalPostInput = {
  summary: string;
  ctaType: CtaType | null;
  ctaUrl: string;
  photoType: string | null;
};

export type LocalPostIssue = {
  code:
    | "summary_missing"
    | "summary_too_long"
    | "photo_missing"
    | "unsupported_type"
    | "cta_type_missing"
    | "cta_url_missing"
    | "cta_url_invalid"
    | "cta_url_not_allowed";
  message: string;
};

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Rules shared by the route and the form. Photo size limits are unknown, so none is enforced.
export function validateLocalPost(input: LocalPostInput): LocalPostIssue | null {
  if (!input.summary.trim()) return { code: "summary_missing", message: "Write something for the post" };
  if (input.summary.length > MAX_LOCAL_POST_SUMMARY) {
    return {
      code: "summary_too_long",
      message: `Keep the post under ${MAX_LOCAL_POST_SUMMARY} characters`,
    };
  }
  if (!input.photoType) return { code: "photo_missing", message: "Choose a photo" };
  if (!(LOCAL_POST_PHOTO_TYPES as readonly string[]).includes(input.photoType)) {
    return { code: "unsupported_type", message: "Use a JPG or PNG photo" };
  }
  if (!input.ctaType) {
    return input.ctaUrl
      ? { code: "cta_type_missing", message: "Choose a button type for the link" }
      : null;
  }
  if (input.ctaType === "CALL") {
    return input.ctaUrl
      ? { code: "cta_url_not_allowed", message: "A Call button doesn't take a link" }
      : null;
  }
  if (!input.ctaUrl) return { code: "cta_url_missing", message: "Add a link for the button" };
  if (!isHttpUrl(input.ctaUrl)) {
    return { code: "cta_url_invalid", message: "The button link must start with http:// or https://" };
  }
  return null;
}

export type GoogleBusinessPost = {
  profile: string;
  file: Blob;
  fileName: string;
  summary: string;
  ctaType: CtaType | null;
  ctaUrl: string;
  requestId: string;
};

// Takes the shared helpers from createUploadPostClient so this file does not import it back.
export function googleBusinessMethods({
  request,
  json,
  submitUpload,
}: {
  request: Request;
  json: JsonInit;
  submitUpload: SubmitUpload;
}) {
  return {
    async startGoogleBusinessConnect(profile: string, redirectUrl: string): Promise<string> {
      const data = await request(
        "/api/uploadposts/oauth/google-business/start",
        startResponseSchema,
        json({ profile, redirect_url: redirectUrl }),
      );
      return data.authorize_url;
    },

    async listGoogleBusinessLocations(profile: string): Promise<GoogleBusinessLocations> {
      const data = await request(
        `/api/uploadposts/users/google-business-location?profile_username=${encodeURIComponent(profile)}`,
        locationsResponseSchema,
      );
      return {
        locations: data.locations.map((location) => ({ id: location.name, name: location.title })),
        selectedLocationId: data.selected_location_id ?? null,
      };
    },

    async pinGoogleBusinessLocation(profile: string, locationId: string): Promise<void> {
      await request(
        "/api/uploadposts/users/google-business-location",
        z.object({ success: z.boolean() }),
        json({ profile_username: profile, gbp_location_id: locationId }),
      );
    },

    // No location id is sent: the pinned location (or the only one) is used upstream.
    async uploadGoogleBusinessPost(post: GoogleBusinessPost): Promise<void> {
      const form = new FormData();
      form.set("user", post.profile);
      form.append("platform[]", "google_business");
      form.set("title", post.summary);
      form.set("gbp_topic_type", "STANDARD");
      if (post.ctaType) form.set("gbp_cta_type", post.ctaType);
      if (post.ctaUrl) form.set("gbp_cta_url", post.ctaUrl);
      form.set("async_upload", "true");
      form.set("request_id", post.requestId);
      form.append("photos[]", post.file, post.fileName);
      await submitUpload("/api/upload_photos", form, post.requestId);
    },
  };
}
