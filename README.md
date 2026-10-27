# Second Value on ChatGPT Sites

The complete game runs at [second-value.abloompixie66.chatgpt.site](https://second-value.abloompixie66.chatgpt.site/). This checkout owns the game pages, artwork, rules, room API and D1 room storage. There is no external game server or Render dependency.

- English is the first-visit default. The header language picker supports English, 中文 and Español on the same Site, without reloading or resetting a game. It remembers the player's choice. Explicit `?lang=zh-CN`, `?lang=en` and `?lang=es` links remain supported and take precedence over the saved preference.
- `/` and `/online.html` open the two-to-four-player game; `/index.html` opens solo practice.
- Players join with a nickname and room code; no account or ChatGPT sign-in is required.
- In the lobby, the host can add or remove clearly marked computer players, choosing Steady, Bold or Patient styles, up to four total seats. One human plus one to three computers can play the same D1-backed room flow. Computer roles are assigned automatically; their decisions use their own projected clues, never another player's private notes or current sealed quote. Computers submit automatically, so a lone human's confirmation reveals immediately. Only humans need to ready up; the human host still opens each round and next crate. Computer winners automatically complete a legal funded sale. Computers receive no browser seat credentials and cannot inherit host control.
- Computer styles differ in uncertainty tolerance and bid timing: Bold competes earlier, Steady increases gradually, and Patient becomes more competitive as clues narrow the risk. Each retains a value-based ceiling and a legal cash limit; previous revealed quotes never force a final-round pass. Estimates use public catalog/source/count/identity clues and the published 8–12% reserve rule. Weighted stratified valuation is deterministic and capped at 96 processing plans per decision. Actual contents are still unknown until revealed, and any style can lose money.
- New sessions offer six roles: Restorer, Appraiser, Collector, Salvager, Curator and Antique Dealer. Everyone shares the same bidding actions; each role has one exclusive ability. Rules 6 expands the catalog from 24 to 32 identities behind the same six public outlines.
- Eight rare finds include two genuine damaged objects, four genuine intact objects and two stage reproductions. Each has a fixed ordinary price, distinct revealed artwork and a short story. Rarity multiplies its existing source draw weight by 0.15, without changing prices or ability payouts. Real draws, solo computer estimates and room computer estimates share the same catalog prior. Covered artwork still depends only on the public outline; an unknown object never gains identity-specific art, a rarity badge or a story.
- The Discovery book is available from the header in solo and multiplayer. It records all six publicly revealed identities only after a purchased crate is settled, for every active human participant, including players who did not buy it. Private inspections, ongoing auctions and unsold crates do not register discoveries. Its progress grants no coins or permanent abilities and does not identify unknown objects in another crate. English, Chinese and Spanish switch without closing the book or submitting a game action.
- Discovery records are browser-local, with only a storage version and whitelisted catalog IDs saved. They are shared by tabs on this Site, not synchronized across devices or accounts. Clearing Site data removes them; blocked storage leaves an in-memory book for the current page. No new database or account system is required. The current crate's new-discovery strip is cached in memory, so polling does not change its count; refreshing may omit an already-recorded discovery strip.
- The original 18 objects now use clean, individually framed artwork with the same dark-green background as the newer catalog. Revealed detail images, sale images and discovered-book detail images open an enlarged read-only viewer. Unknown objects never receive an enlargement trigger; opening or closing artwork does not submit a game action. The viewer supports English, Chinese and Spanish, including while opened over the book.
- The Discovery book can filter discovered objects by category and sort them by ordinary price, with catalog order breaking ties. Selecting a category or price order switches to discovered-only mode. Returning to all objects or resetting restores anonymous catalog order; hidden identities never take part in category or price comparisons. Language changes preserve the chosen item, filters and book scroll position.
- Ordinary prices are fixed when a crate is drawn. Salvage, exhibitions and customer sales require explicit target choices, have fees and capped payouts, and show their net difference from ordinary sale before confirmation. Ordinary sale is always available.
- Before the winning player settles, ordinary sale and the current ability selection are compared side by side: gross proceeds including bonuses, fees, net recovery and profit after the fixed winning bid. Partial or unfunded ability choices leave the ordinary baseline visible and do not produce a false ability total. Switching sale methods keeps the ability draft; only the confirmed method is submitted. No targets are selected automatically.
- Rules 5 and newer crates come from a watchmaker’s clearance, a collector’s estate or a theater storeroom. A repair tag, catalog fragment or old ticket explains the source’s draw tendencies. Sources change probabilities, never guarantee particular objects. Ordinary prices and contents are locked before bidding.
- A public auction-house reserve is 8–12% of the crate’s ordinary sale value, rounded to whole currency. It stays fixed across all three rounds and excludes role bonuses. Every winning bid, including a sole bidder, must meet it. A player below the reserve may pass; an unsold crate charges nobody.
- After settlement, the table compares the buyer’s actual sale with funded hypothetical returns for everyone else at the same winning bid. Comparisons include fees, never change balances and mark players who could not afford that bid. No valuation is projected before settlement.
- Short envelope, hammer, unveiling and receipt animations run on new transitions, without replaying on refresh, polling or language changes. Sound starts off and can be toggled in the header. Reduced-motion preferences are respected. There is no animation speed control.
- Optional audio uses bundled real paper, wooden-gavel and coin recordings. The independent background-music switch plays a quiet looping harp track. Both start off for first-time visitors; saved preferences require a real browser gesture to resume. Music pauses when the page is hidden, muting immediately stops active and scheduled effects, and failed audio never submits or blocks a game action. Source credits, license links and editing notes are in `public/assets/audio/CREDITS.md`; the music attribution is also visible in both help dialogs.
- Rules are locked to the session or room. Existing rules 1–5 saves and rooms retain their catalog, seeded draws, computer quotes and economics across continued auctions; start a new table to use the rare catalog. Objects publicly settled under older rules can still enter the browser's discovery book.
- Room state, hashed seat credentials, action replay records and presence live in D1. The same tab can restore its seat after a Worker restart or deployment while the room has not expired.
- Rooms expire after six hours without authenticated activity. This is session recovery, not a permanent account/history feature.
- Optional “Learn in one crate” practice teaches clues, bid review, reveal and sale choices in an isolated Restorer example. The rival's quote is explicitly scripted; ordinary and repair returns use the shared engine. Only a separate tutorial completion flag is saved locally.
- Private notebook estimates and marks stay in the browser, separate from confirmed facts. Solo notes are device-local; multiplayer notes are tab-local and isolated by seat and crate. They never enter the room API.
- The notebook also keeps an optional ceiling, bid/watch intention and short reason for each reached round. Earlier rounds become read-only after reveal; the current round can be revised before reveal. Settlement compares recorded ceilings with the actual hammer price and the buyer's actual recovery, which depends on their role and chosen sale. This is a price comparison, not a claim that a different bid would have won. Decisions are never filled from or submitted as real bids.
- Before confirming a bid or pass, the review shows only the current seat's known clues and the current round's optional recorded maximum. Bids above that maximum or contrary to a watch intention get a reminder; players can still confirm. Missing or invalid notes do not set a limit. Private notes remain browser-only, and a confirmation closes if the room advances to a new turn.
- The auction table highlights new public clues in round two (genuine count) and round three (repairable count and one public object). Earlier public counts remain visually secondary. The newly revealed object is marked on the table and can be selected directly from the strip; this never submits a bid or spends an inspection. Private Appraiser notes are not copied into the public-clue strip. Refreshing, polling and changing language do not replay an animation.
- After 15 seconds without a seat heartbeat, recovery guidance shows who is offline, elapsed offline time and the action that still needs that player. The original tab can reconnect; a room code alone does not restore a seat. Server-clock heartbeats update timers without replacing bid inputs or open dialogs. Offline status never triggers bids, sales or host actions automatically.
- Concurrent requests commit by database storage version. Retried request IDs cannot debit or credit a successful bid or sale twice. Clients receive only their private `viewFor()` projection.
- Existing seats from the retired in-memory backend are not transferred. Create a new room after migration.

## Development and verification

Future game development and publication use this checkout. The adjacent `auction-game` directory is the original prototype/design reference, and does not need a second hosted deployment. `scripts/sync-game.mjs` records the one-time import; do not rerun it over later game changes.

- `game/client/`: game HTML, JavaScript and styles.
- `game/engine.cjs`, `game/room-engine.cjs`: shared sale rules and authoritative room transitions. `game/client/engine.js` must match the shared engine byte for byte.
- `public/assets/`: local images, fonts and font licenses.
- `lib/room-api.mjs`: native Fetch API backed by D1; `db/schema.ts` and `drizzle/` own the schema.
- `lib/game-site.mjs`: exact game text routes. HTML is deliberately not in public assets, so static hosting cannot redirect `/index.html` to the multiplayer root.
- `.openai/hosting.json`: existing Site identity plus `DB` binding. Preserve this ID and audience for updates.

Run `npm test` for routing and concurrency/private-state tests. The normal native API suite uses real SQLite with the production migrations and forced stale snapshots. For the actual local Workers D1 API run `$env:NATIVE_TEST_D1='miniflare'; node --import ./scripts/sites-env.mjs --test tests/native-rooms.test.mjs` in PowerShell. The optional mode does not replace the built Worker check.

Build, apply pending migrations to local D1, and run the built preview using the framework instructions below. `node scripts/verify-game.mjs <origin>` exercises two temporary seats through inspection, private bidding, withdrawal, hammer, sale and finish without retrying mutations. The script asserts `runtime: sites` and `storage: d1` first. Never print or persist generated seat credentials.

`node scripts/verify-room-bots.mjs <origin>` creates disposable 2-, 3- and 4-seat rooms with one human and the remaining seats filled by computers, checks two consecutive crates per room, automatic funded sales, private bids and host-controlled continuation/finish. Generated seat credentials remain in process memory; mutations are not blindly retried.

Publish through the Sites skill and helpers; no direct Wrangler deployment is needed. Sites provisions the database and applies the schema migrations. Keep the Render service suspended.

## Framework reference

This project uses the maintained Vinext Sites starter. The sections below describe
its supported development and publishing environment.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
