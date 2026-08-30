import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const action = process.argv[2] ?? 'test';
const actions = {
  test: ['-m', 'pytest', 'backend/tests'],
  lint: ['-m', 'ruff', 'check', 'backend'],
  typecheck: ['-m', 'mypy', 'backend/app'],
  build: ['-m', 'compileall', '-q', 'backend/app'],
  migrate: ['-m', 'alembic', '-c', 'backend/alembic.ini', 'upgrade', 'head'],
  dev: ['-m', 'uvicorn', 'backend.app.main:app', '--reload', '--host', '127.0.0.1', '--port', process.env.PORT ?? '5000'],
  local: ['-m', 'uvicorn', 'backend.app.local:create_local_app', '--factory', '--host', '127.0.0.1', '--port', process.env.LOCAL_PORT ?? '4173'],
};

const args = actions[action];
if (!args) {
  console.error(`Unknown Python backend action: ${action}`);
  process.exit(2);
}

const candidates = [
  process.env.PYTHON,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  process.platform === 'win32' ? 'python.exe' : 'python3',
  'python',
].filter(Boolean);

for (const executable of candidates) {
  if (executable.includes('/') && !existsSync(executable)) continue;
  const result = spawnSync(executable, args, { stdio: 'inherit', env: process.env });
  if (!result.error || result.error.code !== 'ENOENT') process.exit(result.status ?? 1);
}

console.error('Python was not found. Create .venv or set the PYTHON environment variable.');
process.exit(1);
