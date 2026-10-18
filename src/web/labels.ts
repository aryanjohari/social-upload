export { FORMAT_LABELS, PLATFORM_LABELS } from "../server/lib/postFormats";

export const CONNECT_ERRORS: Record<string, string> = {
  ACCESS_DENIED: "You closed the authorization window.",
  PROVIDER_ERROR: "The platform reported an error. Try again.",
  INVALID_STATE: "That attempt expired. Try again.",
  CONNECTION_FAILED: "We couldn't finish connecting. Try again.",
};
