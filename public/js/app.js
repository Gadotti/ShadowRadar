import { init as initSidebar, update as updateSidebar } from './components/sidebar.js';
import * as api from './api.js';

const ROUTES = {
  '/login':       () => import('./pages/login.js'),
  '/dashboard':   () => import('./pages/dashboard.js'),
  '/assets':      () => import('./pages/assets.js'),
  '/results':     () => import('./pages/results.js'),
  '/scan':        () => import('./pages/scan.js'),
  '/config/nist': () => import('./pages/configNist.js'),
  '/config/ai':   () => import('./pages/configAi.js'),
  '/settings':    () => import('./pages/settings.js'),
};

const EDITOR_ROUTES = ['/scan', '/config/nist', '/config/ai', '/settings'];

let currentUser = null;

function currentRoute() {
  return window.location.hash.slice(1) || '/dashboard';
}

async function navigate() {
  const route = currentRoute();
  const content = document.getElementById('content');

  if (!ROUTES[route]) {
    window.location.hash = '#/dashboard';
    return;
  }

  if (route === '/login') {
    document.body.classList.add('login-page');
    try {
      await api.get('/auth/me');
      window.location.hash = '#/dashboard';
      return;
    } catch {
      currentUser = null;
    }
    updateSidebar(null, route);
  } else {
    document.body.classList.remove('login-page');
    try {
      const data = await api.get('/auth/me');
      currentUser = data.user;
    } catch {
      // api.js already redirected to #/login
      return;
    }

    if (EDITOR_ROUTES.includes(route) && currentUser.role !== 'editor') {
      window.location.hash = '#/dashboard';
      return;
    }

    updateSidebar(currentUser, route);
  }

  const mod = await ROUTES[route]();
  content.innerHTML = '';
  mod.render(content, currentUser);
}

async function boot() {
  await initSidebar();
  window.addEventListener('hashchange', navigate);
  await navigate();
}

document.addEventListener('DOMContentLoaded', boot);
