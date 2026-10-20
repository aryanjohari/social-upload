import { useEffect, useState } from "react";
import { api, type GoogleBusinessReviews } from "./api";

type Props = {
  profile: string;
  onError: (message: string) => void;
};

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">No rating</span>;
  return (
    <span role="img" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      {"☆".repeat(Math.max(0, 5 - value))}
    </span>
  );
}

export function GoogleBusinessReviewList({ profile, onError }: Props) {
  const [data, setData] = useState<GoogleBusinessReviews | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setData(null);
    api
      .googleBusinessReviews(profile)
      .then(setData)
      .catch((error: Error) => onError(error.message));
  }, [profile, onError]);

  async function loadMore() {
    if (!data?.nextPageToken) return;
    setLoadingMore(true);
    try {
      const next = await api.googleBusinessReviews(profile, data.nextPageToken);
      setData({ ...next, reviews: [...data.reviews, ...next.reviews] });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't load more reviews");
    } finally {
      setLoadingMore(false);
    }
  }

  if (!data) return null;

  return (
    <div className="stack">
      <h3>Reviews</h3>
      {data.totalCount !== null && (
        <p className="muted">
          {data.averageRating !== null && `${data.averageRating.toFixed(1)} average · `}
          {data.totalCount} {data.totalCount === 1 ? "review" : "reviews"}
        </p>
      )}
      {data.reviews.length === 0 ? (
        <p className="muted">No reviews yet.</p>
      ) : (
        <ul className="reviews">
          {data.reviews.map((review) => (
            <li key={review.id}>
              <Stars value={review.stars} /> <strong>{review.reviewerName ?? "Anonymous"}</strong>{" "}
              <span className="muted">{formatDate(review.createdAt)}</span>
              {review.comment && <p>{review.comment}</p>}
              {review.reply?.comment && (
                <p className="muted">
                  <strong>Your reply:</strong> {review.reply.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.nextPageToken && (
        <button type="button" className="ghost" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
