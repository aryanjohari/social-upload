import type { UploadStatus } from "./api";
import { CONNECT_LABELS } from "./labels";

export function StatusList({ status }: { status: UploadStatus }) {
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
            {CONNECT_LABELS[result.platform] ?? result.platform}:{" "}
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
