import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import {
  capacity,
  confirmImport,
  createProject,
  createImportPreview,
  clearProjectData,
  dashboardKpis,
  dataQuality,
  deleteProject,
  distribution,
  forecastForDate,
  forecastForMonth,
  forecastForRange,
  forecastProjects,
  forecastProjectsForMonth,
  forecastProjectsForRange,
  goLiveTrend,
  kpiProjects,
  latestImportSummary,
  listProjects,
  resetFromSeed,
  updateProject
} from './services.js';

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = new URL('../../public', import.meta.url).pathname;
const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_BYTES || 2 * 1024 * 1024);
const BASIC_AUTH_USERNAME = process.env.BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;
const BASIC_AUTH_ENABLED = Boolean(BASIC_AUTH_USERNAME && BASIC_AUTH_PASSWORD);

function send(res, status, body, meta) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });
  res.end(JSON.stringify(status >= 400 ? { success: false, error: body } : { success: true, data: body, ...(meta ? { meta } : {}) }));
}

async function readBody(req) {
  let body = '';
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw Object.assign(new Error('Request body is too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
    }
    body += chunk;
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { status: 400, code: 'INVALID_JSON' });
  }
}

function unauthorized(res) {
  res.writeHead(401, {
    'content-type': 'application/json',
    'www-authenticate': 'Basic realm="Project Delivery Dashboard"',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }));
}

function isAuthorized(req) {
  if (!BASIC_AUTH_ENABLED) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD;
  } catch {
    return false;
  }
}

async function routeApi(req, res, url) {
  if (url.pathname === '/api/health') return send(res, 200, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
  if (url.pathname === '/api/dashboard/kpis') return send(res, 200, await dashboardKpis(Object.fromEntries(url.searchParams)));
  const kpiMatch = url.pathname.match(/^\/api\/dashboard\/kpis\/([^/]+)\/projects$/);
  if (kpiMatch) {
    const result = await kpiProjects(kpiMatch[1], Object.fromEntries(url.searchParams));
    return send(res, 200, result.data, result.meta);
  }
  if (url.pathname === '/api/dashboard/status-distribution') return send(res, 200, await distribution('projectStatus', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/competency-distribution') return send(res, 200, await distribution('competency', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/customer-distribution') return send(res, 200, await distribution('customerName', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/customer-tier-distribution') return send(res, 200, await distribution('customerTier', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/effective-ic-distribution') return send(res, 200, await distribution('effectiveIC', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/integration-type-distribution') return send(res, 200, await distribution('integrationType', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/health-distribution') return send(res, 200, await distribution('healthStatus', Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/dashboard/go-live-trend') return send(res, 200, {
    forecasted: await goLiveTrend('estimatedGoLiveDate', Object.fromEntries(url.searchParams))
  });
  if (url.pathname === '/api/projects') {
    if (req.method === 'DELETE') return send(res, 200, await clearProjectData());
    if (req.method === 'POST') return send(res, 201, await createProject(await readBody(req)));
    const result = await listProjects(Object.fromEntries(url.searchParams));
    return send(res, 200, result.data, result.meta);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && req.method === 'PUT') return send(res, 200, await updateProject(projectMatch[1], await readBody(req)));
  if (projectMatch && req.method === 'DELETE') return send(res, 200, await deleteProject(projectMatch[1]));
  if (url.pathname === '/api/projects/reset-seed' && req.method === 'POST') return send(res, 200, await resetFromSeed());
  const forecastMatch = url.pathname.match(/^\/api\/forecasts\/date\/(\d{4}-\d{2}-\d{2})(\/projects)?$/);
  if (forecastMatch && !forecastMatch[2]) return send(res, 200, await forecastForDate(forecastMatch[1], Object.fromEntries(url.searchParams)));
  if (forecastMatch && forecastMatch[2]) {
    const query = Object.fromEntries(url.searchParams);
    const result = await forecastProjects(forecastMatch[1], query.category || 'all', query);
    return send(res, 200, result.data, result.meta);
  }
  const forecastMonthMatch = url.pathname.match(/^\/api\/forecasts\/month\/(\d{4}-\d{2})(\/projects)?$/);
  if (forecastMonthMatch && !forecastMonthMatch[2]) return send(res, 200, await forecastForMonth(forecastMonthMatch[1], Object.fromEntries(url.searchParams)));
  if (forecastMonthMatch && forecastMonthMatch[2]) {
    const query = Object.fromEntries(url.searchParams);
    const result = await forecastProjectsForMonth(forecastMonthMatch[1], query.category || 'all', query);
    return send(res, 200, result.data, result.meta);
  }
  const forecastRangeMatch = url.pathname.match(/^\/api\/forecasts\/range\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})(\/projects)?$/);
  if (forecastRangeMatch && !forecastRangeMatch[3]) return send(res, 200, await forecastForRange(forecastRangeMatch[1], forecastRangeMatch[2], Object.fromEntries(url.searchParams)));
  if (forecastRangeMatch && forecastRangeMatch[3]) {
    const query = Object.fromEntries(url.searchParams);
    const result = await forecastProjectsForRange(forecastRangeMatch[1], forecastRangeMatch[2], query.category || 'all', query);
    return send(res, 200, result.data, result.meta);
  }
  if (url.pathname === '/api/capacity') return send(res, 200, await capacity(Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/data-quality/summary') return send(res, 200, await dataQuality(Object.fromEntries(url.searchParams)));
  if (url.pathname === '/api/imports/latest') return send(res, 200, await latestImportSummary());
  if (url.pathname === '/api/imports/projects/csv' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.filePath && !body.csvText) return send(res, 400, { code: 'VALIDATION_ERROR', message: 'CSV file content is required' });
    return send(res, 200, await createImportPreview({
      filePath: body.filePath,
      csvText: body.csvText,
      fileName: body.fileName,
      mode: body.mode || 'incremental'
    }));
  }
  const confirmMatch = url.pathname.match(/^\/api\/imports\/([^/]+)\/confirm$/);
  if (confirmMatch && req.method === 'POST') return send(res, 200, await confirmImport(confirmMatch[1]));
  return send(res, 404, { code: 'NOT_FOUND', message: 'Route not found' });
}

async function serveStatic(req, res, url) {
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    const data = await readFile(join(PUBLIC_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(data);
  }
}

export const server = createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    console.info({
      requestId,
      method: req.method,
      path: req.url?.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/api/health' && !isAuthorized(req)) return unauthorized(res);
    if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    console.error({
      requestId,
      method: req.method,
      path: req.url?.split('?')[0],
      code: error.code || 'INTERNAL_ERROR',
      message: error.message
    });
    return send(res, error.status || 500, {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Unexpected error',
      details: error.details || []
    });
  }
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(PORT, () => {
    console.log(`Project Delivery Dashboard running at http://127.0.0.1:${PORT}`);
  });
}
