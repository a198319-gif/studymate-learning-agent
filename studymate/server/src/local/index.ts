import path from 'node:path';

import { createLocalRuntime } from './create-local-runtime.js';

const port = Number.parseInt(process.env.LOCAL_PORT ?? '4173', 10);
const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const dataDirectory = path.resolve(projectRoot, process.env.LOCAL_DATA_DIR ?? '.local-data');
const staticDirectory = path.resolve(projectRoot, process.env.LOCAL_CLIENT_DIR ?? path.join('client', 'dist'));
const runtime = await createLocalRuntime({ dataDirectory, staticDirectory });
const server = runtime.app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`StudyMate local is ready at http://127.0.0.1:${port}\n`);
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await runtime.close();
}

process.once('SIGINT', () => void stop().then(() => process.exit(0)));
process.once('SIGTERM', () => void stop().then(() => process.exit(0)));
