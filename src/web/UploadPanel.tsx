import { useEffect, useState, type FormEvent } from "react";
import {
  ACCEPTED_MEDIA_TYPES,
  coverIssue,
  firstMediaIssue,
  resolvePostTarget,
  supportsFormat,
  videoMetaWarnings,
  type VideoMeta,
} from "../server/lib/postFormats";
import { api, type Platform, type PostFormat, type Profile } from "./api";
import { FormatPicker } from "./FormatPicker";
import { FORMAT_LABELS, PLATFORM_LABELS } from "./labels";
import { MediaPreview } from "./MediaPreview";
import { EMPTY_DRAFT, PostFields, type PostDraft } from "./PostFields";
import { StatusList } from "./StatusList";
import { usePostStatus } from "./usePostStatus";

type Props = {
  profile: Profile;
  onError: (message: string) => void;
};

function connectedPlatforms(profile: Profile): Platform[] {
  return (Object.keys(profile.accounts) as Platform[]).filter(
    (platform) => !profile.accounts[platform]?.reauthRequired,
  );
}

export function UploadPanel({ profile, onError }: Props) {
  const available = connectedPlatforms(profile);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [draft, setDraft] = useState<PostDraft>(EMPTY_DRAFT);
  const [format, setFormat] = useState<PostFormat>("feed");
  const [selected, setSelected] = useState<Platform[]>([]);
  const { status, busy, begin, track, fail, clear } = usePostStatus(onError);

  useEffect(() => {
    setSelected((current) => current.filter((platform) => available.includes(platform)));
  }, [available.join(",")]);

  const target = resolvePostTarget(file?.type ?? null, format, selected);
  const { kind, formats, fileSupported } = target;
  const activeFormat = target.format;
  const sendTo = target.platforms;

  function pick(next: File | null) {
    clear();
    setMeta(null);
    setDraft((current) => ({ ...current, cover: null }));
    setFile(next);
  }

  function toggle(platform: Platform) {
    setSelected((current) =>
      current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !fileSupported || sendTo.length === 0) return;
    begin(sendTo.length);
    try {
      const requestId = await api.upload({
        profile: profile.username,
        platforms: sendTo,
        format: activeFormat,
        file,
        ...draft,
      });
      track(requestId, kind);
    } catch (error) {
      fail();
      onError(error instanceof Error ? error.message : "Upload failed");
    }
  }

  const issue = !file
    ? null
    : !fileSupported
      ? { message: "Choose an image or video" }
      : (firstMediaIssue(sendTo, activeFormat, file) ??
        (draft.cover ? coverIssue(sendTo, activeFormat, draft.cover) : null));
  const warnings = meta && kind === "video" ? videoMetaWarnings(sendTo, activeFormat, meta) : [];

  if (available.length === 0) {
    return (
      <section className="card">
        <h2>Create a post</h2>
        <p className="muted">Connect an account to start posting.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Create a post</h2>
      <form onSubmit={submit} className="stack">
        <label className="file">
          <input
            type="file"
            accept={ACCEPTED_MEDIA_TYPES.join(",")}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
          <span className="primary">{file ? "Choose a different file" : "Choose from gallery"}</span>
        </label>
        <MediaPreview file={file} onVideoMeta={setMeta} />
        <FormatPicker formats={formats} value={activeFormat} onChange={setFormat} />
        <fieldset className="platforms">
          <legend>Post to</legend>
          {available.map((platform) => {
            const supported = supportsFormat(platform, kind, activeFormat);
            return (
              <label key={platform} className="check">
                <input
                  type="checkbox"
                  checked={sendTo.includes(platform)}
                  disabled={!supported}
                  onChange={() => toggle(platform)}
                />
                {PLATFORM_LABELS[platform]}
                {!supported && (
                  <span className="muted"> (not available for {FORMAT_LABELS[activeFormat].toLowerCase()})</span>
                )}
              </label>
            );
          })}
        </fieldset>
        <PostFields format={activeFormat} platforms={sendTo} draft={draft} onChange={setDraft} />
        {issue && (
          <p className="issue" role="alert">
            {issue.message}
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="hint">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          className="primary"
          disabled={busy || !file || !fileSupported || sendTo.length === 0 || issue !== null}
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </form>
      {status && <StatusList status={status} />}
    </section>
  );
}
