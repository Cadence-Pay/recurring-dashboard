import { PlansPage } from '../../src/components/PlansPage';

export const metadata = { title: 'Plans · Stellar Recurring' };

export default function Plans() {
  return (
    <div className="stack">
      <h1>Plans</h1>
      <PlansPage />
    </div>
  );
}
