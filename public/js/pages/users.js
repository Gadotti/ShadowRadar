import * as api from '../api.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
  if (isNaN(d)) return val;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function roleBadge(role) {
  return role === 'editor'
    ? '<span class="badge badge-active">Editor</span>'
    : '<span class="badge badge-inactive">Leitor</span>';
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

// ── HTML builders ──────────────────────────────────────────────────────────

function pageHTML() {
  return `
    <div class="page-header">
      <h1 class="page-title">Usuários</h1>
    </div>
    <div id="table-area"></div>
  `;
}

function skeletonRows() {
  return Array(4).fill(null).map(() =>
    `<tr>${Array(5).fill('<td><div class="skeleton" style="height:14px;border-radius:3px"></div></td>').join('')}</tr>`
  ).join('');
}

function tableHTML(users, currentUserId, isEditor) {
  const cols = isEditor ? 5 : 4;

  const rows = users.map(u => `
    <tr data-id="${u.id}" data-username="${escHtml(u.username)}">
      <td><strong>${escHtml(u.name)}</strong></td>
      <td><code>${escHtml(u.username)}</code></td>
      <td>${roleBadge(u.role)}</td>
      <td class="text-muted">${fmtDate(u.created_at)}</td>
      ${isEditor ? `
      <td>
        ${u.id !== currentUserId
          ? `<button class="btn btn-sm btn-danger" data-action="delete">Excluir</button>`
          : '<span class="text-muted" style="font-size:.8em">Conta atual</span>'}
      </td>` : ''}
    </tr>
  `).join('');

  return `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Nome</th>
          <th>Usuário</th>
          <th>Perfil</th>
          <th>Criado em</th>
          ${isEditor ? '<th>Ações</th>' : ''}
        </tr></thead>
        <tbody id="tbody">${rows}</tbody>
      </table>
    </div>`;
}

// ── Main render ────────────────────────────────────────────────────────────

export async function render(container, user) {
  const isEditor = user?.role === 'editor';

  container.innerHTML = pageHTML();
  const tableArea = container.querySelector('#table-area');

  let users = [];

  async function load() {
    tableArea.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>
        <th>Nome</th><th>Usuário</th><th>Perfil</th><th>Criado em</th>
        ${isEditor ? '<th>Ações</th>' : ''}
      </tr></thead>
      <tbody>${skeletonRows()}</tbody>
    </table></div>`;

    try {
      const res = await api.get('/users');
      users = res.users;

      if (!users.length) {
        tableArea.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">◈</div>
            <div class="empty-state-title">Nenhum usuário encontrado</div>
          </div>`;
        return;
      }

      tableArea.innerHTML = tableHTML(users, user.id, isEditor);
      bindTable();
    } catch (err) {
      if (err.status === 401) return;
      tableArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠</div>
          <div class="empty-state-title">Erro ao carregar usuários</div>
          <p class="empty-state-text">${escHtml(err.message || 'Tente novamente.')}</p>
          <button class="btn btn-secondary mt-16" id="btn-retry">Tentar novamente</button>
        </div>`;
      tableArea.querySelector('#btn-retry')?.addEventListener('click', load);
    }
  }

  function bindTable() {
    const tbody = tableArea.querySelector('#tbody');
    if (!tbody) return;
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.dataset.action !== 'delete') return;

      const row      = btn.closest('tr');
      const id       = Number(row.dataset.id);
      const username = row.dataset.username;

      if (!window.confirm(`Excluir o usuário "${username}"?\nEsta ação não pode ser desfeita.`)) return;

      btn.disabled = true;
      try {
        await api.del(`/users/${id}`);
        await load();
        showToast(`Usuário "${username}" excluído.`, 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao excluir usuário.', 'error');
        btn.disabled = false;
      }
    });
  }

  load();
}
