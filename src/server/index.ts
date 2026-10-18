import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createUploadPostClient } from "./lib/uploadPost";
import { createSocialRouter } from "./routes/social";

const apiKey = process.env.UPLOAD_POST_API_KEY;
if (!apiKey) {
  throw new Error("UPLOAD_POST_API_KEY is not set. Copy .env.example to .env and fill it in.");
}

const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 8787);

const app = new Hono();
app.route(
  "/social",
  createSocialRouter({
    client: createUploadPostClient({ apiKey }),
    connectReturnUrl: `${appUrl}/`,
  }),
);
app.use("/*", serveStatic({ root: "./dist/web" }));
app.get("/*", serveStatic({ path: "./dist/web/index.html" }));

serve({ fetch: app.fetch, port }, () => {
  console.log(`social-upload server on http://localhost:${port}`);
});
