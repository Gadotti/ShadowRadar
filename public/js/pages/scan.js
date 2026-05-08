import * as api from '../api.js';
import { initCustomSelect } from '../components/custom-select.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
  if (isNaN(d)) return val;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(secs) {
  if (secs == null) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function statusBadge(status) {
  const cls = { completed: 'badge-active', failed: 'badge-critical', running: 'badge-low' };
  return `<span class="badge ${cls[status] || 'badge-none'}">${status}</span>`;
}

function showToast(message, type = 'info') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── HTML builders ──────────────────────────────────────────────────────────

function historyTableHTML(runs) {
  if (!runs.length) {
    return '<div class="empty-state" style="padding:32px"><div class="empty-state-text">Nenhum scan executado ainda.</div></div>';
  }
  const rows = runs.map(r => `
    <tr>
      <td>${fmtDate(r.started_at)}</td>
      <td>${fmtDuration(r.duration_seconds)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.assets_scanned ?? 0}</td>
      <td>${r.cves_found ?? 0}</td>
      <td class="text-muted" title="${escHtml(r.error_message || '')}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${r.error_message ? escHtml(r.error_message.slice(0, 60)) + (r.error_message.length > 60 ? '…' : '') : '—'}
      </td>
    </tr>`).join('');
  return `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Data/Hora</th><th>Duração</th><th>Status</th>
          <th>Ativos</th><th>CVEs</th><th>Erro</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function idlePanel() {
  return `
    <div class="flex items-center gap-8" style="flex-wrap:wrap">
      <button class="btn btn-primary" id="run-btn">▶ Executar Scan</button>
    </div>`;
}

function runningPanel(run) {
  const assets = run?.assets_scanned ?? 0;
  const cves   = run?.cves_found ?? 0;
  return `
    <div class="flex items-center gap-8 mb-16">
      <div class="spinner"></div>
      <span style="font-weight:500">Scan em andamento…</span>
    </div>
    <div class="scan-counters mb-16">
      Ativos processados: <strong id="prog-assets">${assets}</strong>
      &nbsp;|&nbsp; CVEs encontrados: <strong id="prog-cves">${cves}</strong>
    </div>
    <button class="btn btn-danger" id="cancel-btn">✕ Cancelar</button>`;
}

function resultPanel(run) {
  const failed = run?.status === 'failed';
  return `
    <div class="kpi-grid" style="max-width:480px">
      <div class="kpi-card">
        <div class="kpi-label">Ativos escaneados</div>
        <div class="kpi-value">${run?.assets_scanned ?? 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CVEs encontrados</div>
        <div class="kpi-value">${run?.cves_found ?? 0}</div>
      </div>
    </div>
    ${failed && run?.error_message ? `
      <div class="alert-warning mt-16" style="border-color:rgba(248,81,73,0.35);background:rgba(248,81,73,0.08);color:var(--color-danger)">
        <strong>Scan falhou:</strong> ${escHtml(run.error_message)}
      </div>` : ''}
    <button class="btn btn-primary mt-16" id="run-again-btn">▶ Executar Novamente</button>`;
}

// ── Main render ────────────────────────────────────────────────────────────

export async function render(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando…</div>';

  let status, assetsRes;
  try {
    [status, assetsRes] = await Promise.all([
      api.get('/scan/status'),
      api.get('/assets', { active: '1', page_size: '100' }),
    ]);
  } catch (err) {
    if (err.status === 401) return;
    container.innerHTML = `
      <div class="page-header"><h1 class="page-title">Executar Scan</h1></div>
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Erro ao carregar</div>
        <p class="empty-state-text">${escHtml(err.message || '')}</p>
      </div>`;
    return;
  }

  const activeAssets = assetsRes.items || [];

  container.innerHTML = `
    <div class="page-header"><h1 class="page-title">Executar Scan</h1></div>

    <div class="card mb-16">
      <div class="card-header"><span class="card-title">Configuração</span></div>
      <div style="max-width:520px">
        <div class="form-group">
          <label>Caminho do script</label>
          <input type="text" value="${escHtml(status.script_path || './scripts/scan.py')}" readonly style="opacity:0.7;cursor:default">
        </div>
        <div class="form-group">
          <label>Escopo</label>
          <div class="flex gap-16" style="margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;color:var(--color-text);font-weight:normal">
              <input type="radio" name="scope" value="all" checked> Todos os ativos ativos
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--color-text);font-weight:normal">
              <input type="radio" name="scope" value="specific"> Ativo específico
            </label>
          </div>
        </div>
        <div class="form-group" id="asset-select-group" style="display:none">
          <label>Ativo</label>
          <div class="custom-select-wrapper" id="asset-select"></div>
        </div>
      </div>
    </div>

    <div class="card mb-16" id="exec-panel">
      <div class="card-header"><span class="card-title">Execução</span></div>
      <div id="exec-body"></div>
    </div>

    <div class="card" id="history-panel">
      <div class="card-header"><span class="card-title">Histórico de Scans</span></div>
      <div id="history-body"><div class="loading-state" style="padding:32px"><div class="spinner"></div></div></div>
    </div>
  `;

  // Polling cleanup marker
  const marker = document.createElement('div');
  marker.style.display = 'none';
  container.appendChild(marker);
  const isAlive = () => document.body.contains(marker);

  let pollInterval = null;

  const execBody    = container.querySelector('#exec-body');
  const historyBody = container.querySelector('#history-body');

  const assetSelectCtrl = initCustomSelect(container.querySelector('#asset-select'), {
    options:     activeAssets.map(a => ({ value: String(a.id), label: a.name + (a.tag ? ' ' + a.tag : '') })),
    value:       String(activeAssets[0]?.id ?? ''),
    placeholder: 'Nenhum ativo disponível',
  });

  // ── Scope radio toggle ──────────────────────────────────────────────────
  container.querySelectorAll('input[name="scope"]').forEach(radio => {
    radio.addEventListener('change', () => {
      container.querySelector('#asset-select-group').style.display =
        radio.value === 'specific' ? '' : 'none';
    });
  });

  // ── Render states ───────────────────────────────────────────────────────

  function showIdle() {
    execBody.innerHTML = idlePanel();
    container.querySelector('#run-btn').addEventListener('click', onRun);
  }

  function showRunning(run) {
    execBody.innerHTML = runningPanel(run);
    container.querySelector('#cancel-btn').addEventListener('click', onCancel);
  }

  function showResult(run) {
    execBody.innerHTML = resultPanel(run);
    container.querySelector('#run-again-btn')?.addEventListener('click', onRunAgain);
  }

  function updateCounters(run) {
    const pa = container.querySelector('#prog-assets');
    const pc = container.querySelector('#prog-cves');
    if (pa) pa.textContent = run?.assets_scanned ?? 0;
    if (pc) pc.textContent = run?.cves_found ?? 0;
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      if (!isAlive()) { clearInterval(pollInterval); pollInterval = null; return; }
      try {
        const s = await api.get('/scan/status');
        if (s.running) {
          updateCounters(s.current_run);
        } else {
          clearInterval(pollInterval); pollInterval = null;
          const lastRun = s.current_run || await getLastRun();
          showResult(lastRun);
          loadHistory();
        }
      } catch { /* network hiccup — retry next tick */ }
    }, 3000);
  }

  async function getLastRun() {
    try {
      const h = await api.get('/scan/history');
      return h.runs?.[0] || null;
    } catch { return null; }
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function onRun() {
    const scope   = container.querySelector('input[name="scope"]:checked')?.value;
    const assetId = scope === 'specific' ? assetSelectCtrl.getValue() : undefined;

    const runBtn = container.querySelector('#run-btn');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Iniciando…'; }

    try {
      await api.post('/scan/run', assetId ? { asset_id: Number(assetId) } : {});
      const s = await api.get('/scan/status');
      showRunning(s.current_run);
      startPolling();
    } catch (err) {
      showToast(err.message || 'Erro ao iniciar scan.', 'error');
      showIdle();
    }
  }

  async function onCancel() {
    const btn = container.querySelector('#cancel-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelando…'; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    try {
      await api.post('/scan/cancel');
      showToast('Scan cancelado.', 'info');
    } catch (err) {
      showToast(err.message || 'Erro ao cancelar.', 'error');
    }
    const lastRun = await getLastRun();
    showResult(lastRun);
    loadHistory();
  }

  function onRunAgain() { showIdle(); }

  // ── History ──────────────────────────────────────────────────────────────

  async function loadHistory() {
    try {
      const h = await api.get('/scan/history');
      historyBody.innerHTML = historyTableHTML(h.runs || []);
    } catch {
      historyBody.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-state-text">Erro ao carregar histórico.</div></div>';
    }
  }

  // ── Initial state ────────────────────────────────────────────────────────

  if (status.running) {
    showRunning(status.current_run);
    startPolling();
  } else {
    showIdle();
  }

  loadHistory();
}
