import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const apiPort = Number(process.env.PORT || 3001);
const apiHealthUrl = `http://127.0.0.1:${apiPort}/api/health`;
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

function track(child) {
  children.push(child);
  child.on('error', error => {
    console.error('Could not start a development process:', error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`A development process stopped${signal ? ` (${signal})` : ` with code ${code}`}.`);
      stop(code || 1);
    }
  });
  return child;
}

async function apiIsAvailable() {
  try {
    const response = await fetch(apiHealthUrl, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function start() {
  if (!(await apiIsAvailable())) {
    const api = track(spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: root, stdio: 'inherit' }));
    let ready = false;
    for (let attempt = 0; attempt < 40 && !stopping; attempt += 1) {
      if (api.exitCode !== null) break;
      if (await apiIsAvailable()) {
        ready = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) {
      console.error(`The API did not become ready at ${apiHealthUrl}.`);
      stop(1);
      return;
    }
  } else {
    console.log(`Using the API already running at http://localhost:${apiPort}`);
  }

  if (!stopping) {
    track(spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], { cwd: root, stdio: 'inherit' }));
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
start().catch(error => {
  console.error('Could not start development services:', error.message);
  stop(1);
});
