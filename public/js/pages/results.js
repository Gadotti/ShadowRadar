import * as api from '../api.js';
import { initCustomSelect } from '../components/custom-select.js';

// ── Constants ──────────────────────────────────────────────────────────────

const SEV_CLASS = { CRITICAL:'badge-critical', HIGH:'badge-high', MEDIUM:'badge-medium', LOW:'badge-low', NONE:'badge-none' };
const ASSESS_CLASS = {
  'Acknowledge/Mitigating':'badge-acknowledge',
  'Accepted Risk':'badge-accepted',
  'Not Affected':'badge-not-affected',
  'False Positive':'badge-false-positive',
};
const ASSESSMENT_OPTS = ['Acknowledge/Mitigating', 'Accepted Risk', 'Not Affected', 'False Positive'];
const SEVERITIES      = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

// ── Helpers ────────────────────────────────────────────────────────────────

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function escHtml(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function pad(n) { return String(n).padStart(2,'0'); }
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : val.replace(' ','T'));
  if (isNaN(d)) return val;
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function showToast(msg, type='info') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function severityBadge(s) { return `<span class="badge ${SEV_CLASS[s]||'badge-none'}">${s||'NONE'}</span>`; }
function assessmentBadge(a) {
  if (!a) return '<span class="badge badge-pending">Pending</span>';
  return `<span class="badge ${ASSESS_CLASS[a]||'badge-none'}">${escHtml(a)}</span>`;
}
function pageNums(cur, total) {
  if (total <= 1) return '';
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i===1||i===total||Math.abs(i-cur)<=1) pages.push(i);
    else if (pages[pages.length-1]!=='…') pages.push('…');
  }
  return pages.map(p => p==='…'
    ? '<span class="page-ellipsis">…</span>'
    : `<button class="btn btn-sm ${p===cur?'btn-primary':'btn-secondary'}" data-page="${p}">${p}</button>`
  ).join('');
}
function buildParams(filters, listState) {
  const p = {};
  if (filters.search)           p.search = filters.search;
  if (filters.asset_id)         p.asset_id = filters.asset_id;
  if (filters.severity.length)  p.severity = filters.severity.join(',');
  if (filters.user_assessment.length) p.user_assessment = filters.user_assessment.join(',');
  if (filters.has_ai_assessment) p.has_ai_assessment = filters.has_ai_assessment;
  if (filters.published_after)  p.published_after = filters.published_after;
  if (filters.published_before) p.published_before = filters.published_before;
  if (filters.active_assets_only) p.active_assets_only = filters.active_assets_only;
  if (listState) Object.assign(p, { page: listState.page, page_size: listState.page_size, order_by: listState.order_by, order_dir: listState.order_dir });
  return p;
}
function scanIndicatorHTML(lastScan) {
  if (!lastScan) return '<span class="scan-indicator lsi-gray">⚠ Nunca escaneado</span>';
  const d = new Date(lastScan.includes('T') ? lastScan : lastScan.replace(' ','T'));
  const days = (Date.now() - d) / 86400000;
  const cls = days <= 7 ? 'lsi-green' : 'lsi-yellow';
  return `<span class="scan-indicator ${cls}">Último scan: ${fmtDate(lastScan)}</span>`;
}

// ── HTML builders ──────────────────────────────────────────────────────────

function pageHTML() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Resultados CVE</h1>
        <div id="scan-indicator" style="margin-top:6px"></div>
      </div>
      <div class="flex gap-8">
        <button class="btn" data-view="list">≡ Lista</button>
        <button class="btn" data-view="macro">⊞ Macro</button>
      </div>
    </div>

    <div class="card mb-16">
      <div class="filter-row mb-16">
        <input type="text" id="f-search" placeholder="Buscar CVE ID ou descrição…" style="flex:1;min-width:160px">
        <div class="custom-select-wrapper" id="f-asset" style="width:180px"></div>
        <div class="custom-select-wrapper" id="f-ai" style="width:150px"></div>
        <div class="custom-select-wrapper" id="f-active" style="width:130px"></div>
        <input type="date" id="f-after" title="Publicado após" style="width:140px">
        <input type="date" id="f-before" title="Publicado até" style="width:140px">
        <button class="btn btn-secondary btn-sm" id="clear-filters">Limpar</button>
      </div>
      <div class="filter-row" style="flex-wrap:wrap;gap:12px 20px">
        <div class="flex items-center gap-8">
          <span class="filter-label">Severidade:</span>
          <div class="chip-group">
            ${SEVERITIES.map(s=>`<label class="chip chip-${s.toLowerCase()}"><input type="checkbox" class="sev-check" value="${s}"> ${s}</label>`).join('')}
          </div>
        </div>
        <div class="flex items-center gap-8" style="flex-wrap:wrap">
          <span class="filter-label">Avaliação:</span>
          <div class="chip-group" style="flex-wrap:wrap">
            <label class="chip"><input type="checkbox" class="ass-check" value="PENDING"> Pending</label>
            ${ASSESSMENT_OPTS.map(a=>`<label class="chip"><input type="checkbox" class="ass-check" value="${a}"> ${a}</label>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div id="content-area"></div>`;
}

function skeletonHTML(cols) {
  return `<div class="table-wrapper"><table><thead><tr>${Array(cols).fill('<th> </th>').join('')}</tr></thead>
    <tbody>${Array(6).fill(`<tr>${Array(cols).fill('<td><div class="skeleton" style="height:14px;border-radius:3px"></div></td>').join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function errorHTML(msg) {
  return `<div class="empty-state">
    <div class="empty-state-icon">⚠</div>
    <div class="empty-state-title">Erro ao carregar CVEs</div>
    <p class="empty-state-text">${escHtml(msg||'Tente novamente.')}</p>
    <button class="btn btn-secondary mt-16" id="btn-retry">Tentar novamente</button>
  </div>`;
}

function listTableHTML(items, total, { page, page_size, order_by, order_dir }, isEditor) {
  if (!items.length) return `<div class="empty-state">
    <div class="empty-state-icon">⚑</div>
    <div class="empty-state-title">Nenhum CVE encontrado</div>
    <p class="empty-state-text">Ajuste os filtros ou execute um scan com ativos configurados.</p>
  </div>`;

  function th(label, col) {
    const arrow = order_by===col ? (order_dir==='DESC'?' ↓':' ↑') : '';
    return `<th data-sort="${col}" class="sortable">${label}${arrow}</th>`;
  }

  const from = Math.min((page-1)*page_size+1, total), to = Math.min(page*page_size, total);
  const totalPages = Math.ceil(total/page_size);

  const rows = items.map(c => `
    <tr data-id="${c.id}">
      <td><code style="font-size:11px">${escHtml(c.cve_id)}</code></td>
      <td>
        <div style="font-weight:500">${escHtml(c.asset_name)}</div>
        <div class="text-muted text-sm">${c.asset_tag?escHtml(c.asset_tag)+' · ':''} v${escHtml(c.asset_version)}</div>
      </td>
      <td class="text-muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(c.description||'')}">
        ${escHtml((c.description||'—').slice(0,70))}${(c.description||'').length>70?'…':''}
      </td>
      <td>${severityBadge(c.severity)}</td>
      <td>${c.cvss_score!=null?c.cvss_score.toFixed(1):'—'}</td>
      <td class="text-muted">${c.published_at?c.published_at.slice(0,10):'—'}</td>
      <td class="assessment-badge${isEditor ? ' assessment-editable' : ''}"${isEditor ? ` data-action="inline-assess"` : ''}>${assessmentBadge(c.user_assessment)}</td>
      <td style="text-align:center">${c.ai_assessment?'<span style="color:var(--color-success)" title="Com avaliação AI">✓</span>':'<span class="text-muted">—</span>'}</td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn-sm btn-ghost" data-action="detail" title="Detalhes">⊙</button>
          ${isEditor?`<button class="btn btn-sm btn-secondary" data-action="assess" title="Avaliar">✎</button>
          <button class="btn btn-sm btn-ghost" data-action="ai" title="Reprocessar AI">✦</button>`:''}
        </div>
      </td>
    </tr>`).join('');

  const pager = total>page_size ? `<div class="pagination">
    <span class="pagination-info">Mostrando ${from}–${to} de ${total} CVEs</span>
    <button class="btn btn-sm btn-secondary" id="page-prev" ${page<=1?'disabled':''}>‹</button>
    ${pageNums(page, totalPages)}
    <button class="btn btn-sm btn-secondary" id="page-next" ${page>=totalPages?'disabled':''}>›</button>
  </div>` : '';

  return `<div class="table-wrapper" data-total="${total}">
    <table>
      <thead><tr>
        ${th('CVE ID','cve_id')} ${th('Ativo','asset_name')} <th>Descrição</th>
        ${th('Severidade','severity')} ${th('CVSS','cvss_score')} ${th('Publicado','published_at')}
        ${th('Avaliação','user_assessment')} <th>AI</th> <th>Ações</th>
      </tr></thead>
      <tbody id="cve-tbody">${rows}</tbody>
    </table>
    ${pager}
  </div>`;
}

function macroTableHTML(rows) {
  if (!rows.length) return `<div class="empty-state">
    <div class="empty-state-icon">⊞</div>
    <div class="empty-state-title">Nenhum ativo com CVEs</div>
    <p class="empty-state-text">Execute um scan para popular os dados.</p>
  </div>`;

  const trs = rows.map(r => `<tr>
    <td>
      <div style="font-weight:500">${escHtml(r.asset_name)}</div>
      <div class="text-muted text-sm">${r.asset_tag?escHtml(r.asset_tag)+' · ':''} v${escHtml(r.asset_version)}</div>
    </td>
    <td>${r.total}</td>
    <td>${r.critical>0?`<span class="badge badge-critical">${r.critical}</span>`:'<span class="text-muted">0</span>'}</td>
    <td>${r.high>0?`<span class="badge badge-high">${r.high}</span>`:'<span class="text-muted">0</span>'}</td>
    <td>${r.medium>0?`<span class="badge badge-medium">${r.medium}</span>`:'<span class="text-muted">0</span>'}</td>
    <td>${r.low>0?`<span class="badge badge-low">${r.low}</span>`:'<span class="text-muted">0</span>'}</td>
    <td>${r.pending}</td>
    <td><span class="badge badge-${r.risk.toLowerCase()}">${r.risk}</span></td>
    <td class="text-muted" style="font-size:12px">${escHtml(r.alert)}</td>
    <td class="text-muted">${fmtDate(r.last_scan)}</td>
  </tr>`).join('');

  return `<div class="table-wrapper"><table>
    <thead><tr>
      <th>Ativo</th><th>Total</th><th>Crítico</th><th>Alto</th><th>Médio</th>
      <th>Baixo</th><th>Pendentes</th><th>Risco</th><th>Alerta</th><th>Último Scan</th>
    </tr></thead>
    <tbody>${trs}</tbody>
  </table></div>`;
}

function detailHTML(cve) {
  return `
    <div class="detail-header">
      <a href="https://nvd.nist.gov/vuln/detail/${escHtml(cve.cve_id)}" target="_blank" rel="noopener" class="detail-cve-id">${escHtml(cve.cve_id)} ↗</a>
      <button class="modal-close detail-close">×</button>
    </div>
    <div class="detail-body">
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Ativo</span><span class="info-value">${escHtml(cve.asset_name)}${cve.asset_tag?' '+escHtml(cve.asset_tag):''} · v${escHtml(cve.asset_version)}</span></div>
        <div class="info-row"><span class="info-label">Severidade</span><span class="info-value">${severityBadge(cve.severity)} <strong>${cve.cvss_score!=null?cve.cvss_score.toFixed(1):''}</strong></span></div>
        <div class="info-row"><span class="info-label">Publicado</span><span class="info-value">${cve.published_at?.slice(0,10)||'—'}</span></div>
        <div class="info-row"><span class="info-label">Último Scan</span><span class="info-value">${fmtDate(cve.scanned_at)}</span></div>
        <div class="info-row"><span class="info-label">Avaliação</span><span class="info-value">${assessmentBadge(cve.user_assessment)}</span></div>
        ${cve.evaluated_at?`<div class="info-row"><span class="info-label">Avaliado em</span><span class="info-value">${fmtDate(cve.evaluated_at)}</span></div>`:''}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Descrição</div>
        <div class="detail-text">${escHtml(cve.description||'—')}</div>
      </div>
      ${cve.user_notes?`<div class="detail-section">
        <div class="detail-section-title">Observações do analista</div>
        <div class="detail-text">${escHtml(cve.user_notes)}</div>
      </div>`:''}
      ${cve.ai_assessment?`<div class="detail-section">
        <div class="detail-section-title">Avaliação AI</div>
        <textarea class="detail-textarea" readonly>${escHtml(cve.ai_assessment)}</textarea>
      </div>`:''}
    </div>`;
}

function assessModalHTML(cve) {
  return `<div class="modal">
    <div class="modal-header">
      <span class="modal-title">Avaliar ${escHtml(cve.cve_id)}</span>
      <button class="modal-close" type="button">×</button>
    </div>
    <div class="modal-body">
      <form id="assess-form" novalidate>
        <div class="form-group">
          <label>Avaliação</label>
          <div class="custom-select-wrapper" id="assess-val"></div>
        </div>
        <div class="form-group">
          <label for="assess-notes">Observações</label>
          <textarea id="assess-notes" rows="4">${escHtml(cve.user_notes||'')}</textarea>
        </div>
        <div id="assess-error" class="form-error" hidden></div>
        <div class="modal-footer" style="padding:0;border:none">
          <button type="button" class="btn btn-secondary" id="assess-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="assess-submit">Salvar</button>
        </div>
      </form>
    </div>
  </div>`;
}

// ── Main render ────────────────────────────────────────────────────────────

export async function render(container, user) {
  const isEditor = user?.role === 'editor';

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando…</div>';

  let allAssets = [];
  try { allAssets = (await api.get('/assets', { page_size: '100' })).items; } catch {}

  container.innerHTML = pageHTML();

  const assetSelect = initCustomSelect(container.querySelector('#f-asset'), {
    options:  [{ value: '', label: 'Todos os ativos' }, ...allAssets.map(a => ({ value: String(a.id), label: a.name + (a.tag ? ' ' + a.tag : '') }))],
    value:    '',
    onChange: v => { filters.asset_id = v; load(); },
  });
  const aiSelect = initCustomSelect(container.querySelector('#f-ai'), {
    options:  [{ value: '', label: 'Com/sem AI' }, { value: 'true', label: 'Com avaliação AI' }, { value: 'false', label: 'Sem avaliação AI' }],
    value:    '',
    onChange: v => { filters.has_ai_assessment = v; load(); },
  });
  const activeSelect = initCustomSelect(container.querySelector('#f-active'), {
    options:  [{ value: '', label: 'Ativos/Inativos' }, { value: 'true', label: 'Somente ativos' }],
    value:    '',
    onChange: v => { filters.active_assets_only = v; load(); },
  });

  // Lifecycle marker — removed when navigate() clears content.innerHTML
  const marker = document.createElement('div');
  marker.style.display = 'none';
  container.appendChild(marker);
  const isAlive = () => document.body.contains(marker);

  // ── State ────────────────────────────────────────────────────────────────
  let view = localStorage.getItem('results_view') || 'list';
  const filters = { search:'', asset_id:'', severity:[], user_assessment:[], has_ai_assessment:'', published_after:'', published_before:'', active_assets_only:'' };
  const listState = { page:1, page_size:50, order_by:'cvss_score', order_dir:'DESC' };
  let listItems = [];

  const contentArea  = container.querySelector('#content-area');
  const scanEl       = container.querySelector('#scan-indicator');

  // ── Load ─────────────────────────────────────────────────────────────────
  async function loadList() {
    contentArea.innerHTML = skeletonHTML(9);
    try {
      const res = await api.get('/cves', buildParams(filters, listState));
      if (!isAlive()) return;
      listItems = res.items;
      if (scanEl) scanEl.innerHTML = scanIndicatorHTML(res.last_scan);
      contentArea.innerHTML = listTableHTML(res.items, res.total, listState, isEditor);
      bindListEvents();
    } catch (err) {
      if (err.status === 401 || !isAlive()) return;
      contentArea.innerHTML = errorHTML(err.message);
      contentArea.querySelector('#btn-retry')?.addEventListener('click', loadList);
    }
  }

  async function loadMacro() {
    contentArea.innerHTML = skeletonHTML(10);
    try {
      const params = {};
      if (filters.asset_id) params.asset_id = filters.asset_id;
      if (filters.active_assets_only) params.active_assets_only = filters.active_assets_only;
      const rows = await api.get('/cves/macro', params);
      if (!isAlive()) return;
      contentArea.innerHTML = macroTableHTML(rows);
    } catch (err) {
      if (err.status === 401 || !isAlive()) return;
      contentArea.innerHTML = errorHTML(err.message);
      contentArea.querySelector('#btn-retry')?.addEventListener('click', loadMacro);
    }
  }

  function load() { listState.page = 1; view === 'list' ? loadList() : loadMacro(); }

  // ── List events ───────────────────────────────────────────────────────────
  function bindListEvents() {
    // Sortable headers
    contentArea.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        listState.order_dir = listState.order_by === col && listState.order_dir === 'DESC' ? 'ASC' : 'DESC';
        listState.order_by = col;
        loadList();
      });
    });

    // Pagination
    const total = parseInt(contentArea.querySelector('.table-wrapper')?.dataset.total || '0');
    const totalPages = Math.ceil(total / listState.page_size);
    contentArea.querySelector('#page-prev')?.addEventListener('click', () => { if (listState.page>1) { listState.page--; loadList(); } });
    contentArea.querySelector('#page-next')?.addEventListener('click', () => { if (listState.page<totalPages) { listState.page++; loadList(); } });
    contentArea.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => { listState.page = Number(b.dataset.page); loadList(); }));

    // Row actions
    contentArea.querySelector('#cve-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const row = btn.closest('tr');
      const cve = listItems.find(c => c.id === Number(row?.dataset.id));
      if (!cve) return;
      const action = btn.dataset.action;
      if (action === 'detail') openDetail(cve);
      else if (action === 'assess') openAssessModal(cve);
      else if (action === 'inline-assess') inlineAssess(cve, btn);
      else if (action === 'ai') showToast('Execute um scan com AI habilitado para reprocessar este CVE.', 'info');
    });
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  let detailPanel = null, detailOverlay = null;

  function openDetail(cve) {
    if (!detailPanel) {
      detailOverlay = Object.assign(document.createElement('div'), { className: 'detail-overlay' });
      detailPanel   = Object.assign(document.createElement('div'), { className: 'detail-panel' });
      container.appendChild(detailOverlay);
      container.appendChild(detailPanel);
      detailOverlay.addEventListener('click', closeDetail);
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && detailPanel?.classList.contains('open') && !document.querySelector('.modal-overlay')) closeDetail();
      });
    }
    detailPanel.innerHTML = detailHTML(cve);
    detailPanel.querySelector('.detail-close')?.addEventListener('click', closeDetail);
    requestAnimationFrame(() => { detailOverlay.classList.add('open'); detailPanel.classList.add('open'); });
  }

  function closeDetail() {
    detailOverlay?.classList.remove('open');
    detailPanel?.classList.remove('open');
  }

  // ── Assessment modal ──────────────────────────────────────────────────────
  function openAssessModal(cve) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = assessModalHTML(cve);
    document.body.appendChild(overlay);

    const assessSelect = initCustomSelect(overlay.querySelector('#assess-val'), {
      options:     [{ value: '', label: '— sem avaliação —' }, ...ASSESSMENT_OPTS.map(o => ({ value: o, label: o }))],
      value:       cve.user_assessment || '',
      placeholder: '— sem avaliação —',
    });

    const close = () => { assessSelect.destroy(); document.removeEventListener('keydown', onEsc); overlay.remove(); };
    const onEsc = e => { if (e.key === 'Escape') close(); };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('#assess-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);

    overlay.querySelector('#assess-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = overlay.querySelector('#assess-error');
      const submitBtn = overlay.querySelector('#assess-submit');
      errEl.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando…';

      try {
        const updated = await api.put(`/cves/${cve.id}/assessment`, {
          user_assessment: assessSelect.getValue() || null,
          user_notes: overlay.querySelector('#assess-notes').value.trim() || null,
        });
        const idx = listItems.findIndex(c => c.id === cve.id);
        if (idx !== -1) {
          Object.assign(listItems[idx], updated);
          const badgeCell = contentArea.querySelector(`tr[data-id="${cve.id}"] .assessment-badge`);
          if (badgeCell) badgeCell.innerHTML = assessmentBadge(updated.user_assessment);
          if (detailPanel?.classList.contains('open')) openDetail(listItems[idx]);
        }
        showToast('Avaliação salva.', 'success');
        close();
      } catch (err) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar';
      }
    });
  }

  // ── Inline assessment ─────────────────────────────────────────────────────
  function inlineAssess(cve, cell) {
    if (cell.dataset.assessing) return;
    cell.dataset.assessing = '1';
    const original = cell.innerHTML;

    // Portal: render outside the table so the dropdown is never clipped by
    // the table wrapper's overflow. Position fixed over the cell.
    const rect = cell.getBoundingClientRect();
    const width = Math.max(rect.width, 180);
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper assessment-inline-select';
    wrapper.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${width}px;z-index:300`;
    cell.innerHTML = '<span class="text-muted" style="font-size:11px">…</span>';
    document.body.appendChild(wrapper);

    let settled = false;
    let ctrl;

    function cleanup() {
      wrapper.remove();
      delete cell.dataset.assessing;
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('click', onClickOutside);
    }

    function cancel() {
      if (settled) return;
      settled = true;
      ctrl.destroy();
      cell.innerHTML = original;
      cleanup();
    }

    async function save(v) {
      if (settled) return;
      settled = true;
      ctrl.destroy();
      cleanup();
      cell.innerHTML = '<span class="text-muted" style="font-size:11px">Salvando…</span>';
      try {
        const updated = await api.put(`/cves/${cve.id}/assessment`, {
          user_assessment: v || null,
          user_notes: cve.user_notes || null,
        });
        const idx = listItems.findIndex(c => c.id === cve.id);
        if (idx !== -1) Object.assign(listItems[idx], updated);
        cell.innerHTML = assessmentBadge(updated.user_assessment);
        if (detailPanel?.classList.contains('open')) openDetail(listItems.find(c => c.id === cve.id) || cve);
        showToast('Avaliação salva.', 'success');
      } catch (err) {
        cell.innerHTML = original;
        showToast(err.message || 'Erro ao salvar.', 'error');
      }
    }

    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      cancel();
    };
    document.addEventListener('keydown', onEsc);

    const onClickOutside = (e) => { if (!wrapper.contains(e.target)) cancel(); };
    setTimeout(() => document.addEventListener('click', onClickOutside), 0);

    ctrl = initCustomSelect(wrapper, {
      options: [
        { value: '', label: '— Pending —' },
        ...ASSESSMENT_OPTS.map(o => ({ value: o, label: o })),
      ],
      value: cve.user_assessment || '',
      onChange: (v) => {
        if ((v || null) === (cve.user_assessment || null)) { cancel(); return; }
        save(v);
      },
    });

    requestAnimationFrame(() => wrapper.querySelector('.custom-select-trigger')?.click());
  }

  // ── Filter bindings ───────────────────────────────────────────────────────
  const debouncedLoad = debounce(load, 300);

  container.querySelector('#f-search')?.addEventListener('input', e => { filters.search = e.target.value.trim(); debouncedLoad(); });
  container.querySelector('#f-search')?.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !e.target.value) return;
    e.stopPropagation();
    e.target.value = '';
    filters.search = '';
    load();
  });
  container.querySelector('#f-after')?.addEventListener('change', e => { filters.published_after = e.target.value; load(); });
  container.querySelector('#f-before')?.addEventListener('change', e => { filters.published_before = e.target.value; load(); });

  container.querySelectorAll('.sev-check').forEach(cb => cb.addEventListener('change', () => {
    filters.severity = [...container.querySelectorAll('.sev-check:checked')].map(c => c.value); load();
  }));
  container.querySelectorAll('.ass-check').forEach(cb => cb.addEventListener('change', () => {
    filters.user_assessment = [...container.querySelectorAll('.ass-check:checked')].map(c => c.value); load();
  }));

  container.querySelector('#clear-filters')?.addEventListener('click', () => {
    Object.assign(filters, { search:'', asset_id:'', severity:[], user_assessment:[], has_ai_assessment:'', published_after:'', published_before:'', active_assets_only:'' });
    ['#f-search','#f-after','#f-before'].forEach(s => { const el = container.querySelector(s); if(el) el.value=''; });
    [assetSelect, aiSelect, activeSelect].forEach(s => s.reset());
    container.querySelectorAll('.sev-check,.ass-check').forEach(c => c.checked = false);
    load();
  });

  // ── View toggle ───────────────────────────────────────────────────────────
  function syncToggle() {
    container.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('btn-primary',   b.dataset.view === view);
      b.classList.toggle('btn-secondary', b.dataset.view !== view);
    });
  }

  container.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    view = btn.dataset.view;
    localStorage.setItem('results_view', view);
    syncToggle();
    load();
  }));

  syncToggle();
  load();
}
