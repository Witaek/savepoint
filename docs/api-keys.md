# Getting API keys

Savepoint needs one key to import your Steam library. A second, optional pair lets you search for
games on every platform.

| Service   | What it's for                                                | Needed?     | Cost |
| --------- | ------------------------------------------------------------ | ----------- | ---- |
| Steam     | Your games, playtime, achievements, rarity                   | Recommended | Free |
| IGDB      | Searching games on any platform (Switch, PlayStation, …)     | Optional    | Free |
| Steam CDN | Covers, banners and achievement icons (loaded by your phone) | No key      | Free |

## Steam Web API key

1. Sign in at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).
2. For **Domain name**, enter anything that describes your server, e.g. `savepoint.local`.
3. Accept the terms and click **Register**. Copy the 32-character key.
4. Set it as `STEAM_API_KEY`.

Steam allows 100,000 calls a day per key. A household uses a few hundred.

### Make your game details public

Steam only shares your games and achievements when your profile allows it. In Steam: **Profile →
Edit Profile → Privacy Settings**, then set **My profile** and **Game details** to **Public**.
Savepoint tells you when it can't read them.

## IGDB (optional)

IGDB is the game database run by Twitch. Without it, Savepoint searches the Steam store only; with
it, search covers every platform, and games you add get covers, release dates and developers.

1. Sign in at [dev.twitch.tv/console](https://dev.twitch.tv/console) with a Twitch account
   (two-factor authentication must be on).
2. Click **Register Your Application**: any name, **OAuth Redirect URL** `http://localhost`,
   category **Application Integration**, client type **Confidential**.
3. Open the application, copy the **Client ID**, then click **New Secret** and copy it.
4. Set them as `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`.
