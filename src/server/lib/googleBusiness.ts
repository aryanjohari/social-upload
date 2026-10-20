import { z } from "zod";

const startResponseSchema = z.object({ authorize_url: z.string().url() });

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init?: RequestInit,
) => Promise<T>;

type JsonInit = (body: unknown) => RequestInit;

// Takes the shared request helpers from createUploadPostClient so this file does not import it back.
export function googleBusinessMethods(request: Request, json: JsonInit) {
  return {
    async startGoogleBusinessConnect(profile: string, redirectUrl: string): Promise<string> {
      const data = await request(
        "/api/uploadposts/oauth/google-business/start",
        startResponseSchema,
        json({ profile, redirect_url: redirectUrl }),
      );
      return data.authorize_url;
    },
  };
}
