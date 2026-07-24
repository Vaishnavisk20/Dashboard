import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { enrichProject } from '../shared/projectLogic.js';

function loadLocalEnv() {
  const envPath = new URL('../../.env', import.meta.url);
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (process.env[key]) continue;
    process.env[key] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

loadLocalEnv();

const DB_PATH = new URL('../../data/db/projects.json', import.meta.url);
const IMPORTS_PATH = new URL('../../data/db/imports.json', import.meta.url);
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const PROJECTS_TABLE = process.env.SUPABASE_PROJECTS_TABLE || 'dashboard_projects';
const IMPORTS_TABLE = process.env.SUPABASE_IMPORTS_TABLE || 'dashboard_imports';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_DISABLED !== '1');
const SUPABASE_TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 10000);

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(table, path = '', options = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${path}`, {
      ...options,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      headers: supabaseHeaders(options.headers)
    });
  } catch (error) {
    throw Object.assign(new Error(`Supabase ${table} is unavailable`), {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      cause: error
    });
  }
  if (!response.ok) {
    const message = await response.text();
    throw Object.assign(new Error(`Supabase ${table} request failed`), {
      status: response.status >= 500 ? 503 : 500,
      code: 'DATABASE_ERROR',
      details: [{ status: response.status, message }]
    });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readSupabaseDocuments(table) {
  const rows = await supabaseRequest(table, '?select=data');
  return rows.map((row) => row.data);
}

async function replaceSupabaseDocuments(table, documents, mapDocument) {
  await supabaseRequest(table, '?id=not.is.null', { method: 'DELETE' });
  if (!documents.length) return;
  await supabaseRequest(table, '', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(documents.map(mapDocument))
  });
}

function nullable(value) {
  const clean = String(value ?? '').trim();
  return clean || null;
}

function dateOrNull(value) {
  const clean = nullable(value);
  return clean && /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function timestampOrNull(value) {
  return nullable(value);
}

function mapProjectForSupabase(project) {
  return {
    id: project.id,
    project_key: project.projectKey,
    project_name: nullable(project.projectName),
    customer_name: nullable(project.customerName),
    customer_tier: nullable(project.customerTier),
    project_status: nullable(project.projectStatus),
    competency: nullable(project.competency),
    primary_ic: nullable(project.primaryIC),
    secondary_ic: nullable(project.secondaryIC),
    ic_lead: nullable(project.icLead),
    station_name: nullable(project.stationName),
    estimated_go_live_date: dateOrNull(project.estimatedGoLiveDate),
    integration_type: nullable(project.integrationType),
    template_name: nullable(project.templateName),
    use_case: nullable(project.useCase),
    comment: nullable(project.comment),
    is_active: project.isActive !== false,
    source_file_name: nullable(project.sourceFileName),
    imported_at: timestampOrNull(project.importedAt),
    created_at: timestampOrNull(project.createdAt),
    updated_at: timestampOrNull(project.updatedAt) || new Date().toISOString(),
    data: project
  };
}

function mapImportForSupabase(entry) {
  return {
    id: entry.id,
    status: nullable(entry.status),
    file_name: nullable(entry.fileName),
    mode: nullable(entry.mode),
    row_count: Number(entry.rowCount || entry.summary?.total || 0),
    created_at: timestampOrNull(entry.createdAt) || new Date().toISOString(),
    confirmed_at: timestampOrNull(entry.confirmedAt),
    data: entry
  };
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(url, value) {
  await mkdir(dirname(url.pathname), { recursive: true });
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
}

export async function getProjects() {
  const projects = USE_SUPABASE ? await getRawProjects() : await readJson(DB_PATH, []);
  return projects.map((project) => enrichProject(project));
}

export async function getRawProjects() {
  if (USE_SUPABASE) {
    try {
      const projects = await readSupabaseDocuments(PROJECTS_TABLE);
      return projects.sort((a, b) => String(a.projectName || '').localeCompare(String(b.projectName || '')));
    } catch (error) {
      if (error.code === 'DATABASE_UNAVAILABLE') return readJson(DB_PATH, []);
      throw error;
    }
  }
  return readJson(DB_PATH, []);
}

export async function saveProjects(projects) {
  await writeJson(DB_PATH, projects);
  if (USE_SUPABASE) {
    try {
      await replaceSupabaseDocuments(PROJECTS_TABLE, projects, mapProjectForSupabase);
    } catch (error) {
      if (error.code !== 'DATABASE_UNAVAILABLE') throw error;
    }
    return;
  }
}

export async function getImports() {
  if (USE_SUPABASE) {
    try {
      const imports = await readSupabaseDocuments(IMPORTS_TABLE);
      return imports.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    } catch (error) {
      if (error.code === 'DATABASE_UNAVAILABLE') return readJson(IMPORTS_PATH, []);
      throw error;
    }
  }
  return readJson(IMPORTS_PATH, []);
}

export async function saveImports(imports) {
  await writeJson(IMPORTS_PATH, imports);
  if (USE_SUPABASE) {
    try {
      await replaceSupabaseDocuments(IMPORTS_TABLE, imports, mapImportForSupabase);
    } catch (error) {
      if (error.code !== 'DATABASE_UNAVAILABLE') throw error;
    }
    return;
  }
}

export async function upsertImportedProjects(incoming, { mode = 'incremental', sourceFileName = 'upload.csv' } = {}) {
  const existing = await getRawProjects();
  const byKey = new Map(existing.map((project) => [project.projectKey, project]));
  const incomingKeys = new Set();
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const project of incoming) {
    incomingKeys.add(project.projectKey);
    const current = byKey.get(project.projectKey);
    if (!current) {
      byKey.set(project.projectKey, { ...project, id: project.id, sourceFileName, importedAt: now, createdAt: now, updatedAt: now });
      created += 1;
      continue;
    }
    const next = {
      ...current,
      ...project,
      id: current.id,
      projectKey: current.projectKey,
      createdAt: current.createdAt,
      sourceFileName,
      importedAt: now,
      updatedAt: now,
      isActive: true
    };
    const comparableCurrent = JSON.stringify({ ...current, updatedAt: undefined, importedAt: undefined, sourceFileName: undefined });
    const comparableNext = JSON.stringify({ ...next, updatedAt: undefined, importedAt: undefined, sourceFileName: undefined });
    if (comparableCurrent === comparableNext) unchanged += 1;
    else updated += 1;
    byKey.set(project.projectKey, next);
  }

  if (mode === 'full') {
    for (const [key, project] of byKey.entries()) {
      if (!incomingKeys.has(key) && project.isActive) {
        byKey.set(key, { ...project, isActive: false, updatedAt: now });
        updated += 1;
      }
    }
  }

  const projects = [...byKey.values()].sort((a, b) => a.projectName.localeCompare(b.projectName));
  await saveProjects(projects);
  return { created, updated, unchanged, total: incoming.length, projects };
}
