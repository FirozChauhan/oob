# oob

A real-time collaboration board: create a room with a hash key, share it, and
everyone with the key can upload **videos, photos, and audio**, drag them around
a freeform canvas, and see everything update live for everyone else.

Built with **Next.js 16 + React 19**, a custom **Socket.io** server, optional
**Firebase Google Auth**, optional **Cloudinary** media storage, and optional
**PostgreSQL** persistence.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

> **Works with zero configuration.** Without any of the optional env vars below,
> the app runs in a fallback mode: anonymous name-based join, local-disk uploads
> (`public/uploads/`), and in-memory rooms. Add credentials to unlock each feature.

## Optional integrations

Copy `.env.example` to `.env.local` and fill in what you want:

```bash
cp .env.example .env.local
```

### Cloudinary (media storage) - recommended for deploy
Stops uploaded files from disappearing on server restarts/redeploys.
1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Console -> Dashboard -> copy your Cloud name, API key, API secret.
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
Supports images, video, and audio. Without it, files are written to local disk.

### Firebase Google Auth
Replaces the manual "your name" field with Google sign-in.
1. [console.firebase.google.com](https://console.firebase.google.com) -> Add project.
2. Add a **Web app** -> copy the config values.
3. Enable **Authentication -> Sign-in method -> Google**.
4. Set the `NEXT_PUBLIC_FIREBASE_*` values (the public ones are safe to expose).
Without it, users join by typing a display name.

#### Fix: "Google sign-in popup opens then closes instantly"

This almost always means the current origin (your site's URL) isn't authorized for
Google sign-in. Add it in **two places**:

1. **Firebase Console** -> Authentication -> Settings -> **Authorized domains**
   -> add `localhost` (or `localhost:3000`) and your Render domain
   (e.g. `yourapp.onrender.com`).
2. **Google Cloud Console** -> APIs & Services -> Credentials -> your **OAuth 2.0
   Client ID** -> add the same origins to **Authorized JavaScript origins**, and
   `https://<your-authDomain>/__/auth/handler` to **Authorized redirect URIs**.

The app now surfaces the exact error and offers a **"use redirect sign-in"**
fallback on the sign-in screens, so a blocked popup won't dead-end.

### PostgreSQL (room + media persistence) - recommended for deploy
Stops active rooms from wiping on server restarts/redeploys (and on Render's
free-tier spin-down).
1. Create a Postgres database (e.g. Render Postgres).
2. Set `DATABASE_URL`. Set `DATABASE_SSL=true` if the connection requires SSL.
The schema (`rooms`, `media_items`) is created automatically on startup.
Without it, rooms live only in memory while the server is up.

## Deploy on Render

1. New -> **Web Service** -> connect this repo.
2. **Build Command:** `npm install && npm run build`
3. **Start Command:** `npm run start`  *(must be `npm run start`, not `next start`,
   so the custom Socket.io server runs)*
4. Add the environment variables from `.env.example` (Cloudinary + Postgres +
   Firebase). With Cloudinary + Postgres set, uploads and rooms survive
   redeploys - no Render Disk needed.
5. Render supports WebSockets on web services, so real-time works out of the box.

## How it works

- A **hash key** creates a temporary room. Everyone with the key joins the same
  room over a persistent Socket.io connection.
- The server keeps an in-memory `rooms` map for fast real-time; **Postgres
  mirrors it** so a restart/redeploy restores rooms and media on next join.
- Uploads go to **Cloudinary** (or local disk); only metadata + position live in
  the DB and in memory.
- Media cards are absolutely positioned on a freeform canvas; dragging broadcasts
  positions live and persists them (throttled). The dragged card always layers on
  top.
- With Firebase on, identity (name + avatar) comes from Google; the board is
  gated behind sign-in.
