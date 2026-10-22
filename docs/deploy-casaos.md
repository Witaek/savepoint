# Deploying on CasaOS

This installs Savepoint as a custom app on CasaOS, next to Episodic. It takes about five minutes.
The image runs on **x86_64 (amd64)** and **ARM64**.

## 1. Import the app

1. Open the CasaOS dashboard. In **Apps**, click **+**, then **Install a customized app**.
2. Click **Import** (top right), paste the contents of
   [`docker-compose.yml`](https://raw.githubusercontent.com/Witaek/savepoint/main/docker-compose.yml),
   then click **Submit**.

## 2. Fill in the settings

| Field                                   | What to enter                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| **Web UI port**                         | `8788` (Episodic already uses 8787). Any free port works.                       |
| **Volumes** → `/data`                   | Keep `/DATA/AppData/savepoint`: your database and backups.                      |
| **Environment** → `STEAM_API_KEY`       | Your Steam Web API key ([api-keys.md](api-keys.md)).                            |
| `STEAM_LANGUAGE`                        | `english`, or `french` for French achievement names.                            |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Optional, to search every platform. Leave empty to search the Steam store only. |
| `TZ`                                    | Your time zone, e.g. `Europe/Paris`.                                            |
| `APP_URL` / `ALLOWED_ORIGINS`           | Leave empty for now (step 4).                                                   |

Click **Install**.

## 3. Create your account and link Steam

1. Open `http://<casaos-ip>:8788` and create the admin account. Do this right away: until it
   exists, anyone who reaches the page can create it.
2. Go to **Settings → Steam**, paste your profile link (e.g.
   `https://steamcommunity.com/id/yourname`) and click **Link Steam**.
3. Savepoint imports every game you own and reads its achievements. A library of a few hundred
   games takes a few minutes; you can follow the progress on the page or leave it.

Everyone in the household can have their own account (**Settings → Users**) and link their own
Steam profile.

## 4. HTTPS from anywhere with Tailscale

Follow [https-tailscale.md](https-tailscale.md). Since Episodic already uses Tailscale's main
HTTPS port, Savepoint gets its own: `https://<server>.<tailnet>.ts.net:8443`. Then, in the app's ⋮ →
**Settings**, set `APP_URL` to that address and `ALLOWED_ORIGINS` to your LAN address
(`http://192.168.1.20:8788`), and save.

## Updating

```bash
sudo docker pull ghcr.io/witaek/savepoint:latest
```

Then open the app's ⋮ → **Settings** and click **Save**. Your data is kept; the database is
upgraded on start.

## Where your data lives

Everything is in `/DATA/AppData/savepoint`: the database (`savepoint.db`) and nightly backups
(`backups/`, kept 14 days). Admins can make and download backups in **Settings → Server**.

## Troubleshooting

| Problem                                           | Fix                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Steam keeps this profile's game details private" | Set **Game details** to **Public** in Steam's privacy settings, then **Sync now**.              |
| No games appear after linking                     | Check **Settings → Server → Background jobs** and the app logs (⋮ → Logs).                      |
| "Cross-site request blocked"                      | Add the address in your browser's address bar to `ALLOWED_ORIGINS`.                             |
| Covers missing for an old game                    | Steam has no portrait cover for some older games; Savepoint shows the store banner instead.     |
| Lost admin password                               | `docker exec -it -u 1000:1000 savepoint node reset-password.js yourname 'new-password' --admin` |
