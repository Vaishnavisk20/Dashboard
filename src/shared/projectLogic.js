export const STATUSES = [
  'Onboarding',
  'Implementation',
  'Testing & UAT',
  'Awaiting Go-Live',
  'Customer Signed Off',
  'On Hold',
  'Live',
  'Closed'
];

export const BLOCKING_KEYWORDS = [
  'blocked',
  'waiting',
  'unavailable',
  'issue',
  'delay',
  'dependency',
  'pending',
  'hold',
  'customer response',
  'credentials',
  'access'
];

export function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function getEffectiveIC(primaryIC, secondaryIC) {
  const primary = clean(primaryIC);
  const secondary = clean(secondaryIC);
  if (primary) return primary;
  if (secondary) return secondary;
  return 'Unassigned';
}

export function createProjectKey(projectName, customerName) {
  return `${projectName || ''}-${customerName || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const month = slash[1].padStart(2, '0');
    const day = slash[2].padStart(2, '0');
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function addDays(dateIso, days) {
  if (!dateIso) return null;
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function differenceInDays(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);
}

export function daysUntil(dateIso, now = new Date()) {
  if (!dateIso) return null;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return Math.round((new Date(`${dateIso}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
}

export function hasBlocker(comment) {
  const text = clean(comment).toLowerCase();
  return BLOCKING_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function classifyHealth(score) {
  if (score <= 24) return 'On Track';
  if (score <= 49) return 'Watch';
  if (score <= 74) return 'At Risk';
  return 'Critical';
}

function evaluateForecastRisk(project, now = new Date()) {
  const reasons = [];
  const forecastedDate = project.estimatedGoLiveDate || project.currentPlannedGoLiveDate;
  const until = daysUntil(forecastedDate, now);
  const status = !forecastedDate ? 'Missing' : until < 0 ? 'Delayed' : until <= 7 ? 'At Risk' : 'On Track';
  if (!forecastedDate) reasons.push('Forecasted go-live date is missing');
  else if (until < 0) reasons.push('Forecasted go-live date is before today');
  else if (until <= 7) reasons.push('Forecasted go-live date is within 7 days');
  else reasons.push('Forecasted go-live date is more than 7 days away');

  const score = !forecastedDate ? 0 : until < 0 ? 100 : until <= 7 ? 70 : 0;
  return {
    score,
    label: status,
    reasons,
    modelVersion: 'forecast-risk-date-v2'
  };
}

export function calculateRiskScore(project, now = new Date()) {
  let score = 0;
  const reasons = [];
  const status = clean(project.projectStatus);
  const effectiveIC = getEffectiveIC(project.primaryIC, project.secondaryIC);
  const forecastedDate = project.estimatedGoLiveDate || project.currentPlannedGoLiveDate;
  const until = daysUntil(forecastedDate, now);

  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (status === 'On Hold') add(40, 'Project is on hold');
  if (effectiveIC === 'Unassigned') add(25, 'Primary and secondary IC are missing');
  if (!forecastedDate) add(25, 'Forecasted go-live date is missing');
  if (until !== null && until < 0 && !['Go Live Completed', 'Closed', 'Live'].includes(status)) add(30, 'Forecasted go-live date is past due');
  if (until !== null && until <= 7 && status === 'Onboarding') add(35, 'Onboarding project is within 7 days of go-live');
  if (until !== null && until <= 14 && status === 'Implementation') add(25, 'Implementation project is within 14 days of go-live');
  if (until !== null && until <= 7 && status === 'Testing & UAT') add(15, 'Testing project is within 7 days of go-live');
  if (!clean(project.stationName)) add(10, 'Station is missing');
  if (!clean(project.integrationType)) add(5, 'Integration type is missing');
  if (!clean(project.templateName)) add(5, 'Template is missing');
  if (hasBlocker(project.comment)) add(15, 'Comment includes a blocking keyword');
  if (status === 'Customer Signed Off') add(-20, 'Customer has signed off');
  if (status === 'Awaiting Go-Live') add(-15, 'Project is awaiting go-live');

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, healthStatus: classifyHealth(clamped), reasons };
}

export function forecastProject(project, now = new Date()) {
  const risk = calculateRiskScore(project, now);
  const forecastRisk = evaluateForecastRisk(project, now);
  const forecastedDate = project.estimatedGoLiveDate || project.currentPlannedGoLiveDate || null;
  const until = daysUntil(forecastedDate, now);
  const actions = [];

  if (!forecastedDate) {
    return {
      forecastedGoLiveDate: null,
      riskScore: risk.score,
      healthStatus: risk.healthStatus,
      riskReasons: risk.reasons,
      forecastRiskScore: forecastRisk.score,
      forecastRiskLabel: forecastRisk.label,
      forecastRiskReasons: forecastRisk.reasons,
      forecastRiskModelVersion: forecastRisk.modelVersion,
      recommendedActions: ['Add a valid forecasted go-live date'],
      forecastModelVersion: 'rules-v1',
      calculatedAt: new Date().toISOString(),
      explanation: 'Forecast unavailable because the project does not have a usable forecasted go-live date.'
    };
  }

  if (forecastRisk.label === 'Delayed') actions.push('Confirm the revised go-live date');
  if (forecastRisk.label === 'At Risk') actions.push('Review readiness before go-live');
  if (forecastRisk.label === 'On Track') actions.push('Monitor the go-live plan');

  if (!actions.length) actions.push('Monitor project readiness and confirm go-live plan');
  const explanation = forecastRisk.label === 'Delayed'
    ? `The forecasted go-live date is ${forecastedDate}, which is past today.`
    : forecastRisk.label === 'At Risk'
      ? `The forecasted go-live date is ${forecastedDate}, which is within 7 days.`
      : `The forecasted go-live date is ${forecastedDate}, sourced from the uploaded CSV.`;

  return {
    forecastedGoLiveDate: forecastedDate,
    riskScore: risk.score,
    healthStatus: risk.healthStatus,
    riskReasons: risk.reasons,
    forecastRiskScore: forecastRisk.score,
    forecastRiskLabel: forecastRisk.label,
    forecastRiskReasons: forecastRisk.reasons,
    forecastRiskModelVersion: forecastRisk.modelVersion,
    recommendedActions: [...new Set(actions)],
    forecastModelVersion: 'rules-v1',
    calculatedAt: new Date().toISOString(),
    explanation
  };
}

export function enrichProject(project, now = new Date()) {
  const effectiveIC = getEffectiveIC(project.primaryIC, project.secondaryIC);
  const forecast = forecastProject(project, now);
  return {
    ...project,
    effectiveIC,
    forecastedGoLiveDate: forecast.forecastedGoLiveDate,
    riskScore: forecast.riskScore,
    healthStatus: forecast.healthStatus,
    riskReasons: forecast.riskReasons,
    forecastRiskScore: forecast.forecastRiskScore,
    forecastRiskLabel: forecast.forecastRiskLabel,
    forecastRiskReasons: forecast.forecastRiskReasons,
    forecastRiskModelVersion: forecast.forecastRiskModelVersion,
    recommendedActions: forecast.recommendedActions,
    forecastExplanation: forecast.explanation,
    forecastModelVersion: forecast.forecastModelVersion,
    forecastCalculatedAt: forecast.calculatedAt
  };
}

export function capacityStatus(score) {
  if (score <= 8) return 'Available';
  if (score <= 15) return 'Balanced';
  if (score <= 20) return 'High';
  return 'Overloaded';
}
