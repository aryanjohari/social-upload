import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACCEPTED_IMAGE_TYPES, IMAGE_FORMATS, firstImageIssue } from "../server/lib/postFormats";
import { api, type ImageFormat, type Platform, type Profile, type UploadStatus } from "./api";
import { FORMAT_LABELS, PLATFORM_LABELS } from "./labels";

const POLL_MS = 5000;
const MAX_POLLS = 60;

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
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [format, setFormat] = useState<ImageFormat>("feed");
  const [selected, setSelected] = useState<Platform[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setSelected((current) => current.filter((platform) => available.includes(platform)));
  }, [available.join(",")]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function pick(next: File | null) {
    setStatus(null);
    setFile(next);
  }

  function toggle(platform: Platform) {
    setSelected((current) =>
      current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform],
    );
  }

  function poll(requestId: string, attempt: number) {
    timer.current = window.setTimeout(async () => {
      try {
        const next = await api.status(requestId);
        setStatus(next);
        if (next.done || attempt >= MAX_POLLS) {
          setBusy(false);
          return;
        }
        poll(requestId, attempt + 1);
      } catch (error) {
        setBusy(false);
        onError(error instanceof Error ? error.message : "Couldn't check the post");
      }
    }, POLL_MS);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || selected.length === 0) return;
    setBusy(true);
    setStatus({ status: "queued", done: false, completed: 0, total: selected.length, message: null, results: [] });
    try {
      const requestId = await api.upload(profile.username, selected, format, file, caption);
      poll(requestId, 1);
    } catch (error) {
      setBusy(false);
      setStatus(null);
      onError(error instanceof Error ? error.message : "Upload failed");
    }
  }

  const issue = file ? firstImageIssue(selected, format, file) : null;

  if (available.length === 0) {
    return (
      <section className="card">
        <h2>Post an image</h2>
        <p className="muted">Connect an account to start posting.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Post an image</h2>
      <form onSubmit={submit} className="stack">
        <label className="file">
          <input
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
          <span className="primary">{file ? "Choose a different image" : "Choose from gallery"}</span>
        </label>
        {preview && <img className="preview" src={preview} alt="Selected" />}
        <div className="segmented" role="radiogroup" aria-label="Post type">
          {IMAGE_FORMATS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={format === option}
              className={format === option ? "primary" : "ghost"}
              onClick={() => setFormat(option)}
            >
              {FORMAT_LABELS[option]}
            </button>
          ))}
        </div>
        {format === "feed" && (
          <label className="field">
            <span>Caption</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={2200}
              rows={3}
            />
          </label>
        )}
        <fieldset className="platforms">
          <legend>Post to</legend>
          {available.map((platform) => (
            <label key={platform} className="check">
              <input
                type="checkbox"
                checked={selected.includes(platform)}
                onChange={() => toggle(platform)}
              />
              {PLATFORM_LABELS[platform]}
            </label>
          ))}
        </fieldset>
        {issue && (
          <p className="issue" role="alert">
            {issue.message}
          </p>
        )}
        <button
          type="submit"
          className="primary"
          disabled={busy || !file || selected.length === 0 || issue !== null}
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
