import {it,expect,vi} from 'vitest';
import {layoutChannel} from './layoutChannel';
it('replaces pending scroll geometry and sends the latest visibility without a bridge backlog',async()=>{
  let finish!:()=>void;const send=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve})),channel=layoutChannel(send);
  channel.push({y:1,visible:true});for(let y=2;y<100;y++)channel.push({y,visible:true});channel.push({y:100,visible:false});
  expect(send).toHaveBeenCalledTimes(1);finish();await Promise.resolve();await Promise.resolve();expect(send).toHaveBeenCalledTimes(2);expect(send).toHaveBeenLastCalledWith({y:100,visible:false});channel.dispose();finish();channel.push({y:101,visible:true});await Promise.resolve();expect(send).toHaveBeenCalledTimes(2);
});
