/** Service cookies live in the native HTTP client, never in the metadata cache. */
export class VideoSession {
  private until=0;
  private generation=0;
  private pending?:Promise<void>;
  constructor(private login:()=>Promise<unknown>,private now=Date.now){}
  reset(){this.generation++;this.until=0;this.pending=undefined;}
  private ensure(force=false){
    if(this.pending)return this.pending;
    if(!force&&this.now()<this.until)return Promise.resolve();
    const generation=this.generation;
    const task=this.login().then(()=>{if(generation!==this.generation)throw Error('账号会话已切换');this.until=this.now()+8*60_000}).finally(()=>{if(this.pending===task)this.pending=undefined});
    this.pending=task;return task;
  }
  async request<T>(run:()=>Promise<T>){
    const generation=this.generation;
    await this.ensure();
    if(generation!==this.generation)throw Error('账号会话已切换');
    try{return await run()}catch(error){
      if(generation!==this.generation)throw Error('账号会话已切换');
      if(!/登录|认证|未授权|401|403|unauthori[sz]ed|forbidden/i.test(String(error)))throw error;
      this.until=0;await this.ensure(true);
      if(generation!==this.generation)throw Error('账号会话已切换');
      return run(); // One retry only; expired jAccount still requires explicit login.
    }
  }
}
