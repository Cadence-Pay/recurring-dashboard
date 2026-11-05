import { PlanDetailPage } from '../../../src/components/PlanDetailPage';

export const metadata = { title: 'Plan · Stellar Recurring' };

export default function PlanPage() {
  return (
    <div className="stack">
      <h1>Plan</h1>
      <PlanDetailPage />
    </div>
  );
}
