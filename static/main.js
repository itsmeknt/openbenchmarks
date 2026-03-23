// ================================================================
//  CONFIG
// ================================================================
 
/** Columns shown in the data table (in order). */
const TABLE_COLS = [
  'benchmark', 'model', 'model_quant', 'model_size_gb',
  'pass_1', 'pass_2', 'seconds_per_test', 'evaluator', 'date', 'notes',
];
 
/** Numeric-looking columns for display alignment. */
const NUMERIC_DISPLAY = new Set(['model_size_gb', 'pass_1', 'pass_2', 'prompt_tokens',
  'completion_tokens', 'seconds_per_test', 'total_cost']);
 
// ================================================================
//  STATE
// ================================================================
 
let allData    = [];      // raw rows from JSON
let allAttrs   = [];      // all column names (in original order)
let numAttrs   = [];      // numeric-valued columns
let strAttrs   = [];      // string-valued columns
let uniqVals   = {};      // strAttr -> sorted unique string[]
let usingSample = false;

// App state — kept in sync with URL
let state = {
  xAxis : 'model_id',
  xAgg  : 'median',
  yAxis : 'pass_2',
  filters: [],  // [{type:'eq'|'gte'|'lte'|'between', attr, val, val2}]
};
 
let chartInst = null;
 
// Table sort state — default: pass_2 descending
let tableSort = { col: 'pass_2', dir: 'desc' };
 
// ================================================================
//  THEME
// ================================================================
 
function initTheme() {
  const saved  = localStorage.getItem('theme');
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);
}
 
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-icon').textContent = t === 'dark' ? '☀ light' : '☾ dark';
  localStorage.setItem('theme', t);
  if (chartInst) renderChart(applyFilters());  // re-render with new colours
}
 
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
 
// ================================================================
//  URL ↔ STATE
// ================================================================
 
/**
 * URL encoding convention:
 *   eq filter      →  ?attr=value
 *   gte filter     →  ?attr_gte=value
 *   lte filter     →  ?attr_lte=value
 *   between filter →  ?attr_between=min,max
 *   graph ctrl     →  ?x_axis=… &x_axis_aggregate=… &y_axis=…
 */
const GRAPH_KEYS = new Set(['x_axis', 'x_axis_aggregate', 'y_axis']);
 
function stateToURL(s) {
  const p = new URLSearchParams();
  p.set('x_axis', s.xAxis);
  p.set('x_axis_aggregate', s.xAgg);
  p.set('y_axis', s.yAxis);
  for (const f of s.filters) {
    if (f.type === 'eq')      p.append(f.attr, f.val);
    else if (f.type === 'gte') p.append(f.attr + '_gte', f.val);
    else if (f.type === 'lte') p.append(f.attr + '_lte', f.val);
    else if (f.type === 'between') p.append(f.attr + '_between', f.val + ',' + (f.val2 ?? ''));
  }
  return '?' + p.toString();
}
 
function urlToState() {
  const p = new URLSearchParams(window.location.search);
  const s = {
    xAxis   : p.get('x_axis')             || 'model_id',
    xAgg    : p.get('x_axis_aggregate')   || 'median',
    yAxis   : p.get('y_axis')             || 'pass_2',
    filters : [],
  };
  for (const [key, val] of p.entries()) {
    if (GRAPH_KEYS.has(key)) continue;
    if (key.endsWith('_between')) {
      const attr = key.slice(0, -8);
      const [v1, v2] = val.split(',');
      s.filters.push({ type: 'between', attr, val: v1 ?? '', val2: v2 ?? '' });
    } else if (key.endsWith('_gte')) {
      s.filters.push({ type: 'gte', attr: key.slice(0, -4), val });
    } else if (key.endsWith('_lte')) {
      s.filters.push({ type: 'lte', attr: key.slice(0, -4), val });
    } else {
      s.filters.push({ type: 'eq', attr: key, val });
    }
  }
  return s;
}
 
function syncURL() {
  window.history.pushState({}, '', stateToURL(state));
}
 
// ================================================================
//  DATA LOADING & ANALYSIS
// ================================================================
 
async function loadData() {
  const res = await fetch('./gsheet_data.json');
  if (!res.ok) {  
    const sample_res = await fetch('./sample_gsheet_data.json');
    if (!sample_res.ok) throw new Error(`Failed to load gsheet_data.json: ${res.status}`);

    usingSample = true;
    return sample_res.json()
  }
  return res.json();
}
 
function analyzeSchema(data) {
  if (!data.length) return;
  allAttrs = Object.keys(data[0]);
  numAttrs = [];
  strAttrs = [];
  uniqVals = {};
 
  for (const attr of allAttrs) {
    const vals = data.map(r => r[attr]).filter(v => v !== null && v !== '' && v !== undefined);
    const isNum = vals.length > 0 && vals.every(v => !isNaN(parseFloat(v)) && isFinite(v));
    if (isNum) {
      numAttrs.push(attr);
    } else {
      strAttrs.push(attr);
      uniqVals[attr] = [...new Set(data.map(r => String(r[attr] ?? '')).filter(v => v && v !== 'null'))].sort();
    }
  }
}
 
// ================================================================
//  FILTER LOGIC
// ================================================================
 
function applyFilters() {
  return allData.filter(row => {
    for (const f of state.filters) {
      const raw = row[f.attr];
      if (f.type === 'eq') {
        if (String(raw ?? '') !== String(f.val)) return false;
      } else if (f.type === 'gte') {
        if (isNaN(parseFloat(raw)) || parseFloat(raw) < parseFloat(f.val)) return false;
      } else if (f.type === 'lte') {
        if (isNaN(parseFloat(raw)) || parseFloat(raw) > parseFloat(f.val)) return false;
      } else if (f.type === 'between') {
        const v = parseFloat(raw);
        if (isNaN(v) || v < parseFloat(f.val) || v > parseFloat(f.val2)) return false;
      }
    }
    return true;
  });
}
 
// ================================================================
//  STATISTICS
// ================================================================
 
function sortedNums(arr) { return [...arr].sort((a, b) => a - b); }
 
function calcMedian(arr) {
  if (!arr.length) return null;
  const s = sortedNums(arr), mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
 
function calcMean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}
 
function calcVariance(arr) {
  if (arr.length < 2) return arr.length ? 0 : null;
  const m = calcMean(arr);
  return calcMean(arr.map(x => (x - m) ** 2));
}
 
// ================================================================
//  CHART RENDERING
// ================================================================
 
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
 
function groupByX(rows) {
  const groups    = {};   // xLabel -> y-value[]
  const rowGroups = {};   // xLabel -> full row[]
  for (const row of rows) {
    const x = String(row[state.xAxis] ?? '');
    const y = parseFloat(row[state.yAxis]);
    if (!x || isNaN(y)) continue;
    if (!groups[x]) { groups[x] = []; rowGroups[x] = []; }
    groups[x].push(y);
    rowGroups[x].push(row);
  }
  // Sort labels by descending median (most informative default)
  const labels = Object.keys(groups).sort(
    (a, b) => (calcMedian(groups[b]) ?? 0) - (calcMedian(groups[a]) ?? 0)
  );
  return { groups, rowGroups, labels };
}
 
function renderChart(rows) {
  const accent    = cssVar('--accent');
  const textMuted = cssVar('--text-muted');
  const borderClr = cssVar('--border');
  const { groups, rowGroups, labels } = groupByX(rows);
 
  // Show empty state
  const isEmpty = labels.length === 0;
  document.getElementById('chart-empty').style.display = isEmpty ? 'flex' : 'none';
  if (isEmpty) {
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    hideTooltip();
    return;
  }
 
  const isBoxPlot = state.xAgg === 'boxplot';
  const chartType = isBoxPlot ? 'boxplot' : 'bar';
  const aggFn = { median: calcMedian, mean: calcMean, variance: calcVariance };
 
  const dataset = isBoxPlot
    ? {
        label: state.yAxis,
        data: labels.map(l => groups[l]),
        backgroundColor: accent + '30',
        borderColor: accent,
        borderWidth: 1,
        outlierRadius: 3,
        outlierBackgroundColor: accent,
        medianColor: accent,
      }
    : {
        label: `${state.xAgg}(${state.yAxis})`,
        data: labels.map(l => aggFn[state.xAgg]?.(groups[l]) ?? null),
        backgroundColor: accent + '90',
        borderColor: accent,
        borderWidth: 1,
      };
 
  const axisBase = {
    ticks: { color: textMuted, font: { family: "'JetBrains Mono', monospace", size: 11 } },
    grid:  { color: borderClr },
  };
 
  const config = {
    type: chartType,
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,   // we draw our own
          external(context) {
            const tooltipEl = document.getElementById('chart-tooltip');
            if (context.tooltip.opacity === 0) { hideTooltip(); return; }
 
            const lbl = context.tooltip.title?.[0];
            if (!lbl || !rowGroups[lbl]) { hideTooltip(); return; }
 
            const recs = rowGroups[lbl];
            const yKey = state.yAxis;
            const PREVIEW = 10;
            const shown   = recs.slice(0, PREVIEW);
 
            // Build mini-table rows
            let rows_html = shown.map(r => {
              const mid   = String(r.model_id   ?? '—');
              const mq    = String(r.model_quant ?? '—');
              const ms    = r.model_size_gb != null && r.model_size_gb !== '' ? Number(r.model_size_gb).toFixed(1) + ' GB' : '—';
              const ev    = String(r.evaluator  ?? '—');
              const yval  = r[yKey] != null && r[yKey] !== '' ? Number(r[yKey]).toFixed(1) : '—';
              const midShort = mid.length > 36 ? mid.slice(0, 35) + '…' : mid;
              return `<tr>
                <td title="${mid}">${midShort}</td>
                <td>${mq}</td>
                <td class="num">${ms}</td>
                <td>${ev}</td>
                <td class="num">${yval}</td>
              </tr>`;
            }).join('');
 
            tooltipEl.innerHTML = `
              <div class="tt-title" title="${lbl}">${lbl} <span style="font-weight:400;color:var(--text-muted)">(${recs.length} run${recs.length !== 1 ? 's' : ''})</span></div>
              <table class="tt-table">
                <thead><tr>
                  <th>model_id</th><th>quant</th><th>size</th><th>evaluator</th><th>${yKey}</th>
                </tr></thead>
                <tbody>${rows_html}</tbody>
              </table>
              ${recs.length > PREVIEW ? `<div class="tt-more">+ ${recs.length - PREVIEW} more rows</div>` : ''}
            `;
 
            // Position: prefer right of bar, flip left if near edge
            const canvas  = context.chart.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const wrapRect   = canvas.parentElement.getBoundingClientRect();
            const tp = context.tooltip;
            const tipX = tp.caretX;
            const tipY = tp.caretY;
 
            tooltipEl.classList.add('visible');
            const ttW = tooltipEl.offsetWidth;
            const ttH = tooltipEl.offsetHeight;
            const wrapW = wrapRect.width;
 
            // Offset relative to .chart-wrap
            let left = tipX + 14;
            if (left + ttW > wrapW - 8) left = tipX - ttW - 14;
            let top  = tipY - ttH / 2;
            if (top < 4) top = 4;
 
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top  = top  + 'px';
          },
        },
      },
      scales: {
        x: {
          ...axisBase,
          ticks: {
            ...axisBase.ticks,
            maxRotation: 45,
            callback(val) {
              const lbl = this.getLabelForValue(val);
              return lbl && lbl.length > 28 ? lbl.slice(0, 27) + '…' : lbl;
            },
          },
        },
        y: {
          ...axisBase,
          title: {
            display: true,
            text: state.yAxis,
            color: textMuted,
            font: { family: "'JetBrains Mono', monospace", size: 11 },
          },
        },
      },
    },
  };
 
  if (chartInst) chartInst.destroy();
  chartInst = new Chart(document.getElementById('chart-canvas').getContext('2d'), config);
}
 
function hideTooltip() {
  const el = document.getElementById('chart-tooltip');
  if (el) el.classList.remove('visible');
}
 
// ================================================================
//  TABLE RENDERING
// ================================================================
 
function sortRows(rows) {
  const { col, dir } = tableSort;
  return [...rows].sort((a, b) => {
    let av = a[col] ?? '';
    let bv = b[col] ?? '';
    // Numeric sort if both parse as numbers
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) {
      return dir === 'desc' ? bn - an : an - bn;
    }
    // String sort
    av = String(av).toLowerCase();
    bv = String(bv).toLowerCase();
    return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
  });
}
 
function onSortClick(col) {
  if (tableSort.col === col) {
    tableSort.dir = tableSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    tableSort.col = col;
    tableSort.dir = 'desc';
  }
  renderTable(applyFilters());
}
 
function renderTable(rows) {
  const root  = document.getElementById('table-root');
  const badge = document.getElementById('table-badge');
  badge.textContent = rows.length + ' rows';
 
  if (!rows.length) {
    root.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-style:italic">No rows match the current filters.</div>';
    return;
  }
 
  const sorted = sortRows(rows);
  const cols   = TABLE_COLS.filter(c => allAttrs.includes(c));
 
  // Header
  let html = '<table><thead><tr>';
  for (const c of cols) {
    const isActive = tableSort.col === c;
    const arrow    = isActive ? (tableSort.dir === 'desc' ? '▼' : '▲') : '▼';
    html += `<th class="sortable${isActive ? ' sort-active' : ''}" onclick="onSortClick('${c}')">
      ${c}<span class="sort-arrow">${arrow}</span>
    </th>`;
  }
  html += '</tr></thead><tbody>';
 
  for (const row of sorted) {
    html += '<tr>';
    for (const c of cols) {
      const raw = row[c] ?? '';
      let cell  = String(raw);
 
      // Link model column to model_url
      if (c === 'model' && row.model_url) {
        cell = `<a href="${row.model_url}" target="_blank" rel="noopener">${cell}</a>`;
      }
      // Truncate long notes
      if (c === 'notes' && cell.length > 60) {
        cell = `<span title="${cell.replace(/"/g, '&quot;')}">${cell.slice(0, 58)}…</span>`;
      }
 
      const cls = [
        NUMERIC_DISPLAY.has(c)             ? 'num' : '',
        raw === null || raw === ''         ? 'dim' : '',
      ].filter(Boolean).join(' ');
 
      html += `<td class="${cls}">${cell || '—'}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  root.innerHTML = html;
}
 
// ================================================================
//  FILTER UI
// ================================================================
 
function renderFilters() {
  const list = document.getElementById('filters-list');
  list.innerHTML = '';
  state.filters.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.innerHTML = buildFilterRow(f, idx);
    list.appendChild(div);
  });
}
 
function buildFilterRow(f, idx) {
  const typeOpts = [
    ['eq',      'must contain'],
    ['gte',     'at least'],
    ['lte',     'at most'],
    ['between', 'between'],
  ].map(([v, l]) => `<option value="${v}"${f.type === v ? ' selected' : ''}>${l}</option>`).join('');
 
  // Attribute dropdown: eq can use any attr; others only numeric
  const availAttrs = f.type === 'eq' ? allAttrs : numAttrs;
  const attrOpts = availAttrs
    .map(a => `<option value="${a}"${f.attr === a ? ' selected' : ''}>${a}</option>`)
    .join('');
 
  // Value widget
  let valHTML;
  if (f.type === 'eq' && strAttrs.includes(f.attr)) {
    // String attribute → select dropdown
    const opts = (uniqVals[f.attr] || [])
      .map(v => `<option value="${v}"${f.val === v ? ' selected' : ''}>${v}</option>`)
      .join('');
    valHTML = `<select onchange="setFilterField(${idx},'val',this.value)">${opts}</select>`;
  } else if (f.type === 'between') {
    valHTML = `
      <input type="number" value="${f.val ?? ''}" placeholder="min" style="width:80px"
        onchange="setFilterField(${idx},'val',this.value)">
      <span class="filter-sep">—</span>
      <input type="number" value="${f.val2 ?? ''}" placeholder="max" style="width:80px"
        onchange="setFilterField(${idx},'val2',this.value)">
    `;
  } else {
    // Numeric input (eq on numeric attr, gte, lte)
    const typ = (f.type === 'eq' && numAttrs.includes(f.attr)) ? 'number' : 'number';
    valHTML = `<input type="${typ}" value="${f.val ?? ''}" style="width:110px"
      onchange="setFilterField(${idx},'val',this.value)">`;
  }
 
  return `
    <select onchange="setFilterType(${idx},this.value)">${typeOpts}</select>
    <select onchange="setFilterAttr(${idx},this.value)">${attrOpts}</select>
    ${valHTML}
    <button class="btn-remove" onclick="removeFilter(${idx})" title="Remove filter">✕</button>
  `;
}
 
function populateDropdowns() {
  const xSel   = document.getElementById('ctrl-x');
  const ySel   = document.getElementById('ctrl-y');
  const aggSel = document.getElementById('ctrl-agg');
 
  xSel.innerHTML = allAttrs
    .map(a => `<option value="${a}"${state.xAxis === a ? ' selected' : ''}>${a}</option>`)
    .join('');
  ySel.innerHTML = numAttrs
    .map(a => `<option value="${a}"${state.yAxis === a ? ' selected' : ''}>${a}</option>`)
    .join('');
  aggSel.value = state.xAgg;
}
 
// ================================================================
//  EVENT HANDLERS
// ================================================================
 
function addFilter() {
  const attr  = allAttrs[0] || 'benchmark';
  const val   = strAttrs.includes(attr) ? (uniqVals[attr]?.[0] ?? '') : '';
  state.filters.push({ type: 'eq', attr, val, val2: '' });
  renderFilters();
  refresh();
}
 
function removeFilter(idx) {
  state.filters.splice(idx, 1);
  renderFilters();
  refresh();
}
 
function setFilterField(idx, key, val) {
  state.filters[idx][key] = val;
  refresh();
}
 
function setFilterType(idx, newType) {
  const f = state.filters[idx];
  f.type = newType;
  // If switching to numeric-only type and attr is a string attr, pick first numeric attr
  if (newType !== 'eq' && strAttrs.includes(f.attr)) {
    f.attr = numAttrs[0] || f.attr;
  }
  f.val  = '';
  f.val2 = '';
  renderFilters();  // full re-render needed (widget type changes)
  refresh();
}
 
function setFilterAttr(idx, newAttr) {
  const f     = state.filters[idx];
  f.attr      = newAttr;
  f.val       = strAttrs.includes(newAttr) ? (uniqVals[newAttr]?.[0] ?? '') : '';
  f.val2      = '';
  renderFilters();  // widget type may change (dropdown ↔ input)
  refresh();
}
 
function onCtrlChange() {
  state.xAxis = document.getElementById('ctrl-x').value;
  state.xAgg  = document.getElementById('ctrl-agg').value;
  state.yAxis = document.getElementById('ctrl-y').value;
  refresh();
}
 
/** Central update: sync URL, re-render chart and table. */
function refresh() {
  syncURL();
  const rows = applyFilters();
  document.getElementById('result-badge').textContent = rows.length + ' rows' + (usingSample ? ' (sample data)' : '');
  renderChart(rows);
  renderTable(rows);
}
 
// ================================================================
//  INIT
// ================================================================
 
async function init() {
  initTheme();
 
  // Read URL; if totally empty, apply default state and redirect
  const raw = new URLSearchParams(window.location.search);
  if (raw.size === 0) {
    state = {
      xAxis: 'model_id',
      xAgg:  'median',
      yAxis: 'pass_2',
      filters: [{ type: 'eq', attr: 'benchmark', val: 'Aider', val2: '' }],
    };
    window.history.replaceState({}, '', stateToURL(state));
  } else {
    state = urlToState();
  }
 
  const msg = document.getElementById('loading-msg');
  try {
    allDataRaw = await loadData();
    allData = allDataRaw.sheets["BenchmarkEvals"].items;
    analyzeSchema(allData);
    msg.textContent = allData.length + ' total rows' + (usingSample ? ' (sample data)' : '');
 
    populateDropdowns();
    renderFilters();
    refresh();
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
    console.error(err);
  }
}
 
// Handle browser back/forward
window.addEventListener('popstate', () => {
  state = urlToState();
  populateDropdowns();
  renderFilters();
  refresh();
});
 
init();



