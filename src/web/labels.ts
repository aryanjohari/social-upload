import { PLATFORM_LABELS } from "../server/lib/postFormats";

export { FORMAT_LABELS, PLATFORM_LABELS } from "../server/lib/postFormats";

// Keys are the platform names Upload-Post puts in the connect return URL.
export const CONNECT_LABELS: Record<string, string> = {
  ...PLATFORM_LABELS,
  "google-business": "Google Business",
  google_business: "Google Business",
};

export const CONNECT_ERRORS: Record<string, string> = {
  ACCESS_DENIED: "You closed the authorization window.",
  PROVIDER_ERROR: "The platform reported an error. Try again.",
  INVALID_STATE: "That attempt expired. Try again.",
  CONNECTION_FAILED: "We couldn't finish connecting. Try again.",
};
