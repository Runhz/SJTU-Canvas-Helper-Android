/** At most one bridge request in flight; intermediate geometry is replaced, never queued. */
export function layoutChannel<T>(send:(value:T)=>Promise<unknown>){
  let pending:T|undefined,active=true,running=false;
  async function flush(){if(running||!active)return;running=true;try{while(active&&pending!==undefined){const value=pending;pending=undefined;try{await send(value)}catch{/* A subsequent layout/visibility event may retry. */}}}finally{running=false}}
  return{push(value:T){if(!active)return;pending=value;void flush()},dispose(){active=false;pending=undefined}};
}
