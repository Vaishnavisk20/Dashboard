import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getProjects, getRawProjects, getImports, saveImports, saveProjects, upsertImportedProjects } from './store.js';
import { normalizeCsvRows } from './csvImport.js';
import { capacityStatus, clean, createProjectKey, getEffectiveIC, parseDate } from '../shared/projectLogic.js';

const ACTIVE_PORTFOLIO_STATUSES = new Set(['Implementation', 'Onboarding', 'Testing & UAT', 'Awaiting Go-Live']);
const DONE_STATUSES = new Set(['Go Live Completed', 'Closed', 'Live']);

function isActivePortfolio(project) {
  return project.isActive !== false && ACTIVE_PORTFOLIO_STATUSES.has(project.projectStatus);
}

function isDelayedForecast(project, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return Boolean(project.estimatedGoLiveDate)
    && project.estimatedGoLiveDate < today
    && !DONE_STATUSES.has(project.projectStatus);
}

export const KPI_KEYS = {
  'total-projects': { label: 'Total Portfolios', predicate: () => true },
  'total-customers': { label: 'Total Customers', uniqueField: 'customerName' },
  'active-projects': { label: 'Active Portfolios', predicate: isActivePortfolio },
  'landed-projects': { label: 'Landed Portfolios', predicate: (p) => p.projectStatus === 'Landed' },
  'at-risk': { label: 'At-Risk Portfolios', predicate: (p) => ['Watch', 'At Risk', 'Critical'].includes(p.healthStatus) },
  'on-hold': { label: 'On-Hold Portfolios', predicate: (p) => p.projectStatus === 'On Hold' }
};

export function applyFilters(projects, query = {}) {
  const search = clean(query.search).toLowerCase();
  const matchText = (value, filter) => !clean(filter) || clean(value).toLowerCase() === clean(filter).toLowerCase();
  return projects.filter((project) => {
    if (query.includeInactive !== 'true' && project.isActive === false) return false;
    if (search) {
      const haystack = [project.projectName, project.customerName, project.comment, project.effectiveIC].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return matchText(project.projectStatus, query.status)
      && matchText(project.customerTier, query.customerTier)
      && matchText(project.competency, query.competency)
      && matchText(project.effectiveIC, query.effectiveIC)
      && matchText(project.primaryIC, query.primaryIC)
      && matchText(project.secondaryIC, query.secondaryIC)
      && matchText(project.icLead, query.icLead)
      && matchText(project.stationName, query.station)
      && matchText(project.integrationType, query.integrationType)
      && matchText(project.customerName, query.customer)
      && matchText(project.healthStatus, query.healthStatus);
  });
}

export function sortAndPage(projects, query = {}) {
  const sortBy = clean(query.sortBy) || 'projectName';
  const direction = clean(query.sortDirection).toLowerCase() === 'desc' ? -1 : 1;
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 25)));
  const sorted = [...projects].sort((a, b) => clean(a[sortBy]).localeCompare(clean(b[sortBy])) * direction);
  const start = (page - 1) * pageSize;
  return { data: sorted.slice(start, start + pageSize), meta: { page, pageSize, total: sorted.length } };
}

export async function listProjects(query) {
  const filtered = applyFilters(await getProjects(), query);
  return sortAndPage(filtered, query);
}

function normalizeManualProject(input = {}, existing = {}) {
  const projectName = clean(input.projectName);
  const customerName = clean(input.customerName);
  if (!projectName) throw Object.assign(new Error('Portfolio name is required'), { status: 400, code: 'VALIDATION_ERROR' });
  if (!customerName) throw Object.assign(new Error('Customer is required'), { status: 400, code: 'VALIDATION_ERROR' });
  const estimatedGoLiveDateRaw = clean(input.estimatedGoLiveDate);
  const estimatedGoLiveDate = parseDate(estimatedGoLiveDateRaw);
  if (estimatedGoLiveDateRaw && !estimatedGoLiveDate) {
    throw Object.assign(new Error('Estimated go-live date is invalid'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  const now = new Date().toISOString();
  return {
    ...existing,
    projectName,
    customerName,
    customerTier: clean(input.customerTier),
    projectStatus: clean(input.projectStatus),
    competency: clean(input.competency),
    primaryIC: clean(input.primaryIC),
    secondaryIC: clean(input.secondaryIC),
    icLead: clean(input.icLead),
    stationName: clean(input.stationName),
    estimatedGoLiveDate,
    originalGoLiveDate: existing.originalGoLiveDate || estimatedGoLiveDate,
    integrationType: clean(input.integrationType),
    templateName: clean(input.templateName),
    useCase: clean(input.useCase),
    comment: clean(input.comment),
    extraFields: existing.extraFields || {},
    isActive: input.isActive === false ? false : true,
    sourceFileName: existing.sourceFileName || 'manual-entry',
    importedAt: existing.importedAt || now,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

export async function createProject(input) {
  const projects = await getRawProjects();
  const id = randomUUID();
  const normalized = normalizeManualProject(input, {
    id,
    projectKey: `${createProjectKey(input?.projectName, input?.customerName) || 'portfolio'}--manual-${id}`,
    baseProjectKey: createProjectKey(input?.projectName, input?.customerName),
    sourceRowNumber: null
  });
  projects.push(normalized);
  await saveProjects(projects.sort((a, b) => clean(a.projectName).localeCompare(clean(b.projectName))));
  return (await getProjects()).find((project) => project.id === id);
}

export async function updateProject(projectId, input) {
  const projects = await getRawProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw Object.assign(new Error('Portfolio not found'), { status: 404, code: 'NOT_FOUND' });
  const updated = normalizeManualProject(input, projects[index]);
  projects[index] = updated;
  await saveProjects(projects.sort((a, b) => clean(a.projectName).localeCompare(clean(b.projectName))));
  return (await getProjects()).find((project) => project.id === projectId);
}

export async function deleteProject(projectId) {
  const projects = await getRawProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw Object.assign(new Error('Portfolio not found'), { status: 404, code: 'NOT_FOUND' });
  projects[index] = { ...projects[index], isActive: false, updatedAt: new Date().toISOString() };
  await saveProjects(projects.sort((a, b) => clean(a.projectName).localeCompare(clean(b.projectName))));
  return { id: projectId, deleted: true };
}

export async function dashboardKpis(query) {
  const filtered = applyFilters(await getProjects(), query);
  return Object.entries(KPI_KEYS).map(([key, config]) => ({
    key,
    label: config.label,
    value: config.uniqueField
      ? new Set(filtered.map((project) => clean(project[config.uniqueField]).toLowerCase()).filter(Boolean)).size
      : filtered.filter(config.predicate).length
  }));
}

export async function kpiProjects(key, query) {
  const config = KPI_KEYS[key];
  if (!config) throw Object.assign(new Error('Unsupported KPI key'), { status: 404, code: 'NOT_FOUND' });
  const filtered = applyFilters(await getProjects(), query);
  if (config.uniqueField === 'customerName') {
    return sortAndPage(customerSummaryRows(filtered), { sortBy: 'customerName', ...query });
  }
  return sortAndPage(config.uniqueField ? filtered : filtered.filter(config.predicate), query);
}

function customerSummaryRows(projects) {
  const customers = new Map();
  for (const project of projects) {
    const customerName = clean(project.customerName);
    if (!customerName) continue;
    const key = customerName.toLowerCase();
    const existing = customers.get(key) || {
      customerRecord: true,
      customerName,
      portfolioCount: 0,
      activeProjects: 0,
      atRiskProjects: 0,
      onHoldProjects: 0,
      competencies: new Set(),
      tiers: new Set(),
      ics: new Set()
    };
    existing.portfolioCount += 1;
    if (isActivePortfolio(project)) existing.activeProjects += 1;
    if (['Watch', 'At Risk', 'Critical'].includes(project.healthStatus)) existing.atRiskProjects += 1;
    if (project.projectStatus === 'On Hold') existing.onHoldProjects += 1;
    if (clean(project.competency)) existing.competencies.add(clean(project.competency));
    if (clean(project.customerTier)) existing.tiers.add(clean(project.customerTier));
    if (clean(project.effectiveIC)) existing.ics.add(clean(project.effectiveIC));
    customers.set(key, existing);
  }
  return [...customers.values()].map((customer) => ({
    ...customer,
    competencies: [...customer.competencies].sort().join(', '),
    tiers: [...customer.tiers].sort().join(', '),
    ics: [...customer.ics].sort().join(', ')
  }));
}

export async function distribution(field, query) {
  const filtered = applyFilters(await getProjects(), query);
  const counts = new Map();
  for (const project of filtered) {
    const value = clean(project[field]) || 'Missing';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export async function goLiveTrend(field, query) {
  const filtered = applyFilters(await getProjects(), query);
  const counts = new Map();
  for (const project of filtered) {
    const date = project[field];
    if (!date) continue;
    const month = date.slice(0, 7);
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
}

export async function forecastForDate(date, query = {}) {
  const relevant = applyFilters(await getProjects(), query).filter((project) => project.estimatedGoLiveDate === date);
  return buildForecastResponse(date, relevant, (project) => project.estimatedGoLiveDate === date);
}

export async function forecastForMonth(month, query = {}) {
  const isMonth = (date) => clean(date).startsWith(`${month}-`);
  const relevant = applyFilters(await getProjects(), query).filter((project) => isMonth(project.estimatedGoLiveDate));
  return buildForecastResponse(month, relevant, (project) => isMonth(project.estimatedGoLiveDate));
}

export async function forecastForRange(fromDate, toDate, query = {}) {
  const inRange = (date) => clean(date) >= fromDate && clean(date) <= toDate;
  const relevant = applyFilters(await getProjects(), query).filter((project) => inRange(project.estimatedGoLiveDate));
  return buildForecastResponse(`${fromDate} to ${toDate}`, relevant, (project) => inRange(project.estimatedGoLiveDate));
}

function buildForecastResponse(period, relevant, isForecasted) {
  const categories = {
    forecasted: relevant.filter(isForecasted),
    delayed: relevant.filter((project) => isDelayedForecast(project)),
    unassigned: relevant.filter((p) => p.effectiveIC === 'Unassigned')
  };
  return {
    period,
    kpis: [
      { key: 'forecasted', label: 'Forecasted', value: categories.forecasted.length },
      { key: 'delayed', label: 'Delayed', value: categories.delayed.length }
    ],
    projects: relevant
  };
}

export async function forecastProjects(date, category, query) {
  const forecast = await forecastForDate(date, query);
  let projects = filterForecastCategory(forecast.projects, category);
  return sortAndPage(projects, query);
}

export async function forecastProjectsForMonth(month, category, query) {
  const forecast = await forecastForMonth(month, query);
  let projects = filterForecastCategory(forecast.projects, category);
  return sortAndPage(projects, query);
}

export async function forecastProjectsForRange(fromDate, toDate, category, query) {
  const forecast = await forecastForRange(fromDate, toDate, query);
  let projects = filterForecastCategory(forecast.projects, category);
  if (category === 'forecasted') {
    projects = projects.filter((p) => clean(p.estimatedGoLiveDate) >= fromDate && clean(p.estimatedGoLiveDate) <= toDate);
  }
  return sortAndPage(projects, query);
}

function filterForecastCategory(projects, category) {
  if (category === 'forecasted') projects = projects.filter((p) => p.estimatedGoLiveDate);
  if (category === 'delayed') projects = projects.filter((p) => isDelayedForecast(p));
  if (category === 'unassigned') projects = projects.filter((p) => p.effectiveIC === 'Unassigned');
  return projects;
}

function workloadPoints(project) {
  const base = { Onboarding: 1, Implementation: 3, 'Testing & UAT': 2, 'Awaiting Go-Live': 2, 'On Hold': 0.5 }[project.projectStatus] || 1;
  let multiplier = 1;
  if (project.customerTier === 'Platinum') multiplier *= 1.5;
  if (project.customerTier === 'Gold') multiplier *= 1.3;
  if (clean(project.integrationType).toLowerCase().includes('custom')) multiplier *= 1.5;
  if (!clean(project.secondaryIC)) multiplier *= 1.1;
  return Number((base * multiplier).toFixed(1));
}

function capacitySummary(projects) {
  const score = Number(projects.reduce((sum, project) => sum + workloadPoints(project), 0).toFixed(1));
  return { workloadScore: score, status: capacityStatus(score) };
}

export async function capacity(query) {
  const filtered = applyFilters(await getProjects(), query).filter(isActivePortfolio);
  const byIc = new Map();
  for (const project of filtered) {
    const list = byIc.get(project.effectiveIC) || [];
    list.push(project);
    byIc.set(project.effectiveIC, list);
  }
  return [...byIc.entries()].map(([effectiveIC, projects]) => {
    const summary = capacitySummary(projects);
    return {
      effectiveIC,
      activeProjects: projects.length,
      forecastedGoLives: projects.filter((p) => p.forecastedGoLiveDate).length,
      atRiskProjects: projects.filter((p) => ['Watch', 'At Risk', 'Critical'].includes(p.healthStatus)).length,
      goldAndPlatinumProjects: projects.filter((p) => ['Gold', 'Platinum'].includes(p.customerTier)).length,
      onHoldProjects: projects.filter((p) => p.projectStatus === 'On Hold').length,
      workloadScore: summary.workloadScore,
      capacityStatus: summary.status
    };
  }).sort((a, b) => b.workloadScore - a.workloadScore);
}

export async function dataQuality(query) {
  const projects = applyFilters(await getProjects(), query);
  const issueDefs = {
    'missing-forecasted-date': (p) => !p.estimatedGoLiveDate,
    'missing-primary-secondary-ic': (p) => p.effectiveIC === 'Unassigned',
    'missing-station': (p) => !clean(p.stationName),
    'missing-integration-type': (p) => !clean(p.integrationType),
    'missing-template': (p) => !clean(p.templateName),
    'missing-customer-tier': (p) => !clean(p.customerTier),
    'invalid-date': () => false,
    'duplicate-project': () => false,
    'stale-project': (p) => Date.now() - new Date(p.updatedAt).getTime() > 1000 * 60 * 60 * 24 * 45,
    'unsupported-status': (p) => !clean(p.projectStatus)
  };
  return Object.entries(issueDefs).map(([key, predicate]) => ({ key, value: projects.filter(predicate).length }));
}

export async function createImportPreview({ filePath, csvText, fileName, mode = 'incremental' }) {
  const sourceName = fileName || filePath?.split('/').pop() || 'uploaded-projects.csv';
  const text = csvText ?? await readFile(filePath, 'utf8');
  const normalized = normalizeCsvRows(text, sourceName);
  const existingKeys = new Set((await getProjects()).map((p) => p.projectKey));
  const importJob = {
    id: randomUUID(),
    mode,
    filePath,
    fileName: sourceName,
    createdAt: new Date().toISOString(),
    status: normalized.errors.length ? 'invalid' : 'preview',
    headers: normalized.headers,
    rowCount: normalized.projects.length,
    newCount: normalized.projects.filter((p) => !existingKeys.has(p.projectKey)).length,
    updatedCount: normalized.projects.filter((p) => existingKeys.has(p.projectKey)).length,
    warningCount: normalized.warnings.length,
    errorCount: normalized.errors.length,
    warnings: normalized.warnings,
    errors: normalized.errors,
    projects: normalized.projects
  };
  const imports = await getImports();
  imports.push(importJob);
  await saveImports(imports);
  return importJob;
}

export async function latestImportSummary() {
  const imports = await getImports();
  const latest = [...imports].reverse().find((entry) => entry.status === 'confirmed' || entry.status === 'cleared');
  const activeProjects = (await getProjects()).filter((project) => project.isActive !== false);
  if (!latest) {
    return {
      status: 'empty',
      importedRows: 0,
      dashboardRows: activeProjects.length,
      uniquePortfolios: activeProjects.length,
      duplicateRowsMerged: 0,
      extraColumnsPreserved: []
    };
  }
  const importedRows = latest.summary?.total ?? latest.rowCount ?? 0;
  const dashboardRows = activeProjects.length;
  const extraColumnsPreserved = [...new Set(activeProjects.flatMap((project) => Object.keys(project.extraFields || {})))].sort();
  return {
    status: latest.status,
    fileName: latest.fileName,
    importedRows,
    dashboardRows,
    uniquePortfolios: dashboardRows,
    duplicateRowsMerged: Math.max(0, importedRows - dashboardRows),
    extraColumnsPreserved,
    confirmedAt: latest.confirmedAt,
    createdAt: latest.createdAt
  };
}

export async function confirmImport(importId) {
  const imports = await getImports();
  const job = imports.find((entry) => entry.id === importId);
  if (!job) throw Object.assign(new Error('Import not found'), { status: 404, code: 'NOT_FOUND' });
  if (job.errors?.length) throw Object.assign(new Error('Cannot confirm an invalid import'), { status: 400, code: 'VALIDATION_ERROR', details: job.errors });
  const summary = await upsertImportedProjects(job.projects, { mode: job.mode, sourceFileName: job.fileName });
  Object.assign(job, { status: 'confirmed', confirmedAt: new Date().toISOString(), summary });
  await saveImports(imports);
  return job;
}

export async function clearProjectData() {
  await saveProjects([]);
  const imports = await getImports();
  imports.push({
    id: randomUUID(),
    status: 'cleared',
    fileName: null,
    rowCount: 0,
    createdAt: new Date().toISOString(),
    summary: { cleared: true }
  });
  await saveImports(imports);
  return { cleared: true, total: 0 };
}

export async function resetFromSeed() {
  const filePath = 'data/imports/projects-filtered-20260715-1505.csv';
  const job = await createImportPreview({ filePath, mode: 'full' });
  return confirmImport(job.id);
}
