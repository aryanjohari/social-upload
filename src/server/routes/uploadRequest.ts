import { z } from "zod";
import {
  DEFAULT_FORMAT,
  DEFAULT_OPTIONS,
  POST_FORMATS,
  VIDEO_STATES,
  coverIssue,
  firstMediaIssue,
  mediaKind,
  type MediaIssue,
  type MediaKind,
  type PostFormat,
  type PostOptions,
} from "../lib/postFormats";
import { PLATFORMS, type Platform } from "../lib/uploadPost";

const profileName = z.string().regex(/^[A-Za-z0-9_@-]{1,64}$/);
const platformsSchema = z.array(z.enum(PLATFORMS)).min(1);
const formatSchema = z.enum(POST_FORMATS);
const videoStateSchema = z.enum(VIDEO_STATES);

const MAX_CAPTION = 2200;
const MAX_DESCRIPTION = 5000;

export type UploadRequest = {
  profile: string;
  platforms: Platform[];
  kind: MediaKind;
  format: PostFormat;
  file: File;
  caption: string;
  description: string;
  options: PostOptions;
  cover: File | null;
};

export type UploadRequestFailure = { status: 400 | 413 | 415; message: string; code: string };

export type ParsedUpload =
  | { ok: true; value: UploadRequest }
  | ({ ok: false } & UploadRequestFailure);

const ISSUE_STATUS: Record<MediaIssue["code"], 400 | 413 | 415> = {
  unsupported_format: 400,
  file_too_large: 413,
  unsupported_type: 415,
};

function fail(status: UploadRequestFailure["status"], message: string, code: string): ParsedUpload {
  return { ok: false, status, message, code };
}

function failIssue(issue: MediaIssue): ParsedUpload {
  return fail(ISSUE_STATUS[issue.code], issue.message, issue.code);
}

function optionalFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

export function parseUploadForm(form: FormData): ParsedUpload {
  const profile = profileName.safeParse(form.get("profile"));
  if (!profile.success) return fail(400, "Invalid profile", "invalid_profile");

  const platforms = platformsSchema.safeParse(form.getAll("platforms"));
  if (!platforms.success) return fail(400, "Pick at least one platform", "invalid_platforms");
  const platformList = [...new Set(platforms.data)];

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "Choose an image or video", "missing_file");
  const kind = mediaKind(file.type);
  if (!kind) return fail(415, "Choose an image or video", "unsupported_type");

  const format = formatSchema.safeParse(form.get("format") ?? DEFAULT_FORMAT[kind]);
  if (!format.success) return fail(400, "Unknown post format", "invalid_format");

  const issue = firstMediaIssue(platformList, format.data, file);
  if (issue) return failIssue(issue);

  const cover = optionalFile(form.get("cover"));
  const coverProblem = cover ? coverIssue(platformList, format.data, cover) : null;
  if (coverProblem) return failIssue(coverProblem);

  const videoState = videoStateSchema.safeParse(form.get("videoState") ?? DEFAULT_OPTIONS.videoState);
  if (!videoState.success) return fail(400, "Unknown video state", "invalid_video_state");

  const isStory = format.data === "story";
  return {
    ok: true,
    value: {
      profile: profile.data,
      platforms: platformList,
      kind,
      format: format.data,
      file,
      caption: isStory ? "" : String(form.get("caption") ?? "").slice(0, MAX_CAPTION),
      description:
        format.data === "video" ? String(form.get("description") ?? "").slice(0, MAX_DESCRIPTION) : "",
      options: {
        shareToFeed: form.get("shareToFeed") !== "false",
        aiGenerated: form.get("aiGenerated") === "true",
        videoState: videoState.data,
      },
      cover,
    },
  };
}
