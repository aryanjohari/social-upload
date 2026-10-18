import type { Platform } from "./uploadPost";

export const IMAGE_FORMATS = ["feed", "story"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

export const FORMAT_LABELS: Record<ImageFormat, string> = {
  feed: "Feed post",
  story: "Story",
};

const MB = 1024 * 1024;

type ImageRule = {
  types: readonly string[];
  maxBytes: Record<ImageFormat, number>;
  mediaTypeField: "media_type" | "facebook_media_type";
  mediaType: Record<ImageFormat, string>;
};

// Limits come from Upload-Post's photo requirements: Instagram lists JPEG/PNG/GIF at 8 MB;
// Facebook allows 4 MB for feed photos and 10 MB for stories.
export const IMAGE_RULES: Record<Platform, ImageRule> = {
  instagram: {
    types: ["image/jpeg", "image/png", "image/gif"],
    maxBytes: { feed: 8 * MB, story: 8 * MB },
    mediaTypeField: "media_type",
    mediaType: { feed: "IMAGE", story: "STORIES" },
  },
  facebook: {
    types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: { feed: 4 * MB, story: 10 * MB },
    mediaTypeField: "facebook_media_type",
    mediaType: { feed: "POSTS", story: "STORIES" },
  },
};

export const ACCEPTED_IMAGE_TYPES = [
  ...new Set(Object.values(IMAGE_RULES).flatMap((rule) => rule.types)),
];

export type ImageIssue = {
  code: "unsupported_type" | "file_too_large";
  message: string;
};

type ImageFile = { type: string; size: number };

function typeName(mimeType: string): string {
  return mimeType.replace(/^image\//, "").toUpperCase() || "this file type";
}

export function imageIssue(
  platform: Platform,
  format: ImageFormat,
  file: ImageFile,
): ImageIssue | null {
  const rule = IMAGE_RULES[platform];
  const label = PLATFORM_LABELS[platform];
  if (!rule.types.includes(file.type)) {
    return {
      code: "unsupported_type",
      message: `${label} doesn't accept ${typeName(file.type)} images`,
    };
  }
  const maxBytes = rule.maxBytes[format];
  if (file.size > maxBytes) {
    return {
      code: "file_too_large",
      message: `${label} ${FORMAT_LABELS[format].toLowerCase()} images must be ${maxBytes / MB} MB or smaller`,
    };
  }
  return null;
}

export function firstImageIssue(
  platforms: readonly Platform[],
  format: ImageFormat,
  file: ImageFile,
): ImageIssue | null {
  for (const platform of platforms) {
    const issue = imageIssue(platform, format, file);
    if (issue) return issue;
  }
  return null;
}

export function imageUpstreamFields(
  platforms: readonly Platform[],
  format: ImageFormat,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const platform of platforms) {
    const rule = IMAGE_RULES[platform];
    fields[rule.mediaTypeField] = rule.mediaType[format];
  }
  return fields;
}
