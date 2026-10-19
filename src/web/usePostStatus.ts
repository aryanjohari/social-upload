import { useEffect, useRef, useState } from "react";
import type { MediaKind } from "../server/lib/postFormats";
import { api, type UploadStatus } from "./api";

const POLLING: Record<MediaKind, { everyMs: number; maxPolls: number }> = {
  image: { everyMs: 5000, maxPolls: 60 },
  video: { everyMs: 10000, maxPolls: 60 },
};

export function usePostStatus(onError: (message: string) => void) {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function poll(requestId: string, kind: MediaKind, attempt: number) {
    const { everyMs, maxPolls } = POLLING[kind];
    timer.current = window.setTimeout(async () => {
      try {
        const next = await api.status(requestId);
        setStatus(next);
        if (next.done || attempt >= maxPolls) {
          setBusy(false);
          return;
        }
        poll(requestId, kind, attempt + 1);
      } catch (error) {
        setBusy(false);
        onError(error instanceof Error ? error.message : "Couldn't check the post");
      }
    }, everyMs);
  }

  return {
    status,
    busy,
    begin(total: number) {
      setBusy(true);
      setStatus({ status: "queued", done: false, completed: 0, total, message: null, results: [] });
    },
    track(requestId: string, kind: MediaKind) {
      poll(requestId, kind, 1);
    },
    fail() {
      setBusy(false);
      setStatus(null);
    },
    clear() {
      setStatus(null);
    },
  };
}
