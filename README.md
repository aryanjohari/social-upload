# social-upload

A small, self-hosted tool to connect Instagram and Facebook accounts and post an image from your gallery to them. Publishing and OAuth are handled by [Upload-Post](https://upload-post.com), so you don't need your own Meta developer app or App Review.

- Own-branded connect screen (you control the UI; the user only sees Meta's consent screen).
- Multiple profiles, each with its own Instagram and Facebook connection.
- Pick an image, write a caption, choose platforms, post, and watch the result.
- Your Upload-Post API key stays on the server and is never sent to the browser.

## How it works

```
Browser ──► your server (Hono) ──► Upload-Post API ──► Instagram / Facebook
```

1. The browser asks your server to start a connection. The server calls Upload-Post and returns an authorization URL.
2. The browser goes to Meta's consent screen, then Upload-Post sends the user back to your app with `?connect_status=success|cancelled|error`.
3. To post, the browser sends the image to your server, which forwards it to Upload-Post and returns a request ID. The browser polls for the result.

## Requirements

- Node.js 20 or newer
- pnpm 9 (`npm install -g pnpm@9.12.0`)
- An [Upload-Post](https://upload-post.com) account and API key
- Accounts to connect:
  - **Instagram:** a Business or Creator account (personal accounts are not supported). A linked Facebook Page is not required.
  - **Facebook:** a Page you manage. Posts go to Pages, not personal profiles.

Upload-Post plan limits apply (profile count, uploads per day, and Facebook's 25 posts per 24 hours per Page). Check your plan in the Upload-Post dashboard.

## Setup

```bash
git clone <your-repo-url> social-upload
cd social-upload
pnpm install
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `UPLOAD_POST_API_KEY` | Yes | | Your Upload-Post API key. Server-side only. |
| `APP_URL` | No | `http://localhost:5173` | Public URL users open in the browser. Upload-Post redirects back here after connecting an account. |
| `PORT` | No | `8787` | Port the API server listens on. |

## Run in development

```bash
pnpm dev
```

This starts the API server on `http://localhost:8787` and the web app on `http://localhost:5173` (it proxies `/social` to the API). Open http://localhost:5173.

## Using it

1. **Create a profile.** A profile is a named container for one set of connected accounts (for example one per brand or customer). The profile ID allows letters, numbers, `_`, `@` and `-`, and can't be changed later.
2. **Connect accounts.** Click Connect next to Instagram or Facebook and approve access. You return to the app with the account shown as connected.
3. **Pick a Facebook Page** if the account manages several. A dropdown appears; the chosen Page is pinned to the profile.
4. **Post an image.** Choose a JPEG, PNG, WebP or GIF up to 8 MB, add a caption, tick the platforms, and press Post. Results are shown per platform.

To use separate accounts, create another profile and switch between them with the profile dropdown.

## Production

```bash
pnpm build
pnpm start
```

`pnpm build` outputs the web app to `dist/web`, and `pnpm start` serves both the API and that build from one process on `PORT`. Set `APP_URL` to the public URL (for example `https://social.example.com`) so the connect flow returns to the right place, and put the server behind HTTPS.

> **There is no login on this app.** Anyone who can reach the server can connect accounts and post using your Upload-Post key. Run it locally, on a private network, or behind your own authentication (reverse proxy, VPN, SSO) before exposing it.

## API

All routes are under `/social`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/profiles` | List profiles and their connected accounts |
| `POST` | `/profiles` | Create a profile: `{ username, displayName? }` |
| `GET` | `/accounts?profile=` | One profile with its accounts |
| `POST` | `/connect/:platform` | Start OAuth (`instagram` or `facebook`): `{ profile }` returns `{ authorizeUrl }` |
| `GET` | `/facebook-pages?profile=` | Pages the connected account manages and the pinned one |
| `POST` | `/facebook-pages` | Pin a Page: `{ profile, pageId }` |
| `POST` | `/upload` | Multipart: `profile`, `platforms` (repeatable), `file`, `caption`. Returns `{ requestId }` |
| `GET` | `/status/:requestId` | Upload progress and per-platform results |

## Project layout

```
src/server/lib/uploadPost.ts   Upload-Post client (all upstream calls and response validation)
src/server/routes/social.ts    Hono router, takes the client as a parameter
src/server/index.ts            Node entry: env, router, static files
src/web/                       React UI (Vite)
```

The client and router have no dependency on the Node entry, so they can be mounted in another Hono app (for example a Cloudflare Worker).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API server (watch) and web app together |
| `pnpm build` | Build the web app to `dist/web` |
| `pnpm start` | Run the server (serves the built web app) |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Run unit tests (no network or API key needed) |

## Troubleshooting

- **`UPLOAD_POST_API_KEY is not set`:** create `.env` from `.env.example` and fill in the key.
- **`Invalid API key` (401):** the key is wrong or revoked; check it in the Upload-Post dashboard.
- **Connect returns "Couldn't connect" or error 400 on Instagram:** the account is probably personal or unverified. Switch it to Business or Creator.
- **Redirect doesn't come back to the app:** make sure `APP_URL` matches the URL you actually open in the browser.
- **Facebook post fails with several Pages:** choose a Page in the "Facebook Page to post to" dropdown.
- **`PROFILE_LIMIT_REACHED` (403):** your Upload-Post plan's profile limit is used up.
