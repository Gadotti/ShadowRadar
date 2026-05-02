import * as api from '../api.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
  if (isNaN(d)) return val;
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const pad = n => String(n).padStart(2, '0');

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(active) {
  return active
    ? '<span class="badge badge-active">Ativo</span>'
    : '<span class="badge badge-inactive">Inativo</span>';
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

function pageNumbers(current, total) {
  if (total <= 1) return '';
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }
  return pages.map(p =>
    p === '…'
      ? '<span class="page-ellipsis">…</span>'
      : `<button class="btn btn-sm ${p === current ? 'btn-primary' : 'btn-secondary'}" data-page="${p}">${p}</button>`
  ).join('');
}

// ── HTML builders ──────────────────────────────────────────────────────────

function pageHTML(isEditor) {
  return `
    <div class="page-header">
      <h1 class="page-title">Ativos</h1>
      ${isEditor ? '<button class="btn btn-primary" id="btn-new">+ Novo Ativo</button>' : ''}
    </div>
    <div class="card mb-16">
      <div class="flex gap-8" style="flex-wrap:wrap">
        <input type="text" id="search" placeholder="Buscar por nome, tag ou descrição…" style="flex:1;min-width:180px">
        <select id="filter-active" style="width:130px">
          <option value="all">Todos</option>
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
        </select>
      </div>
    </div>
    <div id="table-area"></div>
  `;
}

function skeletonRows(cols) {
  return Array(5).fill(null).map(() =>
    `<tr>${Array(cols).fill('<td><div class="skeleton" style="height:14px;border-radius:3px"></div></td>').join('')}</tr>`
  ).join('');
}

function tableHTML(items, total, page, pageSize, isEditor) {
  const cols  = isEditor ? 8 : 7;
  const from  = Math.min((page - 1) * pageSize + 1, total);
  const to    = Math.min(page * pageSize, total);
  const pages = Math.ceil(total / pageSize);

  const rows = items.map(a => `
    <tr data-id="${a.id}" data-name="${escHtml(a.name)}">
      <td><strong>${escHtml(a.name)}</strong></td>
      <td>${a.tag ? `<code>${escHtml(a.tag)}</code>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.description || '—')}</td>
      <td><code>${escHtml(a.current_version)}</code></td>
      <td>${statusBadge(a.active)}</td>
      <td class="text-muted">${fmtDate(a.last_scan)}</td>
      <td>${a.cve_count ?? 0}</td>
      ${isEditor ? `
      <td>
        <div class="flex gap-8">
          <button class="btn btn-sm btn-secondary" data-action="edit">Editar</button>
          <button class="btn btn-sm btn-ghost" data-action="toggle">${a.active ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-sm btn-danger" data-action="delete">Excluir</button>
        </div>
      </td>` : ''}
    </tr>
  `).join('');

  const pager = total > pageSize ? `
    <div class="pagination">
      <span class="pagination-info">Mostrando ${from}–${to} de ${total} ativo${total !== 1 ? 's' : ''}</span>
      <button class="btn btn-sm btn-secondary" id="page-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
      ${pageNumbers(page, pages)}
      <button class="btn btn-sm btn-secondary" id="page-next" ${page >= pages ? 'disabled' : ''}>›</button>
    </div>` : '';

  return `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Nome</th><th>Tag</th><th>Descrição</th><th>Versão</th>
          <th>Status</th><th>Último Scan</th><th>CVEs</th>
          ${isEditor ? '<th>Ações</th>' : ''}
        </tr></thead>
        <tbody id="tbody">${rows}</tbody>
      </table>
      ${pager}
    </div>`;
}

function modalHTML(asset) {
  const isEdit = Boolean(asset);
  const v = asset || {};
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? 'Editar Ativo' : 'Novo Ativo'}</span>
        <button class="modal-close" type="button">×</button>
      </div>
      <div class="modal-body">
        <form id="modal-form" novalidate>
          <div class="grid-2">
            <div class="form-group">
              <label for="m-name">Nome *</label>
              <input type="text" id="m-name" value="${escHtml(v.name || '')}" required>
            </div>
            <div class="form-group">
              <label for="m-tag">Tag</label>
              <input type="text" id="m-tag" value="${escHtml(v.tag || '')}" placeholder="#fw-01">
            </div>
          </div>
          <div class="form-group">
            <label for="m-desc">Descrição</label>
            <textarea id="m-desc">${escHtml(v.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="m-url">URL</label>
            <input type="url" id="m-url" value="${escHtml(v.url || '')}" placeholder="https://…">
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label for="m-version">Versão Atual *</label>
              <input type="text" id="m-version" value="${escHtml(v.current_version || '')}" required>
            </div>
            <div class="form-group">
              <label for="m-cve-date">Data Inicial CVEs *</label>
              <input type="date" id="m-cve-date" value="${v.cve_start_date || ''}" max="${today}" required>
            </div>
          </div>
          <div class="form-group" style="flex-direction:row;align-items:center;gap:12px;margin-bottom:20px">
            <label style="margin:0;color:var(--color-text)">Ativo</label>
            <label class="toggle">
              <input type="checkbox" id="m-active" ${v.active !== 0 ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="modal-error" class="form-error" hidden></div>
          <div class="modal-footer" style="padding:0;border:none">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">${isEdit ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </div>
    </div>`;
}

// ── Main render ────────────────────────────────────────────────────────────

export function render(container, user) {
  const isEditor = user?.role === 'editor';
  const PAGE_SIZE = 20;
  let page   = 1;
  let search = '';
  let active = 'all';
  let items  = [];

  container.innerHTML = pageHTML(isEditor);

  const tableArea = container.querySelector('#table-area');
  const searchEl  = container.querySelector('#search');
  const filterEl  = container.querySelector('#filter-active');

  // ── Load & render table ──────────────────────────────────────────────────

  async function load() {
    // Skeleton
    const skCols = isEditor ? 8 : 7;
    tableArea.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>
        <th>Nome</th><th>Tag</th><th>Descrição</th><th>Versão</th>
        <th>Status</th><th>Último Scan</th><th>CVEs</th>
        ${isEditor ? '<th>Ações</th>' : ''}
      </tr></thead>
      <tbody>${skeletonRows(skCols)}</tbody>
    </table></div>`;

    try {
      const params = { page, page_size: PAGE_SIZE, active };
      if (search) params.search = search;
      const res = await api.get('/assets', params);
      items = res.items;

      if (!items.length) {
        renderEmpty();
        return;
      }

      tableArea.innerHTML = tableHTML(items, res.total, page, PAGE_SIZE, isEditor);
      bindTable();
      bindPager(res.total);
    } catch (err) {
      if (err.status === 401) return;
      renderError(err.message);
    }
  }

  function renderEmpty() {
    tableArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">◈</div>
        <div class="empty-state-title">Nenhum ativo encontrado</div>
        <p class="empty-state-text">${search || active !== 'all'
          ? 'Tente ajustar os filtros de busca.'
          : 'Comece adicionando o primeiro ativo.'}</p>
        ${isEditor && !search && active === 'all'
          ? '<button class="btn btn-primary mt-16" id="empty-new">+ Novo Ativo</button>' : ''}
      </div>`;
    tableArea.querySelector('#empty-new')?.addEventListener('click', () => openModal(null));
  }

  function renderError(msg) {
    tableArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Erro ao carregar ativos</div>
        <p class="empty-state-text">${escHtml(msg || 'Tente novamente.')}</p>
        <button class="btn btn-secondary mt-16" id="btn-retry">Tentar novamente</button>
      </div>`;
    tableArea.querySelector('#btn-retry')?.addEventListener('click', load);
  }

  // ── Table event delegation ───────────────────────────────────────────────

  function bindTable() {
    const tbody = tableArea.querySelector('#tbody');
    if (!tbody) return;
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const row   = btn.closest('tr');
      const id    = Number(row.dataset.id);
      const asset = items.find(a => a.id === id);

      if (btn.dataset.action === 'edit') {
        openModal(asset);

      } else if (btn.dataset.action === 'toggle') {
        btn.disabled = true;
        try {
          const updated = await api.patch(`/assets/${id}/toggle`);
          items = items.map(a => a.id === id ? { ...a, active: updated.active } : a);
          row.querySelector('.badge').outerHTML = statusBadge(updated.active);
          btn.textContent = updated.active ? 'Desativar' : 'Ativar';
        } catch (err) {
          showToast(err.message || 'Erro ao alternar status.', 'error');
        } finally {
          btn.disabled = false;
        }

      } else if (btn.dataset.action === 'delete') {
        const name = row.dataset.name;
        if (!window.confirm(`Excluir "${name}"?\nTodos os CVEs associados serão removidos.`)) return;
        btn.disabled = true;
        try {
          await api.del(`/assets/${id}`);
          await load();
        } catch (err) {
          showToast(err.message || 'Erro ao excluir.', 'error');
          btn.disabled = false;
        }
      }
    });
  }

  // ── Pagination ───────────────────────────────────────────────────────────

  function bindPager(total) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    tableArea.querySelector('#page-prev')?.addEventListener('click', () => { if (page > 1) { page--; load(); } });
    tableArea.querySelector('#page-next')?.addEventListener('click', () => { if (page < totalPages) { page++; load(); } });
    tableArea.querySelectorAll('[data-page]').forEach(b => {
      b.addEventListener('click', () => { page = Number(b.dataset.page); load(); });
    });
  }

  // ── Create / Edit modal ──────────────────────────────────────────────────

  function openModal(asset) {
    const isEdit   = Boolean(asset);
    const overlay  = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = modalHTML(asset);
    document.body.appendChild(overlay);

    const form      = overlay.querySelector('#modal-form');
    const errorEl   = overlay.querySelector('#modal-error');
    const submitBtn = overlay.querySelector('#modal-submit');

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('#modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const name    = overlay.querySelector('#m-name').value.trim();
      const tag     = overlay.querySelector('#m-tag').value.trim();
      const desc    = overlay.querySelector('#m-desc').value.trim();
      const url     = overlay.querySelector('#m-url').value.trim();
      const version = overlay.querySelector('#m-version').value.trim();
      const cveDate = overlay.querySelector('#m-cve-date').value;
      const isActive = overlay.querySelector('#m-active').checked;

      // Client-side validation
      if (!name)    { setError(errorEl, 'Nome é obrigatório.'); return; }
      if (!version) { setError(errorEl, 'Versão é obrigatória.'); return; }
      if (!cveDate) { setError(errorEl, 'Data Inicial de CVEs é obrigatória.'); return; }
      if (cveDate > new Date().toISOString().slice(0, 10)) {
        setError(errorEl, 'Data Inicial de CVEs não pode ser futura.'); return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? 'Salvando…' : 'Criando…';

      const body = {
        name,
        tag: tag || null,
        description: desc || null,
        url: url || null,
        current_version: version,
        cve_start_date: cveDate,
        active: isActive ? 1 : 0,
      };

      try {
        if (isEdit) {
          await api.put(`/assets/${asset.id}`, body);
        } else {
          await api.post('/assets', body);
        }
        close();
        page = isEdit ? page : 1;
        await load();
      } catch (err) {
        const msg = err.status === 409
          ? 'Já existe um ativo com esse nome e tag.'
          : err.message || 'Erro ao salvar.';
        setError(errorEl, msg);
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Salvar' : 'Criar';
      }
    });
  }

  function setError(el, msg) { el.textContent = msg; el.hidden = false; }

  // ── Wire up controls ─────────────────────────────────────────────────────
  searchEl.addEventListener('input', debounce(() => { page = 1; search = searchEl.value.trim(); load(); }, 300));
  filterEl.addEventListener('change', () => { page = 1; active = filterEl.value; load(); });
  container.querySelector('#btn-new')?.addEventListener('click', () => openModal(null));

  load();
}
