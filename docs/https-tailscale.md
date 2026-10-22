# HTTPS with Tailscale, and installing the app on your phone

Phones only install a web app over HTTPS. Tailscale gives your server a private HTTPS address with
a valid certificate, reachable from anywhere your phone runs Tailscale, without exposing anything
to the internet.

If you followed Episodic's guide, Tailscale and HTTPS are already set up: skip to step 2.

## 1. Set up Tailscale

1. Install Tailscale on your phone and on the CasaOS server (`curl -fsSL
https://tailscale.com/install.sh | sh && sudo tailscale up`), signed in to the same account.
2. In the [admin console](https://login.tailscale.com/admin/dns) → **DNS**, turn on **MagicDNS** and
   **Enable HTTPS**.

## 2. Serve Savepoint over HTTPS

Episodic already answers on the standard HTTPS port (443), so Savepoint uses 8443:

```bash
sudo tailscale serve --bg --https=8443 8788
```

If Tailscale runs as the CasaOS app instead of on the host:

```bash
docker exec -it $(docker ps --filter name=tailscale --format '{{.Names}}' | head -1) \
  tailscale serve --bg --https=8443 8788
```

`sudo tailscale serve status` shows both apps, e.g.:

```
https://casaos.tail1234.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:8787
https://casaos.tail1234.ts.net:8443 (tailnet only)
|-- / proxy http://127.0.0.1:8788
```

The setting survives reboots. `sudo tailscale serve --https=8443 off` removes it.

## 3. Tell Savepoint its address

In CasaOS (app ⋮ → **Settings**), set and save:

| Variable          | Example                               |
| ----------------- | ------------------------------------- |
| `APP_URL`         | `https://casaos.tail1234.ts.net:8443` |
| `ALLOWED_ORIGINS` | `http://192.168.1.20:8788`            |

`APP_URL` is also used for the links in notifications.

## 4. Install the app

With Tailscale connected on the phone, open the `https://…ts.net:8443` address.

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Install app**.

Pages you opened recently, covers and achievement icons stay available offline.
