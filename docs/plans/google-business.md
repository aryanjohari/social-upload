# Google Business Profile: posts and read-only reviews

Goal: connect a Google Business Profile through Upload-Post, publish a Local Post with a photo, and list reviews. Reviews are read-only (no reply). Later the same shape can move into 9horsemen.

## Decisions

- GBP gets its own client methods, rules module, routes and panel. It is not added to the `Platform` union or `postFormats.ts`, whose rules are built around Instagram and Facebook formats.
- v1 posts are `STANDARD` with one photo and an optional CTA. Text-only posts use a different Upload-Post endpoint and are left for later.
- Out of scope: reply to reviews, `EVENT`/`OFFER`, gallery uploads, video, text-only posts, scheduling.
- Upload-Post names: OAuth platform `google-business`, upload platform `google_business`.

## Steps

Each step is its own PR with tests. Run `pnpm typecheck` and `pnpm test` before closing a step.

### 0. Capture real responses
Make one real call each to the locations, pinned-location and reviews endpoints with the business profile, and save the JSON (without secrets) to confirm the schemas.
- Check which key `social_accounts` uses for GBP (`google-business` or `google_business`).
- Check the reviews fields, including whether `reviewReply` is absent or null when there is no reply.
- Done when: the shapes are written down and the zod schemas in step 1 are based on them, not the docs.

### 1. Connect, locations and pin
- Client: start OAuth, list locations, get and pin a location (`/users/google-business-location`), with zod schemas.
- Routes and a panel section: Connect button and a location dropdown, like the Facebook Page picker.
- Done when: client tests pass for the happy path, an upstream error and a malformed response, and a real account connects and pins a location.

### 2. Local Post
- Pure rules module `googleBusiness.ts`: summary at most 1,500 characters, CTA needs a URL except `CALL` (which must not have one), one photo. Confirm photo types and sizes in step 0.
- Client method using `/api/upload_photos` with `platform[]=google_business`, `gbp_topic_type=STANDARD`, optional `gbp_cta_type` and `gbp_cta_url`, and the location id. Reuse the existing status polling.
- Done when: validation tests cover the 1,500-character and CTA boundaries, and a real post appears in the Updates tab.

### 3. Reviews list (read-only)
- Client: list reviews with `pageSize`, `pageToken` and `orderBy`.
- Route and panel: stars, comment, date, existing reply if any, average rating, total count, "load more".
- Done when: tests cover a page, the next-page token and an empty list, and the real reviews display.

### 4. Docs
- Update the README: API table, requirements (a verified GBP location), limits and the reviews-are-read-only note.
- Done when: the README matches the routes that exist.

## Risks

- Response shapes come from the docs until step 0 is done.
- Reviewer names and comments are personal data. The app has no login, so keep it local or behind your own auth.
- Replies need a verified location, which is why reply is out of scope for now.
- Google's rules on storing and displaying reviews are unresearched. They matter for 9horsemen, not for this tool.

## Later, in 9horsemen

A reviews add-on with its own `ADD_ON_DATA` key, a daily sync in `runScheduledJobs`, and an owner-curated website widget. Only after the Google policy and personal-data questions are answered. Not started.
