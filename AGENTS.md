# ClawAgent

Front end for ClawAgent, a sales and lead capture platform. React 19 + Vite 6 +
Tailwind v4 in TypeScript. All backend work happens in a separate **gateway**
service (deployed on Railway); this repo only talks to it over HTTP/WebSocket.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev server | `npm run dev` (Vite, port 3000, host 0.0.0.0) |
| Typecheck | `npm run lint` (`tsc --noEmit`) |
| Build | `npm run build` |
| Preview build | `npm run preview` |

There is no test suite and no ESLint/Prettier config. `npm run lint` is the only
automated check — run it before finishing any change, and sanity-check UI work
against a running `npm run dev`.

## Layout

- `src/App.tsx` — three-tab shell (`sales` | `lead` | `ops`), polls gateway
  status every 30s.
- `src/components/SalesAssociateView.tsx` — voice + text chat. Opens a realtime
  WebSocket to xAI Grok Voice, captures mic through `getUserMedia` +
  `AudioContext`. The largest and most stateful file here.
- `src/components/LeadCaptureView.tsx` — lead form. Sends `pageRenderedAt` so
  the server's spam guard can reject instant submissions.
- `src/components/OpsConsoleView.tsx` — ops key entry, lead list, approve action.
- `src/lib/api.ts` — every gateway call. Add new endpoints here, not inline in
  components.

## Gateway

`API_BASE` in `src/lib/api.ts` comes from `VITE_API_BASE`, baked in at build
time by Vite. When unset it falls back to the production Railway gateway,
because static hosts (AI Studio) don't serve `/api` themselves and same-origin
POSTs there fail with 405. Set it to `""` only for a same-origin deployment.

Endpoints currently in use:

- `POST /api/claw/lead` — lead capture
- `GET /api/ops/leads`, `POST /api/ops/leads/:id/approve` — ops console,
  authenticated with an `x-ops-key` header
- `GET /api/claw/sales-associate/config`, `POST .../token`, `POST .../conversation`
- `POST /api/sales/chat` — stateless text chat (OpenRouter), distinct from the
  realtime voice path
- `POST /api/outreach/sms`, `POST /api/outreach/call` — Twilio, server-side

## Conventions

- Single quotes, 2-space indent, functional components with hooks.
- Tailwind utility classes inline; no CSS modules.
- Gateway failures surface as `ApiError` (carries `status` + message); handle
  401 explicitly in ops paths — it means a bad `OPS_KEY`.
- `@/` aliases the repo root (both `vite.config.ts` and `tsconfig.json`).
- The ops key is user-supplied and lives in `localStorage` under
  `clawagent_ops_key`. It is not a build-time secret.

## Gotchas

- **Don't touch the HMR block in `vite.config.ts`.** File watching is
  deliberately disabled when `DISABLE_HMR=true` to stop flicker during agent
  edits.
- Secrets belong on the gateway, never in the client bundle. The browser only
  ever holds short-lived ephemeral tokens (see the sales-associate token flow).
- `checkGatewayStatus()` counts *any* HTTP response — including a 401 — as
  online. Only a network-level or CORS failure means offline.
- `.env.local` is gitignored; `.env.example` documents the variables.
- Prettier is disabled in `opencode.json`: the repo pins no Prettier version or
  config, so formatting on save would rewrite files against the existing style.
