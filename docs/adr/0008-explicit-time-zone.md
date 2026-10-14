# 0008. Time zone is explicit; formatting never uses the server's default zone

- Status: Accepted
- Date: 2026-10-14

## Context
Date formatting depends on a time zone. If the server prerenders with its own default zone (often UTC) and the browser formats with the user's zone, React reports a hydration mismatch. Under Cache Components a per-user zone is request data, so it cannot be read in the static shell. In next-intl, `timeZone` is set in `request.ts`, which runs for every translation call, so making it dynamic made every translation dynamic ([amannn/next-intl#2136](https://github.com/amannn/next-intl/issues/2136)).

## Decision
- `defineConfig({ timeZone })` sets the **build/static** zone. It defaults to `'UTC'`, and the compiler passes it explicitly to every `Intl.DateTimeFormat`. The runtime's default zone is never used.
- Message functions do not depend on the zone, so `getT` stays static. Only date/time formatting reads a zone.
- Per-user zones are opt-in and scoped:
  - Server: `getFormat(locale, { timeZone })`.
  - Client: `<TongueProvider locale timeZone>`. A user zone read from a cookie in the proxy, or from `Intl.DateTimeFormat().resolvedOptions()` on the client, only affects components below a Suspense or dynamic boundary that receive it.
- In dev, a hydration-safe warning (`TONGUE_W_TIMEZONE`) fires when a client `useFormat()` call would format a date with a zone that differs from the one used on the server.

## Consequences
- \+ Static shells format dates deterministically, so there are no zone-related hydration mismatches.
- \+ A dynamic zone does not make translations dynamic.
- − Users see dates in the configured zone unless the app opts into a per-user zone.

## Alternatives considered
- Implicit server default zone: non-deterministic across hosts, so rejected.
- A zone read in a request-scoped config (next-intl `request.ts` style): this couples zone and messages, so rejected (see #2136).
