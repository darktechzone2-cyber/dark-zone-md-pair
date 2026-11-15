# Dark Zone MD — Pair & Host

Pair a WhatsApp number and its Dark Zone MD bot starts automatically and
stays active on this host. No SESSION_ID copy-paste, no separate bot hosting.

## How it works
1. A visitor enters their WhatsApp number on the pairing page.
2. They get an 8-digit pairing code (qr-gated, Ubuntu/Edge device identity).
3. They enter the code in WhatsApp → Linked Devices.
4. On connect, the site sends them their SESSION_ID (backup) AND starts
   their bot right here: one child Node process per number, session kept
   under `host-sessions/<number>/`, settings under `host-data/<number>/`.
5. On host restart, all saved bots are reloaded automatically.
6. If a number logs out, its session is removed so it can re-pair.

## Limits
- `HOST_MAX_BOTS` (default 6) caps concurrent hosted bots; new pairings
  get an honest "host is full" when the cap is reached.
- The bot is the Dark Zone MD v1.1.0 engine (338 commands, no bug/crash/NSFW).

## Run
```
npm install
npm start          # serves the pairing page + hosts the bots
npm test           # pair tests + host manager tests + smoke test
```

## Files
- `index.js` — pairing website + host wiring
- `lib/host.js` — child-process manager (spawn/kill/respawn/reload)
- `lib/session.js` — DZMD~ SESSION_ID encode/decode
- `bot/` — the Dark Zone MD bot engine (one child process per number)
- `public/` — pairing page (QR fallback included)
