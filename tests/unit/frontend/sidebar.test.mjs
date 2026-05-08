/** @jest-environment jsdom */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const apiMock = {
  get: jest.fn().mockResolvedValue({ version: '0.1.0' }),
  post: jest.fn(),
};
jest.unstable_mockModule('../../../public/js/api.js', () => apiMock);

const { init } = await import('../../../public/js/components/sidebar.js');

beforeAll(async () => {
  document.body.innerHTML = '<div id="sidebar"></div>';
  await init();
});

beforeEach(() => {
  document.getElementById('sidebar').classList.remove('collapsed');
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
});

describe('sidebar ESC handling', () => {
  it('collapses when expanded', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
  });

  it('does not act when already collapsed', () => {
    document.getElementById('sidebar').classList.add('collapsed');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
  });

  it('does not collapse when a modal overlay is present', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(false);
  });

  it('does not collapse when a text input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(false);
    input.remove();
  });
});
