# social-upload

A small, self-hosted tool to connect Instagram and Facebook accounts and post photos and videos from your gallery to them: feed posts, Stories, Reels and long videos. Publishing and OAuth are handled by [Upload-Post](https://upload-post.com), so you don't need your own Meta developer app or App Review.

- Own-branded connect screen (you control the UI; the user only sees Meta's consent screen).
- Multiple profiles, each with its own Instagram and Facebook connection.
- Pick a photo or video, choose a post type, add a caption and options, choose platforms, post, and watch the result.
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
4. **Create a post.** Choose a photo or video from your gallery, pick a post type, fill in the options, tick the platforms, and press Post. Results are shown per platform. Videos take longer to process, so the status is checked every 10 seconds for up to 10 minutes.

To use separate accounts, create another profile and switch between them with the profile dropdown.

## Post types and limits

The post type depends on the file you choose. Platforms that can't do the chosen type are greyed out.

| File | Post type | Instagram | Facebook |
| --- | --- | --- | --- |
| Image | Feed post | Yes | Yes |
| Image | Story | Yes | Yes |
| Video | Reel | Yes | Yes |
| Video | Story | Yes | Yes |
| Video | Long video | No | Yes |

Per type, the app checks file type and size before uploading and rejects the whole post if any selected platform would refuse it:

| | Instagram | Facebook |
| --- | --- | --- |
| Image types | JPEG, PNG, GIF | JPEG, PNG, WebP, GIF |
| Feed photo size | 8 MB | 4 MB |
| Story photo size | 8 MB | 10 MB |
| Video types | MP4, MOV | MP4, MOV |
| Reel size | 300 MB | 300 MB |
| Story video size | 100 MB | 300 MB |
| Long video size | not available | 300 MB |

Options by post type:

- **Feed post:** caption.
- **Story:** no caption (Facebook ignores it).
- **Reel:** caption, "also show in the Instagram feed" (on by default), an "AI-generated" label, and an optional Instagram cover image (JPEG, up to 8 MB).
- **Long video (Facebook only):** title, description, an option to save as a draft instead of publishing, and an optional thumbnail (JPEG or PNG, up to 10 MB).

For videos the browser also reads the clip and warns about length and shape, for example a Facebook Reel over 90 seconds or not 9:16, or an Instagram Reel under 3 seconds. These warnings don't block posting; Upload-Post makes the final decision and its message is shown if a post fails.

The limits come from Upload-Post's published requirements. Facebook doesn't publish a size cap for Reels and Stories and allows much larger long videos, so those use this app's own 300 MB ceiling. Daily account caps also apply (Instagram 50 and Facebook 25 posts per rolling 24 hours); hitting one returns an error.

> The server holds an upload in memory while it forwards it to Upload-Post, so a 300 MB video needs that much free memory per request. Requests larger than about 330 MB are rejected up front.

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
| `POST` | `/upload` | Multipart: `profile`, `platforms` (repeatable), `file` (image or video), and optional `format` (`feed`, `story`, `reel` or `video`; defaults to `feed` for images and `reel` for videos), `caption`, `description` (long video only), `shareToFeed`, `aiGenerated`, `videoState` (`PUBLISHED` or `DRAFT`) and `cover`. Returns `{ requestId }` with 202. Errors: 400 for an unsupported format or platform, 413 for too large, 415 for an unsupported type |
| `GET` | `/status/:requestId` | Upload progress and per-platform results |

## Project layout

```
src/server/lib/uploadPost.ts   Upload-Post client (all upstream calls and response validation)
src/server/lib/postFormats.ts  Post types, per-platform limits, options and upstream field mapping
src/server/routes/social.ts    Hono router, takes the client as a parameter
src/server/routes/uploadRequest.ts  Parses and validates the /upload form
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
- **Upload rejected before it starts (400, 413, 415):** the message names the platform and limit, for example a Facebook feed photo over 4 MB or WebP to Instagram. Resize or convert the file, or untick that platform.
- **A Reel or Story fails after uploading:** check the status message from Upload-Post. Common causes are the wrong shape (Facebook Reels need 9:16), a clip outside the allowed length, or an unsupported video codec. Instagram wants H.264 or HEVC video with AAC audio.
- **Large video upload fails or the server runs out of memory:** the server buffers the whole file. Try a shorter or more compressed clip.
- **Facebook post fails with several Pages:** choose a Page in the "Facebook Page to post to" dropdown.
- **`PROFILE_LIMIT_REACHED` (403):** your Upload-Post plan's profile limit is used up.
