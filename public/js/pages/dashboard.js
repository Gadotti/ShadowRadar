import * as api from '../api.js';
import { initCustomSelect } from '../components/custom-select.js';

// ── Colour constants ────────────────────────────────────────────────────────
const SEV_COLORS = {
  CRITICAL: '#f85149',
  HIGH:     '#d29922',
  MEDIUM:   '#e3b341',
  LOW:      '#388bfd',
  NONE:     '#8b949e',
};
const ASSESS_COLORS = {
  'Acknowledge/Mitigating': '#3fb950',
  'Accepted Risk':          '#388bfd',
  'Not Affected':           '#8b949e',
  'False Positive':         '#bc8cff',
  'Pending':                '#e3b341',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function applyChartDefaults(Chart) {
  Chart.defaults.color       = '#c9d1d9';
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size   = 12;
}

// ── HTML builders ────────────────────────────────────────────────────────────

function filterPanelHTML() {
  return `
    <div class="card mb-16">
      <div class="filter-row" style="flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;min-width:200px;flex:1">
          <label style="font-size:12px;margin-bottom:4px">Ativos</label>
          <div class="custom-select-wrapper" id="f-assets"></div>
        </div>
        <div class="form-group" style="margin:0;min-width:160px">
          <label style="font-size:12px;margin-bottom:4px">Período</label>
          <div class="custom-select-wrapper" id="f-period"></div>
        </div>
        <div id="custom-dates" class="filter-row" style="display:none;align-items:flex-end;gap:8px">
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;margin-bottom:4px">De</label>
            <input type="date" id="f-date-from">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;margin-bottom:4px">Até</label>
            <input type="date" id="f-date-to">
          </div>
        </div>
        <div class="form-group" style="margin:0;min-width:160px">
          <label style="font-size:12px;margin-bottom:4px">Severidade</label>
          <div class="custom-select-wrapper" id="f-severity"></div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-primary" id="btn-apply">Aplicar</button>
          <button class="btn btn-secondary" id="btn-clear">Limpar</button>
        </div>
      </div>
    </div>`;
}

function kpiCardsHTML() {
  return `
    <div class="kpi-grid mb-16">
      <div class="kpi-card" id="kpi-active-assets">
        <div class="kpi-label">Ativos Monitorados</div>
        <div class="kpi-value kpi-skeleton"></div>
      </div>
      <div class="kpi-card" id="kpi-total-cves">
        <div class="kpi-label">Total de CVEs</div>
        <div class="kpi-value kpi-skeleton"></div>
      </div>
      <div class="kpi-card kpi-warning" id="kpi-pending">
        <div class="kpi-label">Sem Avaliação</div>
        <div class="kpi-value kpi-skeleton"></div>
      </div>
      <div class="kpi-card kpi-info" id="kpi-mitigating">
        <div class="kpi-label">Em Mitigação</div>
        <div class="kpi-value kpi-skeleton"></div>
      </div>
    </div>`;
}

function chartsHTML() {
  return `
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Distribuição por Severidade</div>
        <div class="chart-wrap"><canvas id="chart-severity"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">CVEs por Ativo (Top 10)</div>
        <div class="chart-wrap"><canvas id="chart-assets"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Evolução por Mês</div>
        <div class="chart-wrap"><canvas id="chart-monthly"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Distribuição por Avaliação</div>
        <div class="chart-wrap"><canvas id="chart-assessment"></canvas></div>
      </div>
      <div class="chart-card chart-card-wide">
        <div class="chart-title">Cobertura de Avaliação IA</div>
        <div class="chart-wrap chart-wrap-gauge">
          <canvas id="chart-ai"></canvas>
          <div class="gauge-label" id="gauge-pct">—</div>
        </div>
      </div>
    </div>`;
}

// ── No-data plugin ────────────────────────────────────────────────────────────

function noDataPlugin() {
  return {
    id: 'noData',
    afterDraw(chart) {
      const empty = chart.data.datasets.every(d => !d.data?.length || d.data.every(v => !v));
      if (!empty) return;
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8b949e';
      ctx.font = '13px sans-serif';
      ctx.fillText('Sem dados para o período', width / 2, height / 2);
      ctx.restore();
    },
  };
}

// ── Chart builders ────────────────────────────────────────────────────────────

const GRID_COLOR = 'rgba(33,38,45,0.9)';

function buildSeverityChart(Chart, canvas, dist) {
  const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: labels.map(l => dist[l] || 0), backgroundColor: labels.map(l => SEV_COLORS[l]), borderWidth: 1, borderColor: '#161b22' }],
    },
    options: { cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } } },
    plugins: [noDataPlugin()],
  });
}

function buildAssetsChart(Chart, canvas, rows) {
  const labels = rows.map(r => r.asset_name + (r.asset_tag ? ' ' + r.asset_tag : ''));
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: rows.map(r => r.total), backgroundColor: '#388bfd88', borderColor: '#388bfd', borderWidth: 1, label: 'CVEs' }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: GRID_COLOR }, ticks: { precision: 0 } }, y: { grid: { display: false } } },
    },
    plugins: [noDataPlugin()],
  });
}

function buildMonthlyChart(Chart, canvas, rows) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(r => r.month),
      datasets: [{ data: rows.map(r => r.count), borderColor: '#388bfd', backgroundColor: 'rgba(56,139,253,0.12)', tension: 0.3, fill: true, pointRadius: 3, label: 'CVEs' }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: GRID_COLOR } }, y: { grid: { color: GRID_COLOR }, ticks: { precision: 0 } } },
    },
    plugins: [noDataPlugin()],
  });
}

function buildAssessmentChart(Chart, canvas, dist) {
  const labels = Object.keys(dist);
  const colors = labels.map(l => ASSESS_COLORS[l] || '#8b949e');
  return new Chart(canvas, {
    type: 'pie',
    data: { labels, datasets: [{ data: Object.values(dist), backgroundColor: colors, borderWidth: 1, borderColor: '#161b22' }] },
    options: {
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            padding: 10,
            generateLabels(chart) {
              const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              return chart.data.labels.map((label, i) => ({
                text: `${label} (${total ? Math.round(chart.data.datasets[0].data[i] / total * 100) : 0}%)`,
                fillStyle: chart.data.datasets[0].backgroundColor[i],
                fontColor: Chart.defaults.color,
                index: i,
              }));
            },
          },
        },
      },
    },
    plugins: [noDataPlugin()],
  });
}

function buildAiChart(Chart, canvas, coverage, gaugeLabelEl) {
  gaugeLabelEl.textContent = `${coverage.percentage ?? 0}%`;
  const withAi = coverage.with_ai || 0;
  const without = Math.max(0, (coverage.total || 0) - withAi);
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels: ['Com AI', 'Sem AI'], datasets: [{ data: [withAi, without], backgroundColor: ['#3fb950', '#21262d'], borderWidth: 0 }] },
    options: { cutout: '70%', rotation: -90, circumference: 180, plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } } },
  });
}

// ── KPI updater ───────────────────────────────────────────────────────────────

function updateKpis(container, kpis) {
  const set = (id, val) => {
    const el = container.querySelector(`#${id} .kpi-value`);
    if (el) { el.classList.remove('kpi-skeleton'); el.textContent = val; }
  };
  set('kpi-active-assets', kpis.active_assets);
  set('kpi-total-cves',    kpis.total_cves);
  set('kpi-pending',       kpis.cves_pending_assessment);
  set('kpi-mitigating',    kpis.cves_mitigating);
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function render(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando…</div>';

  let allAssets = [];
  try { allAssets = await api.get('/dashboard/assets'); } catch {}

  container.innerHTML = `
    <div class="page-header"><h1 class="page-title">Dashboard</h1></div>
    ${filterPanelHTML()}
    ${kpiCardsHTML()}
    ${chartsHTML()}`;

  const Chart = window.Chart;
  if (!Chart) {
    container.querySelector('.charts-grid').innerHTML =
      '<p class="text-muted">Chart.js não carregado. Verifique /vendor/chart.js.</p>';
    return;
  }
  applyChartDefaults(Chart);

  let charts = {};

  const assetsSelect = initCustomSelect(container.querySelector('#f-assets'), {
    options:     allAssets.map(a => ({ value: String(a.id), label: a.name + (a.tag ? ' ' + a.tag : '') })),
    multiple:    true,
    placeholder: 'Todos os ativos',
  });

  const periodSelect = initCustomSelect(container.querySelector('#f-period'), {
    options:  [
      { value: '',       label: 'Todos os períodos' },
      { value: '30d',    label: 'Últimos 30 dias'   },
      { value: '90d',    label: 'Últimos 90 dias'   },
      { value: '180d',   label: 'Últimos 180 dias'  },
      { value: 'custom', label: 'Personalizado'     },
    ],
    value:    '',
    onChange: v => {
      const customDates = container.querySelector('#custom-dates');
      if (customDates) customDates.style.display = v === 'custom' ? 'flex' : 'none';
    },
  });

  const severitySelect = initCustomSelect(container.querySelector('#f-severity'), {
    options:     [
      { value: 'CRITICAL', label: 'CRITICAL' },
      { value: 'HIGH',     label: 'HIGH'     },
      { value: 'MEDIUM',   label: 'MEDIUM'   },
      { value: 'LOW',      label: 'LOW'      },
      { value: 'NONE',     label: 'NONE'     },
    ],
    multiple:    true,
    placeholder: 'Todas as severidades',
  });

  // ── Filter reader ─────────────────────────────────────────────────────────
  function readFilters() {
    const params = {};

    const selectedAssets = assetsSelect.getValues();
    if (selectedAssets.length) params.asset_ids = selectedAssets.join(',');

    const period = periodSelect.getValue();
    if (period) {
      params.period = period;
      if (period === 'custom') {
        const from = container.querySelector('#f-date-from')?.value;
        const to   = container.querySelector('#f-date-to')?.value;
        if (from) params.date_from = from;
        if (to)   params.date_to   = to;
      }
    }

    const selectedSev = severitySelect.getValues();
    if (selectedSev.length) params.severity = selectedSev.join(',');

    return params;
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadData() {
    container.querySelectorAll('.kpi-value').forEach(el => {
      el.classList.add('kpi-skeleton');
      el.textContent = '';
    });

    try {
      const data = await api.get('/dashboard', readFilters());
      updateKpis(container, data.kpis);

      Object.values(charts).forEach(c => c?.destroy());
      charts = {
        severity:   buildSeverityChart(Chart,   container.querySelector('#chart-severity'),   data.severity_distribution),
        assets:     buildAssetsChart(Chart,      container.querySelector('#chart-assets'),     data.cves_by_asset),
        monthly:    buildMonthlyChart(Chart,     container.querySelector('#chart-monthly'),    data.cves_by_month),
        assessment: buildAssessmentChart(Chart,  container.querySelector('#chart-assessment'), data.assessment_distribution),
        ai:         buildAiChart(Chart,          container.querySelector('#chart-ai'),         data.ai_coverage, container.querySelector('#gauge-pct')),
      };
    } catch (err) {
      if (err.status === 401) return;
      container.querySelectorAll('.kpi-value').forEach(el => {
        el.classList.remove('kpi-skeleton');
        el.textContent = '—';
      });
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  container.querySelector('#btn-apply')?.addEventListener('click', loadData);

  container.querySelector('#btn-clear')?.addEventListener('click', () => {
    [assetsSelect, periodSelect, severitySelect].forEach(s => s.reset());
    const fromEl = container.querySelector('#f-date-from');
    if (fromEl) fromEl.value = '';
    const toEl = container.querySelector('#f-date-to');
    if (toEl) toEl.value = '';
    container.querySelector('#custom-dates').style.display = 'none';
    loadData();
  });

  loadData();
}
