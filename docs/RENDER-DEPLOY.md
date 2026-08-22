# Render Deployment — winpilot.onrender.com

Production runs on Render's **Node** runtime.

| Setting | Value |
|---|---|
| Branch | `master` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

## Why `npm start` changed

`npm start` used to be `next start`, which serves HTTP only. The browser
extension talks to the backend over Socket.IO, and that server lives in
`server.ts` — so with `next start` the WebSocket server **never booted** and the
extension could never connect.

`npm start` now runs `tsx server.ts`, which serves Next.js *and* mounts
Socket.IO on the **same** HTTP server at path `/api/ws`. This matters because
Render routes traffic to exactly one port per service (`$PORT`), so the old
"Next.js on 3000, WebSocket on 3001" split could never work here.

Consequences:

- **Do not set `WS_PORT`** on Render. It is ignored and logs a warning.
- `tsx` is a runtime `dependency` (not a devDependency) so `npm start` still
  works if the host installs with `NODE_ENV=production`.
- `next start` is still available as `npm run start:next` if you ever want the
  HTTP-only server.

## Why `.npmrc` sets `include=dev`

Render applies `NODE_ENV=production` during the **build**, and npm omits
`devDependencies` in that mode. But `next build` needs several of them —
`typescript`, `tailwindcss`, `@tailwindcss/postcss` and the `@types/*`
packages — so a production-mode install produces a tree that cannot compile:

```
Error: Cannot find module '@next/bundle-analyzer'
Error: Cannot find module '@tailwindcss/postcss'
```

The repo's `.npmrc` sets `include=dev`, which makes `npm install` install them
regardless of `NODE_ENV`. This lives in the repo rather than in the host's
build command so the build behaves the same everywhere — no dashboard setting
to forget when recreating the service.

Runtime is unaffected: `npm start` only needs `dependencies`, which is why
`tsx` was moved there.

## Environment variables

Copy from [`.env.production.example`](../.env.production.example) into
**Service → Environment → Environment Variables**.

`NEXT_PUBLIC_WS_URL` is inlined into the client bundle at **build** time, so it
must exist in Render *before* the build runs — adding it afterwards requires a
fresh deploy, not just a restart.

`ENCRYPTION_MASTER_KEY` decrypts user API keys already stored in MongoDB.
Rotating it makes every saved key undecryptable — treat it as permanent.

## Google OAuth

Add this redirect URI in Google Cloud Console → Credentials → OAuth client:

```
https://winpilot.onrender.com/api/auth/callback/google
```

## Verifying a deploy

```bash
# App + database
curl -s https://winpilot.onrender.com/api/health

# Socket.IO handshake — must return a session id, e.g. 0{"sid":"...","upgrades":["websocket"]}
curl -s 'https://winpilot.onrender.com/api/ws/?EIO=4&transport=polling'
```

If the second command returns an HTML redirect instead of a `sid`, the custom
server is not running — check that the start command is `npm start` and not
`next start`.

## Free tier note

Render's free instances spin down after inactivity. The first request after a
spin-down takes ~30–60s, and any open WebSocket connection is dropped on
suspend. The extension reconnects with backoff, but a paid instance type is
required for genuinely persistent connections.
