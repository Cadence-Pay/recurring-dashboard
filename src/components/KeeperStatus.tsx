'use client';

import { useMemo } from 'react';
import { createKeeperClient, type Health, type KeeperClient } from '../lib/keeper-client';
import { getPublicConfig } from '../lib/public-env';
import { useAsync } from '../lib/use-async';
import { StateView } from './StateView';

/** Format a Unix time in seconds for people, or say that it has not happened. */
export function formatTime(seconds: number | null): string {
  return seconds === null ? 'not yet' : new Date(seconds * 1000).toLocaleString();
}

/** Shows what the keeper reports about itself. */
export function KeeperStatusView(props: { client: KeeperClient; expectedNetwork: string }) {
  const { client, expectedNetwork } = props;
  const { state, reload } = useAsync((signal) => client.getHealth(signal), [client]);
  return (
    <StateView state={state} what="the keeper status" onRetry={reload}>
      {(health: Health) => (
        <div className="card stack">
          <h2>Keeper</h2>
          <dl>
            <dt>Network</dt>
            <dd>{health.network}</dd>
            <dt>Mode</dt>
            <dd>
              {health.readOnly ? (
                <span className="badge badge--warn">Read only: no charges are submitted</span>
              ) : (
                <span className="badge badge--ok">Charging</span>
              )}
            </dd>
            <dt>Last sync</dt>
            <dd>{formatTime(health.lastSyncAt)}</dd>
            <dt>Contract</dt>
            <dd className="mono">{health.contractId}</dd>
          </dl>
          {health.network === expectedNetwork ? null : (
            <p role="alert" className="badge badge--bad">
              The keeper is on {health.network}, but this dashboard expects {expectedNetwork}.
            </p>
          )}
        </div>
      )}
    </StateView>
  );
}

/** Shows what is wrong with the settings, so nobody has to read the console. */
export function ConfigProblems(props: { problems: readonly string[] }) {
  return (
    <div className="state state--error" role="alert">
      <p>
        <strong>The dashboard is not configured.</strong> Set these environment variables when
        building it (see <code>.env.example</code>):
      </p>
      <ul>
        {props.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

/** The overview's status block: reads the settings, then shows the keeper or what is missing. */
export function KeeperStatus() {
  const config = getPublicConfig();
  const client = useMemo(
    () => (config.ok ? createKeeperClient(config.config.keeperUrl) : undefined),
    // The settings are fixed for a build, so the URL is the only thing that can differ.
    [config.ok ? config.config.keeperUrl : undefined],
  );
  if (!config.ok || client === undefined) {
    return <ConfigProblems problems={config.ok ? [] : config.problems} />;
  }
  return <KeeperStatusView client={client} expectedNetwork={config.config.network} />;
}
