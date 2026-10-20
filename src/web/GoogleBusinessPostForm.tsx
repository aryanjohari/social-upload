import { useState, type FormEvent } from "react";
import {
  CTA_LABELS,
  CTA_TYPES,
  LOCAL_POST_PHOTO_TYPES,
  MAX_LOCAL_POST_SUMMARY,
  validateLocalPost,
  type CtaType,
} from "../server/lib/googleBusinessRules";
import { api } from "./api";
import { MediaPreview } from "./MediaPreview";
import { StatusList } from "./StatusList";
import { usePostStatus } from "./usePostStatus";

type Props = {
  profile: string;
  onError: (message: string) => void;
};

export function GoogleBusinessPostForm({ profile, onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [ctaType, setCtaType] = useState<CtaType | null>(null);
  const [ctaUrl, setCtaUrl] = useState("");
  const { status, busy, begin, track, fail, clear } = usePostStatus(onError);

  const issue = validateLocalPost({ summary, ctaType, ctaUrl, photoType: file?.type ?? null });
  const showUrl = ctaType !== null && ctaType !== "CALL";

  function pick(next: File | null) {
    clear();
    setFile(next);
  }

  function pickCta(value: string) {
    const next = CTA_TYPES.find((type) => type === value) ?? null;
    setCtaType(next);
    if (next === null || next === "CALL") setCtaUrl("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || issue) return;
    begin(1);
    try {
      const requestId = await api.postToGoogleBusiness({ profile, summary, ctaType, ctaUrl, file });
      track(requestId, "image");
    } catch (error) {
      fail();
      onError(error instanceof Error ? error.message : "Couldn't post to Google Business");
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="file">
        <input
          type="file"
          accept={LOCAL_POST_PHOTO_TYPES.join(",")}
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
        <span className="primary">{file ? "Choose a different photo" : "Choose a photo"}</span>
      </label>
      <MediaPreview file={file} onVideoMeta={() => undefined} />
      <label className="field">
        <span>
          Post ({summary.length}/{MAX_LOCAL_POST_SUMMARY})
        </span>
        <textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label className="field">
        <span>Button (optional)</span>
        <select value={ctaType ?? ""} onChange={(event) => pickCta(event.target.value)}>
          <option value="">No button</option>
          {CTA_TYPES.map((type) => (
            <option key={type} value={type}>
              {CTA_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      {showUrl && (
        <label className="field">
          <span>Button link</span>
          <input type="url" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
        </label>
      )}
      {issue && (file || summary) && (
        <p className="issue" role="alert">
          {issue.message}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy || !file || issue !== null}>
        {busy ? "Posting…" : "Post to Google Business"}
      </button>
      {status && <StatusList status={status} />}
    </form>
  );
}
