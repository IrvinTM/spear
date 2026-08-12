import path from 'node:path';
import os from 'node:os';

/**
 * Returns the agent home directory.
 * Configurable via UES_AGENT_HOME env var, defaults to ~/.ues-agent
 */
export function getAgentHome(): string {
  const customHome = process.env.UES_AGENT_HOME;
  if (customHome) {
    return path.resolve(customHome);
  }
  return path.join(os.homedir(), '.ues-agent');
}
