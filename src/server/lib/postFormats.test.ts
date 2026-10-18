import { describe, expect, it } from "vitest";
import { firstImageIssue, imageIssue, imageUpstreamFields } from "./postFormats";

const MB = 1024 * 1024;

describe("imageIssue", () => {
  it.each([
    ["instagram", "feed", "image/png", 8 * MB, null],
    ["instagram", "feed", "image/png", 8 * MB + 1, "file_too_large"],
    ["instagram", "story", "image/webp", MB, "unsupported_type"],
    ["facebook", "feed", "image/webp", 4 * MB, null],
    ["facebook", "feed", "image/jpeg", 4 * MB + 1, "file_too_large"],
    ["facebook", "story", "image/jpeg", 10 * MB, null],
    ["facebook", "story", "image/jpeg", 10 * MB + 1, "file_too_large"],
  ] as const)("%s %s %s %i bytes -> %s", (platform, format, type, size, expected) => {
    expect(imageIssue(platform, format, { type, size })?.code ?? null).toBe(expected);
  });

  it("names the platform and limit in the message", () => {
    const issue = imageIssue("facebook", "feed", { type: "image/png", size: 5 * MB });
    expect(issue?.message).toBe("Facebook feed post images must be 4 MB or smaller");
  });
});

describe("firstImageIssue", () => {
  it("reports the first platform that fails", () => {
    const file = { type: "image/png", size: 6 * MB };
    expect(firstImageIssue(["instagram"], "feed", file)).toBeNull();
    expect(firstImageIssue(["instagram", "facebook"], "feed", file)?.message).toContain("Facebook");
  });
});

describe("imageUpstreamFields", () => {
  it("maps each selected platform's media type", () => {
    expect(imageUpstreamFields(["instagram", "facebook"], "story")).toEqual({
      media_type: "STORIES",
      facebook_media_type: "STORIES",
    });
    expect(imageUpstreamFields(["facebook"], "feed")).toEqual({ facebook_media_type: "POSTS" });
  });
});
