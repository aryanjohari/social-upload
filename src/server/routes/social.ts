import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { VIDEO_CEILING_BYTES } from "../lib/postFormats";
import { PLATFORMS, UploadPostError, type UploadPostClient } from "../lib/uploadPost";
import { createGoogleBusinessRouter } from "./googleBusiness";
import { failure, profileName } from "./http";
import { parseUploadForm } from "./uploadRequest";

type SocialRouterOptions = {
  client: UploadPostClient;
  connectReturnUrl: string;
};

const platformSchema = z.enum(PLATFORMS);

const createProfileBody = z.object({
  username: profileName,
  displayName: z.string().trim().max(100).optional(),
});
const connectBody = z.object({ profile: profileName });
const pinPageBody = z.object({ profile: profileName, pageId: z.string().min(1).max(64) });

const UPLOAD_BODY_LIMIT_BYTES = VIDEO_CEILING_BYTES + 30 * 1024 * 1024;

export function createSocialRouter({ client, connectReturnUrl }: SocialRouterOptions) {
  const app = new Hono();

  app.onError((error) => {
    if (error instanceof UploadPostError) {
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return failure(status, error.message, error.code ?? "upstream_error");
    }
    return failure(500, "Something went wrong", "internal_error");
  });

  app.route("/google-business", createGoogleBusinessRouter({ client, connectReturnUrl }));

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

  app.post(
    "/upload",
    bodyLimit({
      maxSize: UPLOAD_BODY_LIMIT_BYTES,
      onError: () => failure(413, "Upload is too large", "file_too_large"),
    }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      if (!form) return failure(400, "Expected a form upload", "invalid_request");

      const parsed = parseUploadForm(form);
      if (!parsed.ok) return failure(parsed.status, parsed.message, parsed.code);
      const upload = parsed.value;

      const requestId = crypto.randomUUID();
      const common = {
        profile: upload.profile,
        platforms: upload.platforms,
        format: upload.format,
        file: upload.file,
        fileName: upload.file.name || upload.kind,
        caption: upload.caption,
        requestId,
      };
      if (upload.kind === "image") {
        await client.uploadPhoto(common);
      } else {
        await client.uploadVideo({
          ...common,
          description: upload.description,
          options: upload.options,
          cover: upload.cover
            ? { file: upload.cover, fileName: upload.cover.name || "cover" }
            : undefined,
        });
      }
      return c.json({ requestId }, 202);
    },
  );

  app.get("/status/:requestId", async (c) => {
    const requestId = z.string().uuid().safeParse(c.req.param("requestId"));
    if (!requestId.success) return failure(400, "Invalid request id", "invalid_request");
    return c.json(await client.getStatus(requestId.data));
  });

  return app;
}
