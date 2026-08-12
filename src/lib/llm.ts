import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Base error class for all LLM-related errors.
 */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * Thrown when the agy CLI is not available on PATH.
 */
export class LlmUnavailableError extends LlmError {
  constructor(
    message: string = 'Antigravity CLI (agy) is not installed or not available in PATH.',
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/**
 * Thrown when an LLM generation request exceeds its timeout.
 */
export class LlmTimeoutError extends LlmError {
  constructor(message: string = 'LLM generation request timed out.') {
    super(message);
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Configuration options for LLM generation.
 */
export interface LlmOptions {
  /** Model identifier (default: gemini-3.6-flash-low) */
  model?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Reasoning effort level */
  effort?: 'low' | 'medium' | 'high';
}

const DEFAULT_MODEL = 'gemini-3.6-flash-low';
const DEFAULT_TIMEOUT = 30_000;

/** Cached path to the agy binary. null = not yet checked, false = not found. */
let agyCommandPath: string | null | false = null;
const execAsync = promisify(exec);

/**
 * Resolves the agy binary path via env var or PATH lookup.
 */
async function resolveAgyPath(): Promise<string | false> {
  // 1. Explicit env var override
  if (process.env.AGY_PATH) {
    const { existsSync } = await import('node:fs');
    if (existsSync(process.env.AGY_PATH)) return process.env.AGY_PATH;
  }

  // 2. Ask the shell
  try {
    const { stdout } = await execAsync('which agy', {
      shell: '/bin/bash',
    });
    const trimmed = stdout.trim();
    if (trimmed) return trimmed;
  } catch {
    // not found
  }

  return false;
}

/**
 * Checks if the agy CLI is available and caches its path.
 *
 * @returns true if agy is available, false otherwise.
 */
export async function isAgyAvailable(): Promise<boolean> {
  if (agyCommandPath === null) {
    agyCommandPath = await resolveAgyPath();
  }
  return agyCommandPath !== false;
}

/**
 * Returns the cached agy path or throws if unavailable.
 */
async function requireAgy(): Promise<string> {
  if (!(await isAgyAvailable()) || agyCommandPath === false) {
    throw new LlmUnavailableError();
  }
  return agyCommandPath as string;
}

/**
 * Builds the common CLI argument array.
 */
function buildArgs(
  format: 'text' | 'json' | 'stream-json',
  model: string,
  timeoutMs: number,
  effort?: 'low' | 'medium' | 'high',
  jsonSchema?: string,
): string[] {
  const timeoutStr = `${Math.ceil(timeoutMs / 1000)}s`;
  const args = [
    '--output-format', format,
    '--model', model,
    '--print-timeout', timeoutStr,
  ];

  if (effort) {
    args.push('--effort', effort);
  }
  if (jsonSchema) {
    args.push('--json-schema', jsonSchema);
  }

  return args;
}

/**
 * Spawns agy with the given args, pipes prompt via stdin, collects stdout.
 */
async function executeAgy(
  prompt: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const agyPath = await requireAgy();

  return new Promise((resolve, reject) => {
    const child = spawn(agyPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutData = '';
    let stderrData = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new LlmTimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new LlmError(`Failed to spawn agy: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new LlmError(`agy exited with code ${code}: ${stderrData}`));
        return;
      }
      resolve(stdoutData);
    });

    // Pipe the prompt via stdin (safer for complex/long prompts)
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Generates a free-form text response from the LLM.
 *
 * @param prompt - The prompt to send
 * @param options - Optional generation config
 * @returns The generated text
 */
export async function generateText(
  prompt: string,
  options?: LlmOptions,
): Promise<string> {
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;

  const args = buildArgs('text', model, timeoutMs, options?.effort);
  return executeAgy(prompt, args, timeoutMs);
}

/**
 * Generates a structured JSON response from the LLM.
 *
 * @param prompt - The prompt to send
 * @param schema - Optional JSON schema string to enforce structure
 * @param options - Optional generation config
 * @returns The parsed JSON object
 */
export async function generateJson<T>(
  prompt: string,
  schema?: string,
  options?: LlmOptions,
): Promise<T> {
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;

  const args = buildArgs('json', model, timeoutMs, options?.effort, schema);
  const stdout = await executeAgy(prompt, args, timeoutMs);

  try {
    return JSON.parse(stdout.trim()) as T;
  } catch (e) {
    throw new LlmError(
      `Failed to parse JSON response: ${e instanceof Error ? e.message : String(e)}\nResponse was: ${stdout.slice(0, 500)}`,
    );
  }
}

/**
 * Streams text chunks from the LLM using stream-json output format.
 *
 * @param prompt - The prompt to send
 * @param options - Optional generation config
 * @yields Text chunks as they arrive
 */
export async function* streamText(
  prompt: string,
  options?: LlmOptions,
): AsyncGenerator<string> {
  const agyPath = await requireAgy();
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;

  const args = buildArgs('stream-json', model, timeoutMs, options?.effort);

  const child = spawn(agyPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let hasTimedOut = false;
  const timer = setTimeout(() => {
    hasTimedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  let stderrData = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrData += chunk.toString();
  });

  let buffer = '';

  try {
    child.stdin.write(prompt);
    child.stdin.end();

    for await (const chunk of child.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          const text = parsed.text ?? parsed.content ?? parsed.chunk;
          if (text !== undefined) {
            yield text;
          } else {
            yield typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          }
        } catch {
          // Non-JSON line — yield raw
          yield trimmed;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const text = parsed.text ?? parsed.content ?? parsed.chunk;
        if (text !== undefined) {
          yield text;
        } else {
          yield typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        }
      } catch {
        yield buffer.trim();
      }
    }

    // Wait for process exit
    await new Promise<void>((resolve, reject) => {
      if (child.exitCode !== null) {
        if (child.exitCode !== 0) {
          reject(new LlmError(`agy stream exited with code ${child.exitCode}: ${stderrData}`));
        } else {
          resolve();
        }
      } else {
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new LlmError(`agy stream exited with code ${code}: ${stderrData}`));
          } else {
            resolve();
          }
        });
      }
    });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    if (hasTimedOut) {
      throw new LlmTimeoutError(`LLM stream request timed out after ${timeoutMs}ms`);
    }
  }
}
