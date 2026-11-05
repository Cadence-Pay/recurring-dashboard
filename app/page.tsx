import { KeeperStatus } from '../src/components/KeeperStatus';

export default function HomePage() {
  return (
    <div className="stack">
      <h1>Overview</h1>
      <p className="muted">
        Merchant dashboard for Stellar Recurring. Wallet connection, plans, subscribers and revenue
        are added in the next tasks. This page shows whether the keeper is reachable.
      </p>
      <KeeperStatus />
    </div>
  );
}
