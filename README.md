# oob

> Real-time media collaboration board. Create a room, share the 8-character key, and everyone in it can upload videos, photos, and audio, drag them around a freeform canvas, chat, and watch everything update live.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?style=flat-square&logo=socketdotio&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-optional-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-optional-DD2C00?style=flat-square&logo=firebase&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Cloudinary-optional-3448C5?style=flat-square&logo=cloudinary&logoColor=white)

**Flow:** browser → Next.js custom server (Socket.io) → room state broadcast live; uploads go to Cloudinary (or local disk), rooms + media mirror to Postgres (or in-memory). Nothing is required — each optional service just unlocks more.

## Features

- **Room-based collaboration** — an 8-character key is all you need to join; no account unless Google sign-in is enabled
- **Live media board** — images, videos, and audio dropped on a freeform canvas; drag to reposition and everyone sees it move in real time
- **Synced playback** — play, pause, or seek a video/audio card and the whole room follows along
- **Built-in chat** — lightweight room chat, no separate service
- **Paste-to-upload** — copy an image anywhere and paste it straight onto the board
- **Optional Google sign-in** — real identities via Firebase (verified server-side when configured), anonymous names otherwise
- **Graceful degradation** — runs perfectly with zero configuration

## Run locally

Requirements: **Node 20+**

```bash
git clone <repo-url> oob
cd oob
npm install
npm run dev
```

Open **http://localhost:3000**. Zero env vars needed — copy `.env.example` to `.env.local` and fill in only what you want to unlock.

Production build: `npm run build && npm start`.

## Configuration

| Env var | Required | Description |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | — | Media storage in Cloudinary. Unset = files go to local disk |
| `DATABASE_URL` | — | PostgreSQL: rooms + media survive restarts. Unset = in-memory |
| `DATABASE_SSL` | — | `"true"` when your Postgres connection requires SSL |
| `NEXT_PUBLIC_FIREBASE_*` | — | Enables Google sign-in (browser config) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | — | Server-side Google ID token verification (recommended for production) |
