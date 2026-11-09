# recurring-dashboard

[![ci](https://github.com/Cadence-Pay/recurring-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Cadence-Pay/recurring-dashboard/actions/workflows/ci.yml)

Next.js (App Router) merchant dashboard for Stellar Recurring. It shows a merchant their plans, subscribers, charges and revenue from the keeper's read API, and lets them create and deactivate plans and cancel subscriptions with a connected wallet.

This is **not** payment streaming. It is one discrete charge per period.

## Status

Built:

- Design tokens in `app/globals.css`: all colours in one block with a light and a dark theme (dark follows the system setting). A test checks WCAG AA contrast (4.5:1 for text, 3:1 for the focus ring) for every text pair in both themes, and that no colour is written anywhere else in the stylesheet.
- Layout with a skip link, a main navigation landmark and a focusable `main`.
- A typed client for the keeper's read API. Every response is checked against a schema, and errors are typed (`KeeperApiError`, `KeeperNetworkError`, `KeeperResponseError`).
- Loading, error (with retry) and empty states in one `StateView` component, used by every data view.
- Wallet connection through the Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`), behind a small adapter so the rest of the app and the tests do not depend on a browser wallet. It shows the connected address (shortened, full address on hover), the expected network, a disconnect button, and a warning when the wallet reports a different network than the dashboard expects. Nothing is remembered between page loads. The kit is loaded only when the person presses Connect.
- A **Plans** page for the connected merchant (their address is the merchant):
  - a list of their plans from the keeper, with amounts shown in whole tokens (the token's symbol and decimals are read from the token contract) and periods in plain words;
  - a form to create a plan (token contract id, amount per period, period length). The amount is converted using the token's decimals and refused if it has more decimal places than the token, so nobody pays a different amount than typed. The call is simulated, signed in the wallet and sent through the generated contract bindings in `src/contract/`;
  - a deactivate button with an explicit confirmation that says existing subscribers keep being charged.
    Creating or deactivating is disabled while the wallet is on the wrong network. A declined signature, a contract refusal, a network failure and a transaction that is sent but not yet confirmed each get their own message; the last one warns not to send again blindly.
- A **plan page** (`/plans/<id>`, linked from the plans list): the plan in plain words and its subscribers, 25 per page, each with status, next charge time (flagged "Due" once it has passed), and payments made (the first payment counts). The plan's merchant can cancel a subscription, with a confirmation that says the subscriber would have to subscribe again and that money already paid is not returned. Cancel is disabled for any other account, when no wallet is connected, and on the wrong network; the page says why.
- A **charges page** per subscription (`/subscriptions/<id>`, linked from the plan page): every charge the keeper tried, with its due time, a status in plain words (Charged, Waiting to retry with the next try time, Failed with the reason, Handled elsewhere), amount, attempts, and the transaction as a link to the block explorer on testnet and mainnet (a plain hash on a private network). It says that the first payment is not a charge and that other keepers' charges are not listed.
- A **revenue page**: for the connected merchant, one total per token in whole tokens with the number of payments, counted from the subscriptions the keeper synced (first payments plus every charge, whoever made it) and the time of that sync.
- An overview page that shows whether the keeper is reachable, which network it is on, whether it can charge, and when it last synced.

Not built yet: CSV export, invoices and a revenue chart over time (`WAVE-ISSUE(dashboard-1)`, `-2` and `-5` mark where they plug in).

The plans list comes from the keeper, which syncs every few seconds, so a new plan shows up after the next sync (the page says so and has a Refresh button). A plan deactivated or a subscription cancelled on the page is shown as such straight away, before the keeper catches up.

Tested: `pnpm test` (218 at the time of writing) covers the forms, every loading, empty and error state, the wallet adapter with a fake kit, the transaction service with a fake client, the colour contrast, and a mechanical accessibility audit of every page. The built dashboard and keeper were run together against the real testnet: all pages answered and the browser handshake (CORS) between them worked.

Tested by a person on 2026-11-09, on testnet, in a real browser with a real wallet extension: connecting, the wrong-network warning, creating a plan, declining a signature, deactivating the plan, and keyboard-only use. Plan creation and deactivation are confirmed on-chain. This click-through found one bug (after a deactivation the result message disappeared and the plan still looked active), which is fixed and covered by tests.

**Not tested:** cancelling a subscription _through the dashboard_ with a real wallet, a screen reader, and anything on mainnet.

**Audit status: the contract this dashboard talks to has not been audited. This dashboard has not been audited either.**

## Run it

```bash
pnpm install --frozen-lockfile
pnpm dev            # development server on http://localhost:3000
pnpm build && pnpm start   # production build
```

Set the variables below first. The keeper must list this site's origin in its `CORS_ORIGINS`.

## Configuration

Set at build time (they end up in the browser, so they must not hold secrets). See `.env.example`.

| Variable                                 | Meaning                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_KEEPER_URL`                 | Address of the keeper read API, for example `http://127.0.0.1:8080`. The keeper must allow this site's origin in its `CORS_ORIGINS`.                                                                         |
| `NEXT_PUBLIC_STELLAR_NETWORK`            | Network the dashboard expects, for example `testnet`. The overview warns if the keeper reports another one.                                                                                                  |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Passphrase of that network, for example `Test SDF Network ; September 2015` on testnet. Must match the network label.                                                                                        |
| `NEXT_PUBLIC_STELLAR_RPC_URL`            | Stellar RPC server used to build and send transactions, for example `https://soroban-testnet.stellar.org`.                                                                                                   |
| `NEXT_PUBLIC_CONTRACT_ID`                | The deployed recurring contract (starts with `C`). The current testnet one is in the contracts repository's [docs/TESTNET.md](https://github.com/Cadence-Pay/recurring-contracts/blob/main/docs/TESTNET.md). |

If a variable is missing, the pages say which one instead of failing silently.

## Verify

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Needs Node 24 or newer and pnpm.

## Stellar Recurring repositories

| Repository                                                                | What it is                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [recurring-contracts](https://github.com/Cadence-Pay/recurring-contracts) | the Soroban contract: plans, subscriptions, `charge`, `cancel` (testnet deployment and live runs in its `docs/`) |
| [recurring-keeper](https://github.com/Cadence-Pay/recurring-keeper)       | service that charges due subscriptions and serves the read API this dashboard uses                               |
| [recurring-dashboard](https://github.com/Cadence-Pay/recurring-dashboard) | this dashboard                                                                                                   |
| [recurring-checkout](https://github.com/Cadence-Pay/recurring-checkout)   | React subscribe button for websites                                                                              |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## License

MIT
