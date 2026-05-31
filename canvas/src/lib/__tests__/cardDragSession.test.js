import { describe, expect, it } from 'vitest';
import { beginCardDragSession, endCardDragSession } from '../cardDragSession.js';

function makeCanvasWithHost(cardId) {
  const host = {
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    hasAttribute(k) {
      return k in this.attrs;
    },
  };
  host.setAttribute('data-card-id', cardId);

  const canvas = {
    attrs: {},
    hosts: [host],
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    hasAttribute(k) {
      return k in this.attrs;
    },
    querySelector(sel) {
      const match = sel.match(/data-card-id="([^"]+)"/);
      if (!match) return null;
      return this.hosts.find((h) => h.attrs['data-card-id'] === match[1]) ?? null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-dragging-card]') {
        return this.hosts.filter((h) => h.hasAttribute('data-dragging-card'));
      }
      return [];
    },
  };

  return { canvas, host };
}

describe('cardDragSession', () => {
  it('sets and clears drag attributes on canvas and card host', () => {
    const { canvas, host } = makeCanvasWithHost('card-a');

    beginCardDragSession(canvas, 'card-a');
    expect(canvas.hasAttribute('data-card-dragging')).toBe(true);
    expect(host.hasAttribute('data-dragging-card')).toBe(true);

    endCardDragSession(canvas);
    expect(canvas.hasAttribute('data-card-dragging')).toBe(false);
    expect(host.hasAttribute('data-dragging-card')).toBe(false);
  });

  it('no-ops when canvas is null', () => {
    expect(() => beginCardDragSession(null, 'x')).not.toThrow();
    expect(() => endCardDragSession(null)).not.toThrow();
  });
});
