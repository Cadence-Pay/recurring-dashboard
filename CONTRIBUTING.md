# Contributing to recurring-dashboard

Thank you for helping. This is the merchant dashboard of Stellar Recurring: pull-based subscription billing on Stellar. One discrete charge per period; it is **not** payment streaming.

The dashboard asks people to sign transactions. A misleading message here can cost someone money.

## Set up

You need Node 24 or newer and [pnpm](https://pnpm.io).

```bash
cd recurring-dashboard
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

Copy `.env.example` to `.env.local` and fill it in to see real data (see the README).

## Before you open a pull request

Run the full check. A pull request is ready when this passes:

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Rules for this package:

- Function components. Colours and spacing come from the CSS variables in `app/globals.css`; no hard-coded colours anywhere else.
- Every data view has a loading, an empty and an error state. Every form control has a label. Everything works with the keyboard alone.
- Check contrast with the token test. The accessibility audit in `src/components/a11y.test.tsx` must still pass; extend it for new views.
- TypeScript is strict. No `any`. Validate everything from the keeper with a schema.
- Anything that signs a transaction must say what it will do first, handle a declined signature, and be disabled on the wrong network.
- `src/contract/` is generated. Do not edit it by hand beyond what its header says.

Where things are: `app/` (pages), `src/components/`, `src/lib/`.

General rules:

- **Testnet only.** Never put a mainnet key, a seed phrase or any secret in a file, a test, a log, a commit or an issue. Use the Stellar CLI key store.
- **Describe only what exists.** Documentation says what is implemented and tested. No claims about features that are not there.
- **Keep to the issue.** Do what the issue asks and no more. A small, focused change is reviewed faster than a large one.
- **Test it.** New behaviour comes with tests for success and for failure. Say in the pull request what you ran.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org). Examples:

```
feat(dashboard): add <what>
fix(dashboard): handle <case>
docs(dashboard): explain <thing>
test(dashboard): cover <case>
```

## Claiming an issue

1. Pick an issue that is not assigned. Issues drafted for contributors name a marker such as `WAVE-ISSUE(...)`; search the code for it to find where the work plugs in.
2. Comment that you would like to take it, and wait to be assigned. One person per issue at a time.
3. Ask questions in the issue if the scope is unclear. The scope written there is the limit of the change.
4. Open a pull request that mentions the issue. If you stop working on it, say so, so someone else can take it.

## Reporting a security problem

Do not open a public issue. See [SECURITY.md](SECURITY.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
