import { useState, type FormEvent } from "react";
import type { Profile } from "./api";

type Props = {
  profiles: Profile[];
  active: string | null;
  onSelect: (username: string) => void;
  onCreate: (username: string, displayName: string) => Promise<void>;
};

export function ProfileBar({ profiles, active, onSelect, onCreate }: Props) {
  const [adding, setAdding] = useState(profiles.length === 0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onCreate(username.trim(), displayName.trim());
      setUsername("");
      setDisplayName("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Account</h2>
      {profiles.length > 0 && (
        <label className="field">
          <span>Profile</span>
          <select value={active ?? ""} onChange={(event) => onSelect(event.target.value)}>
            {profiles.map((profile) => (
              <option key={profile.username} value={profile.username}>
                {profile.displayName ?? profile.username}
              </option>
            ))}
          </select>
        </label>
      )}
      {adding ? (
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Profile ID</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              pattern="[A-Za-z0-9_@\-]{1,64}"
              title="Letters, numbers, _, @ and - only"
              required
            />
          </label>
          <label className="field">
            <span>Display name (optional)</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={100}
            />
          </label>
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>
              Create profile
            </button>
            {profiles.length > 0 && (
              <button type="button" className="ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          New profile
        </button>
      )}
    </section>
  );
}
