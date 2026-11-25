import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  OpenCodeAutostartResponse,
  OpenCodeStatusResponse,
} from '../../shared/types.js';
import {
  getRawConnectionsConfig,
  scrubSecrets,
  updateConnectionsConfig,
} from './connectionsStore.js';
import {
  pickDefaultOpenCodeModel,
  testOpenCodeConnection,
} from './opencodeClient.js';

interface ManagedOpenCodeProcess {
  pid: number;
  port: number;
  serverUrl: string;
}

let managedChild: ManagedOpenCodeProcess | null = null;
let startingPromise: Promise<{ status: number; body: OpenCodeAutostartResponse }> | null = null;

function killProcessTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // Ignore errors when process already exited
  }
}

export function stopManagedOpenCodeServer(): void {
  if (!managedChild) return;
  const { pid } = managedChild;
  managedChild = null;
  killProcessTree(pid);
}

export async function getOpenCodeStatus(): Promise<OpenCodeStatusResponse> {
  const { opencode } = getRawConnectionsConfig();
  try {
    const res = await testOpenCodeConnection({
      ...opencode,
      timeoutMs: 2500,
    });
    return {
      running: res.body.ok,
      managed: Boolean(managedChild),
      serverUrl: opencode.serverUrl,
      version: res.body.version,
      providers: res.body.providers,
    };
  } catch {
    return {
      running: false,
      managed: Boolean(managedChild),
      serverUrl: opencode.serverUrl,
    };
  }
}

async function waitForChildHealth(
  serverUrl: string,
  childRef: { exited: boolean; code: number | null; logs: string },
  timeoutMs = 12_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childRef.exited) {
      return false;
    }
    try {
      const res = await fetch(`${serverUrl}/global/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) {
        const json = (await res.json()) as { healthy?: boolean };
        if (json?.healthy === true) {
          return true;
        }
      }
    } catch {
      // Retry until healthy or timed out
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function runAutostart(options?: {
  port?: number;
}): Promise<{ status: number; body: OpenCodeAutostartResponse }> {
  const { opencode } = getRawConnectionsConfig();

  // First check if already reachable at configured URL
  const probe = await testOpenCodeConnection({
    ...opencode,
    timeoutMs: 2500,
  });
  if (probe.body.ok) {
    const defaultModel =
      !opencode.providerId || !opencode.modelId
        ? pickDefaultOpenCodeModel(probe.body.providers ?? [])
        : null;
    updateConnectionsConfig({
      opencode: {
        enabled: true,
        ...(defaultModel
          ? { providerId: defaultModel.providerID, modelId: defaultModel.modelID }
          : {}),
      },
    });
    return {
      status: 200,
      body: {
        ...probe.body,
        serverUrl: opencode.serverUrl,
        managed: Boolean(managedChild),
        message: probe.body.message,
      },
    };
  }

  const rawPort = options?.port ?? 4096;
  const port = Math.floor(Number(rawPort));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'BAD_REQUEST',
        message: 'Port must be an integer between 1024 and 65535.',
      },
    };
  }

  const serverUrl = `http://127.0.0.1:${port}`;
  const dataDir = path.resolve(process.cwd(), '.opencode-data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    return {
      status: 500,
      body: {
        ok: false,
        code: 'UNKNOWN',
        message: scrubSecrets(
          `Failed to create local OpenCode data directory: ${err instanceof Error ? err.message : String(err)}`,
        ),
      },
    };
  }

  stopManagedOpenCodeServer();

  const googleApiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    '';

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_DATA_HOME: dataDir,
    ...(googleApiKey ? { GOOGLE_GENERATIVE_AI_API_KEY: googleApiKey } : {}),
  };

  let child: ChildProcess;
  try {
    if (process.platform === 'win32') {
      child = spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `opencode serve --port ${port} --hostname 127.0.0.1`],
        {
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } else {
      child = spawn('opencode', ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
  } catch (err) {
    return {
      status: 502,
      body: {
        ok: false,
        code: 'UNREACHABLE',
        message: scrubSecrets(
          `Failed to launch OpenCode CLI: ${err instanceof Error ? err.message : String(err)}`,
        ),
      },
    };
  }

  const childState = { exited: false, code: null as number | null, logs: '' };
  const appendLog = (chunk: Buffer | string) => {
    childState.logs = (childState.logs + chunk.toString()).slice(-800);
  };
  child.stdout?.on('data', appendLog);
  child.stderr?.on('data', appendLog);
  child.on('exit', (code) => {
    childState.exited = true;
    childState.code = code;
    if (managedChild?.pid === child.pid) {
      managedChild = null;
    }
  });
  child.on('error', (err) => {
    childState.exited = true;
    appendLog(err.message);
  });

  if (!child.pid) {
    return {
      status: 502,
      body: {
        ok: false,
        code: 'UNREACHABLE',
        message: 'Failed to spawn local OpenCode CLI process.',
      },
    };
  }

  const pid = child.pid;
  const healthy = await waitForChildHealth(serverUrl, childState, 12_000);
  if (!healthy) {
    killProcessTree(pid);
    const detail = childState.logs.trim()
      ? ` Details: ${childState.logs.trim().split(/\r?\n/).slice(-2).join(' ')}`
      : '';
    return {
      status: 502,
      body: {
        ok: false,
        code: 'UNREACHABLE',
        message: scrubSecrets(
          `Local OpenCode server failed to become healthy on ${serverUrl}. Ensure OpenCode CLI is installed (npm i -g opencode-ai).${detail}`,
        ),
      },
    };
  }

  managedChild = { pid, port, serverUrl };
  updateConnectionsConfig({
    opencode: {
      enabled: true,
      serverUrl,
      authMode: 'none',
    },
  });

  const { opencode: updatedCfg } = getRawConnectionsConfig();
  const tested = await testOpenCodeConnection(updatedCfg);
  if (!tested.body.ok) {
    return {
      status: tested.status,
      body: {
        ...tested.body,
        serverUrl,
        managed: true,
      },
    };
  }

  if ((!updatedCfg.providerId || !updatedCfg.modelId) && tested.body.providers?.length) {
    const def = pickDefaultOpenCodeModel(tested.body.providers);
    if (def) {
      updateConnectionsConfig({
        opencode: {
          providerId: def.providerID,
          modelId: def.modelID,
        },
      });
    }
  }

  return {
    status: 200,
    body: {
      ...tested.body,
      serverUrl,
      managed: true,
      message: `Started and connected local OpenCode server (${tested.body.version ?? 'healthy'}).`,
    },
  };
}

export async function autostartLocalOpenCode(options?: {
  port?: number;
}): Promise<{ status: number; body: OpenCodeAutostartResponse }> {
  if (startingPromise) {
    return startingPromise;
  }
  startingPromise = runAutostart(options).finally(() => {
    startingPromise = null;
  });
  return startingPromise;
}
