import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, ImagePlus, ShieldCheck, ScanLine, Video, LoaderCircle, MoveUpRight } from 'lucide-react';
import type { FitSettings, Garment, Point, TrackingState } from '../types';
import { getTracker } from '../engine/tracker';
import { loadImage } from '../engine/images';
import { poseConfidence, smoothPose } from '../engine/geometry';
import { renderGarment, texture } from '../engine/renderer';
export interface StudioHandle { startCamera:()=>Promise<void>; stop:()=>void; setPhoto:(src:string)=>Promise<void>; setVideo:(file:File)=>Promise<void>; snapshot:(original?:boolean)=>string|null }
interface Props {garment:Garment;settings:FitSettings;compare:boolean;onTracking:(s:TrackingState)=>void;onError:(m:string)=>void;onUpload:()=>void;onSource:(s:string)=>void}
export const Studio=forwardRef<StudioHandle,Props>(function Studio({garment,settings,compare,onTracking,onError,onUpload,onSource},ref){
  const canvas=useRef<HTMLCanvasElement>(null),video=useRef<HTMLVideoElement>(null),media=useRef<HTMLVideoElement|HTMLImageElement|null>(null),stream=useRef<MediaStream|null>(null),frame=useRef(0),generation=useRef(0),videoUrl=useRef(''),pose=useRef<Point[]|null>(null),lastSeen=useRef(0),tex=useRef<HTMLCanvasElement|null>(null),latest=useRef({settings,garment,compare,onTracking,onError}),[source,setSource]=useState(''),[loading,setLoading]=useState(false);
  latest.current={settings,garment,compare,onTracking,onError};
  useEffect(()=>{let alive=true;loadImage(garment.image).then(i=>{if(alive)tex.current=texture(i,settings);}).catch(e=>onError(e.message));return()=>{alive=false;};},[garment.image,settings.color,settings.pattern]);
  const stop=()=>{generation.current++;cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current){video.current.pause();video.current.srcObject=null;video.current.removeAttribute('src');video.current.load();}if(videoUrl.current){URL.revokeObjectURL(videoUrl.current);videoUrl.current='';}media.current=null;pose.current=null;setSource('');setLoading(false);onSource('');onTracking({status:'idle',fps:0,confidence:0});};
  useEffect(()=>()=>{generation.current++;cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(t=>t.stop());if(videoUrl.current)URL.revokeObjectURL(videoUrl.current);},[]);
  async function run(input:HTMLVideoElement|HTMLImageElement,label:string,token:number) {
    media.current=input;setSource(label);onSource(label);setLoading(true);onTracking({status:'loading',fps:0,confidence:0});
    let tracker;try{tracker=await getTracker();}catch{if(generation.current===token){setLoading(false);onError('Body tracking could not load. Check your connection, then restart the camera.');onTracking({status:'error',fps:0,confidence:0});}return;}
    if(generation.current!==token)return;setLoading(false);
    let detectionTime=0,lastReport=performance.now(),count=0,lastVideoTime=-1,photoDone=false,lastTimestamp=0;
    const captured=document.createElement('canvas');
    const loop=(now:number)=>{
      if(generation.current!==token||!canvas.current)return;
      const w=input instanceof HTMLVideoElement?input.videoWidth:input.naturalWidth,h=input instanceof HTMLVideoElement?input.videoHeight:input.naturalHeight;
      if(!w||!h){frame.current=requestAnimationFrame(loop);return;}
      const out=canvas.current,scale=Math.min(1,1280/Math.max(w,h));if(out.width!==Math.round(w*scale)||out.height!==Math.round(h*scale)){out.width=Math.round(w*scale);out.height=Math.round(h*scale);}
      const changed=input instanceof HTMLVideoElement?input.currentTime!==lastVideoTime:!photoDone;
      if(changed&&now-detectionTime>=50){
        try {
          // Capture once: inference, compositing and limb occlusion must use
          // the same pixels, even if inference takes longer than a video frame.
          captured.width=out.width;captured.height=out.height;captured.getContext('2d')!.drawImage(input,0,0,captured.width,captured.height);
          const ts=Math.max(performance.now(),lastTimestamp+1);lastTimestamp=ts;
          const result=tracker.detectForVideo(captured,ts);const next=result.landmarks[0] as Point[]|undefined;
          const face=next?Math.max(...[0,1,4].map(i=>next[i].visibility??0)):0;
          if(next&&poseConfidence(next)>.5&&face>.55){pose.current=smoothPose(pose.current,next,now-detectionTime);lastSeen.current=now;}else pose.current=null;
          result.close();photoDone=true;if(input instanceof HTMLVideoElement)lastVideoTime=input.currentTime;count++;
        }catch(e){cancelAnimationFrame(frame.current);latest.current.onError('Tracking stopped. Please restart your camera or choose another photo.');latest.current.onTracking({status:'error',fps:0,confidence:0,message:String(e)});return;}
        detectionTime=now;
      }
      if(input instanceof HTMLVideoElement&&now-lastSeen.current>450)pose.current=null;
      const ctx=out.getContext('2d')!;ctx.clearRect(0,0,out.width,out.height);ctx.save();
      if(latest.current.settings.mirror&&label==='Camera'){ctx.translate(out.width,0);ctx.scale(-1,1);}if(captured.width&&captured.height)ctx.drawImage(captured,0,0,out.width,out.height);
      if(pose.current&&tex.current&&!latest.current.compare)renderGarment(ctx,tex.current,pose.current,latest.current.settings,latest.current.garment.category,captured,out.width,out.height);ctx.restore();
      if(now-lastReport>500){latest.current.onTracking({status:pose.current?'tracking':'searching',fps:input instanceof HTMLImageElement?0:Math.round(count*1000/(now-lastReport)),confidence:pose.current?poseConfidence(pose.current):0});count=0;lastReport=now;out.dataset.pose=pose.current?'detected':'missing';out.dataset.source=label;}
      frame.current=requestAnimationFrame(loop);
    };frame.current=requestAnimationFrame(loop);
  }
  async function startCamera(){stop();const token=generation.current;setLoading(true);try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS and a supported browser.');
    const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:960}},audio:false});
    if(generation.current!==token){camera.getTracks().forEach(t=>t.stop());return;}stream.current=camera;const v=video.current!;v.srcObject=camera;v.muted=true;await v.play();await run(v,'Camera',token);
  }catch(e){if(generation.current!==token)return;stop();const name=(e as Error).name;onError(name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings, then try again.':name==='NotFoundError'?'No camera was found. Connect one, or upload a photo or video.':name==='NotReadableError'?'Your camera is busy. Close other camera apps and try again.':(e as Error).message);}}
  async function setPhoto(src:string){stop();const token=generation.current;try{const i=await loadImage(src);if(generation.current===token)await run(i,'Photo',token);}catch(e){onError((e as Error).message);}}
  async function setVideo(file:File){stop();const token=generation.current;if(!file.type.startsWith('video/')){onError('Choose a video file.');return;}if(file.size>150*1024*1024){onError('Choose a video smaller than 150 MB.');return;}try{videoUrl.current=URL.createObjectURL(file);const v=video.current!;v.src=videoUrl.current;v.loop=true;v.muted=true;await v.play();await run(v,'Video',token);}catch{stop();onError('This video format could not be played. Try an MP4 video.');}}
  function snapshot(original=false){if(!canvas.current||!media.current||!pose.current)return null;const out=document.createElement('canvas');const scale=Math.min(1,1000/canvas.current.width);out.width=canvas.current.width*scale;out.height=canvas.current.height*scale;const ctx=out.getContext('2d')!;if(original&&latest.current.settings.mirror&&source==='Camera'){ctx.translate(out.width,0);ctx.scale(-1,1);}ctx.drawImage(original?media.current:canvas.current,0,0,out.width,out.height);return out.toDataURL('image/jpeg',.88);}
  useImperativeHandle(ref,()=>({startCamera,stop,setPhoto,setVideo,snapshot}));
  return <div className={`studio-stage ${source?'has-source':''}`}><video ref={video} className="source-video" playsInline muted aria-hidden="true"/><canvas ref={canvas} aria-label="Your virtual try-on preview" style={{display:source?'block':'none'}}/>{!source&&<div className="stage-welcome"><div className="mirror-art"><svg viewBox="0 0 250 300" aria-hidden="true"><defs><linearGradient id="mirror" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dedfd5"/><stop offset="1" stopColor="#ecebe3"/></linearGradient></defs><path d="M34 282V112C34 0 216 0 216 112v170" fill="url(#mirror)" stroke="#bdbfb1"/><path d="M49 282V113C49 18 201 18 201 113v169" fill="none" stroke="#ffffff70"/><ellipse cx="125" cy="112" rx="26" ry="34" fill="#b4bdac"/><path d="M72 270v-70c0-45 106-45 106 0v70" fill="#b4bdac"/><path d="M99 167l26 22 26-22M125 189v81" stroke="#e8ece1" fill="none"/><path d="M83 194l-16 61m100-61 16 61" stroke="#8f9f8d" strokeWidth="2"/><path d="M60 74l11-11m108 159 11-11" stroke="#fff" strokeWidth="2"/></svg><span className="art-label"><ScanLine size={13}/> MADE FOR YOUR BODY</span></div><span className="eyebrow">YOUR PERSONAL FITTING ROOM</span><h2>A little less guessing.<br/><em>A lot more you.</em></h2><p>Turn on your camera. Find your silhouette.<br/>See a look move with you.</p><button className="button primary" onClick={startCamera} disabled={loading}>{loading?<LoaderCircle className="spin" size={17}/>:<Camera size={17}/>} {loading?'Opening camera…':'Open my camera'}<MoveUpRight size={16}/></button><button className="text-button" onClick={onUpload}><ImagePlus size={15}/> Or try with a photo</button><span className="privacy-note"><ShieldCheck size={13}/> Your camera stays on your device</span></div>}{source&&loading&&<div className="stage-loading"><LoaderCircle className="spin"/><span>Loading body tracking…</span><small>The first start downloads the on-device model.</small></div>}{source&&<span className="source-label">{source==='Camera'?<Camera size={13}/>:source==='Video'?<Video size={13}/>:<ImagePlus size={13}/>} {source==='Camera'?'LIVE CAMERA':source==='Video'?'VIDEO PREVIEW':'PHOTO PREVIEW'}</span>}</div>;
});
