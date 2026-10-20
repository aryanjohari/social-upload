import { describe, expect, it } from "vitest";
import { MAX_LOCAL_POST_SUMMARY, validateLocalPost, type LocalPostInput } from "./googleBusiness";

const valid: LocalPostInput = {
  summary: "Now open late",
  ctaType: null,
  ctaUrl: "",
  photoType: "image/jpeg",
};

describe("validateLocalPost", () => {
  it("accepts a photo post with a summary and no button", () => {
    expect(validateLocalPost(valid)).toBeNull();
  });

  it("allows exactly the maximum summary length and rejects one more", () => {
    const atLimit = { ...valid, summary: "a".repeat(MAX_LOCAL_POST_SUMMARY) };
    const overLimit = { ...valid, summary: "a".repeat(MAX_LOCAL_POST_SUMMARY + 1) };
    expect(validateLocalPost(atLimit)).toBeNull();
    expect(validateLocalPost(overLimit)?.code).toBe("summary_too_long");
  });

  it("requires a summary", () => {
    expect(validateLocalPost({ ...valid, summary: "   " })?.code).toBe("summary_missing");
  });

  it("requires a JPG or PNG photo", () => {
    expect(validateLocalPost({ ...valid, photoType: null })?.code).toBe("photo_missing");
    expect(validateLocalPost({ ...valid, photoType: "image/webp" })?.code).toBe("unsupported_type");
    expect(validateLocalPost({ ...valid, photoType: "image/png" })).toBeNull();
  });

  it("requires an http(s) url for every button except CALL", () => {
    expect(validateLocalPost({ ...valid, ctaType: "BOOK" })?.code).toBe("cta_url_missing");
    expect(validateLocalPost({ ...valid, ctaType: "BOOK", ctaUrl: "not a url" })?.code).toBe(
      "cta_url_invalid",
    );
    expect(validateLocalPost({ ...valid, ctaType: "BOOK", ctaUrl: "javascript:alert(1)" })?.code).toBe(
      "cta_url_invalid",
    );
    expect(validateLocalPost({ ...valid, ctaType: "BOOK", ctaUrl: "https://acme.test/book" })).toBeNull();
  });

  it("rejects a url on a CALL button", () => {
    expect(validateLocalPost({ ...valid, ctaType: "CALL", ctaUrl: "https://acme.test" })?.code).toBe(
      "cta_url_not_allowed",
    );
    expect(validateLocalPost({ ...valid, ctaType: "CALL" })).toBeNull();
  });

  it("rejects a url without a button type", () => {
    expect(validateLocalPost({ ...valid, ctaUrl: "https://acme.test" })?.code).toBe("cta_type_missing");
  });
});
