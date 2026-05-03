// Set up browser globals before importing the module under test
globalThis.window = { location: { hash: '' } };
let mockFetchFn;
globalThis.fetch = (...args) => mockFetchFn(...args);

function mockResponse(status, data) {
  const isJson = data !== null && data !== undefined;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' && isJson ? 'application/json' : null) },
    json: async () => data,
  };
}

// Dynamic import after globals are set up
const { get, post, put, patch, del } = await import('../../public/js/api.js');

describe('api module', () => {
  beforeEach(() => {
    globalThis.window.location.hash = '';
    mockFetchFn = null;
  });

  describe('get', () => {
    test('makes a GET request and returns parsed JSON', async () => {
      mockFetchFn = async () => mockResponse(200, { items: [] });
      const data = await get('/assets');
      expect(data).toEqual({ items: [] });
    });

    test('appends query params to the URL', async () => {
      let capturedUrl;
      mockFetchFn = async (url) => { capturedUrl = url; return mockResponse(200, {}); };
      await get('/assets', { page: 1, search: 'nginx' });
      expect(capturedUrl.includes('page=1')).toBe(true);
      expect(capturedUrl.includes('search=nginx')).toBe(true);
    });

    test('omits null/undefined params from query string', async () => {
      let capturedUrl;
      mockFetchFn = async (url) => { capturedUrl = url; return mockResponse(200, {}); };
      await get('/assets', { page: 1, search: null, tag: undefined });
      expect(capturedUrl.includes('search=')).toBe(false);
      expect(capturedUrl.includes('tag=')).toBe(false);
    });

    test('sends credentials: include for cookie auth', async () => {
      let capturedOpts;
      mockFetchFn = async (url, opts) => { capturedOpts = opts; return mockResponse(200, {}); };
      await get('/assets');
      expect(capturedOpts.credentials).toBe('include');
    });
  });

  describe('post', () => {
    test('makes a POST request with JSON body and Content-Type header', async () => {
      let capturedUrl, capturedOpts;
      mockFetchFn = async (url, opts) => { capturedUrl = url; capturedOpts = opts; return mockResponse(201, { id: 1 }); };
      await post('/assets', { name: 'Test' });
      expect(capturedUrl.includes('/api/assets')).toBe(true);
      expect(capturedOpts.method).toBe('POST');
      expect(capturedOpts.headers['Content-Type']).toBe('application/json');
      expect(capturedOpts.body).toBe(JSON.stringify({ name: 'Test' }));
    });
  });

  describe('put', () => {
    test('makes a PUT request', async () => {
      let method;
      mockFetchFn = async (url, opts) => { method = opts.method; return mockResponse(200, {}); };
      await put('/assets/1', { name: 'Updated' });
      expect(method).toBe('PUT');
    });
  });

  describe('patch', () => {
    test('makes a PATCH request', async () => {
      let method;
      mockFetchFn = async (url, opts) => { method = opts.method; return mockResponse(200, {}); };
      await patch('/assets/1/toggle');
      expect(method).toBe('PATCH');
    });
  });

  describe('del', () => {
    test('makes a DELETE request', async () => {
      let method;
      mockFetchFn = async (url, opts) => { method = opts.method; return mockResponse(204, null); };
      await del('/assets/1');
      expect(method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    test('returns null for 204 No Content', async () => {
      mockFetchFn = async () => ({ status: 204, ok: true, headers: { get: () => null } });
      const result = await del('/assets/1');
      expect(result).toBeNull();
    });

    test('redirects to #/login on 401 and throws', async () => {
      mockFetchFn = async () => mockResponse(401, { error: 'Unauthorized' });
      await expect(get('/assets')).rejects.toMatchObject({ status: 401 });
      expect(globalThis.window.location.hash).toBe('#/login');
    });

    test('does not redirect to login if already on login page', async () => {
      globalThis.window.location.hash = '#/login';
      mockFetchFn = async () => mockResponse(401, { error: 'Unauthorized' });
      await expect(get('/assets')).rejects.toMatchObject({ status: 401 });
      expect(globalThis.window.location.hash).toBe('#/login');
    });

    test('throws with status 403 and server error message', async () => {
      mockFetchFn = async () => mockResponse(403, { error: 'Access denied' });
      await expect(get('/assets')).rejects.toMatchObject({ status: 403, message: 'Access denied' });
    });

    test('throws with status and message on 500', async () => {
      mockFetchFn = async () => mockResponse(500, { error: 'Internal Server Error' });
      await expect(get('/assets')).rejects.toMatchObject({ status: 500 });
    });

    test('throws HTTP <status> fallback when response has no error field', async () => {
      mockFetchFn = async () => mockResponse(404, {});
      await expect(get('/assets')).rejects.toMatchObject(
        expect.objectContaining({ message: expect.stringContaining('404') })
      );
    });
  });
});
