import { ChargesPage } from '../../../src/components/ChargesPage';

export const metadata = { title: 'Charges · Stellar Recurring' };

export default function SubscriptionPage() {
  return (
    <div className="stack">
      <h1>Charges</h1>
      <ChargesPage />
    </div>
  );
}
