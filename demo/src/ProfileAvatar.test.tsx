import {afterEach,it,expect} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {avatarCrop,ProfileAvatar} from './ProfileAvatar';
afterEach(()=>{cleanup();localStorage.clear()});
it('always crops a square within the original image, including extreme drags and portrait images',()=>{
  for(const [w,h] of [[900,300],[300,900],[600,600]])for(const zoom of [1,2,3])for(const x of [-99,0,99])for(const y of [-99,0,99]){const box=avatarCrop(w,h,zoom,x,y);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.side).toBeLessThanOrEqual(w);expect(box.y+box.side).toBeLessThanOrEqual(h);expect(box.side).toBeCloseTo(Math.min(w,h)/zoom)}
});
it('isolates the avatar by account and rejects unsupported uploads without altering the existing avatar',()=>{
  localStorage.setItem('canvas-avatar-v1:one','data:image/jpeg;base64,YWJj');const view=render(<ProfileAvatar scope="one"/>);expect(screen.getByAltText('我的头像')).toBeTruthy();view.rerender(<ProfileAvatar scope="two"/>);expect(screen.queryByAltText('我的头像')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'自定义头像'}));fireEvent.change(screen.getByLabelText('上传头像图片'),{target:{files:[new File(['<svg/>'],'avatar.svg',{type:'image/svg+xml'})]}});expect(screen.getByRole('alert').textContent).toContain('JPG');expect(localStorage.getItem('canvas-avatar-v1:one')).toContain('YWJj');expect(localStorage.getItem('canvas-avatar-v1:two')).toBeNull();
});
