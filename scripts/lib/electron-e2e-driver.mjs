import { existsSync, readFileSync, statSync } from 'node:fs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForHttp = async (url, timeoutMs = 30_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // 起動待ちなので再試行する。
    }
    await sleep(250);
  }
  throw new Error(`HTTP endpoint did not become ready: ${url}`);
};

export const waitForFreshElectronBundle = async ({
  mainBundle,
  preloadBundle,
  startedAtMs,
  requiredMainText = '',
  requiredPreloadText = '',
  timeoutMs = 30_000,
}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(mainBundle) && existsSync(preloadBundle)) {
      const fresh = statSync(mainBundle).mtimeMs >= startedAtMs
        && statSync(preloadBundle).mtimeMs >= startedAtMs;
      const mainReady = requiredMainText === ''
        || readFileSync(mainBundle, 'utf8').includes(requiredMainText);
      const preloadReady = requiredPreloadText === ''
        || readFileSync(preloadBundle, 'utf8').includes(requiredPreloadText);
      if (fresh && mainReady && preloadReady) return;
    }
    await sleep(250);
  }
  throw new Error('Electron bundle did not become ready.');
};

export const waitForRendererTarget = async ({
  debugPort,
  urlPrefix,
  timeoutMs = 30_000,
}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((entry) => (
        entry.type === 'page'
        && typeof entry.webSocketDebuggerUrl === 'string'
        && typeof entry.url === 'string'
        && entry.url.startsWith(urlPrefix)
      ));
      if (target) return target;
    } catch {
      // Electronのdebug endpoint起動待ち。
    }
    await sleep(250);
  }
  throw new Error('Electron renderer debug target did not become ready.');
};

export class CdpClient {
  constructor(url, timeoutMs = 180_000) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.dialogs = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP websocket failed'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      if (!message.method) return;
      this.events.push(message);
      if (message.method === 'Page.javascriptDialogOpening') {
        this.dialogs.push({
          type: message.params?.type ?? '',
          message: message.params?.message ?? '',
        });
        void this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.timeoutMs);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description
        ?? response.exceptionDetails.text
        ?? 'Runtime.evaluate failed';
      throw new Error(detail);
    }
    return response.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

export const collectRuntimeErrors = (client) => client.events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) => (
    event.params?.exceptionDetails?.exception?.description
    ?? event.params?.exceptionDetails?.text
    ?? 'Runtime exception'
  ));

export const collectConsoleLines = (client) => client.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled')
  .map((event) => (event.params?.args ?? [])
    .map((argument) => argument.value ?? argument.description ?? '')
    .join(' '));
