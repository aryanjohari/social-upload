import { useEffect, useState } from "react";
import type { VideoMeta } from "../server/lib/postFormats";

type Props = {
  file: File | null;
  onVideoMeta: (meta: VideoMeta) => void;
};

export function MediaPreview({ file, onVideoMeta }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  if (!file || !url) return null;

  if (file.type.startsWith("video/")) {
    return (
      <video
        className="preview"
        src={url}
        controls
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          onVideoMeta({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        }}
      />
    );
  }
  return <img className="preview" src={url} alt="Selected" />;
}
