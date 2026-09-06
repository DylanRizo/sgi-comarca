import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const requireFromDatabase = createRequire(
  new URL('../../../packages/database/package.json', import.meta.url),
);
const { Client } = requireFromDatabase('pg');
const apiUrl = 'http://localhost:3101';
const webUrl = 'http://localhost:3100';
const sourceDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sgi_dev:sgi_dev_password@localhost:5433/sgi_comarca_dev?schema=public';
const sourceUrl = new URL(sourceDatabaseUrl);
const administratorUrl = new URL(sourceUrl);
administratorUrl.pathname = '/postgres';
administratorUrl.searchParams.delete('schema');
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

// A cold `tsx src/main.ts` compiles the whole Nest application before it can
// answer health, which measured about 104 s on a developer Windows machine
// while Next.js was building in parallel. The old 60 s budget failed there for
// a healthy service, so the wait is generous by default and overridable.
const readyTimeout = Number(process.env.SGI_E2E_READY_TIMEOUT_MS ?? 240_000);

async function waitFor(url, child) {
  const started = Date.now();
  const deadline = started + readyTimeout;
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
  throw new Error(
    `Timed out waiting for ${url} after ${String(
      Math.round((Date.now() - started) / 1000),
    )}s. Raise SGI_E2E_READY_TIMEOUT_MS if the service is only slow.`,
  );
}

// `next dev` compiles each route on its first request, which measured 7 s to
// 68 s per route on a developer Windows machine. Paid inside a test, that
// latency exhausts Playwright's 20 s expect and 60 s test budgets for a page
// that is perfectly healthy, so every page is requested once before the suite
// runs. The private-area guard is a client component, so an unauthenticated
// GET still renders the route server-side and compiles it.
async function pageRoutes(directory, segments = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = entries.some((entry) => entry.name === 'page.tsx')
    ? [`/${segments.join('/')}`]
    : [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const grouped = /^\(.*\)$/u.test(entry.name);
    const dynamic = /^\[.*\]$/u.test(entry.name);
    routes.push(
      ...(await pageRoutes(`${directory}/${entry.name}`, [
        ...segments,
        ...(grouped
          ? []
          : [dynamic ? '00000000-0000-4000-8000-000000000000' : entry.name]),
      ])),
    );
  }
  return routes;
}

async function warmRoutes() {
  if (process.env.SGI_E2E_WARM === '0') return;
  const routes = await pageRoutes(`${repositoryRoot}apps/web/app`);
  const pending = [...routes];
  const started = Date.now();
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let route = pending.shift(); route; route = pending.shift()) {
        try {
          await fetch(`${webUrl}${route === '/' ? '' : route}`);
        } catch {
          // A route that cannot be prerendered still gets compiled by the
          // request, and any real failure surfaces in the test itself.
        }
      }
    }),
  );
  console.log(
    `Compiled ${String(routes.length)} web routes in ${String(
      Math.round((Date.now() - started) / 1000),
    )}s.`,
  );
}

let api;
let web;
let createdDatabase = false;
let administratorConnected = false;
const administrator = new Client({
  connectionString: administratorUrl.toString(),
});

try {
  await administrator.connect();
  administratorConnected = true;
  await administrator.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;

  const databaseEnvironment = {
    ...process.env,
    CI: 'true',
    DATABASE_URL: temporaryUrl.toString(),
  };
  // API development starts through the workspace package export, whose
  // runtime entry is dist/. Regenerate and build it so a newly added Prisma
  // model cannot leave browser tests running an older client.
  await run('pnpm', ['--filter', '@sgi/database', 'db:generate'], {
    env: databaseEnvironment,
  });
  await run('pnpm', ['--filter', '@sgi/database', 'build'], {
    env: databaseEnvironment,
  });
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
  await warmRoutes();
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
  if (administratorConnected) {
    if (createdDatabase) {
      await administrator.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await administrator.query(`DROP DATABASE "${databaseName}"`);
    }
    await administrator.end();
  }
}
