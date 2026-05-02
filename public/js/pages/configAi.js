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
    cfg = await api.get('/config/ai');
  } catch (err) {
    container.innerHTML = `
      <div class="page-header"><h1 class="page-title">Configuração AI</h1></div>
      <div class="empty-state">
        <div class="empty-state-icon">⚠</div>
        <div class="empty-state-title">Erro ao carregar configurações</div>
        <p class="empty-state-text">${err.message || 'Tente recarregar a página.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Configuração AI</h1>
    </div>

    <div class="card mb-16">
      <div class="flex items-center gap-8" style="justify-content:space-between">
        <div>
          <div style="font-weight:600;margin-bottom:2px">Integração com IA</div>
          <div class="text-muted text-sm">Enriquece CVEs com avaliação automatizada via Claude.</div>
        </div>
        <label class="toggle" title="Ativar/desativar integração AI">
          <input type="checkbox" id="ai-enabled" ${cfg.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card" id="ai-fields" style="${cfg.enabled ? '' : 'opacity:0.55'}">
      <div class="card-header"><span class="card-title">Configurações</span></div>
      <form id="ai-form" novalidate style="max-width:560px">
        <div class="form-group">
          <label>Provedor</label>
          <input type="text" value="${cfg.provider}" disabled style="cursor:not-allowed;opacity:0.6">
          <span class="form-hint">Somente Claude disponível nesta versão.</span>
        </div>
        <div class="form-group">
          <label for="ai-url">URL da API</label>
          <input type="url" id="ai-url" value="${cfg.api_url}">
        </div>
        <div class="form-group">
          <label for="ai-key">API Key</label>
          <input type="text" id="ai-key" placeholder="${cfg.api_key_set ? '••••••••  (deixe vazio para não alterar)' : 'sk-ant-…'}">
          <span class="form-hint">Deixe em branco para manter a chave atual.</span>
        </div>
        <div class="form-group">
          <label for="ai-model">Modelo</label>
          <input type="text" id="ai-model" value="${cfg.model}">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="ai-tokens">Max Tokens</label>
            <input type="number" id="ai-tokens" value="${cfg.max_tokens}" min="1">
          </div>
          <div class="form-group">
            <label for="ai-temp">Temperature <span class="text-muted">(0–1)</span></label>
            <input type="number" id="ai-temp" value="${cfg.temperature}" min="0" max="1" step="0.1">
          </div>
        </div>
        <div class="form-group" style="max-width:240px">
          <label for="ai-batch">Batch Size <span class="text-muted">(1–100)</span></label>
          <input type="number" id="ai-batch" value="${cfg.batch_size}" min="1" max="100">
          <span class="form-hint">CVEs processados por chamada à API.</span>
        </div>
        <div id="ai-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary" id="ai-save">Salvar configurações</button>
      </form>
    </div>
  `;

  const enabledToggle = container.querySelector('#ai-enabled');
  const fieldsDiv     = container.querySelector('#ai-fields');
  const form          = container.querySelector('#ai-form');
  const errorEl       = container.querySelector('#ai-error');
  const saveBtn       = container.querySelector('#ai-save');

  enabledToggle.addEventListener('change', () => {
    fieldsDiv.style.opacity = enabledToggle.checked ? '1' : '0.55';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';

    const api_key = container.querySelector('#ai-key').value.trim();

    const body = {
      enabled:     enabledToggle.checked,
      api_url:     container.querySelector('#ai-url').value.trim(),
      api_key:     api_key || '****',
      model:       container.querySelector('#ai-model').value.trim(),
      max_tokens:  Number(container.querySelector('#ai-tokens').value),
      temperature: Number(container.querySelector('#ai-temp').value),
      batch_size:  Number(container.querySelector('#ai-batch').value),
    };

    try {
      await api.put('/config/ai', body);
      showToast('Configurações AI salvas com sucesso.', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Erro ao salvar.';
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar configurações';
    }
  });
}
