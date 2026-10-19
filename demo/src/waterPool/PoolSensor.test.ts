import {expect,it} from 'vitest';
import {sensorImpulse} from './PoolSensor';
it('uses every shake axis, rejects invalid noise and bounds strong impulses',()=>{
 expect(sensorImpulse({x:0,y:9.81,z:0})).toEqual({x:0,z:0,vertical:0});
 expect(sensorImpulse({x:0,y:9.81,z:0,ax:-8,ay:8,az:5})).toMatchObject({x:-.104,vertical:.104,z:.065});
 expect(sensorImpulse({x:0,y:9.81,z:0,ax:Infinity,ay:100,az:-100})).toEqual({x:0,vertical:.12,z:-.12});
 expect(sensorImpulse({x:0,y:9.81,z:0,ay:.1}).vertical).toBe(0);
});
