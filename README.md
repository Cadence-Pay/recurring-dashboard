# recurring-dashboard

Next.js (App Router) merchant dashboard for Stellar Recurring. Planned job: show a merchant their plans, subscribers, charges and revenue, using the keeper read API and a connected wallet.

This is **not** payment streaming. It is one discrete charge per period.

## Status

Built so far (Phase 3 is in progress):

- Design tokens in `app/globals.css`: all colours in one block with a light and a dark theme (dark follows the system setting). A test checks WCAG AA contrast (4.5:1 for text, 3:1 for the focus ring) for every text pair in both themes, and that no colour is written anywhere else in the stylesheet.
- Layout with a skip link, a main navigation landmark and a focusable `main`.
- A typed client for the keeper's read API. Every response is checked against a schema, and errors are typed (`KeeperApiError`, `KeeperNetworkError`, `KeeperResponseError`).
- Loading, error (with retry) and empty states in one `StateView` component, used by every data view.
- Wallet connection through the Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`), behind a small adapter so the rest of the app and the tests do not depend on a browser wallet. It shows the connected address (shortened, full address on hover), the expected network, a disconnect button, and a warning when the wallet reports a different network than the dashboard expects. Nothing is remembered between page loads. The kit is loaded only when the person presses Connect.
- An overview page that shows whether the keeper is reachable, which network it is on, whether it can charge, and when it last synced.

Not built yet: plans, subscribers, charges and revenue pages.

The wallet code is covered by unit tests with a fake kit. It has **not** been tried with a real wallet in a browser yet.

**Audit status: the contract this dashboard talks to has not been audited. This dashboard has not been audited either.**

## Configuration

Set at build time (they end up in the browser, so they must not hold secrets). See `.env.example`.

| Variable                      | Meaning                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_KEEPER_URL`      | Address of the keeper read API, for example `http://127.0.0.1:8080`. The keeper must allow this site's origin in its `CORS_ORIGINS`. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Network the dashboard expects, for example `testnet`. The overview warns if the keeper reports another one.                          |

If a variable is missing, the pages say which one instead of failing silently.

## Verify

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Needs Node 24 or newer and pnpm.

## License

MIT
