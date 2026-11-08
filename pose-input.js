import {measure} from './pose/motion.js';

export const POSE_TIMING={runHoldMin:650,runHoldMax:900,staleFrame:600,silence:800,calibration:1400,calibrationGap:300};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Recognition updates renew a short lease. The game consumes it at its own fixed frame rate.
export class PoseInput {
  constructor(direction=1){this.direction=direction;this.clear(-Infinity);}
  clear(now){this.after=now;this.lastSample=-Infinity;this.lastReceived=-Infinity;this.lastMotion=-Infinity;this.runUntil=-Infinity;this.fireUntil=-Infinity;this.flightConfirmed=false;this.cadence=40;this.jumpPending=false;this.jumpLatched=false;this.blockedActive=new Set(['raise-both','fly']);this.tracked=false;this.seen={};}
  // Tracking loss stops movement immediately, but is not a pause/resume boundary.
  loseTracking(){this.tracked=false;this.runUntil=-Infinity;this.fireUntil=-Infinity;this.flightConfirmed=false;this.jumpPending=false;}
  receive({result,timestamp,receivedAt,lastRunMotion=-Infinity}){
    if(!Number.isFinite(timestamp)||!Number.isFinite(receivedAt)||timestamp<=this.after||timestamp<=this.lastSample||timestamp>receivedAt+5||receivedAt-timestamp>POSE_TIMING.staleFrame)return false;
    if(this.lastSample!==-Infinity)this.cadence=this.cadence*.8+clamp(timestamp-this.lastSample,16,250)*.2;
    this.lastSample=timestamp;this.lastReceived=receivedAt;
    this.tracked=!!(result?.controlReady??result?.upperBody)&&(result.controlQuality??result.quality)>=.48;
    if(!this.tracked){this.loseTracking();return true;}
    const active=new Set(result.active??[]);
    for(const id of this.blockedActive)if(!active.has(id))this.blockedActive.delete(id);
    const events=(result.events??[]).filter(e=>Number.isFinite(e.time)&&e.time>this.after&&e.time>=timestamp-600&&e.time<=timestamp+5&&(this.seen[e.id]??-Infinity)<e.time);
    for(const e of events){this.seen[e.id]=e.time;}
    const jumpEvent=events.some(e=>e.id==='raise-both');
    if(!active.has('raise-both')&&!jumpEvent)this.jumpLatched=false;
    const jump=!this.jumpLatched&&(jumpEvent||active.has('raise-both')&&!this.blockedActive.has('raise-both'));
    if(jump){this.jumpPending=true;this.blockedActive.delete('raise-both');}
    else if(events.some(e=>e.id==='throw-left'))this.direction=-1;
    else if(events.some(e=>e.id==='throw-right'))this.direction=1;
    const flightEvent=events.some(e=>e.id==='fly'),flightActive=result.active?.includes('fly');
    if(flightEvent)this.blockedActive.delete('fly');
    if(flightEvent||flightActive&&!this.blockedActive.has('fly'))this.flightConfirmed=true;
    if(jump||result.active?.includes('raise-both')||!flightEvent&&!flightActive)this.flightConfirmed=false;
    // Briefly bridge missing frames; the game's existing cooldown limits each shot.
    this.fireUntil=this.flightConfirmed?timestamp+clamp(this.cadence*3,180,350):-Infinity;
    const running=result.active?.includes('run')||events.some(e=>e.id==='run');
    // Active state alone must not renew movement after the person's arms stop.
    if(running&&lastRunMotion>this.after&&lastRunMotion>this.lastMotion&&lastRunMotion<=timestamp&&timestamp-lastRunMotion<500){
      this.lastMotion=lastRunMotion;this.runUntil=lastRunMotion+clamp(this.cadence*4,POSE_TIMING.runHoldMin,POSE_TIMING.runHoldMax);
    }
    return true;
  }
  read(now){
    const tracked=this.tracked&&now-this.lastReceived<POSE_TIMING.silence;
    if(!tracked)this.loseTracking();
    const jump=tracked&&this.jumpPending;this.jumpPending=false;if(jump)this.jumpLatched=true;
    return {facing:this.direction,move:tracked&&now<this.runUntil?this.direction:0,jump,fire:tracked&&now<this.fireUntil,tracked};
  }
}

export class PoseCalibration {
  constructor(){this.reset();}
  reset(){this.samples=[];this.start=null;this.last=null;this.reference=null;this.done=false;}
  push(pose,t,aspect){
    if(this.done)return {ready:true,progress:1,samples:this.samples};
    const m=measure(pose,aspect);
    if(!m?.neutral){this.reset();return {ready:false,progress:0,visible:!!m?.upperBody};}
    if(this.last!==null&&(t<=this.last||t-this.last>POSE_TIMING.calibrationGap))this.reset();
    if(this.reference&&(Math.abs(this.reference.shoulder.y-m.shoulder.y)>.08*m.torso||Math.abs(this.reference.width/m.width-1)>.08))this.reset();
    this.start??=t;this.reference??=m;this.last=t;this.samples.push(pose);
    this.done=t-this.start>=POSE_TIMING.calibration&&this.samples.length>=8;
    return {ready:this.done,progress:Math.min(.99,(t-this.start)/POSE_TIMING.calibration),visible:true,samples:this.samples};
  }
}
