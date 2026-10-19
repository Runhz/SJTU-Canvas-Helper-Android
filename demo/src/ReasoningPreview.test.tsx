import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ReasoningPreview} from './ReasoningPreview';
afterEach(cleanup);
it('starts collapsed, previews incoming provider text and expands without modifying it',()=>{
 const ui=render(<ReasoningPreview text={'先核对资料页码。\n再比较条件。'} active elapsedMs={2400}/>);
 const details=screen.getByLabelText('模型思考') as HTMLDetailsElement;expect(details.open).toBe(false);expect(screen.getByText('正在思考')).toBeTruthy();expect(details.querySelector('.reasoning-glimpse')?.textContent).toBe('再比较条件。');
 fireEvent.click(details.querySelector('summary')!);details.open=true;expect(details.querySelector('.reasoning-content')?.textContent).toBe('先核对资料页码。\n再比较条件。');
 ui.rerender(<ReasoningPreview text="模型的最终思考摘要"/>);expect(screen.getByText('思考过程')).toBeTruthy();
});
it('never invents thinking when the provider returns none',()=>{const ui=render(<ReasoningPreview text="" active/>);expect(ui.container.childElementCount).toBe(0)});
