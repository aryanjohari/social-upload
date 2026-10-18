import { describe, expect, it, vi } from "vitest";
import { UploadPostError, createUploadPostClient } from "./uploadPost";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function lastCall(fetchImpl: ReturnType<typeof mockFetch>) {
  const call = fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url: call[0], init: call[1], headers: new Headers(call[1].headers) };
}

describe("createUploadPostClient", () => {
  it("normalizes connected accounts and drops unconnected placeholders", async () => {
    const fetchImpl = mockFetch(200, {
      profiles: [
        {
          username: "acme",
          display_name: "Acme",
          social_accounts: {
            instagram: { display_name: "Acme IG", handle: "acme", social_images: "http://x/i.png" },
            facebook: "",
            tiktok: "",
          },
        },
      ],
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const [profile] = await client.listProfiles();
    expect(profile?.accounts.instagram?.handle).toBe("acme");
    expect(profile?.accounts.facebook).toBeUndefined();
    expect(lastCall(fetchImpl).headers.get("Authorization")).toBe("Apikey k");
  });

  it("starts oauth with the profile and return url", async () => {
    const fetchImpl = mockFetch(200, { success: true, authorize_url: "https://www.instagram.com/oauth/authorize?x=1" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const url = await client.startConnect("acme", "instagram", "https://app.test/");
    const { url: called, init } = lastCall(fetchImpl);
    expect(url).toContain("instagram.com");
    expect(called).toBe("https://api.upload-post.com/api/uploadposts/oauth/instagram/start");
    expect(JSON.parse(String(init.body))).toEqual({ profile: "acme", redirect_url: "https://app.test/" });
  });

  it("uploads photos as an async multipart request with an idempotency key", async () => {
    const fetchImpl = mockFetch(200, { success: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.uploadPhoto({
      profile: "acme",
      platforms: ["instagram", "facebook"],
      file: new Blob(["x"], { type: "image/png" }),
      fileName: "a.png",
      caption: "hello",
      requestId: "req-1",
    });
    const { url, init, headers } = lastCall(fetchImpl);
    const form = init.body as FormData;
    expect(url).toBe("https://api.upload-post.com/api/upload_photos");
    expect(form.getAll("platform[]")).toEqual(["instagram", "facebook"]);
    expect(form.get("title")).toBe("hello");
    expect(form.get("async_upload")).toBe("true");
    expect(form.get("request_id")).toBe("req-1");
    expect(form.get("user")).toBe("acme");
    expect(form.getAll("photos[]")).toHaveLength(1);
    expect(headers.get("Idempotency-Key")).toBe("req-1");
  });

  it("surfaces upstream errors with status and code", async () => {
    const fetchImpl = mockFetch(409, { error: "exists", error_code: "PROFILE_EXISTS" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.createProfile("acme")).rejects.toMatchObject({
      status: 409,
      code: "PROFILE_EXISTS",
      message: "exists",
    });
  });

  it("rejects malformed upstream responses", async () => {
    const fetchImpl = mockFetch(200, { nope: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.listProfiles()).rejects.toBeInstanceOf(UploadPostError);
  });

  it("maps status results and marks terminal states done", async () => {
    const fetchImpl = mockFetch(200, {
      status: "completed",
      completed: 2,
      total: 2,
      results: [
        { platform: "instagram", success: true, message: "Published" },
        { platform: "facebook", success: false, error: "Page missing" },
      ],
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const status = await client.getStatus("abc");
    expect(status.done).toBe(true);
    expect(status.results.map((result) => result.ok)).toEqual([true, false]);
    expect(status.results[1]?.message).toBe("Page missing");
  });

  it("treats a 404 status as not_found", async () => {
    const fetchImpl = mockFetch(404, { status: "not_found" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const status = await client.getStatus("abc");
    expect(status.status).toBe("not_found");
    expect(status.done).toBe(true);
  });
});
