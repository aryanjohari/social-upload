import { Hono } from "hono";
import { z } from "zod";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PLATFORMS,
  UploadPostError,
  type UploadPostClient,
} from "../lib/uploadPost";

type SocialRouterOptions = {
  client: UploadPostClient;
  connectReturnUrl: string;
};

const profileName = z.string().regex(/^[A-Za-z0-9_@-]{1,64}$/);
const platformSchema = z.enum(PLATFORMS);

const createProfileBody = z.object({
  username: profileName,
  displayName: z.string().trim().max(100).optional(),
});
const connectBody = z.object({ profile: profileName });
const pinPageBody = z.object({ profile: profileName, pageId: z.string().min(1).max(64) });

function failure(status: number, message: string, code: string) {
  return Response.json({ error: message, code }, { status });
}

export function createSocialRouter({ client, connectReturnUrl }: SocialRouterOptions) {
  const app = new Hono();

  app.onError((error) => {
    if (error instanceof UploadPostError) {
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return failure(status, error.message, error.code ?? "upstream_error");
    }
    return failure(500, "Something went wrong", "internal_error");
  });

  app.get("/profiles", async (c) => c.json({ profiles: await client.listProfiles() }));

  app.post("/profiles", async (c) => {
    const body = createProfileBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid profile name", "invalid_profile");
    const profile = await client.createProfile(body.data.username, body.data.displayName);
    return c.json({ profile }, 201);
  });

  app.get("/accounts", async (c) => {
    const profile = profileName.safeParse(c.req.query("profile"));
    if (!profile.success) return failure(400, "Invalid profile", "invalid_profile");
    return c.json({ profile: await client.getProfile(profile.data) });
  });

  app.post("/connect/:platform", async (c) => {
    const platform = platformSchema.safeParse(c.req.param("platform"));
    const body = connectBody.safeParse(await c.req.json().catch(() => null));
    if (!platform.success || !body.success) {
      return failure(400, "Invalid connect request", "invalid_request");
    }
    const authorizeUrl = await client.startConnect(
      body.data.profile,
      platform.data,
      connectReturnUrl,
    );
    return c.json({ authorizeUrl });
  });

  app.get("/facebook-pages", async (c) => {
    const profile = profileName.safeParse(c.req.query("profile"));
    if (!profile.success) return failure(400, "Invalid profile", "invalid_profile");
    return c.json(await client.listFacebookPages(profile.data));
  });

  app.post("/facebook-pages", async (c) => {
    const body = pinPageBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid page", "invalid_request");
    await client.pinFacebookPage(body.data.profile, body.data.pageId);
    return c.json({ ok: true });
  });

  app.post("/upload", async (c) => {
    const form = await c.req.formData().catch(() => null);
    if (!form) return failure(400, "Expected a form upload", "invalid_request");

    const profile = profileName.safeParse(form.get("profile"));
    const platforms = z
      .array(platformSchema)
      .min(1)
      .safeParse(form.getAll("platforms"));
    const file = form.get("file");
    const caption = String(form.get("caption") ?? "").slice(0, 2200);

    if (!profile.success) return failure(400, "Invalid profile", "invalid_profile");
    if (!platforms.success) return failure(400, "Pick at least one platform", "invalid_platforms");
    if (!(file instanceof File)) return failure(400, "Choose an image", "missing_file");
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      return failure(415, "Use a JPEG, PNG, WebP or GIF image", "unsupported_type");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return failure(413, "Image must be 8 MB or smaller", "file_too_large");
    }

    const requestId = crypto.randomUUID();
    await client.uploadPhoto({
      profile: profile.data,
      platforms: [...new Set(platforms.data)],
      file,
      fileName: file.name || "photo",
      caption,
      requestId,
    });
    return c.json({ requestId }, 202);
  });

  app.get("/status/:requestId", async (c) => {
    const requestId = z.string().uuid().safeParse(c.req.param("requestId"));
    if (!requestId.success) return failure(400, "Invalid request id", "invalid_request");
    return c.json(await client.getStatus(requestId.data));
  });

  return app;
}
