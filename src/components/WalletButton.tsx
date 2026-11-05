'use client';

import { useWallet } from './WalletProvider';

/** `GABC…WXYZ`: enough to recognise an address without filling the header. */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-4)}`;
}

/**
 * Connect and disconnect controls with the connected address and network.
 *
 * Shows a warning when the wallet is on a different network than the dashboard.
 */
export function WalletButton(props: { networkLabel: string }) {
  const { state, connect, disconnect, wrongNetwork } = useWallet();

  if (state.status === 'connected') {
    return (
      <div className="wallet">
        <p className="wallet__line">
          <span className="visually-hidden">Connected wallet: </span>
          <span className="mono" title={state.address}>
            {shortAddress(state.address)}
          </span>{' '}
          <span className="badge">{props.networkLabel}</span>
        </p>
        <button type="button" className="btn btn--secondary" onClick={() => void disconnect()}>
          Disconnect
        </button>
        {wrongNetwork ? (
          <p role="alert" className="badge badge--bad wallet__warning">
            Your wallet is on a different network than this dashboard ({props.networkLabel}). Switch
            the network in your wallet before signing anything.
          </p>
        ) : null}
        {state.walletPassphrase === null ? (
          <p className="muted wallet__warning">
            Your wallet did not report its network. Check that it is set to {props.networkLabel}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet">
      <button
        type="button"
        className="btn"
        disabled={state.status === 'connecting'}
        aria-busy={state.status === 'connecting'}
        onClick={() => void connect()}
      >
        {state.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </button>
      {state.status === 'error' ? (
        <p role="alert" className="field__error wallet__warning">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
