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

  it("starts Google Business oauth through its own endpoint", async () => {
    const fetchImpl = mockFetch(200, { success: true, authorize_url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const url = await client.startGoogleBusinessConnect("acme", "https://app.test/");
    const { url: called, init } = lastCall(fetchImpl);
    expect(url).toContain("accounts.google.com");
    expect(called).toBe("https://api.upload-post.com/api/uploadposts/oauth/google-business/start");
    expect(JSON.parse(String(init.body))).toEqual({ profile: "acme", redirect_url: "https://app.test/" });
  });

  it("surfaces an upstream error when Google Business oauth cannot start", async () => {
    const fetchImpl = mockFetch(403, { error: "not allowed", error_code: "PLAN_LIMIT" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.startGoogleBusinessConnect("acme", "https://app.test/")).rejects.toMatchObject({
      status: 403,
      code: "PLAN_LIMIT",
    });
  });

  it("keeps a connected Google Business account off the Instagram/Facebook accounts", async () => {
    const fetchImpl = mockFetch(200, {
      profile: {
        username: "acme",
        social_accounts: {
          google_business: { display_name: "Acme Cafe", reauth_required: true },
          instagram: "",
        },
      },
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const profile = await client.getProfile("acme");
    expect(profile.googleBusiness).toMatchObject({ displayName: "Acme Cafe", reauthRequired: true });
    expect(Object.keys(profile.accounts)).toEqual([]);
  });

  it("leaves googleBusiness unset when only a placeholder is returned", async () => {
    const fetchImpl = mockFetch(200, {
      profile: { username: "acme", social_accounts: { google_business: "" } },
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    expect((await client.getProfile("acme")).googleBusiness).toBeUndefined();
  });

  it("lists Google Business locations with the pinned one", async () => {
    const fetchImpl = mockFetch(200, {
      success: true,
      locations: [
        { name: "locations/1", title: "Acme Madrid", account_id: "key", account_name: "accounts/9" },
        { name: "locations/2", title: "Acme Lisbon" },
      ],
      selected_location_id: "locations/2",
      selected_location_name: "Acme Lisbon",
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    const result = await client.listGoogleBusinessLocations("acme");
    expect(lastCall(fetchImpl).url).toBe(
      "https://api.upload-post.com/api/uploadposts/users/google-business-location?profile_username=acme",
    );
    expect(result).toEqual({
      locations: [
        { id: "locations/1", name: "Acme Madrid" },
        { id: "locations/2", name: "Acme Lisbon" },
      ],
      selectedLocationId: "locations/2",
    });
  });

  it("reports no pinned Google Business location as null", async () => {
    const fetchImpl = mockFetch(200, {
      locations: [],
      selected_location_id: null,
      selected_location_name: null,
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    expect(await client.listGoogleBusinessLocations("acme")).toEqual({
      locations: [],
      selectedLocationId: null,
    });
  });

  it("surfaces an upstream error when listing Google Business locations", async () => {
    const fetchImpl = mockFetch(400, { error: "No Google Business connected" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.listGoogleBusinessLocations("acme")).rejects.toMatchObject({
      status: 400,
      message: "No Google Business connected",
    });
  });

  it("rejects a malformed Google Business locations response", async () => {
    const fetchImpl = mockFetch(200, { locations: [{ title: "no name" }] });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.listGoogleBusinessLocations("acme")).rejects.toMatchObject({
      status: 502,
      code: "bad_response",
    });
  });

  it("pins a Google Business location by profile and location id", async () => {
    const fetchImpl = mockFetch(200, {
      success: true,
      gbp_location_id: "locations/1",
      gbp_location_name: "Acme Madrid",
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.pinGoogleBusinessLocation("acme", "locations/1");
    const { url, init } = lastCall(fetchImpl);
    expect(url).toBe("https://api.upload-post.com/api/uploadposts/users/google-business-location");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      profile_username: "acme",
      gbp_location_id: "locations/1",
    });
  });

  it("surfaces an upstream error when the location is not available to the account", async () => {
    const fetchImpl = mockFetch(400, { error: "Location not available" });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(client.pinGoogleBusinessLocation("acme", "locations/9")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("uploads photos as an async multipart request with an idempotency key", async () => {
    const fetchImpl = mockFetch(200, { success: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.uploadPhoto({
      profile: "acme",
      platforms: ["instagram", "facebook"],
      format: "feed",
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
    expect(form.get("media_type")).toBe("IMAGE");
    expect(form.get("facebook_media_type")).toBe("POSTS");
    expect(headers.get("Idempotency-Key")).toBe("req-1");
  });

  it("marks a photo story on each selected platform only", async () => {
    const fetchImpl = mockFetch(200, { success: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.uploadPhoto({
      profile: "acme",
      platforms: ["instagram"],
      format: "story",
      file: new Blob(["x"], { type: "image/png" }),
      fileName: "a.png",
      caption: "",
      requestId: "req-2",
    });
    const form = lastCall(fetchImpl).init.body as FormData;
    expect(form.get("media_type")).toBe("STORIES");
    expect(form.has("facebook_media_type")).toBe(false);
    expect(form.has("title")).toBe(false);
  });

  it("uploads a reel to /api/upload with media types, options and an Instagram cover", async () => {
    const fetchImpl = mockFetch(200, { success: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.uploadVideo({
      profile: "acme",
      platforms: ["instagram", "facebook"],
      format: "reel",
      file: new Blob(["v"], { type: "video/mp4" }),
      fileName: "clip.mp4",
      caption: "new reel",
      description: "ignored",
      options: { shareToFeed: false, aiGenerated: true, videoState: "PUBLISHED" },
      cover: { file: new Blob(["c"], { type: "image/jpeg" }), fileName: "cover.jpg" },
      requestId: "req-3",
    });
    const { url, init, headers } = lastCall(fetchImpl);
    const form = init.body as FormData;
    expect(url).toBe("https://api.upload-post.com/api/upload");
    expect(form.getAll("video")).toHaveLength(1);
    expect(form.has("photos[]")).toBe(false);
    expect(form.get("media_type")).toBe("REELS");
    expect(form.get("facebook_media_type")).toBe("REELS");
    expect(form.get("share_to_feed")).toBe("false");
    expect(form.get("is_ai_generated")).toBe("true");
    expect(form.get("facebook_is_ai_generated")).toBe("true");
    expect(form.getAll("cover_image")).toHaveLength(1);
    expect(form.has("facebook_thumbnail")).toBe(false);
    expect(form.get("title")).toBe("new reel");
    expect(form.has("description")).toBe(false);
    expect(form.get("async_upload")).toBe("true");
    expect(headers.get("Idempotency-Key")).toBe("req-3");
  });

  it("uploads a Facebook long video with description, draft state and thumbnail", async () => {
    const fetchImpl = mockFetch(200, { success: true });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await client.uploadVideo({
      profile: "acme",
      platforms: ["facebook"],
      format: "video",
      file: new Blob(["v"], { type: "video/mp4" }),
      fileName: "talk.mp4",
      caption: "Talk",
      description: "Full recording",
      options: { shareToFeed: true, aiGenerated: false, videoState: "DRAFT" },
      cover: { file: new Blob(["c"], { type: "image/png" }), fileName: "thumb.png" },
      requestId: "req-4",
    });
    const form = lastCall(fetchImpl).init.body as FormData;
    expect(form.get("facebook_media_type")).toBe("VIDEO");
    expect(form.has("media_type")).toBe(false);
    expect(form.get("video_state")).toBe("DRAFT");
    expect(form.get("description")).toBe("Full recording");
    expect(form.getAll("facebook_thumbnail")).toHaveLength(1);
    expect(form.has("cover_image")).toBe(false);
    expect(form.has("share_to_feed")).toBe(false);
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

  it("shows Upload-Post's message when a daily cap is hit", async () => {
    const fetchImpl = mockFetch(429, {
      success: false,
      message: "Daily cap reached for instagram: 50/50 in last 24h",
      violations: [{ platform: "instagram", type: "hard_cap", used_last_24h: 50, cap: 50 }],
    });
    const client = createUploadPostClient({ apiKey: "k", fetchImpl });
    await expect(
      client.uploadPhoto({
        profile: "acme",
        platforms: ["instagram"],
        format: "feed",
        file: new Blob(["x"], { type: "image/png" }),
        fileName: "a.png",
        caption: "",
        requestId: "req-5",
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Daily cap reached for instagram: 50/50 in last 24h",
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
