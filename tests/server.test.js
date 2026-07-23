import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BASIC_AUTH_USERNAME = 'test-user';
process.env.BASIC_AUTH_PASSWORD = 'test-password';
process.env.MAX_REQUEST_BYTES = '240';

const { server } = await import('../src/server/index.js?server-test');

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

let baseUrlPromise;

async function getBaseUrl(t) {
  baseUrlPromise ||= listen().catch((error) => error);
  const result = await baseUrlPromise;
  if (result instanceof Error) {
    if (result.code === 'EPERM') {
      t.skip('Local server listen is blocked in this environment');
      return null;
    }
    throw result;
  }
  return result;
}

test.after(async () => {
  if (server.listening) await close();
});

function authHeaders() {
  return {
    authorization: `Basic ${Buffer.from('test-user:test-password').toString('base64')}`
  };
}

test('health endpoint is public', async (t) => {
  const baseUrl = await getBaseUrl(t);
  if (!baseUrl) return;
  const response = await fetch(`${baseUrl}/api/health`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.status, 'ok');
});

test('basic auth protects application routes', async (t) => {
  const baseUrl = await getBaseUrl(t);
  if (!baseUrl) return;
  const unauthorized = await fetch(`${baseUrl}/api/dashboard/kpis`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/api/dashboard/kpis`, { headers: authHeaders() });
  const payload = await authorized.json();
  assert.equal(authorized.status, 200);
  assert.equal(payload.success, true);
});

test('portfolio create returns created status', async (t) => {
  const baseUrl = await getBaseUrl(t);
  if (!baseUrl) return;
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      projectName: 'Created Status Portfolio',
      customerName: 'Created Status Customer',
      projectStatus: 'Implementation',
      estimatedGoLiveDate: '2026-10-01'
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  await fetch(`${baseUrl}/api/projects/${encodeURIComponent(payload.data.id)}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
});

test('invalid JSON returns a validation error', async (t) => {
  const baseUrl = await getBaseUrl(t);
  if (!baseUrl) return;
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: '{bad json'
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'INVALID_JSON');
});

test('oversized request bodies are rejected', async (t) => {
  const baseUrl = await getBaseUrl(t);
  if (!baseUrl) return;
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ csvText: 'x'.repeat(320) })
  });
  const payload = await response.json();
  assert.equal(response.status, 413);
  assert.equal(payload.error.code, 'PAYLOAD_TOO_LARGE');
});
