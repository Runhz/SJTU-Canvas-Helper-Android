import {describe,it,expect} from 'vitest';
import {currentTerm,playbackUrl,cleanAnswer} from './domain';
import {mapLimited,formatTime} from './services';
describe('desktop learning boundaries',()=>{
  it('does not select a future semester just because it has the largest id',()=>{
    const now=Date.parse('2026-10-26');
    expect(currentTerm([{id:2027,start_at:'2027-02-01'},{id:2026,start_at:'2026-09-01',end_at:'2027-01-20'},{id:2025,start_at:'2026-02-01',end_at:'2026-07-01'}],now)).toBe(2026);
  });
  it('preserves signed queries and the required playback source',()=>{
    expect(playbackUrl('https://videos.sjtu.edu.cn/vod/a/index.m3u8?sign=a%2Fb',4567,'canvas')).toBe('http://localhost:4567/canvas-vod/a/index.m3u8?sign=a%2Fb');
    expect(playbackUrl('https://videos.sjtu.edu.cn/vod/a.mp4',4567,'legacy')).toBe('http://localhost:4567/legacy-vod/a.mp4');
    expect(playbackUrl('https://live.sjtu.edu.cn/live/a.m3u8',4567,'canvas')).toBe('http://localhost:4567/canvas-live/live/a.m3u8');
    expect(()=>playbackUrl('javascript:alert(1)',4567,'canvas')).toThrow();
  });
  it('hides partial AI metadata without removing the actual answer',()=>{
    expect(cleanAnswer('公式 $x^2$\n<study_meta>{"questions":["为什么"]}</study_meta>')).toBe('公式 $x^2$');
    expect(cleanAnswer('完整回答\n<study_meta>{"quest')).toBe('完整回答');
  });
  it('limits parallel requests and keeps independent course failures',async()=>{
    let running=0,peak=0;
    const result=await mapLimited([1,2,3,4,5],2,async value=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,2));running--;if(value===3)throw Error('private course');return value*2;});
    expect(peak).toBe(2);expect(result.map(r=>r.status)).toEqual(['fulfilled','fulfilled','rejected','fulfilled','fulfilled']);expect(result[4]).toEqual({status:'fulfilled',value:10});
  });
  it('formats invalid or negative timestamps without NaN leaking into UI',()=>{expect(formatTime(NaN)).toBe('00:00');expect(formatTime(-3)).toBe('00:00');expect(formatTime(3661)).toBe('1:01:01');});
});
