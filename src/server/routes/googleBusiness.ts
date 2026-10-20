import { Hono } from "hono";
import { z } from "zod";
import type { UploadPostClient } from "../lib/uploadPost";
import { failure, profileName } from "./http";

type GoogleBusinessRouterOptions = {
  client: UploadPostClient;
  connectReturnUrl: string;
};

const connectBody = z.object({ profile: profileName });
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

  app.post("/locations", async (c) => {
    const body = pinLocationBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid location", "invalid_request");
    await client.pinGoogleBusinessLocation(body.data.profile, body.data.locationId);
    return c.json({ ok: true });
  });

  return app;
}
