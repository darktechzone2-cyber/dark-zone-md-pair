# Dark Zone MD — Pairing Website

The public pairing site for **Dark Zone MD** — the same model as the Jawad MD /
Prince MD pairing pages:

1. A visitor opens the page and enters their **WhatsApp number** (with country code).
2. The site shows an **8-digit pairing code**.
3. The visitor enters it in WhatsApp → **Settings → Linked Devices → Link a
   Device → “Link with phone number instead”**.
4. The site hands back a **SESSION_ID** (`DZMD~...`) — shown on the page *and*
   sent to the visitor's own WhatsApp chat.
5. The visitor pastes that SESSION_ID into their bot, and the bot connects
   directly — no pairing code, no QR, ever again (until they log out).

## Privacy & safety (baked in)

- Every pairing runs in a **unique temporary folder that is deleted** the
  moment pairing finishes or expires (**~2 minutes**). The site has **no
  database** and **retains no credentials**.
- Session ids and pairing codes are **never written to logs**.
- One active pairing per number; basic **per-IP rate limiting**; minimal
  security headers on every response.
- A SESSION_ID is a login key for that WhatsApp number — the page tells users
  to keep it secret.

## Run it locally

```bash
npm install
node index.js          # listens on PORT (default 3000)
```

Open `http://localhost:3000`, enter a number, done.

## Deploy it FREE

The app is a plain Node 20 web service (`npm install` → `node index.js`, port
from the `PORT` environment variable). Any free Node host works:

### Render (free web service)
1. Push this folder to a GitHub repo.
2. Render → **New → Web Service** → connect the repo.
3. Build command: `npm install` · Start command: `node index.js`.
4. Pick the **free** instance type, deploy, open the `onrender.com` URL.

### Koyeb / Railway
Same shape: create a service from the repo (or upload), build `npm install`,
start `node index.js`, and open the public URL the platform assigns. (Free
tiers and limits change — check the platform's current free plan.)

### KataBump / Wispbyte (Node panel)
1. Upload the ZIP and extract it in the server files.
2. Run `npm install` from the panel console (or upload `node_modules` too).
3. Set the startup file to `index.js`, start the server, and open the
   panel's assigned domain/port.

> ⏰ **Honest note about free tiers:** free web services on Render/Koyeb-style
> hosts **sleep when idle** and can take **~30–50 seconds to wake** on the
> first visit. That's normal — the pairing itself is quick once the page
> loads. The bot itself should live on an always-on host (see the bot
> README's free-hosting section), not on a sleeping web tier.

## How a user runs the bot with their SESSION_ID

In the Dark Zone MD bot:

- **Option A:** paste it in `config.js` → `SESSION_ID: 'DZMD~...'`
- **Option B:** set the environment variable `SESSION_ID=DZMD~...` on the
  hosting panel.

Then start the bot (`node index.js`) — it connects with the saved session:
no pairing prompt, no QR. If the SESSION_ID is missing or invalid, the bot
falls back to the console pairing-code / QR login automatically.

## Structure

```
index.js          Express server + pairing engine (temp sessions, cleanup)
lib/session.js    the DZMD~ SESSION_ID format (shared with the bot)
public/           the pairing page (index.html + logo)
tests/            local tests with a fake connector — no real WhatsApp needed
```

Run the tests with `npm test` (21 checks: page serving, number validation,
code → connected → SESSION_ID flow, round-trip against the bot's own decoder,
temp-dir deletion, rate limiting).

A product of **Dark Tech Zone** — Learn. Build. Secure.
