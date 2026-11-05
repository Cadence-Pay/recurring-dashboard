/**
 * Link to a transaction in a public block explorer, or undefined when there is no public explorer
 * for the network (a local or private network). Only the two public networks are known.
 *
 * @param network - The network label, for example `testnet` or `mainnet`.
 * @param txHash - Transaction hash (64 hex characters).
 */
export function explorerTxUrl(network: string, txHash: string): string | undefined {
  if (!/^[0-9a-fA-F]{64}$/.test(txHash)) return undefined;
  const slug = network === 'testnet' ? 'testnet' : network === 'mainnet' ? 'public' : undefined;
  return slug === undefined
    ? undefined
    : `https://stellar.expert/explorer/${slug}/tx/${txHash.toLowerCase()}`;
}
