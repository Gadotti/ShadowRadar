const BASE = '/api';

async function request(method, path, { params, body } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    );
    if ([...qs].length) url += `?${qs}`;
  }

  const opts = { method, credentials: 'include', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  if (res.status === 401) {
    if (window.location.hash !== '#/login') window.location.hash = '#/login';
    throw { status: 401, message: 'Authentication required' };
  }

  if (res.status === 204) return null;

  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 403) throw { status: 403, message: data?.error || 'Access denied' };
    throw { status: res.status, message: data?.error || `HTTP ${res.status}` };
  }

  return data;
}

export const get   = (path, params) => request('GET',    path, { params });
export const post  = (path, body)   => request('POST',   path, { body });
export const put   = (path, body)   => request('PUT',    path, { body });
export const patch = (path, body)   => request('PATCH',  path, { body });
export const del   = (path)         => request('DELETE', path);
