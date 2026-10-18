import type { Platform } from "./uploadPost";

export const POST_FORMATS = ["feed", "story", "reel", "video"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export type MediaKind = "image" | "video";

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

export const FORMAT_LABELS: Record<PostFormat, string> = {
  feed: "Feed post",
  story: "Story",
  reel: "Reel",
  video: "Long video",
};

const FORMAT_NOUNS: Record<PostFormat, string> = {
  feed: "a feed post",
  story: "a story",
  reel: "a reel",
  video: "a long video",
};

const KIND_NOUNS: Record<MediaKind, { one: string; many: string }> = {
  image: { one: "an image", many: "images" },
  video: { one: "a video", many: "videos" },
};

export const FORMATS_BY_KIND: Record<MediaKind, readonly PostFormat[]> = {
  image: ["feed", "story"],
  video: ["reel", "story", "video"],
};

export const DEFAULT_FORMAT: Record<MediaKind, PostFormat> = {
  image: "feed",
  video: "reel",
};

const MB = 1024 * 1024;

// Facebook doesn't publish a video size cap for Reels or Stories and allows 10 GB for long
// videos, so those use the ceiling this app is willing to buffer and forward in one request.
export const VIDEO_CEILING_BYTES = 300 * MB;

type MediaRule = {
  types: readonly string[];
  maxBytes: Partial<Record<PostFormat, number>>;
  mediaTypeField: "media_type" | "facebook_media_type";
  mediaType: Partial<Record<PostFormat, string>>;
};

const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

// Limits come from Upload-Post's photo and video requirements: Instagram photos are JPEG/PNG/GIF
// at 8 MB; Facebook feed photos are 4 MB and story photos 10 MB; Instagram Reels go to 300 MB
// and story videos to 100 MB.
export const MEDIA_RULES: Record<Platform, Record<MediaKind, MediaRule>> = {
  instagram: {
    image: {
      types: ["image/jpeg", "image/png", "image/gif"],
      maxBytes: { feed: 8 * MB, story: 8 * MB },
      mediaTypeField: "media_type",
      mediaType: { feed: "IMAGE", story: "STORIES" },
    },
    video: {
      types: VIDEO_TYPES,
      maxBytes: { reel: 300 * MB, story: 100 * MB },
      mediaTypeField: "media_type",
      mediaType: { reel: "REELS", story: "STORIES" },
    },
  },
  facebook: {
    image: {
      types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      maxBytes: { feed: 4 * MB, story: 10 * MB },
      mediaTypeField: "facebook_media_type",
      mediaType: { feed: "POSTS", story: "STORIES" },
    },
    video: {
      types: VIDEO_TYPES,
      maxBytes: { reel: VIDEO_CEILING_BYTES, story: VIDEO_CEILING_BYTES, video: VIDEO_CEILING_BYTES },
      mediaTypeField: "facebook_media_type",
      mediaType: { reel: "REELS", story: "STORIES", video: "VIDEO" },
    },
  },
};

export const ACCEPTED_MEDIA_TYPES = [
  ...new Set(
    Object.values(MEDIA_RULES).flatMap((byKind) => Object.values(byKind).flatMap((rule) => rule.types)),
  ),
];

export function mediaKind(mimeType: string): MediaKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export function supportsFormat(platform: Platform, kind: MediaKind, format: PostFormat): boolean {
  return MEDIA_RULES[platform][kind].maxBytes[format] !== undefined;
}

export type MediaIssue = {
  code: "unsupported_type" | "file_too_large" | "unsupported_format";
  message: string;
};

type UploadFile = { type: string; size: number };

function typeName(mimeType: string): string {
  if (mimeType === "video/quicktime") return "MOV";
  return (mimeType.split("/")[1] ?? "").toUpperCase() || "this file type";
}

export function mediaIssue(
  platform: Platform,
  format: PostFormat,
  file: UploadFile,
): MediaIssue | null {
  const label = PLATFORM_LABELS[platform];
  const kind = mediaKind(file.type);
  if (!kind) {
    return { code: "unsupported_type", message: `${label} doesn't accept ${typeName(file.type)} files` };
  }
  const rule = MEDIA_RULES[platform][kind];
  const maxBytes = rule.maxBytes[format];
  if (maxBytes === undefined) {
    return {
      code: "unsupported_format",
      message: `${label} can't post ${KIND_NOUNS[kind].one} as ${FORMAT_NOUNS[format]}`,
    };
  }
  if (!rule.types.includes(file.type)) {
    return {
      code: "unsupported_type",
      message: `${label} doesn't accept ${typeName(file.type)} ${KIND_NOUNS[kind].many}`,
    };
  }
  if (file.size > maxBytes) {
    return {
      code: "file_too_large",
      message: `${label} ${KIND_NOUNS[kind].many} for ${FORMAT_NOUNS[format]} must be ${maxBytes / MB} MB or smaller`,
    };
  }
  return null;
}

export function firstMediaIssue(
  platforms: readonly Platform[],
  format: PostFormat,
  file: UploadFile,
): MediaIssue | null {
  for (const platform of platforms) {
    const issue = mediaIssue(platform, format, file);
    if (issue) return issue;
  }
  return null;
}

export function mediaUpstreamFields(
  platforms: readonly Platform[],
  kind: MediaKind,
  format: PostFormat,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const platform of platforms) {
    const rule = MEDIA_RULES[platform][kind];
    const value = rule.mediaType[format];
    if (value !== undefined) fields[rule.mediaTypeField] = value;
  }
  return fields;
}

export const VIDEO_STATES = ["PUBLISHED", "DRAFT"] as const;
export type VideoState = (typeof VIDEO_STATES)[number];

export type PostOptions = {
  shareToFeed: boolean;
  aiGenerated: boolean;
  videoState: VideoState;
};

export const DEFAULT_OPTIONS: PostOptions = {
  shareToFeed: true,
  aiGenerated: false,
  videoState: "PUBLISHED",
};

export function optionFields(
  platforms: readonly Platform[],
  format: PostFormat,
  options: PostOptions,
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (format === "reel") {
    if (platforms.includes("instagram")) {
      fields.share_to_feed = String(options.shareToFeed);
      if (options.aiGenerated) fields.is_ai_generated = "true";
    }
    if (platforms.includes("facebook") && options.aiGenerated) {
      fields.facebook_is_ai_generated = "true";
    }
  }
  if (format === "video" && platforms.includes("facebook")) {
    fields.video_state = options.videoState;
  }
  return fields;
}

type CoverRule = { types: readonly string[]; maxBytes: number };

const COVER_RULES: Record<string, CoverRule> = {
  cover_image: { types: ["image/jpeg"], maxBytes: 8 * MB },
  facebook_thumbnail: { types: ["image/jpeg", "image/png"], maxBytes: 10 * MB },
};

export function coverField(platform: Platform, format: PostFormat): string | null {
  if (format === "reel" && platform === "instagram") return "cover_image";
  if (format === "video" && platform === "facebook") return "facebook_thumbnail";
  return null;
}

export function coverIssue(
  platforms: readonly Platform[],
  format: PostFormat,
  file: UploadFile,
): MediaIssue | null {
  for (const platform of platforms) {
    const field = coverField(platform, format);
    const rule = field ? COVER_RULES[field] : undefined;
    if (!rule) continue;
    const label = PLATFORM_LABELS[platform];
    const accepted = rule.types.map(typeName).join(" or ");
    if (!rule.types.includes(file.type)) {
      return { code: "unsupported_type", message: `${label} cover images must be ${accepted}` };
    }
    if (file.size > rule.maxBytes) {
      return {
        code: "file_too_large",
        message: `${label} cover images must be ${rule.maxBytes / MB} MB or smaller`,
      };
    }
  }
  return null;
}

export type VideoMeta = { duration: number; width: number; height: number };

const NINE_BY_SIXTEEN = 9 / 16;

// Advisory only: these come from the browser reading the file, and Upload-Post stays the
// final authority on what gets published.
export function videoMetaWarnings(
  platforms: readonly Platform[],
  format: PostFormat,
  meta: VideoMeta,
): string[] {
  const warnings: string[] = [];
  const { duration } = meta;
  if (platforms.includes("instagram")) {
    if (format === "reel" && (duration < 3 || duration > 15 * 60)) {
      warnings.push("Instagram Reels must be between 3 seconds and 15 minutes");
    }
    if (format === "story" && duration < 3) {
      warnings.push("Instagram Stories need at least 3 seconds of video");
    }
  }
  if (platforms.includes("facebook")) {
    if (format === "reel") {
      if (duration < 3 || duration > 90) warnings.push("Facebook Reels must be 3 to 90 seconds");
      if (Math.abs(meta.width / meta.height - NINE_BY_SIXTEEN) > 0.02) {
        warnings.push("Facebook Reels should be vertical 9:16 (1080×1920)");
      }
    }
    if (format === "story" && duration > 60) {
      warnings.push("Facebook Stories can be at most 60 seconds");
    }
  }
  return warnings;
}
