import { useCallback, useEffect, useState } from "react";
import { api, type Profile } from "./api";
import { ConnectPanel } from "./ConnectPanel";
import { GoogleBusinessPanel } from "./GoogleBusinessPanel";
import { ProfileBar } from "./ProfileBar";
import { UploadPanel } from "./UploadPanel";
import { useConnectReturn } from "./useConnectReturn";

const ACTIVE_KEY = "social-upload.profile";

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(username: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, username);
  } catch {
    return;
  }
}

export function App() {
  const { notice, dismiss, show } = useConnectReturn();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [active, setActive] = useState<string | null>(readActive);

  const reportError = useCallback(
    (text: string) => show({ kind: "error", text }),
    [show],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await api.listProfiles();
      setProfiles(list);
      setActive((current) =>
        current && list.some((profile) => profile.username === current)
          ? current
          : (list[0]?.username ?? null),
      );
    } catch (error) {
      setProfiles([]);
      reportError(error instanceof Error ? error.message : "Couldn't load profiles");
    }
  }, [reportError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function select(username: string) {
    setActive(username);
    writeActive(username);
  }

  async function create(username: string, displayName: string) {
    try {
      await api.createProfile(username, displayName);
      await refresh();
      select(username);
    } catch (error) {
      reportError(error instanceof Error ? error.message : "Couldn't create profile");
      throw error;
    }
  }

  const profile = profiles?.find((entry) => entry.username === active) ?? null;

  return (
    <main className="shell">
      <header className="brand">
        <h1>Social connect</h1>
        <p className="muted">Link Instagram and Facebook, then post from your gallery.</p>
      </header>
      {notice && (
        <div className={`notice ${notice.kind}`} role="alert">
          <span>{notice.text}</span>
          <button type="button" className="ghost" onClick={dismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {profiles === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <ProfileBar profiles={profiles} active={active} onSelect={select} onCreate={create} />
          {profile && (
            <>
              <ConnectPanel profile={profile} onError={reportError} />
              <GoogleBusinessPanel profile={profile} onError={reportError} />
              <UploadPanel profile={profile} onError={reportError} />
            </>
          )}
        </>
      )}
    </main>
  );
}
