import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ACCEPTED_MEDIA_TYPES,
  DEFAULT_FORMAT,
  FORMATS_BY_KIND,
  coverIssue,
  firstMediaIssue,
  mediaKind,
  supportsFormat,
  videoMetaWarnings,
  type MediaKind,
  type VideoMeta,
} from "../server/lib/postFormats";
import { api, type Platform, type PostFormat, type Profile, type UploadStatus } from "./api";
import { FormatPicker } from "./FormatPicker";
import { FORMAT_LABELS, PLATFORM_LABELS } from "./labels";
import { MediaPreview } from "./MediaPreview";
import { EMPTY_DRAFT, PostFields, type PostDraft } from "./PostFields";

const POLLING: Record<MediaKind, { everyMs: number; maxPolls: number }> = {
  image: { everyMs: 5000, maxPolls: 60 },
  video: { everyMs: 10000, maxPolls: 60 },
};

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setSelected((current) => current.filter((platform) => available.includes(platform)));
  }, [available.join(",")]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const kind = file ? mediaKind(file.type) : "image";
  const formats = FORMATS_BY_KIND[kind ?? "image"];
  const activeFormat = formats.includes(format) ? format : DEFAULT_FORMAT[kind ?? "image"];
  const sendTo = selected.filter((platform) => supportsFormat(platform, kind ?? "image", activeFormat));

  function pick(next: File | null) {
    setStatus(null);
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

  function poll(requestId: string, uploadKind: MediaKind, attempt: number) {
    const { everyMs, maxPolls } = POLLING[uploadKind];
    timer.current = window.setTimeout(async () => {
      try {
        const next = await api.status(requestId);
        setStatus(next);
        if (next.done || attempt >= maxPolls) {
          setBusy(false);
          return;
        }
        poll(requestId, uploadKind, attempt + 1);
      } catch (error) {
        setBusy(false);
        onError(error instanceof Error ? error.message : "Couldn't check the post");
      }
    }, everyMs);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !kind || sendTo.length === 0) return;
    setBusy(true);
    setStatus({ status: "queued", done: false, completed: 0, total: sendTo.length, message: null, results: [] });
    try {
      const requestId = await api.upload({
        profile: profile.username,
        platforms: sendTo,
        format: activeFormat,
        file,
        ...draft,
      });
      poll(requestId, kind, 1);
    } catch (error) {
      setBusy(false);
      setStatus(null);
      onError(error instanceof Error ? error.message : "Upload failed");
    }
  }

  const issue = !file
    ? null
    : !kind
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
            const supported = supportsFormat(platform, kind ?? "image", activeFormat);
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
          disabled={busy || !file || !kind || sendTo.length === 0 || issue !== null}
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </form>
      {status && <StatusList status={status} />}
    </section>
  );
}

function StatusList({ status }: { status: UploadStatus }) {
  const finished = status.done;
  return (
    <div className="status" role="status">
      <strong>
        {finished
          ? status.status === "completed"
            ? "Posted"
            : "Something failed"
          : "Posting…"}
      </strong>
      {status.message && <p className="muted">{status.message}</p>}
      <ul>
        {status.results.map((result) => (
          <li key={result.platform}>
            {PLATFORM_LABELS[result.platform as Platform] ?? result.platform}:{" "}
            {result.ok === false ? "failed" : result.ok ? "done" : "in progress"}
            {result.message ? ` (${result.message})` : ""}
            {result.postUrl && result.postUrl.startsWith("http") && (
              <>
                {" "}
                <a href={result.postUrl} target="_blank" rel="noreferrer">
                  View
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
