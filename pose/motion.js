export const ACTIONS = [
  { id:'raise-both',name:'双手举起',en:'HANDS UP',key:'1',brief:'双手举高，随时回应',guide:'双手举过头顶，手肘一起抬高，保持片刻。可以从任意动作直接切换，双手需要完整入镜；放下后再举可以再次触发。',cue:'双手举过头顶、抬高手肘，保持片刻',color:'#c4f36a' },
  { id:'fly',name:'飞翔',en:'FLY',key:'2',brief:'展开双臂，感受气流',guide:'双臂向两侧展开，同时上下挥动。停止挥动后会自动退出；收回胸前可直接交替摆臂，也可自然放下后重新侧挥。',cue:'双臂一起挥动，停止后可切换其他手势',color:'#a1e6dc' },
  { id:'run',name:'原地跑',en:'RUN',key:'3',brief:'交替摆臂，向前出发',guide:'双肘弯曲，双手在胸前一上一下交替摆动，连续完成三次交替。无需抬腿，飞翔后可直接收回胸前开始摆臂。',cue:'胸前交替摆臂，带有明显的上下幅度',color:'#f6b5ca' },
  { id:'throw-left',name:'左手侧挥',en:'LEFT CAST',key:'4',brief:'左手挥开，释放能量',guide:'用你自己的左手，从胸前或身体侧下方向外挥开，右手留在胸前或自然放下。跑步时可直接侧挥。镜像开关只改变预览，不交换左右手。',cue:'左手向外侧挥，右手留在身体附近',color:'#d2b7ff' },
  { id:'throw-right',name:'右手侧挥',en:'RIGHT CAST',key:'5',brief:'右手挥开，释放能量',guide:'用你自己的右手，从胸前或身体侧下方向外挥开，左手留在胸前或自然放下。跑步时可直接侧挥。镜像开关只改变预览，不交换左右手。',cue:'右手向外侧挥，左手留在身体附近',color:'#f4cf91' },
];

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{
  const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];
  return Math.acos(clamp((u[0]*v[0]+u[1]*v[1])/Math.max(.00001,Math.hypot(...u)*Math.hypot(...v)),-1,1))*180/Math.PI;
};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const upperPoints=[0,11,12,13,14,15,16];
const visible=(l,ids)=>ids.every(i=>l[i]&&(l[i].visibility??1)>=.48&&(l[i].presence??1)>=.35);
const inFrame=(l,ids)=>visible(l,ids)&&ids.every(i=>l[i].x>.015&&l[i].x<.985&&l[i].y>.015&&l[i].y<.985);
const FLIGHT_CONFIRM_MS=140,FLIGHT_EXIT_MS=420,PASSIVE_ARM_MS=160,CAST_CONFIRM_MS=100,CHEST_SUPPORT_MS=120;
const HANDS_UP_CONFIRM_MS=120,HANDS_DOWN_CONFIRM_MS=180;
// MediaPipe's anatomical arms: 11/13/15 are left, 12/14/16 are right.
const castId=side=>side===0?'throw-left':'throw-right';

export function measure(l,aspect=1){
  if(!l||l.length<33||!inFrame(l,[11,12]))return null;
  const p=l.map(v=>({...v,x:v.x*aspect}));
  const shoulder={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
  const width=Math.max(.04,length(p[11],p[12])),hipsVisible=inFrame(l,[23,24]);
  const torso=Math.max(.07,hipsVisible?length(shoulder,{x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2}):width*1.25);
  // Hips are optional. A shoulder-based waist estimate keeps cast preparation usable in a crop.
  const waist=[0,1].map(s=>hipsVisible?p[23+s]:{x:shoulder.x+(p[11+s].x-shoulder.x)*.65,y:shoulder.y+torso});
  const hip={x:(waist[0].x+waist[1].x)/2,y:(waist[0].y+waist[1].y)/2};
  const head=inFrame(l,[0])?p[0]:null,upperBody=inFrame(l,upperPoints);
  const neutral=upperBody&&[0,1].every(s=>p[15+s].y>p[11+s].y+.65*torso)&&Math.abs(p[11].y-p[12].y)<.25*torso&&head.y<shoulder.y-.15*torso;
  return {p,hip,waist,shoulder,head,torso,width,upperBody,neutral,
    quality:upperPoints.reduce((sum,i)=>sum+Math.min(l[i].visibility??1,l[i].presence??1),0)/upperPoints.length};
}

export class MotionRecognizer {
  constructor(){this.sensitivity=1;this.baseline=null;this.reset();}
  reset(){
    this.previous=null;this.lastSeen=0;this.lastEvents={};this.entered={};
    this.arms=[{},{}];this.passiveSince=[null,null];this.pendingCast=null;
    this.chestCasts=[{},{}];this.chestSince=[null,null];
    this.clearFlight();this.handsUp={since:null,latched:false,loweredSince:null};this.clearRun();
  }
  clearCast(){this.arms=[{},{}];this.pendingCast=null;this.chestCasts=[{},{}];this.chestSince=[null,null];}
  clearFlight(){this.flight={state:'idle',motionSince:null,lastCoherent:-Infinity,motionStart:null,lostSince:null,direction:0,strokeOrigin:0,lastMotion:-Infinity,history:[]};this.entered.fly=false;}
  clearRun(){this.run={side:0,time:-Infinity,steps:0,lastMotion:-Infinity,activeUntil:-Infinity};this.entered.run=false;}
  calibrate(samples,aspect=1){
    const ms=samples.map(s=>measure(s,aspect)).filter(m=>m?.upperBody);if(!ms.length)return false;
    this.baseline={torso:median(ms.map(m=>m.torso))};
    this.reset();return true;
  }
  update(l,t,aspect=1){
    const m=measure(l,aspect),events=[],scores=Object.fromEntries(ACTIONS.map(a=>[a.id,0]));
    if(!m){this.reset();return {events,scores,active:[],quality:0,upperBody:false,armState:'idle'};}
    if(this.previous&&t-this.lastSeen>250)this.reset();
    this.lastSeen=t;
    const prev=this.previous,dt=prev?clamp((t-prev.t)/1000,.008,.25):0;
    const torso=this.baseline?.torso??m.torso,{p}=m;
    const fire=(id,cooldown=650)=>{if(t-(this.lastEvents[id]??-Infinity)>cooldown){events.push({id,time:t});this.lastEvents[id]=t;}};

    const armOK=[visible(l,[11,13,15]),visible(l,[12,14,16])];
    const levels=[0,1].map(s=>(p[15+s].y-p[11+s].y)/torso);
    // This global pose is evaluated before every flight/run/cast lock, including pending gestures.
    const raised=armOK.every(Boolean)&&inFrame(l,[13,14,15,16])&&[0,1].every(s=>{
      const rise=p[11+s].y-p[13+s].y,side=Math.abs(p[13+s].x-p[11+s].x);
      return levels[s]<-.65&&rise>.35*torso&&rise>side*.8;
    });
    const h=this.handsUp;
    if(raised){h.since??=t;h.loweredSince=null;if(!h.latched&&t-h.since>=HANDS_UP_CONFIRM_MS){h.latched=true;fire('raise-both',180);}}
    else{h.since=null;if(h.latched){h.loweredSince??=t;if(t-h.loweredSince>=HANDS_DOWN_CONFIRM_MS)h.latched=false;}}
    this.entered['raise-both']=h.latched;
    if(raised||h.latched){
      this.clearFlight();this.clearRun();this.clearCast();
      scores['raise-both']=h.latched?1:clamp((t-h.since)/HANDS_UP_CONFIRM_MS);
      this.previous={m,t};
      return {events,scores,active:h.latched?['raise-both']:[],quality:m.quality,upperBody:m.upperBody,armState:h.latched?'hands-up':'hands-up-candidate'};
    }
    if(h.loweredSince!=null){
      h.loweredSince=null;this.clearFlight();this.clearRun();this.clearCast();this.previous={m,t};
      return {events,scores,active:[],quality:m.quality,upperBody:m.upperBody,armState:'idle'};
    }
    const velocities=[0,1].map(s=>{
      if(!prev||!dt)return {x:0,y:0};
      return {x:((p[15+s].x-p[11+s].x)-(prev.m.p[15+s].x-prev.m.p[11+s].x))/dt/torso,
        y:((p[15+s].y-p[11+s].y)-(prev.m.p[15+s].y-prev.m.p[11+s].y))/dt/torso};
    });
    const spreads=[0,1].map(s=>Math.abs(p[15+s].x-p[11+s].x)/torso);
    const chestArms=[0,1].map(s=>armOK[s]&&levels[s]>-.25&&levels[s]<.85&&spreads[s]<.65&&angle(p[11+s],p[13+s],p[15+s])<150);
    // Preparation is relative to the shoulders, not a precise hip landmark or a simultaneous two-hand pose.
    const ready=[0,1].map(s=>armOK[s]&&levels[s]>.55&&levels[s]<1.8&&spreads[s]<.70);
    const passive=[0,1].map(s=>ready[s]&&Math.hypot(velocities[s].x,velocities[s].y)<1.4);
    for(let s=0;s<2;s++){if(passive[s])this.passiveSince[s]??=t;else this.passiveSince[s]=null;}

    // Keep flight's spread zone outside the chest-running zone; neither may trap the other in candidate.
    const outward=[0,1].map(s=>(p[15+s].x-p[11+s].x)*Math.sign(p[11+s].x-m.shoulder.x)/torso);
    const f=this.flight,bothOut=armOK.every(Boolean)&&outward.every(v=>v>.70);
    const coherent=bothOut&&velocities.every(v=>Math.abs(v.y)>.35/this.sensitivity)&&velocities[0].y*velocities[1].y>0;

    if(f.state==='idle'&&bothOut){
      f.state='candidate';f.motionSince=null;f.motionStart=null;f.lostSince=null;this.clearCast();
    }
    if(f.state==='candidate'){
      if(bothOut){
        f.lostSince=null;
        if(coherent){
          if(f.motionSince==null||t-f.lastCoherent>100){f.motionSince=t;f.motionStart=[...levels];}
          f.lastCoherent=t;
          const excursion=Math.min(...levels.map((v,s)=>Math.abs(v-f.motionStart[s])));
          scores.fly=clamp(Math.min((t-f.motionSince)/FLIGHT_CONFIRM_MS,excursion/.14))*.8;
          if(t-f.motionSince>=FLIGHT_CONFIRM_MS&&excursion>.14/this.sensitivity){
            f.state='flying';f.lastMotion=t;f.history=[];f.direction=Math.sign(velocities[0].y+velocities[1].y);f.strokeOrigin=(levels[0]+levels[1])/2;
            this.clearCast();fire('fly',450);
          }
        }else if(t-f.lastCoherent>100){f.motionSince=null;f.motionStart=null;}
      }else{
        f.lostSince??=t;
        if(t-f.lostSince>=160){f.state='idle';f.motionSince=null;f.motionStart=null;this.clearCast();}
      }
    }
    if(f.state==='flying'){
      // A single velocity spike must not restart the exit timer. Require actual bilateral travel.
      f.history=f.history.filter(h=>t-h.t<=240);
      const meaningful=coherent&&f.history.some(h=>t-h.t>=60&&levels.every((v,s)=>
        Math.abs(v-h.levels[s])>.08/this.sensitivity&&(v-h.levels[s])*velocities[s].y>0));
      if(meaningful)f.lastMotion=t;
      if(bothOut)f.history.push({t,levels:[...levels]});
      if(coherent){
        f.lastCoherent=t;scores.fly=clamp(Math.min(...velocities.map(v=>Math.abs(v.y)))/1.1);
        const level=(levels[0]+levels[1])/2,direction=Math.sign(velocities[0].y+velocities[1].y);
        if(direction!==f.direction){
          if(f.direction&&direction===1&&Math.abs(level-f.strokeOrigin)>.28)fire('fly',450);
          f.direction=direction;f.strokeOrigin=level;
        }
      }
      if(t-f.lastMotion>=FLIGHT_EXIT_MS){f.state='idle';f.motionSince=null;f.motionStart=null;f.direction=0;f.history=[];this.clearCast();}
    }
    this.entered.fly=f.state==='flying';

    // Chest-level, bent elbows and opposite wrist motion distinguish running from flight.
    // Flight ownership (including its exit grace) also blocks running and its old history.
    if(f.state!=='idle')this.clearRun();
    else{
      if(t-this.run.lastMotion>900&&this.run.steps)this.clearRun();
      const running=this.run;
      const alternating=chestArms.every(Boolean)&&velocities.every(v=>Math.abs(v.y)>.25/this.sensitivity)&&velocities[0].y*velocities[1].y<0;
      if(alternating){
        running.lastMotion=t;
        const difference=levels[0]-levels[1],side=difference>.15/this.sensitivity?1:difference<-.15/this.sensitivity?-1:0;
        if(side&&side!==running.side&&t-running.time>=140){
          running.side=side;running.time=t;running.steps++;
          if(running.steps>=3){fire('run',180);running.activeUntil=t+500;}
        }
        if(running.steps>=3)running.activeUntil=t+500;
      }
      this.entered.run=t<running.activeUntil;
      scores.run=this.entered.run?1:clamp(running.steps/3)*.6;
    }

    // Flight retains exclusive ownership. Chest casts may interrupt running once lateral travel is clear.
    const runLocked=this.entered.run||(this.run.steps>0&&t-this.run.lastMotion<500);
    if(f.state!=='idle')this.clearCast();
    else{
      for(let s=0;s<2;s++){
        if(chestArms[s]&&Math.abs(velocities[s].x)<.8)this.chestSince[s]??=t;
        else this.chestSince[s]=null;
      }
      const loweredSupport=s=>this.passiveSince[s]!=null&&t-this.passiveSince[s]>=PASSIVE_ARM_MS;
      // The supporting hand can keep moving vertically, but must stay near the chest without swinging out.
      const chestSupport=s=>this.chestSince[s]!=null&&t-this.chestSince[s]>=CHEST_SUPPORT_MS;
      if(this.pendingCast){
        const pending=this.pendingCast,s=pending.side,other=1-s;
        const stableOther=loweredSupport(other)||(pending.from==='chest'&&chestSupport(other));
        if(!armOK.every(Boolean)||!stableOther||spreads[s]<.6||levels[s]<-.35||(runLocked&&pending.from!=='chest')){
          this.pendingCast=null;this.arms[s]={};this.chestCasts[s]={};
        }else if(t>=pending.confirmAt){
          fire(castId(s),700);this.pendingCast=null;this.arms[s]={};this.chestCasts[s]={};this.clearRun();scores.run=0;
        }
      }
      for(let s=0;s<2;s++){
        const a=this.chestCasts[s],other=1-s,w=p[15+s],sh=p[11+s];
        if(!armOK.every(Boolean)){this.chestCasts[s]={};continue;}
        // Horizontal preparation survives vertical running swings and the run exit grace.
        if(chestArms[s]&&Math.abs(velocities[s].x)<.8){a.startX=w.x-sh.x;a.startT=t;}
        if(a.startT==null||t-a.startT>1000||t-a.startT<50||this.pendingCast)continue;
        const distance=Math.abs((w.x-sh.x)-a.startX)/torso;
        const outwardSpeed=velocities[s].x*Math.sign(sh.x-m.shoulder.x);
        if(chestSupport(other)||loweredSupport(other)){
          scores[castId(s)]=Math.max(scores[castId(s)],clamp(distance/1.05));
          if(spreads[s]>.75&&outwardSpeed>.8/this.sensitivity&&distance>.50/this.sensitivity&&levels[s]>-.35){
            this.pendingCast={side:s,from:'chest',confirmAt:t+CAST_CONFIRM_MS};this.chestCasts[s]={};
            this.clearRun();scores.run=0;
          }
        }
      }
      // Keep the existing lowered-hand path and its stationary supporting-arm requirement.
      if(runLocked)this.arms=[{},{}];
      else for(let s=0;s<2;s++){
        const other=1-s,a=this.arms[s],w=p[15+s],sh=p[11+s];
        const stableOther=loweredSupport(other);
        if(!armOK.every(Boolean)||!stableOther){this.arms[s]={};continue;}
        // Refresh only while preparing quietly; following the moving hand would erase its travel.
        if(ready[s]&&Math.hypot(velocities[s].x,velocities[s].y)<.8){a.startX=w.x;a.startT=t;}
        if(a.startT!=null&&t-a.startT<1400&&t-a.startT>50){
          const distance=Math.abs(w.x-a.startX)/torso,outwardSpeed=velocities[s].x*Math.sign(sh.x-m.shoulder.x);
          scores[castId(s)]=Math.max(scores[castId(s)],clamp(distance/1.05));
          if(spreads[s]>.75&&outwardSpeed>.8/this.sensitivity&&distance>.50/this.sensitivity&&levels[s]>-.35&&!this.pendingCast){
            this.pendingCast={side:s,confirmAt:t+CAST_CONFIRM_MS};delete a.startT;
          }
        }
      }
    }
    this.previous={m,t};
    return {events,scores,active:ACTIONS.filter(a=>this.entered[a.id]).map(a=>a.id),quality:m.quality,upperBody:m.upperBody,armState:f.state!=='idle'?f.state:this.entered.run?'running':'idle'};
  }
}

// Deterministic example poses also pass through the real recognizer.
export function demoPose(id,t,aspect=1.5){
  const pts=Array.from({length:33},()=>({x:.5,y:.3,z:0,visibility:1,presence:1}));
  const set=(i,x,y)=>{pts[i]={x:.5+x/aspect,y,z:0,visibility:1,presence:1};};
  set(0,0,.16);set(7,-.04,.17);set(8,.04,.17);set(11,-.10,.30);set(12,.10,.30);set(13,-.13,.46);set(14,.13,.46);
  set(15,-.14,.60);set(16,.14,.60);set(23,-.065,.55);set(24,.065,.55);set(25,-.075,.72);set(26,.075,.72);
  set(27,-.08,.90);set(28,.08,.90);set(29,-.09,.92);set(30,.09,.92);set(31,-.055,.93);set(32,.12,.93);
  const phase=(t%4000)/4000,smooth=value=>{value=clamp(value);return value*value*(3-2*value);};
  if(id==='raise-both'){
    const lift=smooth((phase-.14)/.18)*(1-smooth((phase-.72)/.16));
    set(13,-.13-.01*lift,.46-.30*lift);set(14,.13+.01*lift,.46-.30*lift);
    set(15,-.14-.03*lift,.60-.555*lift);set(16,.14+.03*lift,.60-.555*lift);
  }
  if(id==='fly'){
    const spread=smooth((phase-.08)/.12)*(1-smooth((phase-.88)/.1)),wave=Math.sin((phase-.22)*Math.PI*6)*.17*spread;
    set(13,-.13-.11*spread,.46-.1*spread+wave*.5);set(14,.13+.11*spread,.46-.1*spread+wave*.5);
    set(15,-.14-.26*spread,.60-.25*spread+wave);set(16,.14+.26*spread,.60-.25*spread+wave);
  }
  if(id==='run'){
    const wave=phase>.08&&phase<.94?Math.sin((phase-.08)*Math.PI*10):0;
    for(const [knee,ankle,heel,toe,side] of [[25,27,29,31,1],[26,28,30,32,-1]]){
      const lift=Math.max(0,wave*side)*.17;pts[knee].y-=lift;for(const i of [ankle,heel,toe])pts[i].y-=lift*.85;
    }
    set(13,-.14,.44);set(14,.14,.44);set(15,-.1,.36+wave*.05);set(16,.1,.36-wave*.05);
  }
  if(id==='throw-left'||id==='throw-right'){
    const side=id==='throw-left'?0:1,sign=side===0?-1:1;
    const value=smooth((phase-.28)/.18)*(1-smooth((phase-.65)/.20));
    set(13+side,sign*(.13+.12*value),.46-.08*value);set(15+side,sign*(.10+.32*value),.60-.23*value);
    // Camera-facing demonstration, before the preview's optional mirroring.
    pts.forEach(p=>p.x=1-p.x);
  }
  for(const [i,w] of [[17,15],[19,15],[21,15],[18,16],[20,16],[22,16]])pts[i]={...pts[w]};return pts;
}
export const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
