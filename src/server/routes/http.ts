import { z } from "zod";

export const profileName = z.string().regex(/^[A-Za-z0-9_@-]{1,64}$/);

export function failure(status: number, message: string, code: string) {
  return Response.json({ error: message, code }, { status });
}
