// Pure Google Business rules with no dependencies, so the web form can import them without pulling in zod.
export const MAX_LOCAL_POST_SUMMARY = 1500;
export const CTA_TYPES = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"] as const;
export type CtaType = (typeof CTA_TYPES)[number];
export const CTA_LABELS: Record<CtaType, string> = {
  BOOK: "Book",
  ORDER: "Order",
  SHOP: "Shop",
  LEARN_MORE: "Learn more",
  SIGN_UP: "Sign up",
  CALL: "Call",
};
export const LOCAL_POST_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

export type LocalPostInput = {
  summary: string;
  ctaType: CtaType | null;
  ctaUrl: string;
  photoType: string | null;
};

export type LocalPostIssue = {
  code:
    | "summary_missing"
    | "summary_too_long"
    | "photo_missing"
    | "unsupported_type"
    | "cta_type_missing"
    | "cta_url_missing"
    | "cta_url_invalid"
    | "cta_url_not_allowed";
  message: string;
};

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Rules shared by the route and the form. Photo size limits are unknown, so none is enforced.
export function validateLocalPost(input: LocalPostInput): LocalPostIssue | null {
  if (!input.summary.trim()) return { code: "summary_missing", message: "Write something for the post" };
  if (input.summary.length > MAX_LOCAL_POST_SUMMARY) {
    return {
      code: "summary_too_long",
      message: `Keep the post under ${MAX_LOCAL_POST_SUMMARY} characters`,
    };
  }
  if (!input.photoType) return { code: "photo_missing", message: "Choose a photo" };
  if (!(LOCAL_POST_PHOTO_TYPES as readonly string[]).includes(input.photoType)) {
    return { code: "unsupported_type", message: "Use a JPG or PNG photo" };
  }
  if (!input.ctaType) {
    return input.ctaUrl
      ? { code: "cta_type_missing", message: "Choose a button type for the link" }
      : null;
  }
  if (input.ctaType === "CALL") {
    return input.ctaUrl
      ? { code: "cta_url_not_allowed", message: "A Call button doesn't take a link" }
      : null;
  }
  if (!input.ctaUrl) return { code: "cta_url_missing", message: "Add a link for the button" };
  if (!isHttpUrl(input.ctaUrl)) {
    return { code: "cta_url_invalid", message: "The button link must start with http:// or https://" };
  }
  return null;
}
