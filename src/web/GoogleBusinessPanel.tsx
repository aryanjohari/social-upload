import { useEffect, useState } from "react";
import { api, type GoogleBusinessLocations, type Profile } from "./api";
import { GoogleBusinessPostForm } from "./GoogleBusinessPostForm";

type Props = {
  profile: Profile;
  onError: (message: string) => void;
};

export function GoogleBusinessPanel({ profile, onError }: Props) {
  const [locations, setLocations] = useState<GoogleBusinessLocations | null>(null);
  const usable = Boolean(profile.googleBusiness) && !profile.googleBusiness?.reauthRequired;

  useEffect(() => {
    if (!usable) {
      setLocations(null);
      return;
    }
    api
      .googleBusinessLocations(profile.username)
      .then(setLocations)
      .catch((error: Error) => onError(error.message));
  }, [usable, profile.username, onError]);

  async function pin(locationId: string) {
    try {
      await api.pinGoogleBusinessLocation(profile.username, locationId);
      setLocations(await api.googleBusinessLocations(profile.username));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't select that location");
    }
  }

  if (!usable) return null;

  // A single location is auto-detected upstream, so there is nothing to choose.
  const choices = locations && locations.locations.length > 1 ? locations : null;

  return (
    <section className="card">
      <h2>Google Business</h2>
      {choices && (
        <label className="field">
          <span>Location to post to</span>
          <select value={choices.selectedLocationId ?? ""} onChange={(event) => pin(event.target.value)}>
            {!choices.selectedLocationId && <option value="">Choose a location…</option>}
            {choices.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <GoogleBusinessPostForm profile={profile.username} onError={onError} />
    </section>
  );
}
