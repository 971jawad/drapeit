import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let pending: Promise<PoseLandmarker> | null = null;
export function getTracker() {
  if(!pending) pending=(async()=>{
    const files=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    const options={baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`},runningMode:'VIDEO' as const,numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};
    try{return await PoseLandmarker.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate:'GPU'}});}catch{return PoseLandmarker.createFromOptions(files,options);}
  })().catch(e=>{pending=null;throw e;});
  return pending;
}
