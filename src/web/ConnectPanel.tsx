import { useEffect, useState } from "react";
import { api, type FacebookPages, type Platform, type Profile } from "./api";
import { PLATFORM_LABELS } from "./labels";

type Props = {
  profile: Profile;
  onError: (message: string) => void;
};

const PLATFORM_ORDER: Platform[] = ["instagram", "facebook"];

export function ConnectPanel({ profile, onError }: Props) {
  const [starting, setStarting] = useState<Platform | null>(null);
  const [pages, setPages] = useState<FacebookPages | null>(null);
  const facebookConnected = Boolean(profile.accounts.facebook);

  useEffect(() => {
    if (!facebookConnected) {
      setPages(null);
      return;
    }
    api
      .facebookPages(profile.username)
      .then(setPages)
      .catch((error: Error) => onError(error.message));
  }, [facebookConnected, profile.username, onError]);

  async function connect(platform: Platform) {
    setStarting(platform);
    try {
      window.location.href = await api.startConnect(profile.username, platform);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't start connecting");
      setStarting(null);
    }
  }

  async function pin(pageId: string) {
    try {
      await api.pinFacebookPage(profile.username, pageId);
      setPages(await api.facebookPages(profile.username));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't select that Page");
    }
  }

  return (
    <section className="card">
      <h2>Connected accounts</h2>
      <ul className="accounts">
        {PLATFORM_ORDER.map((platform) => {
          const account = profile.accounts[platform];
          return (
            <li key={platform} className="account">
              <div className="account-info">
                <strong>{PLATFORM_LABELS[platform]}</strong>
                <span className="muted">
                  {account
                    ? account.reauthRequired
                      ? "Needs reconnecting"
                      : (account.handle ?? account.displayName ?? "Connected")
                    : "Not connected"}
                </span>
              </div>
              <button
                type="button"
                className={account && !account.reauthRequired ? "ghost" : "primary"}
                disabled={starting !== null}
                onClick={() => connect(platform)}
              >
                {starting === platform ? "Opening…" : account ? "Reconnect" : "Connect"}
              </button>
            </li>
          );
        })}
      </ul>
      {pages && pages.pages.length > 1 && (
        <label className="field">
          <span>Facebook Page to post to</span>
          <select
            value={pages.selectedPageId ?? ""}
            onChange={(event) => pin(event.target.value)}
          >
            {!pages.selectedPageId && <option value="">Choose a Page…</option>}
            {pages.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
