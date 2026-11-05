import { RevenuePage } from '../../src/components/RevenuePage';

export const metadata = { title: 'Revenue · Stellar Recurring' };

export default function Revenue() {
  return (
    <div className="stack">
      <h1>Revenue</h1>
      <RevenuePage />
    </div>
  );
}
