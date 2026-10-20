import { useEffect, useState } from "react";
import { api, type GoogleBusinessLocations, type Profile } from "./api";

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

  // A single location is auto-detected upstream, so there is nothing to choose.
  if (!locations || locations.locations.length < 2) return null;

  return (
    <section className="card">
      <h2>Google Business</h2>
      <label className="field">
        <span>Location to post to</span>
        <select value={locations.selectedLocationId ?? ""} onChange={(event) => pin(event.target.value)}>
          {!locations.selectedLocationId && <option value="">Choose a location…</option>}
          {locations.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
