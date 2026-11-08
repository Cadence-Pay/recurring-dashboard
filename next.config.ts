import type { NextConfig } from 'next';

const config: NextConfig = {
  // `next dev` otherwise writes an AGENTS.md into the package when an AI coding tool runs it.
  agentRules: false,
};

export default config;
