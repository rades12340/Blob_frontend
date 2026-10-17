# Blob_frontend

Web app for the Blob_storage system: sign up, sign in, upload files and download them again. Built with Next.js (App Router) and run with Bun.

```
Browser ──▶ blob_frontend (Next.js, :5173)
   │  fetch(credentials: "include")
   ▼
api_gateway (:8080)
   ├── /api/auth/*  ──▶ auth_service  (:4000)  register, login, refresh, logout, me
   └── /api/blob/*  ──▶ blob_storage  (:3000)  upload, list files, download links
Browser ──presigned link──▶ S3 (the file itself)
```

The app only talks to api_gateway. Downloads go straight from S3 to the browser through a short-lived presigned link.

## Requirements

- Bun v1.3 or newer
- auth_service, Blob_storage and api_gateway running (see their READMEs)

## Getting started

```bash
bun install
bun run dev   # http://localhost:5173
```

### Environment

Both are read at **build time** (Next.js inlines `NEXT_PUBLIC_*` into the browser bundle), so rebuild after changing them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | api_gateway's address, as the browser reaches it. |
| `NEXT_PUBLIC_MAX_UPLOAD_BYTES` | `26214400` (25 MB) | Size checked before uploading. Keep it equal to blob_storage's `MAX_UPLOAD_BYTES`; the server still enforces its own limit. |

The other services must allow this app's origin: `CORS_ORIGIN=http://localhost:5173` in api_gateway (its default).

### Run everything with Docker

Start the stacks in this order. auth_service's creates the shared `blob-storage` network the next two join:

```bash
cd ../auth_service  && docker compose up -d --build   # :4000
cd ../Blob_storage  && docker compose up -d --build   # :3000, S3Mock on :9090
cd ../Blob_api_gateway && docker compose up -d --build   # :8080
cd ../Blob_frontend && docker compose up -d --build   # :5173
```

Then open http://localhost:5173 and create an account.

## How sign-in works

| Token | Where it lives |
| --- | --- |
| Access token (15 min) | Only in memory, in `lib/api.ts`. Sent as `Authorization: Bearer …`. |
| Refresh token (14 days) | `httpOnly` cookie set by auth_service through the gateway. JavaScript can't read it. |

- **Reload:** the in-memory token is gone, so `AuthProvider` (`app/providers.tsx`) calls `POST /api/auth/refresh` with the cookie to get a new one before deciding whether you're signed in.
- **Expired token:** any request that gets `401` refreshes once and retries. If the refresh fails, you're sent to `/login`.
- **One refresh at a time:** auth_service rotates the refresh cookie on every refresh and revokes every session if an old one is reused. Parallel refreshes would trip that, so they share a single request.

`localhost:5173` and `localhost:8080` are the same site (the port doesn't count), so the `SameSite=Strict` cookie is sent to the gateway.

## Project layout

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Files page (signed in only): upload button and file table. |
| `app/login/`, `app/register/` | Sign-in and sign-up pages, both using `components/AuthForm.tsx`. |
| `app/providers.tsx` | `AuthProvider` / `useAuth()`: session state, restores the session on load. |
| `components/FilesPanel.tsx` | Lists, uploads and downloads files; maps 401/413/502 to messages. |
| `lib/api.ts` | `createApi()`: every call to the gateway, token handling, refresh-and-retry. |
| `lib/format.ts` | Byte and date formatting, upload limit. |
| `lib/api.test.ts` | Tests for the API client with a scripted `fetch`. |
| `app/globals.css` | All styles, with light and dark themes. |
| `Dockerfile`, `compose.yaml` | Standalone Next.js image and the local Docker stack. |

## Checks

| Command | What it does |
| --- | --- |
| `bun test` | Runs the tests. |
| `bun run typecheck` | Generates route types, then `tsc --noEmit`. |
| `bun run lint` / `lint:fix` | Biome |
| `bun run build` | Production build. |

Husky runs Biome on commit. On push, it checks the branch name and runs typecheck and tests. GitHub Actions also runs the build.

## PR rules

Same as auth_service: branches are named `<feat|fix|docs|chore>/<issue number>-short-slug`, and a PR needs a type label (`feature`, `enhancement`, `bug`, `documentation`) and a reference to an open issue. With Claude Code, "ship this" uses the `ship-pr` skill in `.claude/skills/`.
