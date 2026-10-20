import { z } from "zod";

const startResponseSchema = z.object({ authorize_url: z.string().url() });

const locationsResponseSchema = z.object({
  locations: z.array(z.object({ name: z.string(), title: z.string() }).passthrough()),
  selected_location_id: z.string().nullish(),
});

export type GoogleBusinessLocations = {
  locations: { id: string; name: string }[];
  selectedLocationId: string | null;
};

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

    async listGoogleBusinessLocations(profile: string): Promise<GoogleBusinessLocations> {
      const data = await request(
        `/api/uploadposts/users/google-business-location?profile_username=${encodeURIComponent(profile)}`,
        locationsResponseSchema,
      );
      return {
        locations: data.locations.map((location) => ({ id: location.name, name: location.title })),
        selectedLocationId: data.selected_location_id ?? null,
      };
    },

    async pinGoogleBusinessLocation(profile: string, locationId: string): Promise<void> {
      await request(
        "/api/uploadposts/users/google-business-location",
        z.object({ success: z.boolean() }),
        json({ profile_username: profile, gbp_location_id: locationId }),
      );
    },
  };
}
