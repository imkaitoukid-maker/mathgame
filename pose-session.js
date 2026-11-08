import {MotionRecognizer,measure} from './pose/motion.js';
import {requestCamera,stopCameraStream} from './pose/camera.js';
import {PoseCalibration,POSE_TIMING} from './pose-input.js';

const asset=name=>new URL('./pose/'+name,import.meta.url).href;
export function createPoseSession(options){return new PoseSession(options);}
export class PoseSession {
  constructor({video,onSample,onCalibrated,onStatus,onLost,onError}){
    Object.assign(this,{video,onSample,onCalibrated,onStatus,onLost,onError});this.recognizer=new MotionRecognizer();this.calibration=new PoseCalibration();this.token=0;this.live=false;this.worker=null;this.model=null;this.stream=null;this.raf=0;
  }
  stop(){
    this.token++;this.live=false;this.calibrated=false;this.suspended=false;cancelAnimationFrame(this.raf);clearTimeout(this.initTimer);this.cancelInit?.();this.cancelInit=null;
    this.worker?.terminate();this.worker=null;this.model?.close();this.model=null;stopCameraStream(this.stream);this.stream=null;this.video.pause();this.video.srcObject=null;
    this.recognizer.reset();this.calibration.reset();this.busy=false;
  }
  setSuspended(value){this.suspended=value;this.ignoreBefore=performance.now();this.recognizer.reset();}
  async start(){
    this.stop();const token=this.token;this.live=true;this.busy=false;this.lastVideo=-1;this.lastInfer=-Infinity;this.lastResult=performance.now();this.lost=false;this.ignoreBefore=-Infinity;this.failures=0;
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('摄像头需要 HTTPS，或在本机用 localhost 打开。也可以使用键盘。');
      this.onStatus({phase:'loading',text:'请允许使用摄像头…',progress:0});
      const camera=await requestCamera(navigator.mediaDevices,'user',{isCurrent:()=>this.live&&token===this.token});
      if(token!==this.token){stopCameraStream(camera.stream);return;}
      this.stream=camera.stream;this.video.srcObject=this.stream;this.video.classList.toggle('mirrored',camera.facing==='user');await this.video.play();
      if(token!==this.token)return;
      this.stream.getVideoTracks()[0].addEventListener('ended',()=>{if(token===this.token&&this.live)this.fail(Error('摄像头已断开，请重新校准或使用键盘。'));});
      this.onStatus({phase:'loading',text:'正在加载本地动作模型…',progress:0});
      try{await this.loadWorker(token);}catch(error){if(token!==this.token)return;this.worker?.terminate();this.worker=null;await this.loadMain(token);}
      if(token!==this.token)return;
      this.lastResult=performance.now();this.onStatus({phase:'calibrating',text:'双手自然下垂，保持上半身稳定',progress:0});this.loop();
    }catch(error){if(token===this.token)this.fail(error);}
  }
  async loadWorker(token){
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw Error('Worker unavailable');
    const w=new Worker(asset('pose-worker.js'));this.worker=w;
    await new Promise((resolve,reject)=>{
      let ready=false;const cancel=()=>reject(new DOMException('Cancelled','AbortError'));this.cancelInit=cancel;
      const finish=()=>{clearTimeout(this.initTimer);this.cancelInit=null;};
      this.initTimer=setTimeout(()=>{w.terminate();finish();reject(Error('识别引擎启动超时'));},18000);
      w.onerror=()=>{finish();if(ready)this.fail(Error('识别引擎中断，请重新校准。'));else reject(Error('Worker unavailable'));};
      w.onmessage=({data})=>{
        if(token!==this.token)return;
        if(data.type==='ready'){ready=true;finish();resolve();}
        else if(data.type==='error'){finish();reject(Error(data.message));}
        else if(data.type==='result'){this.busy=false;this.failures=0;this.handle(data.landmarks,data.timestamp);}
        else if(data.type==='frame-error'){this.busy=false;if(++this.failures>=3)this.fail(Error('识别暂时中断，请重新校准。'));}
      };
      w.postMessage({type:'init',wasm:asset('wasm/'),model:asset('models/pose_landmarker_lite.task')});
    });
  }
  async loadMain(token){
    const {FilesetResolver,PoseLandmarker}=await import('./pose/vendor/vision.js');
    const vision=await FilesetResolver.forVisionTasks(asset('wasm/'));
    const common={runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false};let model;
    try{model=await PoseLandmarker.createFromOptions(vision,{...common,baseOptions:{modelAssetPath:asset('models/pose_landmarker_lite.task'),delegate:'GPU'}});}
    catch{model=await PoseLandmarker.createFromOptions(vision,{...common,baseOptions:{modelAssetPath:asset('models/pose_landmarker_lite.task'),delegate:'CPU'}});}
    if(token!==this.token){model.close();return;}
    this.model=model;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.getContext('2d').fillRect(0,0,256,256);model.detectForVideo(canvas,0);
  }
  handle(pose,timestamp){
    const now=performance.now();this.lastResult=now;
    if(timestamp<=this.ignoreBefore||now-timestamp>POSE_TIMING.staleFrame||document.hidden||this.suspended&&this.calibrated)return;
    const aspect=this.video.videoWidth/this.video.videoHeight||4/3;
    if(!this.calibrated){
      const c=this.calibration.push(pose,timestamp,aspect);
      this.onStatus({phase:'calibrating',text:c.visible?'双手自然下垂，保持稳定…':'请让头、双肩、双肘和双手完整入镜',progress:c.ready?1:c.progress});
      if(c.ready&&this.recognizer.calibrate(c.samples,aspect)){this.calibrated=true;this.lost=false;this.onCalibrated();}
      return;
    }
    const result=this.recognizer.update(pose,timestamp,aspect);
    this.onSample({result,timestamp,receivedAt:now,lastRunMotion:this.recognizer.run.lastMotion});
    if(!measure(pose,aspect)?.controlReady){if(!this.lost){this.lost=true;this.onLost();}}
    else this.lost=false;
  }
  loop(){
    if(!this.live)return;const now=performance.now();
    if(now-this.lastResult>POSE_TIMING.silence&&!this.lost&&this.calibrated&&!this.suspended){this.lost=true;this.onLost();}
    if(this.busy&&now-this.busySince>4000){this.fail(Error('动作识别没有响应，请重新校准。'));return;}
    if(!document.hidden&&!(this.suspended&&this.calibrated)&&!this.busy&&this.video.readyState>=2&&now-this.lastInfer>=40&&this.video.currentTime!==this.lastVideo){void this.infer(now);}
    this.raf=requestAnimationFrame(()=>this.loop());
  }
  async infer(now){
    const token=this.token;this.busy=true;this.busySince=now;this.lastInfer=now;this.lastVideo=this.video.currentTime;
    try{
      if(this.worker){
        const bitmap=await createImageBitmap(this.video);
        if(token!==this.token||!this.worker){bitmap.close();return;}
        this.worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
      }else if(this.model){const result=this.model.detectForVideo(this.video,now);this.busy=false;this.handle(result.landmarks[0]??null,now);}
    }catch(error){if(token===this.token){this.busy=false;if(++this.failures>=3)this.fail(Error('无法读取摄像头，请重新校准。'));}}
  }
  fail(error){
    this.stop();this.onLost();
    const messages={NotAllowedError:'没有摄像头权限，请允许后重试，或使用键盘。',NotFoundError:'未找到摄像头，可以先使用键盘。',NotReadableError:'摄像头被其他程序占用，请关闭后重试。'};
    this.onError(messages[error.name]||error.message||'摄像头未能开启，请重试或使用键盘。');
  }
}
