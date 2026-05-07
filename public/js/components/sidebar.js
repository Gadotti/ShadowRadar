import * as api from '../api.js';

const MENU = [
  { path: '/dashboard',   icon: '⊞', label: 'Dashboard' },
  { path: '/assets',      icon: '◈', label: 'Ativos' },
  { path: '/results',     icon: '⚑', label: 'Resultados CVE' },
  { path: '/scan',        icon: '⟳', label: 'Executar Scan',  editorOnly: true },
  { path: '/config/nist', icon: '⚙', label: 'Config NIST',    editorOnly: true },
  { path: '/config/ai',   icon: '✦', label: 'Config AI',      editorOnly: true },
  { path: '/settings',    icon: '⚿', label: 'API Keys',       editorOnly: true },
];

let el;
let version = '';

export async function init() {
  el = document.getElementById('sidebar');
  try {
    const data = await api.get('/health');
    version = data.version || '';
  } catch { /* server unreachable — version stays empty */ }
  renderShell();
  applyCollapsed();
}

export function update(user, route) {
  if (!el) return;
  renderNav(user, route);
  renderFooter(user);
}

function renderShell() {
  el.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-logo">SR</span>
      <span class="sidebar-title">ShadowRadar</span>
      <button class="sidebar-toggle" id="sidebar-toggle" title="Colapsar menu">‹</button>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav"></nav>
    <div class="sidebar-footer" id="sidebar-footer"></div>
  `;
  document.getElementById('sidebar-toggle').addEventListener('click', toggleCollapse);
  el.addEventListener('click', expandOnEmptyClick);
  document.addEventListener('keydown', collapseOnEsc);
}

function renderNav(user, route) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const items = MENU.filter(i => !i.editorOnly || user?.role === 'editor');
  nav.innerHTML = items.map(i => `
    <a class="sidebar-item${route === i.path ? ' active' : ''}" href="#${i.path}" title="${i.label}">
      <span class="sidebar-item-icon">${i.icon}</span>
      <span class="sidebar-item-label">${i.label}</span>
    </a>
  `).join('');
}

function renderFooter(user) {
  const footer = document.getElementById('sidebar-footer');
  if (!footer) return;
  footer.innerHTML = `
    <span class="sidebar-version">v${version}</span>
    ${user ? `
      <button class="btn btn-ghost sidebar-logout" id="sidebar-logout" title="Sair">
        <span class="sidebar-item-icon">↩</span>
        <span class="sidebar-item-label">Sair</span>
      </button>` : ''}
  `;
  document.getElementById('sidebar-logout')?.addEventListener('click', async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    window.location.hash = '#/login';
  });
}

function toggleCollapse() {
  const collapsed = el.classList.toggle('collapsed');
  localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.textContent = collapsed ? '›' : '‹';
}

function expandOnEmptyClick(e) {
  if (!el.classList.contains('collapsed')) return;
  if (e.target.closest('.sidebar-item, #sidebar-toggle, .sidebar-logout')) return;
  el.classList.remove('collapsed');
  localStorage.setItem('sidebar_collapsed', '0');
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.textContent = '‹';
}

function collapseOnEsc(e) {
  if (e.key !== 'Escape' || el.classList.contains('collapsed') || document.querySelector('.modal-overlay')) return;
  if (document.activeElement?.matches('input, textarea, select')) return;
  el.classList.add('collapsed');
  localStorage.setItem('sidebar_collapsed', '1');
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.textContent = '›';
}

function applyCollapsed() {
  if (localStorage.getItem('sidebar_collapsed') === '1') {
    el.classList.add('collapsed');
    const btn = document.getElementById('sidebar-toggle');
    if (btn) btn.textContent = '›';
  }
}
