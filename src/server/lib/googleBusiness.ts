import { z } from "zod";
import type { CtaType, ReviewOrder } from "./googleBusinessRules";

const startResponseSchema = z.object({ authorize_url: z.string().url() });

const locationsResponseSchema = z.object({
  locations: z.array(z.object({ name: z.string(), title: z.string() }).passthrough()),
  selected_location_id: z.string().nullish(),
});

const reviewsResponseSchema = z.object({
  reviews: z
    .array(
      z
        .object({
          reviewId: z.string().nullish(),
          name: z.string().nullish(),
          reviewer: z.object({ displayName: z.string().nullish() }).passthrough().nullish(),
          starRating: z.union([z.string(), z.number()]).nullish(),
          comment: z.string().nullish(),
          createTime: z.string().nullish(),
          updateTime: z.string().nullish(),
          reviewReply: z
            .object({ comment: z.string().nullish(), updateTime: z.string().nullish() })
            .passthrough()
            .nullish(),
        })
        .passthrough(),
    )
    .default([]),
  averageRating: z.number().nullish(),
  totalReviewCount: z.number().nullish(),
  nextPageToken: z.string().nullish(),
});

const STAR_VALUES: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function toStars(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return value;
  return (value && STAR_VALUES[value]) || null;
}

export type GoogleBusinessReview = {
  id: string;
  stars: number | null;
  comment: string | null;
  reviewerName: string | null;
  createdAt: string | null;
  reply: { comment: string | null; updatedAt: string | null } | null;
};

export type GoogleBusinessReviews = {
  reviews: GoogleBusinessReview[];
  averageRating: number | null;
  totalCount: number | null;
  nextPageToken: string | null;
};

export type ReviewQuery = { pageSize?: number; pageToken?: string; orderBy?: ReviewOrder };

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
type SubmitUpload = (path: string, form: FormData, requestId: string) => Promise<void>;

export type GoogleBusinessPost = {
  profile: string;
  file: Blob;
  fileName: string;
  summary: string;
  ctaType: CtaType | null;
  ctaUrl: string;
  requestId: string;
};

// Takes the shared helpers from createUploadPostClient so this file does not import it back.
export function googleBusinessMethods({
  request,
  json,
  submitUpload,
}: {
  request: Request;
  json: JsonInit;
  submitUpload: SubmitUpload;
}) {
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

    // No location id is sent: the pinned location (or the only one) is used upstream.
    async uploadGoogleBusinessPost(post: GoogleBusinessPost): Promise<void> {
      const form = new FormData();
      form.set("user", post.profile);
      form.append("platform[]", "google_business");
      form.set("title", post.summary);
      form.set("gbp_topic_type", "STANDARD");
      if (post.ctaType) form.set("gbp_cta_type", post.ctaType);
      if (post.ctaUrl) form.set("gbp_cta_url", post.ctaUrl);
      form.set("async_upload", "true");
      form.set("request_id", post.requestId);
      form.append("photos[]", post.file, post.fileName);
      await submitUpload("/api/upload_photos", form, post.requestId);
    },

    async listGoogleBusinessReviews(
      profile: string,
      query: ReviewQuery,
    ): Promise<GoogleBusinessReviews> {
      const params = new URLSearchParams({ user: profile });
      if (query.pageSize) params.set("pageSize", String(query.pageSize));
      if (query.pageToken) params.set("pageToken", query.pageToken);
      if (query.orderBy) params.set("orderBy", query.orderBy);
      const data = await request(
        `/api/uploadposts/google-business/reviews?${params}`,
        reviewsResponseSchema,
      );
      return {
        reviews: data.reviews.map((review, index) => ({
          id: review.reviewId ?? review.name ?? `${review.createTime ?? "review"}-${index}`,
          stars: toStars(review.starRating),
          comment: review.comment ?? null,
          reviewerName: review.reviewer?.displayName ?? null,
          createdAt: review.createTime ?? review.updateTime ?? null,
          reply: review.reviewReply
            ? {
                comment: review.reviewReply.comment ?? null,
                updatedAt: review.reviewReply.updateTime ?? null,
              }
            : null,
        })),
        averageRating: data.averageRating ?? null,
        totalCount: data.totalReviewCount ?? null,
        nextPageToken: data.nextPageToken ?? null,
      };
    },
  };
}
