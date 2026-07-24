import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRiskScore,
  createProjectKey,
  forecastProject,
  getEffectiveIC,
  parseDate
} from '../src/shared/projectLogic.js';
import { normalizeCsvRows } from '../src/server/csvImport.js';

function localTodayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('IC falls back from primary to secondary to Unassigned', () => {
  assert.equal(getEffectiveIC('Rajat', 'Backup'), 'Rajat');
  assert.equal(getEffectiveIC(' ', 'Madhusudhan Jami'), 'Madhusudhan Jami');
  assert.equal(getEffectiveIC('', ''), 'Unassigned');
});

test('stable project key normalizes project and customer', () => {
  assert.equal(createProjectKey('Dayforce/Active Directory', 'Meduit Group'), 'dayforce-active-directory-meduit-group');
});

test('risk scoring counts missing IC only when both IC fields are missing', () => {
  const withSecondary = calculateRiskScore({ projectStatus: 'Implementation', secondaryIC: 'Backup', estimatedGoLiveDate: '2026-12-01' }, new Date('2026-07-16T00:00:00Z'));
  const withoutAny = calculateRiskScore({ projectStatus: 'Implementation', estimatedGoLiveDate: '2026-12-01' }, new Date('2026-07-16T00:00:00Z'));
  assert.ok(withoutAny.score > withSecondary.score);
});

test('forecast uses the uploaded CSV date as the forecasted go-live date', () => {
  const forecast = forecastProject({
    projectStatus: 'Implementation',
    primaryIC: 'Navin',
    estimatedGoLiveDate: '2026-07-31',
    stationName: 'Implementation & Development',
    integrationType: 'Core Templates'
  }, new Date('2026-07-20T00:00:00Z'));
  assert.equal(forecast.expectedDelayDays, 0);
  assert.equal(forecast.forecastedGoLiveDate, '2026-07-31');
});

test('forecast marks past go-live dates as delayed', () => {
  const forecast = forecastProject({
    projectStatus: 'Implementation',
    primaryIC: 'Navin',
    estimatedGoLiveDate: '2026-07-10',
    stationName: 'Implementation & Development',
    integrationType: 'Core Templates'
  }, new Date('2026-07-20T00:00:00Z'));
  assert.equal(forecast.expectedDelayDays, 10);
  assert.match(forecast.explanation, /past today/);
  assert.ok(forecast.riskReasons.includes('Forecasted go-live date is past due'));
});

test('forecast exposes a dedicated risk model', () => {
  const forecast = forecastProject({
    projectStatus: 'Testing & UAT',
    primaryIC: 'Navin',
    estimatedGoLiveDate: '2026-07-18',
    stationName: 'Implementation & Development',
    integrationType: 'Core Templates'
  }, new Date('2026-07-16T00:00:00Z'));
  assert.equal(forecast.forecastRiskModelVersion, 'forecast-risk-v1');
  assert.equal(typeof forecast.forecastRiskScore, 'number');
  assert.ok(Array.isArray(forecast.forecastRiskReasons));
  assert.equal(typeof forecast.forecastRiskLabel, 'string');
});

test('CSV normalization supports real headers and date parsing', () => {
  const result = normalizeCsvRows('Project,Customer,IC,Secondary IC,Estimated Go Live Date\nP,C,,Backup,07/31/2026\n', 'test.csv');
  assert.equal(result.errors.length, 0);
  assert.equal(result.projects[0].estimatedGoLiveDate, '2026-07-31');
  assert.equal(parseDate('2026-07-31'), '2026-07-31');
});

test('CSV normalization preserves duplicate rows and extra columns', () => {
  const result = normalizeCsvRows(
    'Project,Customer,IC,Secondary IC,Estimated Go Live Date,Jira Ticket Number,Developer Name\nP,C,,Backup,07/31/2026,JIRA-1,Asha\nP,C,Rajat,,08/15/2026,JIRA-2,Navin\n',
    'test.csv'
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.projects.length, 2);
  assert.notEqual(result.projects[0].projectKey, result.projects[1].projectKey);
  assert.equal(result.projects[0].sourceRowNumber, 2);
  assert.equal(result.projects[1].sourceRowNumber, 3);
  assert.equal(result.projects[0].extraFields['Jira Ticket Number'], 'JIRA-1');
  assert.equal(result.projects[1].extraFields['Developer Name'], 'Navin');
});
