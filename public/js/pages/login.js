import * as api from '../api.js';

export function render(container) {
  container.innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <h1 class="login-title">ShadowRadar</h1>
        <p class="login-subtitle">External Security Posture Management</p>
        <form id="login-form" novalidate>
          <div class="form-group">
            <label for="username">Usuário</label>
            <input type="text" id="username" name="username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="password">Senha</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required>
          </div>
          <div id="login-error" class="form-error" hidden></div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn">Entrar</button>
        </form>
      </div>
    </div>
  `;

  const form     = container.querySelector('#login-form');
  const errorEl  = container.querySelector('#login-error');
  const btn      = container.querySelector('#login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando…';

    try {
      await api.post('/auth/login', {
        username: container.querySelector('#username').value.trim(),
        password: container.querySelector('#password').value,
      });
      window.location.hash = '#/dashboard';
    } catch {
      errorEl.textContent = 'Usuário ou senha inválidos.';
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}
