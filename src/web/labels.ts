import type { Platform } from "./api";

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

export const CONNECT_ERRORS: Record<string, string> = {
  ACCESS_DENIED: "You closed the authorization window.",
  PROVIDER_ERROR: "The platform reported an error. Try again.",
  INVALID_STATE: "That attempt expired. Try again.",
  CONNECTION_FAILED: "We couldn't finish connecting. Try again.",
};
