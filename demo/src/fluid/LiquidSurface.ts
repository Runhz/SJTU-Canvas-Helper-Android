/** Particle positions drive a single filled liquid silhouette, never individual particle outlines. */
export class LiquidSurface {
  readonly pixels:Uint8Array;
  readonly mask:Uint8Array;
  private density:Float32Array;
  private scratch:Float32Array;
  private visited:Uint8Array;
  private queue:Int32Array;
  private labels:Int32Array;
  private distances:Float32Array;
  private kernel:number[]=[];
  private kernelSigma=0;
  private iso=.5;

  constructor(readonly size:number,readonly radius=.88){
    const count=size*size;
    this.pixels=new Uint8Array(count*4);this.mask=new Uint8Array(count);
    this.density=new Float32Array(count);this.scratch=new Float32Array(count);
    this.visited=new Uint8Array(count);this.queue=new Int32Array(count);
    this.labels=new Int32Array(count);this.distances=new Float32Array(count);
    for(let i=0;i<count;i++)this.pixels[i*4+3]=255;
  }

  update(positions:Float32Array,count:number,particleRadius:number,fill:number){
    const n=this.size,total=n*n,d=this.density;
    d.fill(0);
    const mass=2*Math.sqrt(3)*particleRadius*particleRadius/(4/total);
    // Bilinear particle mass deposition followed by a blur in physical units.
    // This does not depend on a GPU's supported point-size range or screen pixel ratio.
    for(let i=0;i<count;i++){
      const x=positions[i*2]*n/2-.5,y=positions[i*2+1]*n/2-.5;
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      if(ix<0||iy<0||ix+1>=n||iy+1>=n)continue;
      const p=iy*n+ix;
      d[p]+=mass*(1-fx)*(1-fy);d[p+1]+=mass*fx*(1-fy);
      d[p+n]+=mass*(1-fx)*fy;d[p+n+1]+=mass*fx*fy;
    }
    this.blur(Math.max(.9,particleRadius*n*.65));
    const target=Math.round(Math.max(0,Math.min(1,fill))*Math.PI*(this.radius*n/2)**2);
    if(!count||target===0)this.mask.fill(0);
    else if(fill>=.9999){
      for(let y=0;y<n;y++)for(let x=0;x<n;x++)this.mask[y*n+x]=this.inside(x,y)?1:0;
    }else{
      // Filling enclosed air removes pinholes. Keep the projected water area tied to its amount,
      // so a sparse particle sheet cannot turn a half-filled tank into a full tank.
      let area=this.outline(this.iso);
      if(Math.abs(area-target)>Math.max(3,target*.015)){
        let best=this.iso,error=Math.abs(area-target);
        let low=0,high=0;
        for(let i=0;i<total;i++)high=Math.max(high,d[i]);
        for(let iteration=0;iteration<8;iteration++){
          this.iso=(low+high)/2;area=this.outline(this.iso);
          if(Math.abs(area-target)<error){best=this.iso;error=Math.abs(area-target);}
          if(area>target)low=this.iso;else high=this.iso;
        }
        this.iso=best;this.outline(this.iso);
      }
      this.removeSpecks();
    }
    this.distanceField();
  }

  sample(u:number,v:number){
    const n=this.size,x=Math.max(0,Math.min(n-1,u*n-.5)),y=Math.max(0,Math.min(n-1,v*n-.5));
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const x1=Math.min(n-1,ix+1),y1=Math.min(n-1,iy+1),p=this.pixels;
    return ((p[(iy*n+ix)*4]*(1-fx)+p[(iy*n+x1)*4]*fx)*(1-fy)+(p[(y1*n+ix)*4]*(1-fx)+p[(y1*n+x1)*4]*fx)*fy)/255;
  }

  private inside(x:number,y:number){
    const r=this.radius*this.size/2;
    return (x+.5-this.size/2)**2+(y+.5-this.size/2)**2<=r*r;
  }

  private blur(sigma:number){
    if(sigma!==this.kernelSigma){
      this.kernelSigma=sigma;this.kernel=[];
      const radius=Math.ceil(sigma*2.5);let sum=0;
      for(let i=-radius;i<=radius;i++){const value=Math.exp(-i*i/(2*sigma*sigma));this.kernel.push(value);sum+=value;}
      this.kernel=this.kernel.map(v=>v/sum);
    }
    const n=this.size,k=this.kernel,r=(k.length-1)/2;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let sum=0;for(let i=-r;i<=r;i++)sum+=this.density[y*n+Math.min(n-1,Math.max(0,x+i))]*k[i+r];
      this.scratch[y*n+x]=sum;
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let sum=0;for(let i=-r;i<=r;i++)sum+=this.scratch[Math.min(n-1,Math.max(0,y+i))*n+x]*k[i+r];
      this.density[y*n+x]=sum;
    }
  }

  private outline(iso:number){
    const n=this.size,wet=this.mask,seen=this.visited,q=this.queue;
    seen.fill(0);let head=0,tail=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const p=y*n+x;
      wet[p]=this.inside(x,y)&&this.density[p]>=iso?1:0;
      if(x===0||y===0||x===n-1||y===n-1){seen[p]=1;q[tail++]=p;}
    }
    while(head<tail){
      const p=q[head++],x=p%n;
      if(x>0&&!wet[p-1]&&!seen[p-1]){seen[p-1]=1;q[tail++]=p-1;}
      if(x<n-1&&!wet[p+1]&&!seen[p+1]){seen[p+1]=1;q[tail++]=p+1;}
      if(p>=n&&!wet[p-n]&&!seen[p-n]){seen[p-n]=1;q[tail++]=p-n;}
      if(p<n*(n-1)&&!wet[p+n]&&!seen[p+n]){seen[p+n]=1;q[tail++]=p+n;}
    }
    let area=0;
    for(let p=0;p<wet.length;p++){if(!wet[p]&&!seen[p])wet[p]=1;area+=wet[p];}
    return area;
  }

  private removeSpecks(){
    const n=this.size,wet=this.mask,labels=this.labels,q=this.queue;
    labels.fill(0);const sizes:number[]=[0];let label=0;
    for(let p=0;p<wet.length;p++){
      if(!wet[p]||labels[p])continue;
      label++;let head=0,tail=0;q[tail++]=p;labels[p]=label;
      while(head<tail){
        const at=q[head++],x=at%n;
        if(x>0&&wet[at-1]&&!labels[at-1]){labels[at-1]=label;q[tail++]=at-1;}
        if(x<n-1&&wet[at+1]&&!labels[at+1]){labels[at+1]=label;q[tail++]=at+1;}
        if(at>=n&&wet[at-n]&&!labels[at-n]){labels[at-n]=label;q[tail++]=at-n;}
        if(at<n*(n-1)&&wet[at+n]&&!labels[at+n]){labels[at+n]=label;q[tail++]=at+n;}
      }
      sizes.push(tail);
    }
    let largest=0;for(let i=1;i<sizes.length;i++)largest=Math.max(largest,sizes[i]);
    const droplets=sizes.map((area,id)=>({area,id})).filter(c=>c.id&&c.area>=3&&c.area<largest*.08).sort((a,b)=>b.area-a.area).slice(0,6);
    const keep=new Set(droplets.map(c=>c.id));
    for(let i=1;i<sizes.length;i++)if(sizes[i]>=Math.max(3,largest*.08))keep.add(i);
    for(let p=0;p<wet.length;p++)if(wet[p]&&!keep.has(labels[p]))wet[p]=0;
  }

  private distanceField(){
    const n=this.size,m=this.mask,d=this.distances;
    // Distance from the silhouette, rather than particle density, controls all surface lighting.
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const p=y*n+x,s=m[p];
      d[p]=x===0||y===0||x===n-1||y===n-1||(x>0&&m[p-1]!==s)||(x<n-1&&m[p+1]!==s)||(p>=n&&m[p-n]!==s)||(p<n*(n-1)&&m[p+n]!==s)?.5:1000;
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const p=y*n+x;
      if(x>0)d[p]=Math.min(d[p],d[p-1]+1);
      if(y>0)d[p]=Math.min(d[p],d[p-n]+1);
      if(x>0&&y>0)d[p]=Math.min(d[p],d[p-n-1]+1.4142);
      if(x<n-1&&y>0)d[p]=Math.min(d[p],d[p-n+1]+1.4142);
    }
    for(let y=n-1;y>=0;y--)for(let x=n-1;x>=0;x--){
      const p=y*n+x;
      if(x<n-1)d[p]=Math.min(d[p],d[p+1]+1);
      if(y<n-1)d[p]=Math.min(d[p],d[p+n]+1);
      if(x<n-1&&y<n-1)d[p]=Math.min(d[p],d[p+n+1]+1.4142);
      if(x>0&&y<n-1)d[p]=Math.min(d[p],d[p+n-1]+1.4142);
    }
    for(let p=0;p<d.length;p++)d[p]=(m[p]?1:-1)*Math.min(8,d[p]);
    // Smooth the silhouette distance, not the individual particle highlights.
    // This also removes grid stairs from the meniscus and from the glass boundary.
    const weights=[1,4,6,4,1];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let sum=0;for(let k=-2;k<=2;k++)sum+=d[y*n+Math.min(n-1,Math.max(0,x+k))]*weights[k+2];
      this.scratch[y*n+x]=sum/16;
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let sum=0;for(let k=-2;k<=2;k++)sum+=this.scratch[Math.min(n-1,Math.max(0,y+k))*n+x]*weights[k+2];
      const p=y*n+x;
      // Preserve the filled contour's topology: smoothing must not close an air channel
      // and leave another tiny enclosed pocket behind it.
      const signed=m[p]?Math.max(.5,sum/16):Math.min(-.5,sum/16);
      this.pixels[p*4]=Math.round(128+signed*15.8);
    }
  }
}
