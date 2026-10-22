# Configuration

Savepoint is configured with environment variables (in CasaOS: app ⋮ → Settings; with Docker
Compose: the `.env` file). All are optional, but without `STEAM_API_KEY` there is no Steam import.

| Variable                | Default   | What it does                                                                                     |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `STEAM_API_KEY`         |           | Steam Web API key. Enables linking Steam accounts, import and sync.                              |
| `STEAM_LANGUAGE`        | `english` | Language of achievement names and store descriptions, as Steam names it (`french`, `german`, …). |
| `STORE_COUNTRY`         | `US`      | Country used for store details and store search.                                                 |
| `IGDB_CLIENT_ID`        |           | Twitch application client ID. With the secret, search covers every platform.                     |
| `IGDB_CLIENT_SECRET`    |           | Twitch application client secret.                                                                |
| `APP_URL`               |           | The main address you open Savepoint from. Used for the cross-site check and notification links.  |
| `ALLOWED_ORIGINS`       |           | Other addresses you use, comma separated.                                                        |
| `PORT`                  | `8788`    | Port on the host (Docker Compose).                                                               |
| `DATA_DIR`              | `./data`  | Where the database and backups go. In the image: `/data`.                                        |
| `TZ`                    | `UTC`     | Time zone for the nightly jobs and dates.                                                        |
| `PUID` / `PGID`         | `1000`    | The user that owns the files in `/data`.                                                         |
| `BACKUP_RETENTION_DAYS` | `14`      | How long nightly backups are kept. `0` turns them off.                                           |
| `ADMIN_USERNAME`        |           | With `ADMIN_PASSWORD`: creates the first admin on first start instead of the setup page.         |
| `ADMIN_PASSWORD`        |           | At least 8 characters.                                                                           |
| `DISABLE_JOBS`          |           | `1` stops the background jobs (development and tests).                                           |

## Background jobs

| Job             | When             | What it does                                                                       |
| --------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `steam-recent`  | every 15 minutes | Reads achievements of games played in the last two weeks whose playtime went up.   |
| `steam-library` | 03:10, and start | Reads owned games and wishlist, and achievements not read for a month (or played). |
| `backup`        | 03:30            | Saves a copy of the database in `/data/backups`.                                   |
| `cleanup`       | 04:15            | Removes expired cache entries, sessions and old job runs.                          |

Their last run is shown to admins under **Settings → Server → Background jobs**.
