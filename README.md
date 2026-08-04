# oob

A real-time media collaboration board. Create a room, share the key, and everyone
in it can upload **videos, photos, and audio**, drag them around a freeform
canvas, chat, and watch everything update live for everyone else.

> The name comes from the "O.O.B" placeholder brand — it just stuck.

## Features

- **Room-based collaboration** — an 8-character key is all you need to join; no accounts required unless you enable Google sign-in
- **Live media board** — images, videos, and audio dropped on a freeform canvas, drag to reposition with everyone seeing it move in real time
- **Synced playback** — play, pause, and seek a video/audio card and everyone in the room follows along
- **Built-in chat** — lightweight room chat, no separate service
- **Paste-to-upload** — copy an image anywhere and paste it straight onto the board
- **Optional Google Auth** — real identities when you want them, anonymous names otherwise
- **Graceful degradation** — runs perfectly with zero configuration; each optional service just unlocks more

## Tech stack

| Layer | Tech |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| Language | TypeScript |
| Realtime | [Socket.io](https://socket.io) (custom Node server) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Auth | [Firebase Auth](https://firebase.google.com/products/auth) (Google provider, client + Admin SDK verification) |
| Media storage | [Cloudinary](https://cloudinary.com) with local-disk fallback |
| Persistence | [PostgreSQL](https://www.postgresql.org) (`pg`) with in-memory fallback |
| Hosting | Node + Next.js custom server (Render-ready) |

Every optional service degrades gracefully: no Cloudinary → files go to
`public/uploads/`, no Postgres → rooms live in memory, no Firebase → users join
by name.

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3000
```

That's it — the app runs in fallback mode with zero env vars. Copy
`.env.example` to `.env.local` and fill in what you want to unlock:

```bash
cp .env.example .env.local
```

### Cloudinary (media storage)

Keeps uploads alive across restarts/redeploys instead of the local disk.

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. Console → Dashboard → copy Cloud name, API key, API secret
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Firebase Google Auth

Replaces the manual name field with real Google identities.

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project → add a **Web app**
2. Enable **Authentication → Sign-in method → Google**
3. Set the `NEXT_PUBLIC_FIREBASE_*` values (these are safe to expose)
4. Optionally set the server-side `FIREBASE_*` service-account fields to verify
   ID tokens server-side (recommended for production)

**If the Google popup opens and instantly closes:** your origin isn't
authorized. Add it in two places:

1. Firebase Console → Authentication → Settings → **Authorized domains**
2. Google Cloud Console → APIs & Services → Credentials → your **OAuth 2.0
   Client ID** → add the same origin to **Authorized JavaScript origins**, and
   `https://<auth-domain>/__/auth/handler` to **Authorized redirect URIs**

The app surfaces the exact error, so it's clear what needs fixing if the popup
can't open.

### PostgreSQL (persistence)

Lets rooms and media survive restarts, redeploys, and platform spin-downs.

1. Create a Postgres database (e.g. Render Postgres)
2. Set `DATABASE_URL`, and `DATABASE_SSL=true` if the connection needs SSL
3. The `rooms` / `media_items` schema is created automatically on startup

## Deploying

The start command must run the custom server — the Socket.io endpoint lives
there, not in `next start`.

- **Build:** `npm install && npm run build`
- **Start:** `npm run start` (`NODE_ENV=production node server.js`)

With Cloudinary + Postgres configured, uploads and rooms survive redeploys
without any persistent disk.

## How it works

- A room key routes every connection into a Socket.io room; the server keeps an
  in-memory `rooms` map as the fast real-time source of truth
- Postgres mirrors rooms + media so a restart restores them on next join; drag
  positions are persisted throttled (~1/sec) so dragging stays smooth
- Uploads go to Cloudinary (or disk) over a base64 POST with progress reporting;
  only metadata and position live in the DB
- Media cards are absolutely positioned on a percentage-based canvas, so the
  layout is viewport-independent; dragged cards layer on top via a monotonic
  z-index
- With Firebase enabled, the server verifies the ID token and trusts the
  verified identity (uid/name/photo) rather than client-supplied values

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the custom Node + Socket.io server |
| `npm run build` | Production build |
| `npm run start` | Production server (custom server, not `next start`) |
| `npm run lint` | ESLint |
