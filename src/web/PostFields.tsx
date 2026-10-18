import { DEFAULT_OPTIONS } from "../server/lib/postFormats";
import type { Platform, PostFormat, PostOptions } from "./api";

export type PostDraft = {
  caption: string;
  description: string;
  options: PostOptions;
  cover: File | null;
};

export const EMPTY_DRAFT: PostDraft = {
  caption: "",
  description: "",
  options: DEFAULT_OPTIONS,
  cover: null,
};

type Props = {
  format: PostFormat;
  platforms: Platform[];
  draft: PostDraft;
  onChange: (draft: PostDraft) => void;
};

export function PostFields({ format, platforms, draft, onChange }: Props) {
  const instagram = platforms.includes("instagram");
  const facebook = platforms.includes("facebook");

  function setOptions(patch: Partial<PostOptions>) {
    onChange({ ...draft, options: { ...draft.options, ...patch } });
  }

  if (format === "story") {
    return <p className="muted">Stories are posted without a caption.</p>;
  }

  return (
    <>
      {format === "video" ? (
        <>
          <label className="field">
            <span>Title</span>
            <input
              value={draft.caption}
              onChange={(event) => onChange({ ...draft, caption: event.target.value })}
              maxLength={255}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              maxLength={5000}
              rows={3}
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span>Caption</span>
          <textarea
            value={draft.caption}
            onChange={(event) => onChange({ ...draft, caption: event.target.value })}
            maxLength={2200}
            rows={3}
          />
        </label>
      )}
      {format === "reel" && (
        <>
          {instagram && (
            <label className="check">
              <input
                type="checkbox"
                checked={draft.options.shareToFeed}
                onChange={(event) => setOptions({ shareToFeed: event.target.checked })}
              />
              Also show the Reel in the Instagram feed
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={draft.options.aiGenerated}
              onChange={(event) => setOptions({ aiGenerated: event.target.checked })}
            />
            Label as AI-generated
          </label>
        </>
      )}
      {format === "video" && facebook && (
        <label className="check">
          <input
            type="checkbox"
            checked={draft.options.videoState === "DRAFT"}
            onChange={(event) => setOptions({ videoState: event.target.checked ? "DRAFT" : "PUBLISHED" })}
          />
          Save as a draft instead of publishing
        </label>
      )}
      {((format === "reel" && instagram) || (format === "video" && facebook)) && (
        <label className="field">
          <span>
            {format === "reel" ? "Cover image (JPEG, optional)" : "Thumbnail (JPEG or PNG, optional)"}
          </span>
          <input
            type="file"
            accept={format === "reel" ? "image/jpeg" : "image/jpeg,image/png"}
            onChange={(event) => onChange({ ...draft, cover: event.target.files?.[0] ?? null })}
          />
        </label>
      )}
    </>
  );
}
