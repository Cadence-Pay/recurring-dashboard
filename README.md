# recurring-dashboard

Next.js (App Router) merchant dashboard for Stellar Recurring. Planned job: show a merchant their plans, subscribers, charges and revenue, using the keeper read API and a connected wallet.

This is **not** payment streaming. It is one discrete charge per period.

## Status

**Skeleton only.** One page renders a notice. There is no wallet connection, keeper client, or data view yet.

**Audit status: the contract this dashboard talks to has not been audited. This dashboard has not been audited either.**

## Verify

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Needs Node 24 or newer and pnpm.

## License

MIT
