import type {GravitySample} from '../waterMotion';
/** Screen-relative linear acceleration; gravity itself is handled by the tilt spring. */
export function sensorImpulse(sample:GravitySample){
 const force=(value:number|undefined)=>Number.isFinite(value)&&Math.abs(value!)>.22?Math.max(-.12,Math.min(.12,value!*.013)):0;
 return{x:force(sample.ax),z:force(sample.az),vertical:force(sample.ay)};
}
