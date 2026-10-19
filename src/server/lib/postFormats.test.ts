import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  coverField,
  coverIssue,
  firstMediaIssue,
  mediaIssue,
  mediaUpstreamFields,
  optionFields,
  resolvePostTarget,
  videoMetaWarnings,
} from "./postFormats";

const MB = 1024 * 1024;

describe("mediaIssue", () => {
  it.each([
    ["instagram", "feed", "image/png", 8 * MB, null],
    ["instagram", "feed", "image/png", 8 * MB + 1, "file_too_large"],
    ["instagram", "story", "image/webp", MB, "unsupported_type"],
    ["facebook", "feed", "image/webp", 4 * MB, null],
    ["facebook", "feed", "image/jpeg", 4 * MB + 1, "file_too_large"],
    ["facebook", "story", "image/jpeg", 10 * MB, null],
    ["facebook", "story", "image/jpeg", 10 * MB + 1, "file_too_large"],
    ["instagram", "reel", "video/mp4", 300 * MB, null],
    ["instagram", "reel", "video/mp4", 300 * MB + 1, "file_too_large"],
    ["instagram", "story", "video/quicktime", 100 * MB, null],
    ["instagram", "story", "video/quicktime", 100 * MB + 1, "file_too_large"],
    ["instagram", "reel", "video/webm", MB, "unsupported_type"],
    ["instagram", "video", "video/mp4", MB, "unsupported_format"],
    ["facebook", "video", "video/mp4", 300 * MB, null],
    ["facebook", "reel", "image/png", MB, "unsupported_format"],
    ["facebook", "feed", "video/mp4", MB, "unsupported_format"],
    ["facebook", "feed", "text/plain", 10, "unsupported_type"],
  ] as const)("%s %s %s %i bytes -> %s", (platform, format, type, size, expected) => {
    expect(mediaIssue(platform, format, { type, size })?.code ?? null).toBe(expected);
  });

  it("names the platform, limit and format in the message", () => {
    expect(mediaIssue("facebook", "feed", { type: "image/png", size: 5 * MB })?.message).toBe(
      "Facebook images for a feed post must be 4 MB or smaller",
    );
    expect(mediaIssue("instagram", "video", { type: "video/mp4", size: MB })?.message).toBe(
      "Instagram can't post a video as a long video",
    );
    expect(mediaIssue("instagram", "story", { type: "image/webp", size: MB })?.message).toBe(
      "Instagram doesn't accept WEBP images",
    );
  });
});

describe("firstMediaIssue", () => {
  it("reports the first platform that fails", () => {
    const file = { type: "image/png", size: 6 * MB };
    expect(firstMediaIssue(["instagram"], "feed", file)).toBeNull();
    expect(firstMediaIssue(["instagram", "facebook"], "feed", file)?.message).toContain("Facebook");
  });
});

describe("mediaUpstreamFields", () => {
  it("maps each selected platform's media type per kind and format", () => {
    expect(mediaUpstreamFields(["instagram", "facebook"], "image", "story")).toEqual({
      media_type: "STORIES",
      facebook_media_type: "STORIES",
    });
    expect(mediaUpstreamFields(["facebook"], "image", "feed")).toEqual({
      facebook_media_type: "POSTS",
    });
    expect(mediaUpstreamFields(["instagram", "facebook"], "video", "reel")).toEqual({
      media_type: "REELS",
      facebook_media_type: "REELS",
    });
    expect(mediaUpstreamFields(["instagram", "facebook"], "video", "video")).toEqual({
      facebook_media_type: "VIDEO",
    });
  });
});

describe("optionFields", () => {
  it("sends reel options per platform and omits the AI label when off", () => {
    expect(optionFields(["instagram", "facebook"], "reel", DEFAULT_OPTIONS)).toEqual({
      share_to_feed: "true",
    });
    expect(
      optionFields(["instagram", "facebook"], "reel", {
        ...DEFAULT_OPTIONS,
        shareToFeed: false,
        aiGenerated: true,
      }),
    ).toEqual({
      share_to_feed: "false",
      is_ai_generated: "true",
      facebook_is_ai_generated: "true",
    });
  });

  it("sends the video state only for Facebook long videos", () => {
    const draft = { ...DEFAULT_OPTIONS, videoState: "DRAFT" } as const;
    expect(optionFields(["facebook"], "video", draft)).toEqual({ video_state: "DRAFT" });
    expect(optionFields(["facebook"], "story", draft)).toEqual({});
    expect(optionFields(["instagram", "facebook"], "feed", draft)).toEqual({});
  });
});

describe("covers", () => {
  it("picks the cover field per platform and format", () => {
    expect(coverField("instagram", "reel")).toBe("cover_image");
    expect(coverField("facebook", "video")).toBe("facebook_thumbnail");
    expect(coverField("facebook", "reel")).toBeNull();
    expect(coverField("instagram", "story")).toBeNull();
  });

  it.each([
    [["instagram"], "reel", "image/jpeg", 8 * MB, null],
    [["instagram"], "reel", "image/png", MB, "unsupported_type"],
    [["instagram"], "reel", "image/jpeg", 8 * MB + 1, "file_too_large"],
    [["facebook"], "video", "image/png", 10 * MB, null],
    [["facebook"], "video", "image/png", 10 * MB + 1, "file_too_large"],
    [["facebook"], "reel", "image/gif", 100 * MB, null],
  ] as const)("%j %s %s %i bytes -> %s", (platforms, format, type, size, expected) => {
    expect(coverIssue(platforms, format, { type, size })?.code ?? null).toBe(expected);
  });
});

describe("videoMetaWarnings", () => {
  const portrait = { duration: 30, width: 1080, height: 1920 };

  it("has no warnings for a valid vertical clip", () => {
    expect(videoMetaWarnings(["instagram", "facebook"], "reel", portrait)).toEqual([]);
  });

  it("warns about duration and shape per platform", () => {
    const long = { duration: 120, width: 1920, height: 1080 };
    expect(videoMetaWarnings(["facebook"], "reel", long)).toEqual([
      "Facebook Reels must be 3 to 90 seconds",
      "Facebook Reels should be vertical 9:16 (1080×1920)",
    ]);
    expect(videoMetaWarnings(["instagram"], "reel", long)).toEqual([]);
    expect(videoMetaWarnings(["instagram"], "reel", { ...portrait, duration: 2 })).toHaveLength(1);
    expect(videoMetaWarnings(["facebook"], "story", { ...portrait, duration: 61 })).toEqual([
      "Facebook Stories can be at most 60 seconds",
    ]);
  });
});

describe("resolvePostTarget", () => {
  const both = ["instagram", "facebook"] as const;

  it("assumes an image with no file and keeps a valid requested format", () => {
    expect(resolvePostTarget(null, "story", both)).toMatchObject({
      kind: "image",
      format: "story",
      fileSupported: true,
      platforms: ["instagram", "facebook"],
    });
  });

  it("falls back to the kind's default when the requested format doesn't fit the file", () => {
    expect(resolvePostTarget("video/mp4", "feed", both).format).toBe("reel");
    expect(resolvePostTarget("image/png", "video", both).format).toBe("feed");
  });

  it("drops platforms that can't do the resulting format", () => {
    const target = resolvePostTarget("video/mp4", "video", both);
    expect(target.format).toBe("video");
    expect(target.platforms).toEqual(["facebook"]);
  });

  it("flags an unsupported file and treats it as an image", () => {
    expect(resolvePostTarget("audio/mpeg", "feed", both)).toMatchObject({
      kind: "image",
      fileSupported: false,
    });
  });
});
