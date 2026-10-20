import { z } from "zod";
import type { CtaType } from "./googleBusinessRules";

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
