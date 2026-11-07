import type { FitSettings, Point, Category } from '../types';
import { meshPoint, distance } from './geometry';
type XY = [number, number];
function triangle(ctx:CanvasRenderingContext2D,image:CanvasImageSource,s:XY[],d:XY[]) {
  const [a,b,c]=s,[A,B,C]=d;
  const det=a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);if(Math.abs(det)<.001)return;
  const coeff=(v:number[])=>[(v[0]*(b[1]-c[1])+v[1]*(c[1]-a[1])+v[2]*(a[1]-b[1]))/det,(v[0]*(c[0]-b[0])+v[1]*(a[0]-c[0])+v[2]*(b[0]-a[0]))/det,(v[0]*(b[0]*c[1]-c[0]*b[1])+v[1]*(c[0]*a[1]-a[0]*c[1])+v[2]*(a[0]*b[1]-b[0]*a[1]))/det];
  const x=coeff([A[0],B[0],C[0]]), y=coeff([A[1],B[1],C[1]]);
  ctx.save();ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.lineTo(...C);ctx.closePath();ctx.clip();ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(image,0,0);ctx.restore();
}
export function texture(image:HTMLImageElement,settings:FitSettings) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.round(512*image.height/image.width);const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  if(settings.color){ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.56;ctx.fillStyle=settings.color;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=1;}
  if(settings.pattern!=='original') {
    ctx.globalCompositeOperation='source-atop';ctx.strokeStyle='rgba(255,255,255,.27)';ctx.fillStyle='rgba(255,255,255,.34)';ctx.lineWidth=4;
    for(let i=0;i<canvas.width+canvas.height;i+=22) {
      if(settings.pattern==='dots'){for(let y=0;y<canvas.height;y+=26){ctx.beginPath();ctx.arc(i,y,3,0,Math.PI*2);ctx.fill();}}
      else {ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,canvas.height);ctx.stroke();if(settings.pattern==='checks'){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(canvas.width,i);ctx.stroke();}}
    }
  }
  return canvas;
}
export function renderGarment(ctx:CanvasRenderingContext2D, garment:HTMLCanvasElement, pose:Point[], settings:FitSettings, category:Category, source:CanvasImageSource, w:number,h:number) {
  ctx.save();ctx.globalAlpha=settings.opacity/100;
  const nx=12,ny=16;
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
    const uv=[[x/nx,y/ny],[(x+1)/nx,y/ny],[(x+1)/nx,(y+1)/ny],[x/nx,(y+1)/ny]];
    const s=uv.map(([u,v])=>[u*garment.width,v*garment.height] as XY);
    const d=uv.map(([u,v])=>{const p=meshPoint(u,v,pose,settings,category);return [p.x*w,p.y*h] as XY;});
    triangle(ctx,garment,[s[0],s[1],s[2]],[d[0],d[1],d[2]]);triangle(ctx,garment,[s[0],s[2],s[3]],[d[0],d[2],d[3]]);
  }
  ctx.restore();
  // Restore hands and forearms over the garment. This is geometric occlusion,
  // not a claim of dense, depth-aware cloth reconstruction.
  if(settings.occlusion&&category!=='bottom') {
    ctx.save();ctx.beginPath();
    const sw=distance({x:pose[11].x*w,y:pose[11].y*h},{x:pose[12].x*w,y:pose[12].y*h});
    for(const [elbow,wrist,index,pinky] of [[13,15,19,17],[14,16,20,18]]) {
      if(Math.min(pose[elbow].visibility??0,pose[wrist].visibility??0)<.6)continue;
      const a={x:pose[elbow].x*w,y:pose[elbow].y*h},b={x:pose[wrist].x*w,y:pose[wrist].y*h};
      const angle=Math.atan2(b.y-a.y,b.x-a.x),r=Math.max(6,sw*.065), dx=Math.sin(angle)*r,dy=-Math.cos(angle)*r;
      ctx.moveTo(a.x+dx,a.y+dy);ctx.lineTo(b.x+dx,b.y+dy);ctx.lineTo(b.x-dx,b.y-dy);ctx.lineTo(a.x-dx,a.y-dy);ctx.closePath();
      ctx.moveTo(b.x+r,b.y);ctx.arc(b.x,b.y,r,0,Math.PI*2);
      for(const i of [index,pinky]){const p=pose[i];ctx.moveTo(p.x*w+r*.8,p.y*h);ctx.arc(p.x*w,p.y*h,r*.8,0,Math.PI*2);}
    }
    ctx.clip();ctx.drawImage(source,0,0,w,h);ctx.restore();
  }
  if(settings.showGuides) {
    ctx.save();ctx.strokeStyle='#d8f4df';ctx.fillStyle='#d8f4df';ctx.lineWidth=2;
    for(const [a,b] of [[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16]]){ctx.beginPath();ctx.moveTo(pose[a].x*w,pose[a].y*h);ctx.lineTo(pose[b].x*w,pose[b].y*h);ctx.stroke();}
    for(const i of [11,12,13,14,15,16,23,24]){ctx.beginPath();ctx.arc(pose[i].x*w,pose[i].y*h,4,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
}
