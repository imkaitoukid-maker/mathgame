import { parseLevel, stepPlatform, queueJump, ENTRY_COST, FRUIT_KINDS, MONSTER_LIMIT, monsterProgress, refillMonsters, VIEW, cameraFor, upgradePlatformRun } from './platform-engine.js';
import { getProjectile } from './projectiles.js';
import {PoseInput} from './pose-input.js';
import {createPoseSession} from './pose-session.js';
export const PLATFORM_LEVELS=['orchard-1'];
let sharedPromise;
const heroImages=new Map();
const image=url=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('游戏图片没能加载，请联网后再试'));img.src=url;});
function svgImage(art){const svg=art.replace('<svg',`<svg ${art.includes('xmlns=')?'':'xmlns="http://www.w3.org/2000/svg"'} width="64" height="64"`);return image('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));}
const fluffArt='<svg viewBox="0 0 64 64"><g stroke="#8d739d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 22-2-15q11 2 14 12m15 0q4-10 11-12l-1 17" fill="#ffe2a2"/><path d="M14 19q-7 1-5 10-11 5-3 12-5 10 7 12 4 10 14 4 10 8 17 0 13 5 14-6 11-5 4-14 4-12-7-15-4-10-14-5-10-7-17 2Z" fill="#c8a7dc"/><path d="m18 31 7 3m14 0 7-3"/><path d="m24 41 8 7 9-7" fill="#fff8e8"/><circle cx="21" cy="37" r="1.7" fill="#795b83"/><circle cx="43" cy="37" r="1.7" fill="#795b83"/></g><ellipse cx="14" cy="43" rx="5" ry="3" fill="#eca6b4"/><ellipse cx="50" cy="43" rx="5" ry="3" fill="#eca6b4"/></svg>';

export async function preparePlatformer(hero){
  if(!sharedPromise)sharedPromise=Promise.all([
    fetch('./maps/orchard-1.tmj').then(r=>{if(!r.ok)throw Error('关卡没能加载');return r.json();}).then(parseLevel),
    image('./assets/platformer/orchard-background.png'),image('./assets/platformer/tiles.svg'),image('./assets/animals.png'),svgImage(fluffArt),
    Promise.all(FRUIT_KINDS.map(async kind=>[kind,await svgImage(getProjectile(kind).art)])),
  ]).then(([level,background,tiles,enemies,fluff,fruits])=>({level,background,tiles,enemies,fluff,fruits:Object.fromEntries(fruits)})).catch(error=>{sharedPromise=null;throw error;});
  if(!heroImages.has(hero.id))heroImages.set(hero.id,image(hero.image).catch(e=>{heroImages.delete(hero.id);throw e;}));
  const [shared,heroImage]=await Promise.all([sharedPromise,heroImages.get(hero.id)]);
  return {...shared,heroImage};
}

export function mountPlatformer(container,{run,assets,heroName,resuming=false,onSave,onHome,onRetry,onSound,getBalance,poseSessionFactory=createPoseSession}){
  const level=assets.level;
  let state=upgradePlatformRun(run,level),paused=resuming||run.status==='playing',disposed=false,last=performance.now(),accumulator=0,lastSaved=0,raf=0,endShown=false;
  let calibrationOpen=state.status==='playing',poseEnabled=false;
  const poseInput=new PoseInput(state.player.dir);
  const input={left:false,right:false,jump:false,fire:false},heldKeys=new Set(),touchInputs=new Map();
  let fireQueued=false;
  refillMonsters(state,level);
  const effects=[];
  container.innerHTML=`<section class="platformer-card" aria-label="水果跳跳乐，第1关">
    <div class="platform-hud"><h1>第1关 · ${level.title}</h1><div class="platform-hearts" role="img" aria-label="剩余3颗桃心"></div><div class="platform-counts"><span class="platform-ammo">🍎 水果 <b>0</b><small class="platform-refresh-badge" hidden>刷新暂停</small></span><span class="platform-enemies">击败 <b>0/${monsterProgress(state).total}</b></span><span class="platform-active">场上 <b>0/${MONSTER_LIMIT}</b></span><button class="platform-pause" aria-label="暂停游戏">Ⅱ</button></div></div>
    <div class="platform-route"><span>🌱 起点</span><div role="progressbar" aria-label="前往城堡的进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><b class="platform-distance">0%</b><span>🏰 城堡</span></div>
    <div class="platform-stage"><canvas id="platform-canvas" tabindex="0" role="application" aria-label="${heroName}的卷轴果园，左方向键向左，右方向键向右，松开停止，Space跳跃，J发射水果"></canvas><div class="platform-overlay" hidden role="dialog" aria-label="游戏暂停"><div class="platform-modal"><div class="platform-modal-icon" aria-hidden="true">🌱</div><h2></h2><p></p><button class="primary-button" data-platform-resume>继续冒险</button><button class="primary-button" data-platform-retry>再玩一局 · 10钻石</button><button class="text-button" data-platform-home>返回首页</button></div></div></div>
    <div class="platform-instructions"><strong><kbd>←</kbd> 向左　<kbd>→</kbd> 向右 · 松开停止</strong><span><kbd>Space</kbd> 跳跃　<kbd>J</kbd> 发射 · 8格射程</span><span class="platform-paid">本局已付10钻石</span></div>
    <div class="platform-bottom"><span class="platform-message" aria-live="polite">跳上平台、收集水果，向城堡出发！</span><div class="platform-touch-controls" aria-label="游戏操作"><button class="platform-pose" aria-label="打开体感校准">体感校准</button><button data-control="left" aria-label="按住向左">← 向左</button><button data-control="right" aria-label="按住向右">向右 →</button><button data-control="jump">跳跃 ↑</button><button data-control="fire">发射水果</button></div></div>
  </section>
  <section class="pose-calibration" role="dialog" aria-modal="true" aria-labelledby="pose-title" ${calibrationOpen?'':'hidden'}>
    <div class="pose-modal"><span class="pose-eyebrow">动一动，和小伙伴一起冒险</span><h2 id="pose-title">先校准，再出发</h2><p class="pose-intro">让头、双肩、双肘和双手入镜，头顶和两侧留出活动空间。无需拍到腿部。</p>
      <div class="pose-calibration-body"><div class="pose-preview"><video muted playsinline aria-label="摄像头校准预览"></video><span class="pose-preview-placeholder">🌱<br>开启摄像头后<br>双手自然下垂，保持稳定</span></div>
      <div class="pose-guide"><div><b>👈 左手侧挥</b><span>角色向左转</span></div><div><b>👉 右手侧挥</b><span>角色向右转</span></div><div><b>🙌 双手举过头顶</b><span>跳跃一次</span></div><div><b>🏃 胸前交替摆臂</b><span>沿面向方向前进</span></div><div><b>🕊️ 双臂飞翔</b><span>有水果时向面向方向发射</span></div></div></div>
      <p class="pose-status" role="status">准备好后开启摄像头，稳定站好即可完成校准。</p><progress class="pose-progress" max="1" value="0" aria-label="校准进度"></progress>
      <div class="pose-actions"><button class="primary-button" data-pose-start>开启摄像头并校准</button><button class="text-button" data-pose-keyboard>先用键盘玩</button></div>
      <p class="pose-local-note">校准完成后自动收起。画面仅在浏览器本地识别，不录制、不上传。飞翔发射水果，也可用 J 或下方按钮。</p>
    </div>
  </section>`;
  const canvas=container.querySelector('canvas'),ctx=canvas.getContext('2d');
  const overlay=container.querySelector('.platform-overlay'),resumeButton=container.querySelector('[data-platform-resume]'),retryButton=container.querySelector('[data-platform-retry]'),pauseButton=container.querySelector('.platform-pause');
  const hearts=container.querySelector('.platform-hearts'),ammo=container.querySelector('.platform-ammo b'),enemies=container.querySelector('.platform-enemies b'),active=container.querySelector('.platform-active b'),message=container.querySelector('.platform-message');
  const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=VIEW.width*dpr;canvas.height=VIEW.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;
  const route=container.querySelector('[role="progressbar"]'),distance=container.querySelector('.platform-distance');
  const poseModal=container.querySelector('.pose-calibration'),poseStart=container.querySelector('[data-pose-start]'),poseStatus=container.querySelector('.pose-status'),poseProgress=container.querySelector('.pose-progress'),poseVideo=container.querySelector('.pose-preview video'),poseButton=container.querySelector('.platform-pose');
  const poseSession=poseSessionFactory({
    video:poseVideo,
    onSample(sample){
      if(disposed||paused||!poseEnabled)return;
      if(poseInput.receive(sample)){
        const names={'throw-left':'向左转','throw-right':'向右转','raise-both':'跳跃','run':'原地跑，沿当前方向前进','fly':state.ammo.length?'飞翔，发射水果':'飞翔，请先收集水果'};
        const action=sample.result?.events?.find(e=>names[e.id]);if(action)message.textContent='体感：'+names[action.id];
      }
    },
    onStatus(status){
      if(disposed)return;
      poseStart.disabled=true;poseStart.textContent=status.phase==='loading'?'正在准备…':'校准中…';
      if(poseStatus.textContent!==status.text)poseStatus.textContent=status.text;poseProgress.value=status.progress;
      poseVideo.parentElement.classList.toggle('has-video',!!poseVideo.srcObject);
    },
    onCalibrated(){
      if(disposed)return;
      poseEnabled=true;calibrationOpen=false;poseModal.hidden=true;poseButton.textContent='重新校准';poseInput.direction=state.player.dir;poseInput.clear(performance.now());
      setPaused(false);canvas.focus({preventScroll:true});message.textContent='体感已就绪：侧挥转向，举手跳跃，原地跑前进，飞翔发射水果。';
    },
    onLost(){poseInput.clear(performance.now());if(!disposed&&poseEnabled)message.textContent='未看见完整上半身，体感前进已停止；回到画面后可继续。';},
    onError(text){
      if(disposed)return;
      poseEnabled=false;calibrationOpen=true;poseModal.hidden=false;setPaused(true);poseStart.disabled=false;poseStart.textContent='重新尝试校准';poseStatus.textContent=text;poseProgress.value=0;poseVideo.parentElement.classList.remove('has-video');
    },
  });
  function snapshot(){const copy=structuredClone(state);delete copy.events;return copy;}
  function saveNow(){if(!disposed)onSave(snapshot());}
  function hud(){
    const health=Array.from({length:3},(_,i)=>`<span class="${i<state.hearts?'':'empty'}" aria-hidden="true">♥</span>`).join('');
    if(hearts.innerHTML!==health)hearts.innerHTML=health;
    hearts.setAttribute('aria-label',`剩余${state.hearts}颗桃心`);
    const progress=monsterProgress(state);
    ammo.textContent=state.ammo.length;enemies.textContent=`${progress.defeated}/${progress.total}`;active.textContent=`${progress.active}/${MONSTER_LIMIT}`;
    container.querySelector('.platform-refresh-badge').hidden=!state.fruitRefreshPaused;
    ammo.parentElement.title=state.fruitRefreshPaused?'水果刷新已暂停，库存低于5个恢复':'吃掉的水果10秒后刷新';
    const percent=state.status==='won'?100:Math.max(0,Math.min(99,Math.floor((state.player.x-level.spawn.x+14)/(level.goal.x+48-level.spawn.x)*100)));
    route.setAttribute('aria-valuenow',percent);route.querySelector('i').style.width=percent+'%';distance.textContent=percent+'%';
  }
  function showOverlay(){
    const ended=state.status!=='playing';overlay.hidden=calibrationOpen||!(paused||ended);
    pauseButton.disabled=ended||calibrationOpen;poseButton.disabled=ended;
    pauseButton.setAttribute('aria-label',paused?'继续游戏':'暂停游戏');pauseButton.textContent=paused?'▶':'Ⅱ';
    if(overlay.hidden)return;
    overlay.setAttribute('aria-label',ended?'游戏结果':'游戏暂停');
    const won=state.status==='won',hasNext=PLATFORM_LEVELS[state.levelIndex+1];
    overlay.querySelector('h2').textContent=ended?(won?'第1关通关啦！':'桃心用完啦，再试一次！'):'休息一下，冒险等着你';
    overlay.querySelector('p').textContent=ended?(won?(hasNext?'正在前往下一关…':'抵达糖果城堡！第2关正在准备中。'):'试着跳上平台，从上方踩怪，或用J发射水果。'):'按住←或→移动，松开停止；Space跳跃，J朝面向方向发射水果。继续这一局不用再扣钻石。';
    resumeButton.hidden=ended;retryButton.hidden=!ended;
    retryButton.disabled=getBalance()<ENTRY_COST;
    retryButton.textContent=getBalance()<ENTRY_COST?'钻石不足10个，先去练习口算吧':'再玩一局 · 10钻石';
    pauseButton.disabled=ended;
    pauseButton.setAttribute('aria-label',paused?'继续游戏':'暂停游戏');pauseButton.textContent=paused?'▶':'Ⅱ';
  }
  function syncInput(){
    const touches=[...touchInputs.values()];
    input.left=heldKeys.has('ArrowLeft')||touches.includes('left');input.right=heldKeys.has('ArrowRight')||touches.includes('right');
    input.jump=['Space','ArrowUp','KeyW'].some(key=>heldKeys.has(key))||touches.includes('jump');input.fire=heldKeys.has('KeyJ')||touches.includes('fire');
  }
  function clearInput(){heldKeys.clear();touchInputs.clear();syncInput();fireQueued=false;poseInput.clear(performance.now());}
  function setPaused(value){if(!value&&calibrationOpen)return;clearInput();paused=value;if(!calibrationOpen)poseSession.setSuspended(value);last=performance.now();accumulator=0;showOverlay();saveNow();}
  poseStart.addEventListener('click',()=>{if(!disposed)void poseSession.start();});
  container.querySelector('[data-pose-keyboard]').addEventListener('click',()=>{poseSession.stop();poseEnabled=false;calibrationOpen=false;poseModal.hidden=true;poseButton.textContent='体感校准';setPaused(false);canvas.focus({preventScroll:true});});
  poseButton.addEventListener('click',()=>{
    poseSession.stop();poseEnabled=false;calibrationOpen=true;poseModal.hidden=false;setPaused(true);poseStart.disabled=false;poseStart.textContent='开启摄像头并校准';poseProgress.value=0;poseStatus.textContent='双手自然下垂，稳定站好后开启校准。';poseVideo.parentElement.classList.remove('has-video');
  });
  const focusCanvas=event=>{if(event.button===0)canvas.focus({preventScroll:true});};
  const key=event=>{
    if(event.target?.closest?.('button,input,select,textarea'))return;
    if(calibrationOpen)return;
    if(event.code==='Escape'&&state.status==='playing'){event.preventDefault();if(!event.repeat)setPaused(!paused);return;}
    if(paused||state.status!=='playing')return;
    if(['ArrowLeft','ArrowRight','Space','ArrowUp','KeyW','KeyJ'].includes(event.code)){event.preventDefault();heldKeys.add(event.code);syncInput();}
    if(['Space','ArrowUp','KeyW'].includes(event.code)&&!event.repeat)queueJump(state);
    if(event.code==='KeyJ'&&!event.repeat)fireQueued=true;
  };
  const keyup=event=>{heldKeys.delete(event.code);syncInput();};
  const blur=()=>{clearInput();if(state.status==='playing'&&!paused)setPaused(true);};
  const visibility=()=>{if(document.hidden&&state.status==='playing')setPaused(true);};
  canvas.addEventListener('pointerdown',focusCanvas);
  window.addEventListener('keydown',key);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  for(const button of container.querySelectorAll('[data-control]')){
    const control=button.dataset.control;
    button.addEventListener('pointerdown',event=>{if(event.button!==0||paused||state.status!=='playing')return;event.preventDefault();button.setPointerCapture(event.pointerId);touchInputs.set(event.pointerId,control);syncInput();canvas.focus({preventScroll:true});if(control==='jump')queueJump(state);if(control==='fire')fireQueued=true;});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>{touchInputs.delete(event.pointerId);syncInput();});
  }
  pauseButton.addEventListener('click',()=>{setPaused(!paused);if(!paused)canvas.focus({preventScroll:true});});
  resumeButton.addEventListener('click',()=>{setPaused(false);canvas.focus({preventScroll:true});});
  retryButton.addEventListener('click',()=>{setPaused(true);onRetry();});
  container.querySelector('[data-platform-home]').addEventListener('click',()=>{setPaused(true);onHome();});

  function sprite(img,x,y,size,dir=1,rotation=0,alpha=1){ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(dir,1);ctx.globalAlpha=alpha;ctx.drawImage(img,-size/2,-size*.875,size,size);ctx.restore();}
  function monster(kind,x,y,dir=1,rotation=0,alpha=1){
    if(kind==='mosquito'){
      ctx.save();ctx.translate(x,y-18);ctx.rotate(rotation);ctx.scale(-dir,1);ctx.globalAlpha=alpha;
      ctx.lineWidth=2;ctx.strokeStyle='#8f789b';ctx.fillStyle='#eddef6';
      for(const side of [-1,1]){ctx.save();ctx.translate(side*8,-9);ctx.rotate(side*(.45+Math.sin(state.elapsedMs/30)*.3));ctx.beginPath();ctx.ellipse(0,-5,7,12,side*.5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
      ctx.fillStyle='#bd97ce';ctx.beginPath();ctx.ellipse(-4,0,13,9,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff0b9';ctx.beginPath();ctx.arc(10,-3,9,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#66516c';ctx.beginPath();ctx.arc(12,-5,2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(18,-1);ctx.lineTo(27,1);ctx.moveTo(-8,8);ctx.lineTo(-13,14);ctx.moveTo(1,8);ctx.lineTo(5,14);ctx.stroke();ctx.restore();return;
    }
    if(kind==='fluff')return sprite(assets.fluff,x,y,45,dir,rotation,alpha);
    const column=kind==='fox'?0:2,sourceW=assets.enemies.width/3,sourceH=assets.enemies.height/2;
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(-dir,1);ctx.globalAlpha=alpha;
    ctx.drawImage(assets.enemies,column*sourceW,sourceH,sourceW,sourceH,-28,-50,56,56);ctx.restore();
  }
  function castle(){
    const g=level.goal,x=g.x,y=g.y;
    ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#b98b9f';
    const box=(bx,by,w,h,fill,r=5)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(bx,by,w,h,r);ctx.fill();ctx.stroke();};
    box(x+16,y+56,112,104,'#ffe3d9');
    for(const bx of [x,x+112]){
      box(bx,y+28,32,132,'#f6c2d6');ctx.fillStyle='#b9c7f2';ctx.beginPath();ctx.moveTo(bx-7,y+31);ctx.lineTo(bx+16,y-7);ctx.lineTo(bx+39,y+31);ctx.closePath();ctx.fill();ctx.stroke();
      box(bx+11,y+55,10,23,'#fff9cd');
    }
    box(x+42,y+14,60,71,'#ffedc5');
    for(let i=0;i<3;i++)box(x+42+i*23,y+6,14,20,'#ffedc5',2);
    ctx.fillStyle='#9a7a9d';ctx.beginPath();ctx.roundRect(x+51,y+105,42,55,[21,21,2,2]);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffecb0';ctx.beginPath();ctx.arc(x+84,y+139,3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#a9878c';ctx.beginPath();ctx.moveTo(x+73,y+5);ctx.lineTo(x+73,y-37);ctx.stroke();ctx.fillStyle='#ef98b8';ctx.beginPath();ctx.moveTo(x+74,y-37);ctx.lineTo(x+106,y-26);ctx.lineTo(x+74,y-14);ctx.fill();
    ctx.font='bold 19px sans-serif';ctx.fillStyle='#d389a3';ctx.textAlign='center';ctx.fillText('♥',x+72,y+59);
    ctx.fillStyle='#fffbed';ctx.strokeStyle='#d9bf93';ctx.beginPath();ctx.roundRect(x+3,y+167,138,27,12);ctx.fill();ctx.stroke();ctx.fillStyle='#956c53';ctx.font='bold 15px sans-serif';ctx.fillText('糖 果 城 堡',x+72,y+186);ctx.restore();
  }
  function draw(now){
    const camera=cameraFor(state,level),visible=(x,pad=64)=>x>=camera-pad&&x<=camera+VIEW.width+pad;
    ctx.clearRect(0,0,VIEW.width,VIEW.height);
    const backgroundX=camera*.2,firstBackground=Math.floor(backgroundX/VIEW.width);
    for(let i=firstBackground;i<=firstBackground+1;i++){
      ctx.save();ctx.translate(i*VIEW.width-backgroundX,0);
      if(i%2){ctx.translate(VIEW.width,0);ctx.scale(-1,1);}
      // Keep the open landscape in repeating sections; edge trees belong to the old single-screen frame.
      ctx.drawImage(assets.background,assets.background.width*.2,0,assets.background.width*.6,assets.background.height,0,0,VIEW.width,VIEW.height);ctx.restore();
    }
    ctx.save();ctx.translate(-camera,0);
    const left=Math.max(0,Math.floor(camera/level.tile)),right=Math.min(level.map.width-1,Math.ceil((camera+VIEW.width)/level.tile));
    for(const layer of level.map.layers.filter(l=>l.type==='tilelayer'))for(let row=0;row<level.map.height;row++)for(let col=left;col<=right;col++){
      const gid=layer.data[row*level.map.width+col];if(gid)ctx.drawImage(assets.tiles,(gid-1)*32,0,32,32,col*32,row*32,32,32);
    }
    for(const sign of level.signs)if(visible(sign.x)){
      ctx.fillStyle='#b59168';ctx.fillRect(sign.x+27,sign.y+23,5,39);ctx.fillStyle='#fff0cb';ctx.strokeStyle='#c4a073';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(sign.x-9,sign.y,98,27,6);ctx.fill();ctx.stroke();ctx.fillStyle='#9c7952';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(sign.name+' →',sign.x+40,sign.y+18);
    }
    if(visible(level.goal.x,180))castle();
    for(const f of state.fruits)if(f.active&&visible(f.x)){
      const bob=Math.sin(state.elapsedMs/400+f.x)*2.5;ctx.fillStyle='#6f8d5525';ctx.beginPath();ctx.ellipse(f.x,f.y+13,9,2.3,0,0,Math.PI*2);ctx.fill();ctx.drawImage(assets.fruits[f.kind],f.x-13,f.y-15+bob,26,26);
    }
    for(const m of state.monsters)if(m.alive&&m.active&&visible(m.x)){
      const y=m.y+m.h+Math.sin(state.elapsedMs/180+m.x)*1.2;monster(m.kind,m.x+m.w/2,y,m.dir);
      if(state.elapsedMs<(m.chaseUntil??0)){ctx.save();ctx.font='900 22px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#fff9eb';ctx.fillStyle='#e99156';ctx.strokeText('!',m.x+m.w/2,m.y-10);ctx.fillText('!',m.x+m.w/2,m.y-10);ctx.restore();}
      else if(state.elapsedMs<(m.cooldownUntil??0)){ctx.save();ctx.fillStyle='#9585a9';ctx.font='bold 14px sans-serif';ctx.fillText('z z',m.x+8,m.y-9);ctx.restore();}
    }
    const p=state.player,blink=state.invulnerableUntil>state.elapsedMs&&Math.floor(state.elapsedMs/90)%2;
    const bounce=p.grounded&&input.left!==input.right?Math.sin(state.elapsedMs/100)*1.1:0;
    sprite(assets.heroImage,p.x+p.w/2,p.y+p.h+bounce,49,p.dir,0,blink?.35:1);
    for(const s of state.shots){ctx.save();ctx.translate(s.x,s.y);ctx.rotate((state.elapsedMs-s.born)/220);ctx.drawImage(assets.fruits[s.kind],-11,-11,22,22);ctx.restore();}
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i],age=(now-e.born)/1000;if(age>1.1||e.type==='defeat'&&state.elapsedMs>=e.exitUntil){effects.splice(i,1);continue;}
      if(e.type==='defeat')monster(e.kind,e.x+e.dir*age*170,e.y+17-age*220+age*age*150,e.dir,age*8,Math.max(0,1-age));
      for(let n=0;n<7;n++){const a=n*Math.PI*2/7,spread=age*55;ctx.globalAlpha=Math.max(0,1-age);ctx.fillStyle=e.type==='hurt'?'#ed9db4':n%2?'#ffd67e':'#b6d98c';ctx.beginPath();ctx.arc(e.x+Math.cos(a)*spread,e.y+Math.sin(a)*spread+age*age*26,2.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  function tick(now){
    if(disposed)return;
    const delta=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    if(!paused&&state.status==='playing'){
      const pose=poseEnabled?poseInput.read(now):null;
      if(pose?.jump)queueJump(state);
      const manual=input.left||input.right;
      if(manual&&input.left!==input.right)poseInput.direction=input.left?-1:1;
      const frameInput={...input,fire:input.fire||fireQueued||!!pose?.fire};
      if(pose&&!manual){frameInput.left=pose.move<0;frameInput.right=pose.move>0;frameInput.facing=pose.facing;}
      accumulator+=delta;
      while(accumulator>=1/120){
        frameInput.fire=input.fire||fireQueued||!!pose?.fire;
        const events=stepPlatform(state,level,1/120,Math.random,frameInput);fireQueued=false;accumulator-=1/120;
        for(const event of events){
          if(['collect','defeat','hurt'].includes(event.type))effects.push({...event,x:event.x??state.player.x+14,y:event.y??state.player.y+10,born:now});
          if(event.type==='collect'){message.textContent='吃到水果啦！按J发射，射程8格';onSound('tap');}
          else if(event.type==='jump')onSound('jump');
          else if(event.type==='shoot')onSound('shoot');
          else if(event.type==='hurt'){message.textContent='碰到怪物啦，少一颗桃心';onSound('wrong');}
          else if(event.type==='defeat'){message.textContent=event.method==='stomp'?'踩中啦！弹起来继续前进':'水果命中！向城堡前进';onSound('hit');}
          else if(event.type==='chase')message.textContent='小怪冲锋5秒！跳过它，之后会休息3秒';
          else if(event.type==='fruit-refresh-paused')message.textContent='水果刷新暂停，库存低于5个后恢复';
          else if(event.type==='fruit-refresh-resumed')message.textContent='水果刷新恢复啦！';
          else if(event.type==='won')onSound('finish');
          else if(event.type==='lost')onSound('wrong');
        }
        if(events.some(e=>e.type!=='jump'))saveNow();
        if(state.status!=='playing')break;
      }
      if(state.elapsedMs-lastSaved>=1000){lastSaved=state.elapsedMs;saveNow();}
    }
    hud();draw(now);
    if(state.status!=='playing'&&!endShown){endShown=true;poseSession.stop();poseEnabled=false;saveNow();setTimeout(()=>{if(!disposed)showOverlay();},650);}
    raf=requestAnimationFrame(tick);
  }
  hud();showOverlay();raf=requestAnimationFrame(tick);if(calibrationOpen)poseStart.focus({preventScroll:true});else if(!paused)canvas.focus({preventScroll:true});
  if(run.version!==state.version||run.layoutVersion!==state.layoutVersion)saveNow();
  return {snapshot,pause:()=>setPaused(true),destroy(){clearInput();disposed=true;poseSession.stop();cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',focusCanvas);window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);}};
}
