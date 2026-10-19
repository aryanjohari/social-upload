import { describe, expect, it, vi } from "vitest";
import { createSocialRouter } from "./social";
import { UploadPostError, type UploadPostClient } from "../lib/uploadPost";

function setup(overrides: Partial<UploadPostClient> = {}) {
  const client = {
    listProfiles: vi.fn(async () => []),
    getProfile: vi.fn(),
    createProfile: vi.fn(),
    startConnect: vi.fn(async () => "https://auth.test/go"),
    listFacebookPages: vi.fn(),
    pinFacebookPage: vi.fn(),
    uploadPhoto: vi.fn(async () => undefined),
    uploadVideo: vi.fn(async () => undefined),
    getStatus: vi.fn(),
    ...overrides,
  } as unknown as UploadPostClient;
  const app = createSocialRouter({ client, connectReturnUrl: "https://app.test/" });
  return { app, client };
}

function uploadForm(fields: Record<string, string | string[] | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((entry) => form.append(key, entry));
    else form.set(key, value);
  }
  return form;
}

const mp4 = () => new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });
const png = () => new File([new Uint8Array(10)], "a.png", { type: "image/png" });

describe("social router", () => {
  it("returns the authorize url for a platform", async () => {
    const { app, client } = setup();
    const response = await app.request("/connect/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: "acme" }),
    });
    expect(await response.json()).toEqual({ authorizeUrl: "https://auth.test/go" });
    expect(client.startConnect).toHaveBeenCalledWith("acme", "instagram", "https://app.test/");
  });

  it("rejects unsupported platforms and bad profile names", async () => {
    const { app } = setup();
    const platform = await app.request("/connect/tiktok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: "acme" }),
    });
    const profile = await app.request("/connect/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: "bad name!" }),
    });
    expect(platform.status).toBe(400);
    expect(profile.status).toBe(400);
  });

  it("accepts a valid upload and returns a request id", async () => {
    const { app, client } = setup();
    const response = await app.request("/upload", {
      method: "POST",
      body: uploadForm({ profile: "acme", platforms: ["instagram", "facebook"], caption: "hi", file: png() }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { requestId: string };
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.uploadPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "acme",
        platforms: ["instagram", "facebook"],
        format: "feed",
        caption: "hi",
      }),
    );
  });

  it("posts a story without a caption", async () => {
    const { app, client } = setup();
    const response = await app.request("/upload", {
      method: "POST",
      body: uploadForm({ profile: "acme", platforms: ["facebook"], format: "story", caption: "ignored", file: png() }),
    });
    expect(response.status).toBe(202);
    expect(client.uploadPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ format: "story", caption: "" }),
    );
  });

  it("rejects the whole post when one platform's limit is exceeded", async () => {
    const { app, client } = setup();
    const sixMb = new File([new Uint8Array(6 * 1024 * 1024)], "a.png", { type: "image/png" });
    const response = await app.request("/upload", {
      method: "POST",
      body: uploadForm({ profile: "acme", platforms: ["instagram", "facebook"], file: sixMb }),
    });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain("Facebook");
    expect(client.uploadPhoto).not.toHaveBeenCalled();
  });

  it("allows a larger image for a Facebook story than for a Facebook feed post", async () => {
    const { app } = setup();
    const sixMb = () => new File([new Uint8Array(6 * 1024 * 1024)], "a.png", { type: "image/png" });
    const send = (format: string) =>
      app.request("/upload", {
        method: "POST",
        body: uploadForm({ profile: "acme", platforms: ["facebook"], format, file: sixMb() }),
      });
    expect((await send("feed")).status).toBe(413);
    expect((await send("story")).status).toBe(202);
  });

  it("rejects WebP for Instagram and unknown formats", async () => {
    const { app } = setup();
    const webp = new File(["x"], "a.webp", { type: "image/webp" });
    const send = (fields: Record<string, string | string[] | File>) =>
      app.request("/upload", { method: "POST", body: uploadForm(fields) });
    expect((await send({ profile: "acme", platforms: ["instagram"], file: webp })).status).toBe(415);
    expect((await send({ profile: "acme", platforms: ["facebook"], file: webp })).status).toBe(202);
    const unknown = await send({ profile: "acme", platforms: ["facebook"], format: "banner", file: png() });
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { code: string }).code).toBe("invalid_format");
  });

  it("sends a video as a reel with its options and cover, not through the photo path", async () => {
    const { app, client } = setup();
    const response = await app.request("/upload", {
      method: "POST",
      body: uploadForm({
        profile: "acme",
        platforms: ["instagram", "facebook"],
        caption: "new reel",
        shareToFeed: "false",
        aiGenerated: "true",
        cover: new File(["c"], "cover.jpg", { type: "image/jpeg" }),
        file: mp4(),
      }),
    });
    expect(response.status).toBe(202);
    expect(client.uploadPhoto).not.toHaveBeenCalled();
    expect(client.uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "reel",
        caption: "new reel",
        options: { shareToFeed: false, aiGenerated: true, videoState: "PUBLISHED" },
        cover: { file: expect.any(File), fileName: "cover.jpg" },
      }),
    );
  });

  it("keeps the description only for long videos and drops story captions", async () => {
    const { app, client } = setup();
    const send = (format: string) =>
      app.request("/upload", {
        method: "POST",
        body: uploadForm({
          profile: "acme",
          platforms: ["facebook"],
          format,
          caption: "Title",
          description: "Details",
          file: mp4(),
        }),
      });
    await send("video");
    await send("story");
    expect(client.uploadVideo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        caption: "Title",
        description: "Details",
        options: { shareToFeed: true, aiGenerated: false, videoState: "PUBLISHED" },
      }),
    );
    expect(client.uploadVideo).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ caption: "", description: "" }),
    );
  });

  it("rejects formats a platform or file kind can't do", async () => {
    const { app, client } = setup();
    const send = (fields: Record<string, string | string[] | File>) =>
      app.request("/upload", { method: "POST", body: uploadForm(fields) });
    const longOnInstagram = await send({ profile: "acme", platforms: ["instagram", "facebook"], format: "video", file: mp4() });
    expect(longOnInstagram.status).toBe(400);
    expect(((await longOnInstagram.json()) as { code: string }).code).toBe("unsupported_format");
    expect((await send({ profile: "acme", platforms: ["facebook"], format: "reel", file: png() })).status).toBe(400);
    expect((await send({ profile: "acme", platforms: ["facebook"], file: new File(["x"], "a.mp3", { type: "audio/mpeg" }) })).status).toBe(415);
    expect(client.uploadVideo).not.toHaveBeenCalled();
    expect(client.uploadPhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing file", { profile: "acme", platforms: ["instagram"] }, "missing_file"],
    ["an invalid profile", { profile: "bad name!", platforms: ["instagram"], file: mp4() }, "invalid_profile"],
    ["an unknown video state", { profile: "acme", platforms: ["instagram"], videoState: "SCHEDULED", file: mp4() }, "invalid_video_state"],
  ])("rejects %s", async (_label, fields, code) => {
    const { app, client } = setup();
    const response = await app.request("/upload", { method: "POST", body: uploadForm(fields) });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe(code);
    expect(client.uploadVideo).not.toHaveBeenCalled();
  });

  it("rejects a cover with the wrong type", async () => {
    const { app, client } = setup();
    const response = await app.request("/upload", {
      method: "POST",
      body: uploadForm({
        profile: "acme",
        platforms: ["instagram"],
        cover: new File(["c"], "cover.png", { type: "image/png" }),
        file: mp4(),
      }),
    });
    expect(response.status).toBe(415);
    expect(((await response.json()) as { error: string }).error).toContain("Instagram cover images");
    expect(client.uploadVideo).not.toHaveBeenCalled();
  });

  it("rejects an oversized request body before reading it", async () => {
    const { app, client } = setup();
    const response = await app.request("/upload", {
      method: "POST",
      headers: { "Content-Length": String(400 * 1024 * 1024) },
      body: uploadForm({ profile: "acme", platforms: ["instagram"], file: mp4() }),
    });
    expect(response.status).toBe(413);
    expect(client.uploadVideo).not.toHaveBeenCalled();
  });

  it("rejects wrong types, oversize files and missing platforms", async () => {
    const { app, client } = setup();
    const gif = new File(["x"], "a.txt", { type: "text/plain" });
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    const send = (fields: Record<string, string | string[] | File>) =>
      app.request("/upload", { method: "POST", body: uploadForm(fields) });
    expect((await send({ profile: "acme", platforms: ["instagram"], file: gif })).status).toBe(415);
    expect((await send({ profile: "acme", platforms: ["instagram"], file: big })).status).toBe(413);
    expect((await send({ profile: "acme", platforms: [], file: png() })).status).toBe(400);
    expect(client.uploadPhoto).not.toHaveBeenCalled();
  });

  it("maps upstream errors to json responses", async () => {
    const { app } = setup({
      listProfiles: vi.fn(async () => {
        throw new UploadPostError("Profile limit", 403, "PROFILE_LIMIT_REACHED");
      }),
    });
    const response = await app.request("/profiles");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Profile limit", code: "PROFILE_LIMIT_REACHED" });
  });

  it("rejects non-uuid status ids", async () => {
    const { app } = setup();
    expect((await app.request("/status/not-a-uuid")).status).toBe(400);
  });
});
