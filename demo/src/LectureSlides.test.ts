import {describe,it,expect} from 'vitest';
import {normalizeSlides,slideAt} from './LectureSlides';
describe('course slide timeline',()=>{
  it('uses only real, nonempty timestamps and follows backwards seeks',()=>{
    const slides=normalizeSlides([{createSec:'20',ocrText:'第二张'},{createSec:'',ocrText:'没有时间'},{createSec:'10',ocrText:'第一张'},{createSec:'not-time',ocrText:'未知'}]);
    expect(slideAt(slides,9000)).toBe(-1);expect(slideAt(slides,10000)).toBe(0);expect(slideAt(slides,23000)).toBe(1);expect(slideAt(slides,12000)).toBe(0);
    expect(slides[2].timeMs).toBeNull();
  });
  it('does not render file URLs or script schemes as platform images',()=>{
    const slides=normalizeSlides([{createSec:0,pptImgUrl:'javascript:alert(1)'},{createSec:1,pptImgUrl:'https://v.sjtu.edu.cn/ppt/1.jpg'}]);expect(slides[0].image).toBeUndefined();expect(slides[1].image).toContain('https://');
  });
});
