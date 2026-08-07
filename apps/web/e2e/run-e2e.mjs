import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const apiUrl = 'http://localhost:3101';
const webUrl = 'http://localhost:3100';
const sourceDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';
const sourceUrl = new URL(sourceDatabaseUrl);
const administratorDatabase = sourceUrl.pathname.slice(1);
const databaseUser = decodeURIComponent(sourceUrl.username);
const databaseName = `sgi_e2e_${process.pid}_${randomBytes(4).toString('hex')}`;
const temporaryUrl = new URL(sourceUrl);
temporaryUrl.pathname = `/${databaseName}`;

if (!/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)) {
  throw new Error('Unsafe temporary database name.');
}

const children = new Set();

function invocation(command, arguments_) {
  if (process.platform === 'win32' && command === 'pnpm') {
    return {
      arguments: ['/d', '/s', '/c', 'pnpm', ...arguments_],
      executable: process.env.ComSpec ?? 'cmd.exe',
    };
  }
  return { arguments: arguments_, executable: command };
}

function run(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const invoked = invocation(command, arguments_);
    const child = spawn(invoked.executable, invoked.arguments, {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      stdio:
        options.input === undefined
          ? 'inherit'
          : ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${String(code)}.`));
    });
  });
}

function start(command, arguments_, env) {
  const invoked = invocation(command, arguments_);
  const child = spawn(invoked.executable, invoked.arguments, {
    cwd: repositoryRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await run('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(
      () => undefined,
    );
  } else {
    child.kill('SIGTERM');
  }
}

async function waitFor(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Service for ${url} exited before becoming ready.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function psql(sql) {
  await run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      databaseUser,
      '-d',
      administratorDatabase,
    ],
    { input: sql },
  );
}

let api;
let web;
let createdDatabase = false;

try {
  await run('docker', ['compose', 'up', '-d', 'postgres']);
  await psql(`CREATE DATABASE "${databaseName}";\n`);
  createdDatabase = true;

  const databaseEnvironment = {
    ...process.env,
    CI: 'true',
    DATABASE_URL: temporaryUrl.toString(),
  };
  await run('pnpm', ['--filter', '@sgi/database', 'db:migrate:deploy'], {
    env: databaseEnvironment,
  });
  await run('pnpm', ['--filter', '@sgi/database', 'db:bootstrap'], {
    env: databaseEnvironment,
  });

  const sharedEnvironment = {
    ...databaseEnvironment,
    API_PORT: '3101',
    API_PUBLIC_URL: apiUrl,
    AUTH_CSRF_HMAC_SECRET_BASE64: Buffer.alloc(32, 17).toString('base64'),
    AUTH_ORIGIN_HMAC_SECRET_BASE64: Buffer.alloc(32, 23).toString('base64'),
    LOG_LEVEL: 'info',
    NEXT_PUBLIC_API_URL: apiUrl,
    NODE_ENV: 'test',
    SESSION_COOKIE_NAME: 'sgi_session',
    SGI_E2E_API_URL: apiUrl,
    SGI_E2E_DATABASE_URL: temporaryUrl.toString(),
    SGI_E2E_WEB_URL: webUrl,
    SWAGGER_ENABLED: 'false',
    TRUST_PROXY_HOPS: '0',
    WEB_ORIGINS: webUrl,
  };

  api = start(
    'pnpm',
    ['--filter', '@sgi/api', 'exec', 'tsx', 'src/main.ts'],
    sharedEnvironment,
  );
  web = start(
    'pnpm',
    [
      '--filter',
      '@sgi/web',
      'exec',
      'next',
      'dev',
      '--hostname',
      'localhost',
      '--port',
      '3100',
    ],
    sharedEnvironment,
  );
  await Promise.all([
    waitFor(`${apiUrl}/api/v1/health`, api),
    waitFor(`${webUrl}/login`, web),
  ]);
  await run(
    'pnpm',
    [
      '--filter',
      '@sgi/web',
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.config.ts',
      ...process.argv.slice(2),
    ],
    { env: sharedEnvironment },
  );
} finally {
  await Promise.all([stop(web), stop(api)]);
  if (createdDatabase) {
    await psql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid();\nDROP DATABASE "${databaseName}";\n`,
    );
  }
}
