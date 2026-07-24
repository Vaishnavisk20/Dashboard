const PORTFOLIO_FILTER_KEYS = new Set([
  'search',
  'status',
  'customerTier',
  'effectiveIC',
  'competency',
  'customer',
  'secondaryIC',
  'icLead',
  'station',
  'integrationType',
  'healthStatus'
]);

function loadPortfolioFilters() {
  return Object.fromEntries([...new URLSearchParams(location.search).entries()].filter(([key]) => PORTFOLIO_FILTER_KEYS.has(key)));
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonthsIso(dateIso, months) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

const initialToday = todayIso();

const state = {
  filters: loadPortfolioFilters(),
  activeModule: location.hash.replace('#', '') || 'overview',
  forecastFrom: initialToday,
  forecastTo: addMonthsIso(initialToday, 6),
  forecastTab: 'all',
  drawerRows: [],
  drawerBack: null,
  tablePages: {},
  settings: loadSettings(),
  currentImportId: null,
  overviewAttributes: []
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const api = async (path, options) => {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!payload.success) throw new Error(payload.error?.message || 'Request failed');
  return payload;
};
const qs = () => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) if (value && PORTFOLIO_FILTER_KEYS.has(key)) params.set(key, value);
  return params.toString();
};
const setQuery = () => {
  const params = new URLSearchParams(state.activeModule === 'projects' ? qs() : '');
  params.set('from', state.forecastFrom);
  params.set('to', state.forecastTo);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#${state.activeModule}`);
};

const modules = ['overview', 'forecast', 'projects', 'capacity', 'imports', 'settings'];
const filteredModules = new Set(['projects']);
const OVERVIEW_KPI_ORDER = [
  'total-projects',
  'total-customers',
  'active-projects',
  'landed-projects',
  'on-hold'
];
const FILTER_LABELS = {
  search: 'Search',
  status: 'Status',
  customerTier: 'Tier',
  effectiveIC: 'IC',
  competency: 'Competency'
};

function loadSettings() {
  const defaults = {
    riskWatch: 25,
    riskHigh: 50,
    riskCritical: 75,
    capBalanced: 15,
    capHigh: 20,
    pageSize: 10,
    showSource: true
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('deliveryDashboardSettings') || '{}') };
  } catch {
    return defaults;
  }
}

function normalizeBadge(value) {
  return String(value || 'Missing').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function renderBadge(value) {
  return `<span class="badge ${normalizeBadge(value)}">${escapeHtml(value || '-')}</span>`;
}

function renderDate(value) {
  if (!value) return '<span class="muted">-</span>';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
}

function renderText(value) {
  return value ? escapeHtml(value) : '<span class="muted">-</span>';
}

function renderDash(value) {
  return value ? escapeHtml(value) : '<span class="muted">-</span>';
}

function renderTable(target, rows, columns, options = {}) {
  const table = $(target);
  const tableKey = options.key || target.replace(/[^a-z0-9]/gi, '');
  const pageSize = options.pageSize || Number(state.settings.pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, state.tablePages[tableKey] || 1), totalPages);
  state.tablePages[tableKey] = currentPage;
  const start = (currentPage - 1) * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);
  renderPagination(target, tableKey, rows.length, currentPage, totalPages, pageSize, () => renderTable(target, rows, columns, options));
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty-cell" colspan="${columns.length + 1}">No records found. Import a CSV or adjust filters.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `<thead><tr><th class="index-col">#</th>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${
    visibleRows.map((row, rowIndex) => `<tr><td class="index-col">${start + rowIndex + 1}</td>${columns.map((c) => `<td>${c.render ? c.render(row) : escapeHtml(row[c.key] || '')}</td>`).join('')}</tr>`).join('')
  }</tbody>`;
  options.afterRender?.();
}

function renderPagination(target, tableKey, totalRows, currentPage, totalPages, pageSize, rerender) {
  const table = $(target);
  const wrap = table.closest('.table-wrap');
  if (!wrap) return;
  let controls = wrap.nextElementSibling;
  if (!controls || !controls.classList.contains('pagination-controls')) {
    controls = document.createElement('div');
    controls.className = 'pagination-controls';
    wrap.insertAdjacentElement('afterend', controls);
  }
  const start = totalRows ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(totalRows, currentPage * pageSize);
  controls.innerHTML = `
    <span>Showing ${start}-${end} of ${totalRows}</span>
    <div>
      <button type="button" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
      <strong>Page ${currentPage} of ${totalPages}</strong>
      <button type="button" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  controls.querySelector('[data-page="prev"]').addEventListener('click', () => {
    state.tablePages[tableKey] = Math.max(1, currentPage - 1);
    rerender();
  });
  controls.querySelector('[data-page="next"]').addEventListener('click', () => {
    state.tablePages[tableKey] = Math.min(totalPages, currentPage + 1);
    rerender();
  });
}

const projectColumns = [
  { key: 'projectName', label: 'Portfolio', render: (row) => `<strong class="table-title">${escapeHtml(row.projectName || 'Untitled portfolio')}</strong>` },
  { key: 'customerName', label: 'Customer', render: (row) => renderText(row.customerName) },
  { key: 'customerTier', label: 'Tier', render: (row) => renderBadge(row.customerTier) },
  { key: 'projectStatus', label: 'Status', render: (row) => renderBadge(row.projectStatus) },
  { key: 'competency', label: 'Competency', render: (row) => renderText(row.competency) },
  { key: 'effectiveIC', label: 'IC', render: (row) => renderText(row.effectiveIC) },
  { key: 'secondaryIC', label: 'Secondary IC', render: (row) => renderText(row.secondaryIC) },
  { key: 'estimatedGoLiveDate', label: 'Forecasted Go-Live', render: (row) => renderDate(row.estimatedGoLiveDate) },
  { key: 'stationName', label: 'Station', render: (row) => renderDash(row.stationName) },
  { key: 'integrationType', label: 'Integration', render: (row) => renderText(row.integrationType) }
];
const projectTableColumns = [...projectColumns];
const forecastColumns = [
  ...projectColumns,
  { key: 'forecastRiskLabel', label: 'Risk', render: (row) => renderBadge(row.forecastRiskLabel || '-') }
];
const customerColumns = [
  { key: 'customerName', label: 'Customer', render: (row) => `<button class="link-button customer-drilldown" data-customer="${escapeHtml(row.customerName)}" type="button">${escapeHtml(row.customerName)}</button>` },
  { key: 'portfolioCount', label: 'Portfolios' },
  { key: 'activeProjects', label: 'Active' },
  { key: 'onHoldProjects', label: 'On Hold' },
  { key: 'tiers', label: 'Tiers' },
  { key: 'competencies', label: 'Competencies' },
  { key: 'ics', label: 'ICs' }
];

function chartFilterAttributes(filterKey, filterValue) {
  return filterKey ? `data-filter-key="${escapeHtml(filterKey)}" data-filter-value="${escapeHtml(filterValue)}"` : '';
}

function attachChartFilters(selector) {
  document.querySelectorAll(`${selector} [data-filter-key]`).forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.filterValue === 'Missing' ? '' : button.dataset.filterValue;
      state.filters = value ? { [button.dataset.filterKey]: value } : {};
      state.tablePages.projects = 1;
      state.activeModule = 'projects';
      location.hash = '#projects';
      syncFilterInputs();
      refreshAll();
    });
  });
}

async function loadOptions() {
  const payload = await api('/api/projects?pageSize=200');
  const rows = payload.data;
  const options = {
    '#filter-status': ['projectStatus', 'status'],
    '#filter-tier': ['customerTier', 'customerTier'],
    '#filter-effectiveIC': ['effectiveIC', 'effectiveIC'],
    '#filter-competency': ['competency', 'competency']
  };
  for (const [selector, [field, filterKey]] of Object.entries(options)) {
    const select = $(selector);
    const current = select.value || state.filters[filterKey] || '';
    const values = [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All</option>' + values.map((value) => `<option>${escapeHtml(value)}</option>`).join('');
    select.value = current;
  }
}

async function loadKpis() {
  const payload = await api('/api/dashboard/kpis');
  const kpisByKey = new Map(payload.data.map((kpi) => [kpi.key, kpi]));
  const visibleKpis = OVERVIEW_KPI_ORDER.map((key) => kpisByKey.get(key)).filter(Boolean);
  $('#kpi-grid').innerHTML = visibleKpis.map((kpi) => `
    <button class="kpi-card" data-kpi="${kpi.key}" type="button">
      <span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong><span>Open records</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-kpi]').forEach((button) => button.addEventListener('click', () => openKpiDrawer(button.dataset.kpi, button.querySelector('span').textContent)));
  await loadImportSourceNote();
}

async function loadImportSourceNote() {
  const note = $('#portfolio-source-note');
  if (!note) return;
  if (!state.settings.showSource) {
    note.textContent = '';
    return;
  }
  const payload = await api('/api/imports/latest');
  const summary = payload.data;
  note.textContent = summary.importedRows
    ? `Latest import: ${summary.importedRows} CSV rows are loaded as ${summary.dashboardRows ?? summary.uniquePortfolios} dashboard rows. ${summary.extraColumnsPreserved?.length ? `${summary.extraColumnsPreserved.length} additional CSV columns are preserved.` : 'All mapped CSV columns are available.'}`
    : 'No CSV import confirmed yet.';
}

function renderBars(selector, rows, filterKey) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) {
    $(selector).innerHTML = '<p class="muted">No data available.</p>';
    return;
  }
  $(selector).innerHTML = rows.map((row) => `
    <div class="bar-row">
      <span title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
      <button type="button" style="width:${Math.max(4, (row.value / max) * 100)}%" data-filter-key="${escapeHtml(filterKey)}" data-filter-value="${escapeHtml(row.name)}" aria-label="Filter by ${escapeHtml(row.name)}"></button>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join('');
  if (!filterKey) return;
  attachChartFilters(selector);
}

const CHART_COLORS = ['#1f6ed4', '#2aa36b', '#f5a623', '#ef4444', '#7c3aed', '#0ea5e9', '#64748b', '#d81b7c', '#4d7c0f', '#f97316'];
const overviewAttributeConfig = {
  status: { label: 'Delivery Stage', endpoint: '/api/dashboard/status-distribution', filterKey: 'status', chart: 'horizontal' },
  competency: { label: 'Competency Mix', endpoint: '/api/dashboard/competency-distribution', filterKey: 'competency', chart: 'vertical' },
  customerTier: { label: 'Customer Tier Mix', endpoint: '/api/dashboard/customer-tier-distribution', filterKey: 'customerTier', chart: 'donut' },
  integrationType: { label: 'Integration Mix', endpoint: '/api/dashboard/integration-type-distribution', filterKey: 'integrationType', chart: 'donut' },
  effectiveIC: { label: 'IC Ownership', endpoint: '/api/dashboard/effective-ic-distribution', filterKey: 'effectiveIC', chart: 'horizontal' }
};

function setChartTotal(selector, rows) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const totalNode = $(selector).closest('.mini-chart-card, .chart-card')?.querySelector('.chart-total');
  if (totalNode) totalNode.textContent = `${total} total`;
  return total;
}

function renderHorizontalChart(selector, rows, filterKey, options = {}) {
  setChartTotal(selector, rows);
  const visibleRows = rows.slice(0, options.limit || 10);
  if (!visibleRows.length) {
    $(selector).innerHTML = '<p class="muted">No data available.</p>';
    return;
  }
  const max = Math.max(1, ...visibleRows.map((row) => row.value));
  $(selector).innerHTML = `
    <div class="axis-chart horizontal-chart ${options.compact ? 'compact-axis-chart' : ''}">
      ${visibleRows.map((row, index) => `
        <button class="axis-row" type="button" ${chartFilterAttributes(filterKey, row.name)}>
          <span class="axis-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
          <span class="axis-plot">
            <span class="axis-bar" style="width:${Math.max(2, (row.value / max) * 100)}%; background:${CHART_COLORS[index % CHART_COLORS.length]}"></span>
          </span>
          <strong>${escapeHtml(row.value)}</strong>
        </button>
      `).join('')}
    </div>
  `;
  attachChartFilters(selector);
}

function renderVerticalChart(selector, rows, filterKey, options = {}) {
  setChartTotal(selector, rows);
  const visibleRows = rows.slice(0, options.limit || 5);
  if (!visibleRows.length) {
    $(selector).innerHTML = '<p class="muted">No data available.</p>';
    return;
  }
  const max = Math.max(1, ...visibleRows.map((row) => row.value));
  $(selector).innerHTML = `
    <div class="axis-chart vertical-chart ${options.compact ? 'compact-vertical-chart' : ''}">
      ${visibleRows.map((row, index) => `
        <button class="vertical-item" type="button" ${chartFilterAttributes(filterKey, row.name)}>
          <span class="vertical-plot"><span style="height:${Math.max(3, (row.value / max) * 100)}%; background:${CHART_COLORS[index % CHART_COLORS.length]}"></span></span>
          <strong>${escapeHtml(row.value)}</strong>
          <span title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
        </button>
      `).join('')}
    </div>
  `;
  attachChartFilters(selector);
}

function renderDonut(selector, rows, filterKey) {
  const total = setChartTotal(selector, rows);
  const colors = CHART_COLORS;
  let start = 0;
  const segments = rows.map((row, index) => {
    const degrees = total ? (row.value / total) * 360 : 0;
    const segment = `${colors[index % colors.length]} ${start}deg ${start + degrees}deg`;
    start += degrees;
    return segment;
  }).join(', ');
  $(selector).innerHTML = `
    <div class="donut-wrap">
      <div class="donut" style="background: conic-gradient(${segments || '#e5e7eb 0deg 360deg'});">
        <span>${escapeHtml(total)}</span>
        <small>Total</small>
      </div>
      <div class="donut-legend">
        ${rows.map((row, index) => `
          <button type="button" ${chartFilterAttributes(filterKey, row.name)}>
            <i style="background:${colors[index % colors.length]}"></i>
            <span>${escapeHtml(row.name)}</span>
            <strong>${escapeHtml(row.value)}</strong>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  attachChartFilters(selector);
}

async function loadCharts() {
  document.querySelectorAll('#overview-attribute input[type="checkbox"]').forEach((input) => {
    input.checked = state.overviewAttributes.includes(input.value);
  });
  syncOverviewAttributeSummary();
  if (!state.overviewAttributes.length) {
    $('#overview-chart-title').textContent = 'Portfolio Insights';
    $('#overview-dynamic-chart').innerHTML = '<div class="chart-empty-state"><strong>Select insight views</strong><span>Choose one or more options to visualize your portfolio data.</span></div>';
    return;
  }
  $('#overview-chart-title').textContent = 'Portfolio Insights';
  $('#overview-dynamic-chart').innerHTML = `
    <div class="multi-chart-grid">
      ${state.overviewAttributes.map((attribute) => {
        const config = overviewAttributeConfig[attribute];
        return `
          <article class="mini-chart-card">
            <div class="mini-chart-header">
              <h4>${escapeHtml(config.label)}</h4>
              <span class="chart-total"></span>
            </div>
            <div id="overview-chart-${escapeHtml(attribute)}"></div>
          </article>
        `;
      }).join('')}
    </div>
  `;
  await Promise.all(state.overviewAttributes.map(async (attribute) => {
    const config = overviewAttributeConfig[attribute];
    const selector = `#overview-chart-${attribute}`;
    const payload = await api(config.endpoint);
    if (config.chart === 'donut') {
      renderDonut(selector, payload.data, config.filterKey);
    } else if (config.chart === 'vertical') {
      renderVerticalChart(selector, payload.data, config.filterKey, { limit: 6, compact: true });
    } else {
      renderHorizontalChart(selector, payload.data, config.filterKey, { limit: 10, compact: true });
    }
  }));
}

function selectedOverviewAttributes() {
  const values = [...document.querySelectorAll('#overview-attribute input[type="checkbox"]:checked')].map((input) => input.value);
  return values.filter((value) => overviewAttributeConfig[value]);
}

function syncOverviewAttributeSelection() {
  state.overviewAttributes = selectedOverviewAttributes();
  syncOverviewAttributeSummary();
  if (state.overviewAttributes.length) return;
  document.querySelectorAll('#overview-attribute input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
}

function syncOverviewAttributeSummary() {
  const summary = $('#overview-attribute-summary');
  if (!summary) return;
  const labels = state.overviewAttributes.map((attribute) => overviewAttributeConfig[attribute]?.label).filter(Boolean);
  if (!labels.length) {
    summary.textContent = 'Choose insights';
  } else if (labels.length === 1) {
    summary.textContent = labels[0];
  } else {
    summary.textContent = `${labels.length} insights selected`;
  }
}

function normalizeOverviewAttributeState() {
  if (Array.isArray(state.overviewAttributes)) return;
  if (state.overviewAttribute) {
    state.overviewAttributes = [state.overviewAttribute];
  } else {
    state.overviewAttributes = [];
  }
}

async function loadProjects() {
  const payload = await api(`/api/projects?pageSize=200&${qs()}`);
  renderTable('#projects-table', payload.data, projectTableColumns, { key: 'projects' });
}

function portfolioFormFields() {
  return [...$('#portfolio-form').elements].filter((element) => element.name);
}

function openPortfolioForm(row = null) {
  $('#portfolio-form').reset();
  $('#portfolio-form-status').textContent = '';
  $('#portfolio-id').value = row?.id || '';
  $('#portfolio-form-title').textContent = row ? 'Edit Portfolio' : 'Add Portfolio';
  $('#portfolio-form-kicker').textContent = row ? row.projectName : 'Portfolio';
  for (const field of portfolioFormFields()) {
    if (field.name === 'id') continue;
    field.value = row?.[field.name] ?? '';
  }
  $('#portfolio-modal').hidden = false;
  $('#portfolio-form [name="projectName"]').focus();
}

function closePortfolioForm() {
  $('#portfolio-modal').hidden = true;
  $('#portfolio-form-status').textContent = '';
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#drawer').querySelector('.ic-drawer-summary')?.remove();
  state.drawerBack = null;
  syncDrawerBackButton();
}

function syncDrawerBackButton() {
  $('#drawer-back').hidden = !state.drawerBack;
}

function portfolioPayload() {
  return Object.fromEntries(new FormData($('#portfolio-form')).entries());
}

async function savePortfolio() {
  const id = $('#portfolio-id').value;
  const payload = portfolioPayload();
  const path = id ? `/api/projects/${encodeURIComponent(id)}` : '/api/projects';
  const response = await api(path, {
    method: id ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  closePortfolioForm();
  state.tablePages.projects = 1;
  await refreshAll();
  return response.data;
}

async function deletePortfolio(id, name) {
  if (!confirm(`Delete ${name || 'this portfolio'}?`)) return;
  await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.tablePages.projects = 1;
  await refreshAll();
}

async function loadForecast() {
  syncForecastControls();
  $('#forecast-from').value = state.forecastFrom;
  $('#forecast-to').value = state.forecastTo;
  const payload = await api(`${forecastBasePath()}?${forecastTodayQuery()}`);
  $('#forecast-kpis').innerHTML = payload.data.kpis.map((kpi) => `
    <button class="kpi-card" data-forecast-kpi="${kpi.key}" type="button"><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong><span>Selected range</span></button>
  `).join('');
  document.querySelectorAll('[data-forecast-kpi]').forEach((button) => button.addEventListener('click', () => openForecastDrawer(button.dataset.forecastKpi, button.querySelector('span').textContent)));
  await loadForecastTable();
}

async function loadForecastTable() {
  const category = state.forecastTab === 'all' ? '' : `&category=${state.forecastTab}`;
  const payload = await api(`${forecastBasePath()}/projects?pageSize=200${category}&${forecastTodayQuery()}`);
  renderTable('#forecast-table', payload.data, forecastColumns, { key: 'forecast' });
}

async function loadCapacity() {
  const cap = await api('/api/capacity');
  renderTable('#capacity-table', cap.data, [
    { key: 'effectiveIC', label: 'Consultant', render: (row) => `<button class="link-button consultant-link" data-ic="${escapeHtml(row.effectiveIC)}" type="button">${escapeHtml(row.effectiveIC)}</button>` },
    { key: 'activeProjects', label: 'Active Portfolios' },
    { key: 'forecastedGoLives', label: 'Forecasted Go-Lives' },
    { key: 'goldAndPlatinumProjects', label: 'Priority Customers' },
    { key: 'capacityStatus', label: 'Workload', render: (row) => renderBadge(row.capacityStatus) }
  ], { key: 'capacity' });
  document.querySelectorAll('[data-ic]').forEach((button) => {
    button.addEventListener('click', () => openIcDrawer(button.dataset.ic));
  });
}

async function openIcDrawer(effectiveIC) {
  const params = new URLSearchParams();
  params.set('effectiveIC', effectiveIC);
  params.set('pageSize', '200');
  const payload = await api(`/api/projects?${params.toString()}`);
  const capacity = await api('/api/capacity');
  const summary = capacity.data.find((row) => row.effectiveIC === effectiveIC);
  openIcDetailDrawer(effectiveIC, payload.data, summary);
}

function openIcDetailDrawer(effectiveIC, rows, summary = {}) {
  state.drawerRows = rows;
  state.drawerBack = null;
  state.tablePages.drawer = 1;
  syncDrawerBackButton();
  $('#drawer-title').textContent = effectiveIC;
  $('#drawer-kicker').textContent = `${rows.length} portfolios`;
  const table = $('#drawer-table');
  const wrap = table.closest('.table-wrap');
  wrap.parentElement?.querySelector('.ic-drawer-summary')?.remove();
  const existingPager = wrap?.nextElementSibling;
  if (existingPager?.classList.contains('pagination-controls')) existingPager.remove();
  const summaryRows = [
    ['Active', summary?.activeProjects ?? rows.length],
    ['Forecasted', summary?.forecastedGoLives ?? rows.filter((row) => row.estimatedGoLiveDate).length],
    ['Priority', summary?.goldAndPlatinumProjects ?? rows.filter((row) => ['Gold', 'Platinum'].includes(row.customerTier)).length],
    ['On Hold', summary?.onHoldProjects ?? rows.filter((row) => row.projectStatus === 'On Hold').length],
    ['Workload', summary?.capacityStatus || '-']
  ];
  renderTable('#drawer-table', rows, projectColumns, { key: 'drawer' });
  wrap.insertAdjacentHTML('beforebegin', `
    <div class="ic-drawer-summary">
      ${summaryRows.map(([label, value]) => `
        <article>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `).join('')}
    </div>
  `);
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
}

async function openKpiDrawer(key, label) {
  const payload = await api(`/api/dashboard/kpis/${key}/projects?pageSize=200`);
  openDrawer(label, payload.data);
}

function attachCustomerDrilldowns() {
  document.querySelectorAll('[data-customer]').forEach((button) => {
    button.addEventListener('click', async () => {
      const customer = button.dataset.customer;
      const params = new URLSearchParams({ customer, pageSize: '200' });
      const payload = await api(`/api/projects?${params.toString()}`);
      state.drawerBack = {
        title: $('#drawer-title').textContent,
        rows: state.drawerRows
      };
      openDrawer(`${customer} portfolios`, payload.data, { keepBack: true });
    });
  });
}

async function openForecastDrawer(key, label) {
  if (key === 'capacity-status') {
    const payload = await api('/api/capacity');
    openDrawer(label, payload.data);
    return;
  }
  const payload = await api(`${forecastBasePath()}/projects?pageSize=200&category=${key}&${forecastTodayQuery()}`);
  openDrawer(label, payload.data, { columns: forecastColumns });
}

function openDrawer(title, rows, options = {}) {
  state.drawerRows = rows;
  state.tablePages.drawer = 1;
  if (!options.keepBack) state.drawerBack = null;
  $('#drawer').querySelector('.ic-drawer-summary')?.remove();
  $('#drawer-title').textContent = title;
  $('#drawer-kicker').textContent = `${rows.length} records`;
  syncDrawerBackButton();
  const isCustomerDrawer = Boolean(rows[0]?.customerRecord);
  const columns = options.columns || (isCustomerDrawer ? customerColumns : rows[0]?.activeProjects !== undefined ? [
    { key: 'effectiveIC', label: 'IC' },
    { key: 'activeProjects', label: 'Active' },
    { key: 'forecastedGoLives', label: 'Forecasted' },
    { key: 'capacityStatus', label: 'Capacity' }
  ] : projectColumns);
  renderTable('#drawer-table', rows, columns, { key: 'drawer', afterRender: isCustomerDrawer ? attachCustomerDrilldowns : null });
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
}

function syncFilterInputs() {
  $('#filter-search').value = state.filters.search || '';
  $('#filter-status').value = state.filters.status || '';
  $('#filter-tier').value = state.filters.customerTier || '';
  $('#filter-effectiveIC').value = state.filters.effectiveIC || '';
  $('#filter-competency').value = state.filters.competency || '';
  renderActiveFilters();
}

function renderActiveFilters() {
  const summary = $('#active-filter-summary');
  const entries = Object.entries(state.filters).filter(([, value]) => value);
  if (!entries.length || state.activeModule !== 'projects') {
    summary.hidden = true;
    summary.innerHTML = '';
    return;
  }
  summary.hidden = false;
  summary.innerHTML = `
    <div>${entries.map(([key, value]) => `<span>${escapeHtml(FILTER_LABELS[key] || key)}: <strong>${escapeHtml(value)}</strong></span>`).join('')}</div>
    <button id="active-filter-clear" type="button">Clear filters</button>
  `;
  $('#active-filter-clear').addEventListener('click', () => {
    state.filters = {};
    syncFilterInputs();
    refreshAll();
  });
}

function forecastBasePath() {
  return `/api/forecasts/range/${state.forecastFrom}/${state.forecastTo}`;
}

function forecastTodayQuery() {
  return `today=${todayIso()}`;
}

function syncForecastControls() {
  if (state.forecastFrom > state.forecastTo) {
    [state.forecastFrom, state.forecastTo] = [state.forecastTo, state.forecastFrom];
  }
  $('#forecast-from').value = state.forecastFrom;
  $('#forecast-to').value = state.forecastTo;
}

function syncSettingsForm() {
  $('#setting-risk-watch').value = state.settings.riskWatch;
  $('#setting-risk-high').value = state.settings.riskHigh;
  $('#setting-risk-critical').value = state.settings.riskCritical;
  $('#setting-cap-balanced').value = state.settings.capBalanced;
  $('#setting-cap-high').value = state.settings.capHigh;
  $('#setting-page-size').value = state.settings.pageSize;
  $('#setting-show-source').checked = Boolean(state.settings.showSource);
}

function saveSettings(nextSettings) {
  state.settings = { ...state.settings, ...nextSettings };
  localStorage.setItem('deliveryDashboardSettings', JSON.stringify(state.settings));
  $('#settings-status').textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

function syncModuleView() {
  if (!modules.includes(state.activeModule)) state.activeModule = 'overview';
  document.querySelectorAll('.page-section').forEach((section) => {
    section.hidden = section.id !== state.activeModule;
  });
  document.querySelectorAll('.sidebar-nav a, .shell-header .primary-link').forEach((link) => {
    const target = link.getAttribute('href')?.replace('#', '');
    link.classList.toggle('active', target === state.activeModule);
  });
  $('.workspace-intro').hidden = state.activeModule !== 'overview';
  $('.filter-bar').hidden = !filteredModules.has(state.activeModule);
  renderActiveFilters();
}

async function refreshAll() {
  setQuery();
  $('#last-refresh').textContent = `Last refreshed ${new Date().toLocaleString()}`;
  await loadOptions();
  await Promise.all([loadKpis(), loadCharts(), loadProjects(), loadForecast(), loadCapacity()]);
}

function downloadCsv(rows, fileName) {
  const flatRows = rows.map(flattenRowForExport);
  const headers = [...new Set(flatRows.flatMap((row) => Object.keys(row)))];
  const csv = [headers.join(','), ...flatRows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = fileName;
  link.click();
}

function flattenRowForExport(row) {
  const {
    extraFields = {},
    id,
    projectKey,
    baseProjectKey,
    riskReasons,
    recommendedActions,
    ...rest
  } = row;
  const flattened = {
    ...rest,
    ...extraFields,
    riskReasons: Array.isArray(riskReasons) ? riskReasons.join('; ') : riskReasons,
    recommendedActions: Array.isArray(recommendedActions) ? recommendedActions.join('; ') : recommendedActions
  };
  return Object.fromEntries(Object.entries(flattened).filter(([, value]) => typeof value !== 'object' || value === null));
}

function wireEvents() {
  window.addEventListener('hashchange', () => {
    state.activeModule = location.hash.replace('#', '') || 'overview';
    closeDrawer();
    syncModuleView();
    setQuery();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  const filterBindings = [
    ['#filter-search', 'search'],
    ['#filter-status', 'status'],
    ['#filter-tier', 'customerTier'],
    ['#filter-effectiveIC', 'effectiveIC'],
    ['#filter-competency', 'competency']
  ];
  filterBindings.forEach(([selector, key]) => $(selector).addEventListener('change', () => {
    state.filters[key] = $(selector).value;
    refreshAll();
  }));
  $('#filter-search').addEventListener('input', () => {
    state.filters.search = $('#filter-search').value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(refreshAll, 250);
  });
  $('#reset-filters').addEventListener('click', () => { state.filters = {}; syncFilterInputs(); refreshAll(); });
  $('#overview-attribute').addEventListener('change', (event) => {
    if (event.target.type !== 'checkbox') return;
    syncOverviewAttributeSelection();
    event.target.closest('details')?.removeAttribute('open');
    loadCharts();
  });
  $('#add-portfolio').addEventListener('click', () => openPortfolioForm());
  $('#portfolio-form-close').addEventListener('click', closePortfolioForm);
  $('#portfolio-form-cancel').addEventListener('click', closePortfolioForm);
  $('#portfolio-modal').addEventListener('click', (event) => {
    if (event.target.id === 'portfolio-modal') closePortfolioForm();
  });
  $('#portfolio-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#portfolio-form-status').textContent = 'Saving portfolio...';
    try {
      await savePortfolio();
    } catch (error) {
      $('#portfolio-form-status').textContent = error.message;
    }
  });
  $('#export-projects').addEventListener('click', async () => {
    const payload = await api(`/api/projects?pageSize=200&${qs()}`);
    downloadCsv(payload.data, 'filtered-projects.csv');
  });
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-back').addEventListener('click', () => {
    if (!state.drawerBack) return;
    const previous = state.drawerBack;
    state.drawerBack = null;
    openDrawer(previous.title, previous.rows);
  });
  $('#drawer-search').addEventListener('input', () => {
    const term = $('#drawer-search').value.toLowerCase();
    openDrawer($('#drawer-title').textContent, state.drawerRows.filter((row) => JSON.stringify(row).toLowerCase().includes(term)));
    $('#drawer-search').value = term;
    $('#drawer-search').focus();
  });
  const updateForecastRange = () => {
    state.forecastFrom = $('#forecast-from').value;
    state.forecastTo = $('#forecast-to').value;
    if (!state.forecastFrom || !state.forecastTo) return;
    syncForecastControls();
    refreshAll();
  };
  $('#forecast-from').addEventListener('input', updateForecastRange);
  $('#forecast-from').addEventListener('change', updateForecastRange);
  $('#forecast-to').addEventListener('input', updateForecastRange);
  $('#forecast-to').addEventListener('change', updateForecastRange);
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    state.forecastTab = tab.dataset.tab;
    loadForecastTable();
  }));
  $('#import-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = $('#import-file').files[0];
    if (!file) {
      $('#import-result').textContent = 'Choose a CSV file before previewing the import.';
      return;
    }
    const csvText = await file.text();
    const payload = await api('/api/imports/projects/csv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csvText, fileName: file.name, mode: $('#import-mode').value })
    });
    state.currentImportId = payload.data.id;
    $('#confirm-import').disabled = payload.data.errorCount > 0;
    $('#import-result').textContent = JSON.stringify(payload.data, null, 2);
  });
  $('#confirm-import').addEventListener('click', async () => {
    const payload = await api(`/api/imports/${state.currentImportId}/confirm`, { method: 'POST' });
    $('#import-result').textContent = JSON.stringify(payload.data, null, 2);
    state.filters = {};
    syncFilterInputs();
    await refreshAll();
  });
  $('#clear-data').addEventListener('click', async () => {
    if (!confirm('Clear all imported project data? This keeps the app ready for the next CSV upload.')) return;
    const payload = await api('/api/projects', { method: 'DELETE' });
    state.currentImportId = null;
    $('#confirm-import').disabled = true;
    $('#import-result').textContent = JSON.stringify(payload.data, null, 2);
    await refreshAll();
  });
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    saveSettings({
      riskWatch: Number($('#setting-risk-watch').value),
      riskHigh: Number($('#setting-risk-high').value),
      riskCritical: Number($('#setting-risk-critical').value),
      capBalanced: Number($('#setting-cap-balanced').value),
      capHigh: Number($('#setting-cap-high').value),
      pageSize: Number($('#setting-page-size').value),
      showSource: $('#setting-show-source').checked
    });
    state.tablePages = {};
    syncForecastControls();
    await refreshAll();
  });
  $('#settings-reset').addEventListener('click', async () => {
    localStorage.removeItem('deliveryDashboardSettings');
    state.settings = loadSettings();
    state.tablePages = {};
    syncSettingsForm();
    syncForecastControls();
    $('#settings-status').textContent = 'Settings reset';
    await refreshAll();
  });
}

syncFilterInputs();
syncForecastControls();
normalizeOverviewAttributeState();
syncModuleView();
syncSettingsForm();
wireEvents();
refreshAll().catch((error) => {
  document.body.insertAdjacentHTML('afterbegin', `<div class="panel" role="alert">Unable to load dashboard: ${error.message}</div>`);
});
