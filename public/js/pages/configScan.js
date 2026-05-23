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

  let nist, scan;
  try {
    [nist, scan] = await Promise.all([
      api.get('/config/nist'),
      api.get('/config/scan'),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="page-header"><h1 class="page-title">Config Scan</h1></div>
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Erro ao carregar configurações</div>
        <p class="empty-state-text">${err.message || 'Tente recarregar a página.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Config Scan</h1>
    </div>

    <h2 class="section-title">NIST NVD</h2>

    ${!nist.api_key_set ? `
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
          <span class="info-value">${nist.source_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL Base</span>
          <code class="info-value">${nist.base_url}</code>
        </div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="card-header"><span class="card-title">Configurações NIST</span></div>
      <form id="nist-form" novalidate style="max-width:480px">
        <div class="form-group">
          <label for="page-size">Resultados por página</label>
          <input type="number" id="page-size" value="${nist.page_size}" min="1" max="2000" required>
          <span class="form-hint">Número de CVEs retornados por requisição à NIST (1–2000).</span>
        </div>
        <div class="form-group">
          <label for="api-key">API Key</label>
          <input type="text" id="api-key" placeholder="${nist.api_key_set ? '••••••••  (deixe vazio para não alterar)' : 'Opcional — aumenta o rate limit'}">
          <span class="form-hint">Deixe em branco para manter a chave atual.</span>
        </div>
        <div id="nist-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary" id="nist-save">Salvar configurações NIST</button>
      </form>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Hook de Notificação</span></div>
      <form id="hook-form" novalidate style="max-width:480px">
        <div class="form-group">
          <label for="notification-hook">URL do Hook</label>
          <input type="url" id="notification-hook" value="${escapeAttr(scan.notification_hook)}" placeholder="https://exemplo.com/webhook">
          <span class="form-hint">
            Ao final de cada scan, quando novos CVEs forem encontrados, o script enviará um POST
            com <code>{ "scan_timestamp": "…", "new_cves_found": […] }</code> para esta URL.
            Deixe em branco para desabilitar.
          </span>
        </div>
        <div id="hook-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary" id="hook-save">Salvar hook</button>
      </form>
    </div>
  `;

  const nistForm  = container.querySelector('#nist-form');
  const nistError = container.querySelector('#nist-error');
  const nistSave  = container.querySelector('#nist-save');

  nistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    nistError.hidden = true;
    nistSave.disabled = true;
    nistSave.textContent = 'Salvando…';

    const page_size = container.querySelector('#page-size').value;
    const api_key   = container.querySelector('#api-key').value.trim();

    try {
      await api.put('/config/nist', { page_size: Number(page_size), api_key: api_key || '****' });
      showToast('Configurações NIST salvas com sucesso.', 'success');
    } catch (err) {
      nistError.textContent = err.message || 'Erro ao salvar.';
      nistError.hidden = false;
    } finally {
      nistSave.disabled = false;
      nistSave.textContent = 'Salvar configurações NIST';
    }
  });

  const hookForm  = container.querySelector('#hook-form');
  const hookError = container.querySelector('#hook-error');
  const hookSave  = container.querySelector('#hook-save');

  hookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hookError.hidden = true;
    hookSave.disabled = true;
    hookSave.textContent = 'Salvando…';

    const notification_hook = container.querySelector('#notification-hook').value.trim();

    try {
      await api.put('/config/scan', { notification_hook });
      showToast('Hook de notificação salvo com sucesso.', 'success');
    } catch (err) {
      hookError.textContent = err.message || 'Erro ao salvar.';
      hookError.hidden = false;
    } finally {
      hookSave.disabled = false;
      hookSave.textContent = 'Salvar hook';
    }
  });
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}
