import { useState } from "react";
import { CONNECT_ERRORS, CONNECT_LABELS } from "./labels";

export type Notice = { kind: "success" | "error"; text: string };

function readReturn(): Notice | null {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("connect_status");
  if (!status) return null;
  const platform = params.get("platform") ?? "";
  const label = CONNECT_LABELS[platform] ?? platform;
  window.history.replaceState(null, "", window.location.pathname);
  if (status === "success") return { kind: "success", text: `${label} connected.` };
  const code = params.get("error_code") ?? "";
  return { kind: "error", text: CONNECT_ERRORS[code] ?? `Couldn't connect ${label}.` };
}

export function useConnectReturn() {
  const [notice, setNotice] = useState<Notice | null>(readReturn);
  return { notice, dismiss: () => setNotice(null), show: setNotice };
}
