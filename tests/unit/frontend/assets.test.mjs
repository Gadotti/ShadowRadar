/** @jest-environment jsdom */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const apiMock = {
  get:   jest.fn(),
  post:  jest.fn(),
  put:   jest.fn(),
  patch: jest.fn(),
  del:   jest.fn(),
};
jest.unstable_mockModule('../../../public/js/api.js', () => apiMock);

const { render } = await import('../../../public/js/pages/assets.js');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const editorUser = { role: 'editor' };

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  apiMock.get.mockResolvedValue({ items: [], total: 0 });
  render(container, editorUser);
});

afterEach(() => {
  container.remove();
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
});

describe('assets modal', () => {
  it('opens on "New Asset" click', () => {
    container.querySelector('#btn-new').click();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('closes via X button', () => {
    container.querySelector('#btn-new').click();
    document.querySelector('.modal-close').click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('closes via Cancel button', () => {
    container.querySelector('#btn-new').click();
    document.querySelector('#modal-cancel').click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('closes via overlay click', () => {
    container.querySelector('#btn-new').click();
    document.querySelector('.modal-overlay').click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('closes on ESC key', () => {
    container.querySelector('#btn-new').click();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});

describe('search ESC', () => {
  it('clears the input and triggers reload', async () => {
    await flush();
    apiMock.get.mockClear();
    const searchEl = container.querySelector('#search');
    searchEl.value = 'nginx';
    searchEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(searchEl.value).toBe('');
    await flush();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it('does nothing when input is already empty', async () => {
    await flush();
    apiMock.get.mockClear();
    const searchEl = container.querySelector('#search');
    searchEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});
