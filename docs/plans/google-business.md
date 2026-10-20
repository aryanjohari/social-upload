# Google Business Profile: posts and read-only reviews

Goal: connect a Google Business Profile through Upload-Post, publish a Local Post with a photo, and list reviews. Reviews are read-only (no reply). Later the same shape can move into 9horsemen.

## Decisions

- GBP gets its own client methods, rules module, routes and panel. It is not added to the `Platform` union or `postFormats.ts`, whose rules are built around Instagram and Facebook formats.
- Connecting happens in this app's UI (a "Connect Google Business" button), not in the Upload-Post dashboard.
- Schemas are written from the Upload-Post docs, with optional fields kept lenient (`.nullish()`, as `uploadPost.ts` does). They are confirmed against a real account in the last step, not before building.
- v1 posts are `STANDARD` with one photo and an optional CTA. Text-only posts use a different Upload-Post endpoint and are left for later.
- Out of scope: reply to reviews, `EVENT`/`OFFER`, gallery uploads, video, text-only posts, scheduling.
- Upload-Post names: OAuth platform `google-business`, upload platform `google_business`.

## Steps

Each step is its own PR with tests. Run `pnpm typecheck` and `pnpm test` before closing a step.

### 1. Connect button
- Client: start OAuth for `google-business` through a separate path, since `startConnect` is typed to `instagram | facebook`. The connected account must show on the profile.
- Route and UI: a Connect Google Business button that reuses the existing redirect flow and `?connect_status` handling.
- Done when: a client test covers the start call and an upstream error, and the real flow returns to the app with the account shown as connected.

### 2. Locations and pin
- Client: list locations, get and pin a location (`/users/google-business-location`), with zod schemas from the docs.
- Routes and a panel section: a location dropdown, like the Facebook Page picker.
- Done when: tests cover the happy path, an upstream error and a malformed response, and a real location can be pinned.

### 3. Local Post
- Pure rules module `googleBusiness.ts`: summary at most 1,500 characters, CTA needs a URL except `CALL` (which must not have one), one photo. Photo types and sizes are not in the docs I read, so treat them as unknown until tested.
- Client method using `/api/upload_photos` with `platform[]=google_business`, `gbp_topic_type=STANDARD`, optional `gbp_cta_type` and `gbp_cta_url`, and the location id. Reuse the existing status polling.
- Done when: validation tests cover the 1,500-character and CTA boundaries, and a post appears in the Updates tab.

### 4. Reviews list (read-only)
- Client: list reviews with `pageSize`, `pageToken` and `orderBy`. `reviewReply`, `comment` and `reviewer` are optional.
- Route and panel: stars, comment, date, existing reply if any, average rating, total count, "load more".
- Done when: tests cover a page, the next-page token, an empty list and a review without a reply, and the real reviews display.

### 5. Verify against the real account and update docs
- Run steps 1 to 4 against the business profile. Fix any schema that rejects a real response, and add a test for each fix.
- Update the README: API table, requirements (a verified GBP location), limits and the reviews-are-read-only note.
- Done when: every flow above works on the real account and the README matches the routes that exist.

## Risks

- Response shapes come from hand-written doc examples until step 5, so expect a schema fix or two there.
- Reviewer names and comments are personal data. The app has no login, so keep it local or behind your own auth.
- Replies need a verified location, which is why reply is out of scope for now.
- Google's rules on storing and displaying reviews are unresearched. They matter for 9horsemen, not for this tool.

## Later, in 9horsemen

A reviews add-on with its own `ADD_ON_DATA` key, a daily sync in `runScheduledJobs`, and an owner-curated website widget. Only after the Google policy and personal-data questions are answered. Not started.
