/** @jest-environment jsdom */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

const apiMock = {
  get: jest.fn(),
  put: jest.fn(),
};
jest.unstable_mockModule('../../../public/js/api.js', () => apiMock);

const { render } = await import('../../../public/js/pages/results.js');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const editorUser = { role: 'editor' };

const mockCve = {
  id: 1, cve_id: 'CVE-2024-0001',
  asset_name: 'App', asset_tag: null, asset_version: '1.0',
  description: 'Test vulnerability', severity: 'HIGH', cvss_score: 7.5,
  published_at: '2024-01-01', user_assessment: null, user_notes: null,
  ai_assessment: null, scanned_at: '2024-01-01T00:00:00Z',
};

beforeAll(() => {
  global.requestAnimationFrame = cb => setTimeout(cb, 0);
});

let container;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  apiMock.get.mockImplementation(path => {
    if (path === '/assets') return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [mockCve], total: 1, last_scan: null });
  });
  await render(container, editorUser);
  await flush();
});

afterEach(() => {
  container.remove();
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
});

describe('assessment modal', () => {
  it('closes on ESC', () => {
    container.querySelector('[data-action="assess"]').click();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});

describe('detail panel', () => {
  it('closes on ESC, and ESC does not close it while a modal is open on top', async () => {
    container.querySelector('[data-action="detail"]').click();
    await flush();
    expect(container.querySelector('.detail-panel.open')).not.toBeNull();

    container.querySelector('[data-action="assess"]').click();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();

    // ESC while modal is open: closes modal, panel stays
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal-overlay')).toBeNull();
    expect(container.querySelector('.detail-panel.open')).not.toBeNull();

    // ESC with no modal open: closes panel
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(container.querySelector('.detail-panel.open')).toBeNull();
  });
});

describe('search ESC', () => {
  it('clears the input and triggers reload', async () => {
    apiMock.get.mockClear();
    const searchEl = container.querySelector('#f-search');
    searchEl.value = 'nginx';
    searchEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(searchEl.value).toBe('');
    await flush();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it('does nothing when input is already empty', async () => {
    apiMock.get.mockClear();
    const searchEl = container.querySelector('#f-search');
    searchEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});
