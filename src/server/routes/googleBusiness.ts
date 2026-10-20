import { Hono } from "hono";
import { z } from "zod";
import type { UploadPostClient } from "../lib/uploadPost";
import { failure, profileName } from "./http";

type GoogleBusinessRouterOptions = {
  client: UploadPostClient;
  connectReturnUrl: string;
};

const connectBody = z.object({ profile: profileName });

// Errors from the client are turned into responses by the parent social router's onError.
export function createGoogleBusinessRouter({ client, connectReturnUrl }: GoogleBusinessRouterOptions) {
  const app = new Hono();

  app.post("/connect", async (c) => {
    const body = connectBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return failure(400, "Invalid connect request", "invalid_request");
    const authorizeUrl = await client.startGoogleBusinessConnect(body.data.profile, connectReturnUrl);
    return c.json({ authorizeUrl });
  });

  return app;
}
