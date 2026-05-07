import * as api from '../api.js';

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
  if (isNaN(d)) return val;
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function showToast(msg, type = 'info') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function keysTableHTML(keys) {
  if (!keys.length) return `<p class="text-muted" style="padding:12px 0">Nenhuma API Key cadastrada.</p>`;
  const rows = keys.map(k => `
    <tr>
      <td>${k.id}</td>
      <td><strong>${escHtml(k.name)}</strong></td>
      <td class="text-muted">${fmtDate(k.created_at)}</td>
      <td class="text-muted">${fmtDate(k.last_used_at)}</td>
      <td>
        <button class="btn btn-sm btn-danger" data-revoke="${k.id}" data-name="${escHtml(k.name)}">Revogar</button>
      </td>
    </tr>`).join('');
  return `<div class="table-wrapper">
    <table>
      <thead><tr><th>#</th><th>Nome</th><th>Criada em</th><th>Último uso</th><th>Ações</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function generateModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-header">
      <span class="modal-title">Nova API Key</span>
      <button class="modal-close" type="button">×</button>
    </div>
    <div class="modal-body">
      <form id="gen-form" novalidate>
        <div class="form-group">
          <label for="key-name">Nome da chave</label>
          <input id="key-name" type="text" placeholder="Ex: CI/CD Pipeline" required>
        </div>
        <div id="gen-error" class="form-error" hidden></div>
        <div class="modal-footer" style="padding:0;border:none">
          <button type="button" class="btn btn-secondary" id="gen-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Gerar</button>
        </div>
      </form>
    </div>
  </div>`;
  return overlay;
}

function resultModal(data) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-header">
      <span class="modal-title">API Key gerada</span>
    </div>
    <div class="modal-body">
      <div class="alert-warning mb-16">${escHtml(data.warning)}</div>
      <div class="form-group">
        <label>Nome</label>
        <input type="text" value="${escHtml(data.name)}" readonly>
      </div>
      <div class="form-group">
        <label>Chave (copie agora)</label>
        <div class="flex gap-8">
          <input id="key-value" type="text" value="${escHtml(data.key)}" readonly style="font-family:monospace;flex:1">
          <button class="btn btn-secondary" id="btn-copy">Copiar</button>
        </div>
      </div>
      <div class="modal-footer" style="padding:0;border:none">
        <button type="button" class="btn btn-primary" id="btn-done">Fechar</button>
      </div>
    </div>
  </div>`;
  return overlay;
}

export async function render(container, user) {
  if (user?.role !== 'editor') {
    container.innerHTML = `<div class="page-header"><h1 class="page-title">Configurações</h1></div>
      <div class="empty-state"><div class="empty-state-icon">⛔</div>
      <div class="empty-state-title">Acesso restrito</div></div>`;
    return;
  }

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando…</div>';

  let keys = [];
  try { keys = await api.get('/settings/api-keys'); } catch {}

  function renderPage() {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Configurações — API Keys</h1>
        <button class="btn btn-primary" id="btn-generate">+ Gerar nova API Key</button>
      </div>
      <div class="card">
        <p class="text-muted mb-16" style="font-size:13px">
          API Keys permitem acesso externo aos endpoints <code>/api/v1/export</code> e <code>/api/v1/assets/sync</code>
          via header <code>X-API-Key</code>. O valor da chave é exibido <strong>uma única vez</strong> no momento da criação.
        </p>
        <div id="keys-list">${keysTableHTML(keys)}</div>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#btn-generate')?.addEventListener('click', openGenerateModal);

    container.querySelector('#keys-list')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-revoke]');
      if (!btn) return;
      const id   = Number(btn.dataset.revoke);
      const name = btn.dataset.name;
      if (!window.confirm(`Revogar a key "${name}"? Esta ação não pode ser desfeita.`)) return;
      try {
        await api.del(`/settings/api-keys/${id}`);
        keys = keys.filter(k => k.id !== id);
        container.querySelector('#keys-list').innerHTML = keysTableHTML(keys);
        showToast('API Key revogada.', 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao revogar.', 'error');
      }
    });
  }

  function openGenerateModal() {
    const overlay = generateModal();
    document.body.appendChild(overlay);

    const close = () => { document.removeEventListener('keydown', onEsc); overlay.remove(); };
    const onEsc = e => { if (e.key === 'Escape') close(); };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('#gen-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);

    overlay.querySelector('#gen-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl  = overlay.querySelector('#gen-error');
      const submit = overlay.querySelector('button[type="submit"]');
      const name   = overlay.querySelector('#key-name').value.trim();
      if (!name) {
        errEl.textContent = 'Nome é obrigatório.';
        errEl.hidden = false;
        return;
      }
      errEl.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Gerando…';
      try {
        const data = await api.post('/settings/api-keys', { name });
        close();
        openResultModal(data);
        keys = await api.get('/settings/api-keys');
        const listEl = container.querySelector('#keys-list');
        if (listEl) listEl.innerHTML = keysTableHTML(keys);
      } catch (err) {
        errEl.textContent = err.message || 'Erro ao gerar.';
        errEl.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Gerar';
      }
    });
  }

  function openResultModal(data) {
    const overlay = resultModal(data);
    document.body.appendChild(overlay);
    const close = () => { document.removeEventListener('keydown', onEsc); overlay.remove(); };
    const onEsc = e => { if (e.key === 'Escape') close(); };
    overlay.querySelector('#btn-done').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);
    overlay.querySelector('#btn-copy').addEventListener('click', () => {
      const input = overlay.querySelector('#key-value');
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => {
        showToast('Chave copiada!', 'success');
      }).catch(() => {
        document.execCommand('copy');
        showToast('Chave copiada!', 'success');
      });
    });
  }

  renderPage();
}
