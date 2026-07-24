import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  confirmImport,
  clearProjectData,
  createProject,
  deleteProject,
  createImportPreview,
  dashboardKpis,
  forecastForDate,
  forecastForMonth,
  forecastProjectsForRange,
  forecastForRange,
  kpiProjects,
  latestImportSummary,
  listProjects,
  updateProject
} from '../src/server/services.js';

function localTodayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('KPI count and detail records stay consistent', async () => {
  const kpis = await dashboardKpis({});
  const active = kpis.find((item) => item.key === 'active-projects');
  const details = await kpiProjects('active-projects', { pageSize: 200 });
  assert.equal(active.value, details.meta.total);
});

test('active portfolio KPI only includes active workflow statuses', async () => {
  const activeStatuses = new Set(['Implementation', 'Onboarding', 'Testing & UAT', 'Awaiting Go-Live']);
  const details = await kpiProjects('active-projects', { pageSize: 200 });
  assert.ok(details.data.length > 0);
  assert.ok(details.data.every((project) => activeStatuses.has(project.projectStatus)));
});

test('landed portfolio KPI is separate from active portfolios', async () => {
  const details = await kpiProjects('landed-projects', { pageSize: 200 });
  assert.ok(details.data.length > 0);
  assert.ok(details.data.every((project) => project.projectStatus === 'Landed'));
});

test('total customer KPI counts unique customer names', async () => {
  const kpis = await dashboardKpis({});
  const totalProjects = kpis.find((item) => item.key === 'total-projects');
  const totalCustomers = kpis.find((item) => item.key === 'total-customers');
  const details = await kpiProjects('total-customers', { pageSize: 200 });
  assert.ok(totalCustomers.value > 0);
  assert.ok(totalCustomers.value <= totalProjects.value);
  assert.equal(totalCustomers.value, details.meta.total);
  assert.ok(details.data.every((row) => row.customerRecord && row.portfolioCount >= 1));
});

test('forecast selected date returns categorized records', async () => {
  const forecast = await forecastForDate('2026-07-31');
  assert.ok(Array.isArray(forecast.kpis));
  assert.ok(Array.isArray(forecast.projects));
});

test('forecast selected month returns categorized records', async () => {
  const forecast = await forecastForMonth('2026-07');
  assert.ok(Array.isArray(forecast.kpis));
  assert.ok(Array.isArray(forecast.projects));
  assert.equal(forecast.period, '2026-07');
});

test('forecast selected range returns categorized records', async () => {
  const forecast = await forecastForRange('2026-07-01', '2026-12-31');
  assert.ok(Array.isArray(forecast.kpis));
  assert.ok(Array.isArray(forecast.projects));
  assert.equal(forecast.period, '2026-07-01 to 2026-12-31');
  assert.ok(forecast.kpis.some((kpi) => kpi.key === 'delayed'));
});

test('forecast range delayed count only uses records inside the selected range', async () => {
  const forecast = await forecastForRange('2026-07-16', '2026-12-31');
  const delayed = forecast.kpis.find((kpi) => kpi.key === 'delayed');
  const today = localTodayIso();
  const delayedRows = forecast.projects.filter((project) => project.estimatedGoLiveDate < today && !['Go Live Completed', 'Closed', 'Live'].includes(project.projectStatus));
  assert.equal(delayed.value, delayedRows.length);
  assert.ok(forecast.projects.every((project) => project.estimatedGoLiveDate >= '2026-07-16' && project.estimatedGoLiveDate <= '2026-12-31'));
});

test('forecasted range project list only includes dates inside the selected range', async () => {
  const result = await forecastProjectsForRange('2026-07-16', '2026-12-31', 'forecasted', { pageSize: 200 });
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((project) => project.estimatedGoLiveDate >= '2026-07-16' && project.estimatedGoLiveDate <= '2026-12-31'));
});

test('latest import summary reports imported rows and dashboard rows', async () => {
  const summary = await latestImportSummary();
  assert.equal(typeof summary.importedRows, 'number');
  assert.equal(typeof summary.dashboardRows, 'number');
  assert.ok(Array.isArray(summary.extraColumnsPreserved));
  assert.ok(summary.duplicateRowsMerged >= 0);
});

test('CSV preview and confirmation do not duplicate stable keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'project-import-'));
  const file = join(dir, 'sample.csv');
  await writeFile(file, 'Project,Customer,IC,Secondary IC,Estimated Go Live Date\nUnique Project,Unique Customer,,Backup,2026-08-01\n');
  const preview = await createImportPreview({ filePath: file, mode: 'incremental' });
  assert.equal(preview.errorCount, 0);
  const first = await confirmImport(preview.id);
  assert.equal(first.status, 'confirmed');
  const previewAgain = await createImportPreview({ filePath: file, mode: 'incremental' });
  const second = await confirmImport(previewAgain.id);
  assert.equal(second.summary.created, 0);
  const restore = await createImportPreview({ filePath: 'data/imports/projects-filtered-20260715-1505.csv', mode: 'full' });
  await confirmImport(restore.id);
});

test('CSV preview accepts uploaded file content and clear data works', async () => {
  const preview = await createImportPreview({
    csvText: 'Project,Customer,IC,Secondary IC,Estimated Go Live Date\nUploaded Project,Uploaded Customer,,Backup,2026-09-01\n',
    fileName: 'uploaded.csv',
    mode: 'incremental'
  });
  assert.equal(preview.fileName, 'uploaded.csv');
  assert.equal(preview.errorCount, 0);
  const cleared = await clearProjectData();
  assert.equal(cleared.total, 0);
  const restore = await createImportPreview({ filePath: 'data/imports/projects-filtered-20260715-1505.csv', mode: 'full' });
  await confirmImport(restore.id);
});

test('manual portfolios can be created and updated', async () => {
  const created = await createProject({
    projectName: 'Manual Portfolio',
    customerName: 'Manual Customer',
    projectStatus: 'Implementation',
    secondaryIC: 'Backup IC',
    estimatedGoLiveDate: '2026-10-01'
  });
  assert.equal(created.projectName, 'Manual Portfolio');
  assert.equal(created.effectiveIC, 'Backup IC');
  const updated = await updateProject(created.id, {
    ...created,
    projectName: 'Manual Portfolio Updated',
    customerName: 'Manual Customer',
    primaryIC: 'Primary IC',
    estimatedGoLiveDate: '2026-10-15'
  });
  assert.equal(updated.projectName, 'Manual Portfolio Updated');
  assert.equal(updated.effectiveIC, 'Primary IC');
  assert.equal(updated.estimatedGoLiveDate, '2026-10-15');
  const restore = await createImportPreview({ filePath: 'data/imports/projects-filtered-20260715-1505.csv', mode: 'full' });
  await confirmImport(restore.id);
});

test('manual portfolios can be deleted', async () => {
  const created = await createProject({
    projectName: 'Delete Me Portfolio',
    customerName: 'Delete Me Customer',
    projectStatus: 'Implementation',
    estimatedGoLiveDate: '2026-10-01'
  });
  const result = await deleteProject(created.id);
  assert.equal(result.deleted, true);
  const listed = await listProjects({ search: 'Delete Me Portfolio', pageSize: 20 });
  assert.equal(listed.data.length, 0);
  const restore = await createImportPreview({ filePath: 'data/imports/projects-filtered-20260715-1505.csv', mode: 'full' });
  await confirmImport(restore.id);
});
