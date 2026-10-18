import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
vi.mock('./runtime', () => ({ NATIVE: true, native: vi.fn().mockResolvedValue({}) }));
import { native } from './runtime';
import { Modal } from './Modal';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const occlusion = (obscured: boolean) => ['playerControl', { action: 'occlusion', obscured }];
const playerCalls=()=>vi.mocked(native).mock.calls.filter(([method])=>method==='playerControl');

describe('native player dialog occlusion', () => {
  it('makes the side conversation inert until the screenshot dialog closes', () => {
    const dock=document.createElement('aside');dock.className='study-chat-dock';document.body.append(dock);
    const view=render(<Modal title="标记课堂画面" onClose={()=>{}}>content</Modal>);
    expect(dock.hasAttribute('inert')).toBe(true);
    expect(dock.getAttribute('aria-hidden')).toBe('true');
    view.unmount();
    expect(dock.hasAttribute('inert')).toBe(false);
    expect(dock.hasAttribute('aria-hidden')).toBe(false);dock.remove();
  });
  it('hides native video before displaying a dialog and restores it on close', () => {
    const view = render(<Modal title="test" onClose={() => {}}>content</Modal>);
    expect(playerCalls().at(-1)).toEqual(occlusion(true));
    view.unmount();
    expect(playerCalls().at(-1)).toEqual(occlusion(false));
  });

  it('keeps video hidden until every nested dialog has closed', () => {
    const parent = render(<Modal title="parent" onClose={() => {}}>parent</Modal>);
    const child = render(<Modal title="child" onClose={() => {}}>child</Modal>);
    expect(playerCalls()).toHaveLength(1);
    // The parent can also unmount first during navigation.
    parent.unmount();
    expect(playerCalls()).toHaveLength(1);
    child.unmount();
    expect(playerCalls().at(-1)).toEqual(occlusion(false));
    expect(playerCalls()).toHaveLength(2);
  });

  it('balances occlusion across StrictMode remounts', () => {
    const view = render(<StrictMode><Modal title="test" onClose={() => {}}>content</Modal></StrictMode>);
    expect(playerCalls().at(-1)).toEqual(occlusion(true));
    view.unmount();
    expect(playerCalls().at(-1)).toEqual(occlusion(false));
  });
});
