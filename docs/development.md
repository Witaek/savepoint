# Development

```bash
npm install
cp .env.example .env    # set DATA_DIR=./data
npm run dev
```

## Without a Steam key

`tests/e2e/mock-steam.mjs` is a stand-in for the Steam API with a small test library. Run it, then
point Savepoint at it:

```bash
node tests/e2e/mock-steam.mjs &
STEAM_API_KEY=test STEAM_API_URL=http://localhost:4400 STEAM_STORE_URL=http://localhost:4400 \
  DISABLE_JOBS=1 npm run dev
```

Link the profile `https://steamcommunity.com/id/ashenone` in Settings. `POST
http://localhost:4400/mock/unlock?appid=1245620&count=4` unlocks more achievements for the next sync.

## Checks

| Command            | What it runs                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `npm run lint`     | Prettier                                                             |
| `npm run check`    | svelte-check (TypeScript)                                            |
| `npm test`         | Unit tests (Vitest), including a full sync flow against a fake Steam |
| `npm run test:e2e` | Playwright against a production build and the mock Steam API         |

## Database changes

Edit `src/lib/server/db/schema.ts`, then `npm run db:generate` and commit the new file in
`drizzle/`. Migrations run on start. Keep changes additive.

## Releasing

CI builds `ghcr.io/witaek/savepoint` for amd64 and arm64 on every push to `main` (`latest`) and on
version tags (`v0.2.0` → `0.2.0`, `0.2`). After the first push, make the package public once:
GitHub → your profile → **Packages** → `savepoint` → **Package settings** → **Change visibility**.
