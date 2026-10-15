import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {WaterQualityPicker} from './WaterTank';
afterEach(()=>{cleanup();localStorage.clear();});
describe('manual water quality',()=>{it('changes and persists the chosen preset without losing access to the other presets',()=>{
  const ui=render(<WaterQualityPicker/>);
  expect(screen.getByRole('button',{name:/高清/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:/省电/}));expect(screen.getByRole('button',{name:/省电/}).getAttribute('aria-pressed')).toBe('true');
  ui.unmount();render(<WaterQualityPicker/>);expect(screen.getByRole('button',{name:/省电/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:/均衡/}));expect(localStorage.getItem('canvas-water-quality')).toBe('balanced');
});});
