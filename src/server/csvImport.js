import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { clean, createProjectKey, parseDate } from '../shared/projectLogic.js';

const HEADER_ALIASES = {
  projectName: ['project', 'project name'],
  customerName: ['customer', 'customer name'],
  customerTier: ['customer tier', 'tier'],
  projectStatus: ['project status', 'status'],
  competency: ['competency'],
  primaryIC: ['ic', 'primary ic', 'implementation consultant'],
  secondaryIC: ['secondary ic', 'backup ic'],
  icLead: ['ic lead', 'lead'],
  stationName: ['station name', 'station'],
  estimatedGoLiveDate: ['estimated go live date', 'estimated go-live date', 'forecasted go live date', 'forecasted go-live date', 'go live date'],
  integrationType: ['integration type', 'integration'],
  templateName: ['template name', 'template'],
  useCase: ['use case', 'usecase'],
  comment: ['comment', 'comments', 'notes']
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => clean(cell))) rows.push(row);
  }
  return rows;
}

export function buildHeaderMap(headers) {
  const normalized = headers.map((header) => clean(header).toLowerCase());
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header));
    if (index >= 0) map[field] = index;
  }
  return map;
}

export function normalizeCsvRows(text, sourceFileName = 'upload.csv') {
  const parsed = parseCsv(text);
  const headers = parsed[0] || [];
  const map = buildHeaderMap(headers);
  const mappedIndexes = new Set(Object.values(map));
  const extraColumns = headers
    .map((header, index) => ({ header: clean(header), index }))
    .filter((column) => column.header && !mappedIndexes.has(column.index));
  const required = ['projectName', 'customerName'];
  const errors = [];
  const warnings = [];
  for (const field of required) {
    if (map[field] === undefined) errors.push({ row: 1, field, message: `Missing required column: ${field}` });
  }

  const rowsForImport = [];
  parsed.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const pick = (field) => (map[field] === undefined ? '' : clean(row[map[field]]));
    const projectName = pick('projectName');
    const customerName = pick('customerName');
    if (!projectName && !customerName) return;
    rowsForImport.push({ row, rowNumber, pick, projectName, customerName });
  });

  const baseKeyCounts = new Map();
  for (const row of rowsForImport) {
    const baseKey = createProjectKey(row.projectName, row.customerName);
    baseKeyCounts.set(baseKey, (baseKeyCounts.get(baseKey) || 0) + 1);
  }

  const seenKeys = new Map();
  const projects = [];
  parsed.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const pick = (field) => (map[field] === undefined ? '' : clean(row[map[field]]));
    const projectName = pick('projectName');
    const customerName = pick('customerName');
    if (!projectName && !customerName) return;
    if (!projectName) errors.push({ row: rowNumber, field: 'Project', message: 'Project is required' });
    if (!customerName) errors.push({ row: rowNumber, field: 'Customer', message: 'Customer is required' });

    const baseProjectKey = createProjectKey(projectName, customerName);
    const key = baseKeyCounts.get(baseProjectKey) > 1 ? `${baseProjectKey}--csv-row-${rowNumber}` : baseProjectKey;
    if (seenKeys.has(baseProjectKey)) {
      warnings.push({ row: rowNumber, message: `Repeated Project + Customer also appears on row ${seenKeys.get(baseProjectKey)}; kept as its own dashboard row` });
    } else {
      seenKeys.set(baseProjectKey, rowNumber);
    }

    const estimatedGoLiveDateRaw = pick('estimatedGoLiveDate');
    const estimatedGoLiveDate = parseDate(estimatedGoLiveDateRaw);
    if (estimatedGoLiveDateRaw && !estimatedGoLiveDate) {
      errors.push({ row: rowNumber, field: 'Estimated Go Live Date', message: 'Invalid date' });
    }

    const extraFields = Object.fromEntries(extraColumns.map((column) => [column.header, clean(row[column.index])]));

    projects.push({
      id: randomUUID(),
      projectKey: key,
      baseProjectKey,
      sourceRowNumber: rowNumber,
      projectName,
      customerName,
      customerTier: pick('customerTier'),
      projectStatus: pick('projectStatus'),
      competency: pick('competency'),
      primaryIC: pick('primaryIC'),
      secondaryIC: pick('secondaryIC'),
      icLead: pick('icLead'),
      stationName: pick('stationName'),
      estimatedGoLiveDate,
      originalGoLiveDate: estimatedGoLiveDate,
      integrationType: pick('integrationType'),
      templateName: pick('templateName'),
      useCase: pick('useCase'),
      comment: pick('comment'),
      extraFields,
      isActive: true,
      sourceFileName,
      importedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  return { headers, map, projects, errors, warnings };
}

export async function loadCsvFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return normalizeCsvRows(text, filePath.split('/').pop());
}
