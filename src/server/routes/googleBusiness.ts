import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  CTA_TYPES,
  MAX_REVIEW_PAGE_SIZE,
  REVIEW_ORDERS,
  validateLocalPost,
} from "../lib/googleBusinessRules";
import type { UploadPostClient } from "../lib/uploadPost";
import { failure, profileName } from "./http";

type GoogleBusinessRouterOptions = {
  client: UploadPostClient;
  connectReturnUrl: string;
};

const connectBody = z.object({ profile: profileName });
const ctaTypeSchema = z.enum(CTA_TYPES);

// Upload-Post documents no photo size limit; this only bounds what the server will buffer.
const POST_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

const reviewsQuery = z.object({
  profile: profileName,
  pageSize: z.coerce.number().int().min(1).max(MAX_REVIEW_PAGE_SIZE).optional(),
  pageToken: z.string().min(1).max(2000).optional(),
  orderBy: z.enum(REVIEW_ORDERS).optional(),
});

const pinLocationBody = z.object({ profile: profileName, locationId: z.string().min(1).max(200) });

// Errors from the client are turned into responses by the parent social router's onError.
export function createGoogleBusinessRouter({ client, connectReturnUrl }: GoogleBusinessRouterOptions) {
  const app = new Hono();

  app.post("/connect", async (c) => {
    const body = connectBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid connect request", "invalid_request");
    const authorizeUrl = await client.startGoogleBusinessConnect(body.data.profile, connectReturnUrl);
    return c.json({ authorizeUrl });
  });

  app.get("/locations", async (c) => {
    const profile = profileName.safeParse(c.req.query("profile"));
    if (!profile.success) return failure(400, "Invalid profile", "invalid_profile");
    return c.json(await client.listGoogleBusinessLocations(profile.data));
  });

  app.get("/reviews", async (c) => {
    const query = reviewsQuery.safeParse(c.req.query());
    if (!query.success) return failure(400, "Invalid reviews request", "invalid_request");
    const { profile, ...options } = query.data;
    return c.json(await client.listGoogleBusinessReviews(profile, options));
  });

  app.post("/locations", async (c) => {
    const body = pinLocationBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid location", "invalid_request");
    await client.pinGoogleBusinessLocation(body.data.profile, body.data.locationId);
    return c.json({ ok: true });
  });

  app.post(
    "/post",
    bodyLimit({
      maxSize: POST_BODY_LIMIT_BYTES,
      onError: () => failure(413, "Photo is too large", "file_too_large"),
    }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      if (!form) return failure(400, "Expected a form upload", "invalid_request");

      const profile = profileName.safeParse(form.get("profile"));
      if (!profile.success) return failure(400, "Invalid profile", "invalid_profile");

      const rawCta = String(form.get("ctaType") ?? "");
      const ctaType = rawCta ? ctaTypeSchema.safeParse(rawCta) : null;
      if (ctaType && !ctaType.success) return failure(400, "Unknown button type", "invalid_cta_type");

      const file = form.get("file");
      const photo = file instanceof File && file.size > 0 ? file : null;
      const summary = String(form.get("summary") ?? "").trim();
      const ctaUrl = String(form.get("ctaUrl") ?? "").trim();
      const input = {
        summary,
        ctaType: ctaType?.success ? ctaType.data : null,
        ctaUrl,
        photoType: photo?.type ?? null,
      };

      const issue = validateLocalPost(input);
      if (issue || !photo) {
        const status = issue?.code === "unsupported_type" ? 415 : 400;
        return failure(status, issue?.message ?? "Choose a photo", issue?.code ?? "photo_missing");
      }

      const requestId = crypto.randomUUID();
      await client.uploadGoogleBusinessPost({
        profile: profile.data,
        file: photo,
        fileName: photo.name || "photo",
        summary: input.summary,
        ctaType: input.ctaType,
        ctaUrl: input.ctaUrl,
        requestId,
      });
      return c.json({ requestId }, 202);
    },
  );

  return app;
}
