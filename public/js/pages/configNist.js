import * as api from '../api.js';

function showToast(message, type = 'info') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export async function render(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div> Carregando…</div>';

  let cfg;
  try {
    cfg = await api.get('/config/nist');
  } catch (err) {
    container.innerHTML = `
      <div class="page-header"><h1 class="page-title">Configuração NIST</h1></div>
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Erro ao carregar configurações</div>
        <p class="empty-state-text">${err.message || 'Tente recarregar a página.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Configuração NIST</h1>
    </div>

    ${!cfg.api_key_set ? `
    <div class="alert-warning mb-24">
      <strong>⚠ API Key não configurada.</strong>
      Sem uma API Key, a NIST NVD limita as requisições a <strong>5 req/30s</strong>.
      Recomendado configurar para evitar erros de rate limit em scans grandes.
    </div>` : ''}

    <div class="card mb-16">
      <div class="card-header"><span class="card-title">Fonte de dados</span></div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Fonte ativa</span>
          <span class="info-value">${cfg.source_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL Base</span>
          <code class="info-value">${cfg.base_url}</code>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Configurações</span></div>
      <form id="nist-form" novalidate style="max-width:480px">
        <div class="form-group">
          <label for="page-size">Resultados por página</label>
          <input type="number" id="page-size" value="${cfg.page_size}" min="1" max="2000" required>
          <span class="form-hint">Número de CVEs retornados por requisição à NIST (1–2000).</span>
        </div>
        <div class="form-group">
          <label for="api-key">API Key</label>
          <input type="text" id="api-key" placeholder="${cfg.api_key_set ? '••••••••  (deixe vazio para não alterar)' : 'Opcional — aumenta o rate limit'}">
          <span class="form-hint">Deixe em branco para manter a chave atual.</span>
        </div>
        <div id="nist-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary" id="nist-save">Salvar configurações</button>
      </form>
    </div>
  `;

  const form    = container.querySelector('#nist-form');
  const errorEl = container.querySelector('#nist-error');
  const saveBtn = container.querySelector('#nist-save');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';

    const page_size = container.querySelector('#page-size').value;
    const api_key   = container.querySelector('#api-key').value.trim();

    try {
      await api.put('/config/nist', { page_size: Number(page_size), api_key: api_key || '****' });
      showToast('Configurações NIST salvas com sucesso.', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Erro ao salvar.';
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar configurações';
    }
  });
}
