import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
vi.mock('./runtime', () => ({ NATIVE: true, native: vi.fn().mockResolvedValue({}) }));
import { native } from './runtime';
import { Modal } from './Modal';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const occlusion = (obscured: boolean) => ['playerControl', { action: 'occlusion', obscured }];

describe('native player dialog occlusion', () => {
  it('hides native video before displaying a dialog and restores it on close', () => {
    const view = render(<Modal title="test" onClose={() => {}}>content</Modal>);
    expect(native).toHaveBeenLastCalledWith(...occlusion(true));
    view.unmount();
    expect(native).toHaveBeenLastCalledWith(...occlusion(false));
  });

  it('keeps video hidden until every nested dialog has closed', () => {
    const parent = render(<Modal title="parent" onClose={() => {}}>parent</Modal>);
    const child = render(<Modal title="child" onClose={() => {}}>child</Modal>);
    expect(native).toHaveBeenCalledTimes(1);
    // The parent can also unmount first during navigation.
    parent.unmount();
    expect(native).toHaveBeenCalledTimes(1);
    child.unmount();
    expect(native).toHaveBeenLastCalledWith(...occlusion(false));
    expect(native).toHaveBeenCalledTimes(2);
  });

  it('balances occlusion across StrictMode remounts', () => {
    const view = render(<StrictMode><Modal title="test" onClose={() => {}}>content</Modal></StrictMode>);
    expect(native).toHaveBeenLastCalledWith(...occlusion(true));
    view.unmount();
    expect(native).toHaveBeenLastCalledWith(...occlusion(false));
  });
});
