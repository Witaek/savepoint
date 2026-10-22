# Architecture

Savepoint is one **SvelteKit** app (Svelte 5, TypeScript) on Node.js, with one **SQLite** database
through **Drizzle ORM**: one process, one container, no Redis or worker. It shares Episodic's
foundations (accounts, cross-site check, compression, cache, scheduler, backups).

```
Phone / browser (PWA) ── HTTPS (Tailscale) or HTTP (LAN)
        ▼
SvelteKit server (adapter-node, port 3000)
  ├─ routes/        pages (form actions) and a few /api endpoints
  ├─ services/      library, achievements, Steam sync, search, stats, notifications
  ├─ providers/     Steam Web API + store, IGDB; rate-limited HTTP client
  ├─ jobs/          steam-recent (15 min), steam-library (nightly), backup, cleanup
  └─ db/            schema + migrations, $DATA_DIR/savepoint.db (WAL)
```

## Data model

| Table                | One row per                         | Notes                                                                                     |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `games`              | game, shared by everyone            | Identified by Steam app id when it's on Steam, else IGDB id, else added by hand.          |
| `achievements`       | achievement or checklist item       | `source` = `steam` (keyed by API name) or `custom` (checklist items, shared).             |
| `library_entries`    | person × game                       | Status, platform, playtime, `steam_owned`, notes, rating, `perfected_at`.                 |
| `user_achievements`  | person × unlocked achievement       | `source` = `steam` (mirrored) or `manual` (ticked). Index on (user, unlocked_at).         |
| `users`              | account                             | Linked SteamID and the state of its last sync.                                            |
| `achievement_groups` | part of a game, shared              | A game of a collection or a DLC, with its own progress (`kind`: game or dlc).             |
| `split_rules`        | rule placing achievements in groups | `prefix` (API name), `range` (Steam order) or `contains` (name or description), in order. |

Progress (unlocked / total) is one grouped query per page over `achievements` ⟕
`user_achievements`, so it's never stored twice and never out of date. Checklist items count like
achievements.

**One game, any platform.** A game on Steam is one row whatever platform people play it on. If you
own it on the linked Steam account (`steam_owned`), its achievements come from Steam and can't be
ticked; on another platform (PS5, Switch…) you tick Steam's list yourself.

## Steam sync (`services/steam-sync.ts`)

- **Link:** profile link → SteamID (ResolveVanityURL) → GetPlayerSummaries (must be public) → full
  sync in the background, with progress in `users.steam_sync`.
- **Full sync:** GetOwnedGames → new games get a status (played in the last 2 weeks → Playing, never
  played → Backlog, else Unsorted), playtime is updated, wishlisted games bought since move out of
  the wishlist; wishlist import; then achievements of the games that are due, 4 at a time.
- **Achievements of a game:** GetPlayerAchievements; the schema (GetSchemaForGame + global
  percentages) is re-read when older than 7 days or when Steam mentions an unknown achievement.
  Unlocks are mirrored: new ones added, ones Steam shows locked removed (resets).
- **Due games:** never read, playtime changed since the last read (`synced_playtime`), or read more
  than 30 days ago. The 15-minute job only looks at GetRecentlyPlayedGames.
- **Perfection:** `updatePerfection` sets `perfected_at` (the last unlock's time) and moves the game
  to Beaten. Adding a checklist item re-checks everyone with the game.
- **Notifications:** one message per game with new unlocks, and a gold one at 100%, to ntfy topics
  and Discord webhooks. The first import never notifies.

## Splitting a game (`services/splits.ts`, `split-rules.ts`)

Steam gives one achievement list per app and nothing about which game of a collection or which DLC
an achievement belongs to. `achievements.group_id` holds its group: rules set it (first match in
`split_rules` order wins, `applySplit`), unless `group_manual` says it was moved by hand.
`applySplit` runs after every change to rules or groups and, through `refreshSplit`, after each
read of Steam's list, so new achievements find their group. Suggestions come from API-name
prefixes (`suggestPrefixes`) and, with IGDB, the games listed in the bundle (`bundleContents`).

A split exports to and imports from a small JSON file (`splitFileSchema`); files in
`src/lib/server/splits/<app id>.json` are bundled (`import.meta.glob`) and applied the first time a
game is read if it has no groups. Progress per group is computed on the game page from the list
it already loads.

## Pages

| Route              | What                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `/`                | Bonfire: the game being played and what's left, totals, Almost there, recent unlocks  |
| `/library`         | Grid with status chips, sorting and a detail panel; Unsorted becomes a triage list    |
| `/game/[id]`       | Achievements (locked first, rarity, hidden blurred), checklist, status, notes, rating |
| `/game/[id]/split` | Groups, rules, moves by hand, suggestions, split files                                |
| `/search`          | IGDB or Steam store search, and adding a game by hand                                 |
| `/hall-of-fame`    | Perfected games with their rarest achievement                                         |
| `/stats`           | Totals, unlocks per month, completion bands, rarest unlocks, most played              |
| `/settings`        | Steam link and sync, notifications, display, account, users, backups, jobs            |

## Look

The "Ember" theme lives in `src/app.css` (Tailwind 4 tokens): dark stone, ash text, one ember
accent, gold only for 100%. Cinzel for headings, Spectral for text, IBM Plex Mono for labels. The
original proposal and mockups (written when this was planned as a side of Episodic) are in
[design/proposal.html](design/proposal.html).

## Service worker

Shell precached per version; pages network-first with an offline page; covers and banners
cache-first (500), achievement icons in a separate cache (800) so they never push covers out.
