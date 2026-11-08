export const ENTRY_COST=0, FRUIT_RESPAWN=10000, MONSTER_TOTAL=20, MONSTER_LIMIT=20, MONSTER_EXIT_MS=1100;
export const isPlatformEnabled=search=>new URLSearchParams(search).get('a')==='1';
export const VIEW={width:1024,height:576};
export const CHASE={range:176,verticalRange:56,duration:5000,cooldown:3000,speedFactor:1.5};
export const FRUIT_KINDS=['apple','banana','pear','orange','grapes','strawberry','cherry'];
export const PHYSICS={speed:115.2,gravity:1350,jump:700,width:28,height:36,invulnerable:1500,shotTiles:8,shotSpeed:300,shotCooldown:450};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const center=o=>({x:o.x+o.w/2,y:o.y+o.h/2});
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const pick=(a,r)=>a[Math.min(a.length-1,Math.floor(r()*a.length))];
const prop=(o,name)=>o.properties?.find(p=>p.name===name)?.value;

export function parseLevel(map){
  if(map.type!=='map'||map.orientation!=='orthogonal'||!Number.isInteger(map.width)||!Number.isInteger(map.height)||map.width<8||map.height<8||map.tilewidth!==32||map.tileheight!==32)throw Error('地图格式不正确');
  const boundary=map.layers.find(l=>l.name==='boundary'),platforms=map.layers.find(l=>l.name==='platforms'),objects=map.layers.find(l=>l.name==='entities')?.objects;
  const w=map.width,h=map.height,t=map.tilewidth;
  if(boundary?.data?.length!==w*h||platforms?.data?.length!==w*h||!objects)throw Error('地图图层不完整');
  for(let x=0;x<w;x++)if(!boundary.data[x]||!boundary.data[(h-1)*w+x])throw Error('地图上下必须封闭');
  for(let y=0;y<h;y++)if(!boundary.data[y*w]||!boundary.data[y*w+w-1])throw Error('地图左右必须封闭');
  const surfaces=[{id:'floor',x:t,y:(h-1)*t,w:(w-2)*t}];
  for(let row=1;row<h-1;row++)for(let x=1;x<w-1;x++)if(platforms.data[row*w+x]){
    const left=x;while(x+1<w-1&&platforms.data[row*w+x+1])x++;
    surfaces.push({id:`platform-${row}-${left}`,x:left*t,y:row*t,w:(x-left+1)*t});
  }
  const spawn=objects.find(o=>o.type==='spawn'),goal=objects.find(o=>o.type==='castle');
  const points=objects.filter(o=>o.type==='fruitSpawn').map(o=>({x:o.x,y:o.y-14}));
  const monsterSpawns=objects.filter(o=>o.type==='monster').map(o=>{
    const kind=prop(o,'kind')||o.name,surface=surfaces.find(s=>Math.abs(s.y-o.y)<1&&o.x>=s.x&&o.x<=s.x+s.w);
    if(!surface&&kind!=='mosquito')throw Error('地面怪物必须放在平台上');
    return {x:o.x,y:o.y,kind,surface:surface||surfaces[0]};
  });
  if(!spawn||!goal||points.length<9||monsterSpawns.length!==MONSTER_TOTAL)throw Error('地图出生点或终点不足');
  return {id:'orchard-1',revision:'scroll-1',layoutVersion:prop(map,'layoutVersion'),title:prop(map,'title')||'青芽果园',width:w*t,height:h*t,tile:t,map,surfaces,spawn,goal,points,monsterSpawns,signs:objects.filter(o=>o.type==='sign')};
}

export function cameraFor(state,level){return clamp(state.player.x-VIEW.width*.32,0,level.width-VIEW.width);}
export function monsterProgress(state){return {total:state.monsterTotal??state.monsters.length,active:state.monsters.filter(m=>m.alive&&m.active!==false).length,defeated:state.monsters.filter(m=>!m.alive).length,pending:state.monsters.filter(m=>m.alive&&m.active===false).length};}
// Old saves may contain sleeping actors; restore only the original survivors once.
export function restoreMonsterActivity(state){
  for(const monster of state.monsters)monster.active=monster.alive;
}
export function createPlatformRun(heroId,level,random=Math.random,id=globalThis.crypto.randomUUID()){
  const state={version:3,mapRevision:level.revision,layoutVersion:level.layoutVersion,worldWidth:level.width,monsterRule:'fixed-v1',id,levelId:level.id,levelIndex:0,heroId,entryPaid:ENTRY_COST,status:'playing',monsterTotal:MONSTER_TOTAL,hearts:3,elapsedMs:0,ammo:[],fruitRefreshPaused:false,monsters:[],fruits:[],shots:[],nextShotAt:0,invulnerableUntil:0,jumpQueuedUntil:-1,coyoteUntil:100,player:{x:level.spawn.x-14,y:level.spawn.y-36,w:28,h:36,vy:0,dir:1,grounded:true},collected:0};
  state.monsters=level.monsterSpawns.map((s,i)=>({id:`monster-${i}`,kind:s.kind,x:s.x-15,y:s.y-34,baseY:s.y-34,w:30,h:34,dir:-1,speed:s.kind==='mosquito'?48:38+i%3*4,minX:s.kind==='mosquito'?s.x-85:Math.max(s.surface.x,s.x-96),maxX:s.kind==='mosquito'?s.x+55:Math.min(s.surface.x+s.surface.w-30,s.x+96),surfaceMin:s.surface.x,surfaceMax:s.surface.x+s.surface.w-30,alive:true,active:true,chaseUntil:0,cooldownUntil:0}));
  state.fruits=level.points.map((p,i)=>({id:`fruit-${i}`,kind:pick(FRUIT_KINDS,random),x:p.x,y:p.y,active:true,respawnAt:0}));
  return state;
}
export function buyPlatformRun(save,heroId,level,random=Math.random){return !Number.isSafeInteger(save.diamonds)||save.diamonds<ENTRY_COST?null:{...save,diamonds:save.diamonds-ENTRY_COST,platformRun:createPlatformRun(heroId,level,random),lastView:'platform'};}

export function normalizePlatformRun(v){
  if(!v||![1,2,3].includes(v.version)||v.levelId!=='orchard-1'||![0,10].includes(v.entryPaid)||typeof v.id!=='string'||!v.id||v.levelIndex!==0||!['playing','won','lost'].includes(v.status)||!Number.isInteger(v.hearts)||v.hearts<0||v.hearts>3||!Number.isFinite(v.elapsedMs)||v.elapsedMs<0)return null;
  if(!v.player||![v.player.x,v.player.y,v.player.vy].every(Number.isFinite)||v.player.w!==28||v.player.h!==36||![-1,1].includes(v.player.dir))return null;
  if(![v.nextShotAt,v.invulnerableUntil,v.jumpQueuedUntil,v.coyoteUntil].every(Number.isFinite)||!Number.isSafeInteger(v.collected)||v.collected<0)return null;
  if(!Array.isArray(v.ammo)||!v.ammo.every(k=>FRUIT_KINDS.includes(k))||!Array.isArray(v.fruits)||!v.fruits.every(f=>FRUIT_KINDS.includes(f.kind)&&[f.x,f.y,f.respawnAt].every(Number.isFinite)&&typeof f.active==='boolean'))return null;
  if(!Array.isArray(v.monsters)||v.monsters.length<1||v.monsters.length>20||new Set(v.monsters.map(m=>m.id)).size!==v.monsters.length||!v.monsters.every(m=>['fox','wolf','fluff','mosquito'].includes(m.kind)&&[m.x,m.y,m.speed,m.minX,m.maxX].every(Number.isFinite)&&m.speed>=0&&m.w===30&&m.h===34&&typeof m.alive==='boolean'&&[-1,1].includes(m.dir)&&m.minX<=m.maxX))return null;
  if(v.fruitRefreshPaused!==undefined&&typeof v.fruitRefreshPaused!=='boolean')return null;
  if(!Array.isArray(v.shots)||v.status==='lost'&&v.hearts!==0||v.status!=='lost'&&v.hearts===0)return null;
  if(v.version<3)return structuredClone(v); // Convert with the map at mount, without charging again.
  if(v.mapRevision!=='scroll-1'||v.monsterTotal!==20||v.monsters.length!==20||v.monsters.filter(m=>m.alive&&m.active).length>MONSTER_LIMIT)return null;
  if(!v.monsters.every(m=>typeof m.active==='boolean'&&[m.baseY,m.surfaceMin,m.surfaceMax,m.chaseUntil,m.cooldownUntil].every(Number.isFinite)&&m.surfaceMin<=m.surfaceMax&&m.chaseUntil>=0&&m.cooldownUntil>=0&&(m.exitUntil===undefined||Number.isFinite(m.exitUntil))))return null;
  if(!v.shots.every(s=>FRUIT_KINDS.includes(s.kind)&&[s.x,s.y,s.fromX,s.fromY,s.born,s.dir,s.distance].every(Number.isFinite)&&[-1,1].includes(s.dir)&&s.distance>=0&&s.distance<=8*32))return null;
  const worldWidth=v.worldWidth??10240;
  if(!Number.isInteger(worldWidth)||worldWidth<1024||worldWidth>10240||worldWidth%32!==0)return null;
  if(v.player.x<32||v.player.x+28>worldWidth-32||v.player.y<32||v.player.y+36>544)return null;
  return {...structuredClone(v),fruitRefreshPaused:v.ammo.length>5?true:v.ammo.length<5?false:v.fruitRefreshPaused??false};
}
export function upgradePlatformRun(run,level){
  if(run.version===3){
    const copy=structuredClone(run);
    if((copy.worldWidth??10240)!==level.width){
      const oldWidth=copy.worldWidth??10240,fresh=createPlatformRun(copy.heroId,level,Math.random,copy.id);
      const progress=clamp((copy.player.x-level.tile)/(oldWidth-2*level.tile-copy.player.w),0,1);
      copy.player.x=level.tile+progress*(level.width-2*level.tile-copy.player.w);
      delete copy.player.surfaceId;copy.shots=[];
      copy.monsters=fresh.monsters.map(monster=>{
        const previous=copy.monsters.find(m=>m.id===monster.id);
        return {...monster,alive:previous?.alive??true,active:false};
      });
      copy.fruits=fresh.fruits.map(fruit=>{
        const previous=copy.fruits.find(f=>f.id===fruit.id);
        return previous?{...previous,x:fruit.x,y:fruit.y}:fruit;
      });
    }else if(copy.layoutVersion!==level.layoutVersion){
      for(const fruit of copy.fruits){
        const point=level.points[Number(fruit.id?.replace('fruit-',''))];
        if(point){fruit.x=point.x;fruit.y=point.y;}
      }
    }
    copy.layoutVersion=level.layoutVersion;copy.worldWidth=level.width;copy.monsterRule='fixed-v1';restoreMonsterActivity(copy);
    return copy;
  }
  const next=createPlatformRun(run.heroId,level,Math.random,run.id);
  Object.assign(next,{entryPaid:run.entryPaid,hearts:run.hearts,ammo:[...run.ammo],collected:run.collected,fruitRefreshPaused:run.ammo.length>5||run.ammo.length===5&&!!run.fruitRefreshPaused,status:run.status,migrated:true});
  return next;
}
export function queueJump(state){if(state.status==='playing')state.jumpQueuedUntil=state.elapsedMs+130;}
export function advancePlayer(state,level,dt,input={}){
  const p=state.player,oldFeet=p.y+p.h;
  if(input.jump&&p.grounded)queueJump(state);
  if(state.jumpQueuedUntil>=state.elapsedMs&&(p.grounded||state.coyoteUntil>=state.elapsedMs)){
    p.vy=-PHYSICS.jump;p.grounded=false;state.coyoteUntil=-1;state.jumpQueuedUntil=-1;state.events?.push({type:'jump'});
  }
  const direction=Number(!!input.right)-Number(!!input.left);
  if(!direction&&[-1,1].includes(input.facing))p.dir=input.facing;
  if(direction){p.x+=direction*PHYSICS.speed*dt;p.dir=direction;}
  p.x=clamp(p.x,level.tile,level.width-level.tile-p.w);
  p.vy+=PHYSICS.gravity*dt;p.y+=p.vy*dt;
  if(p.y<level.tile){p.y=level.tile;p.vy=Math.max(0,p.vy);}
  const wasGrounded=p.grounded;p.grounded=false;
  if(p.vy>=0){
    const landing=level.surfaces.filter(s=>oldFeet<=s.y+.6&&p.y+p.h>=s.y&&p.x+p.w>s.x+1&&p.x<s.x+s.w-1).sort((a,b)=>a.y-b.y)[0];
    if(landing){p.y=landing.y-p.h;p.vy=0;p.grounded=true;p.surfaceId=landing.id;}
  }
  if(p.y+p.h>level.height-level.tile){p.y=level.height-level.tile-p.h;p.vy=0;p.grounded=true;p.surfaceId='floor';}
  if(p.grounded)state.coyoteUntil=state.elapsedMs+100;
  else if(wasGrounded&&state.coyoteUntil<state.elapsedMs)state.coyoteUntil=state.elapsedMs+100;
}
export function updateFruitRefresh(state){
  const before=state.fruitRefreshPaused??false;
  if(state.ammo.length>5)state.fruitRefreshPaused=true;else if(state.ammo.length<5)state.fruitRefreshPaused=false;else state.fruitRefreshPaused=before;
  if(before!==state.fruitRefreshPaused)state.events?.push({type:state.fruitRefreshPaused?'fruit-refresh-paused':'fruit-refresh-resumed'});
  return state.fruitRefreshPaused;
}
export function safeFruitPoints(state,level,ignoreId){
  const camera=cameraFor(state,level);
  return level.points.filter(p=>p.x>=camera&&p.x<=camera+VIEW.width&&state.monsters.every(m=>!m.alive||Math.hypot(p.x-m.x-15,p.y-m.y-17)>=112)&&state.fruits.every(f=>f.id===ignoreId||!f.active||Math.hypot(p.x-f.x,p.y-f.y)>=25));
}
export function refreshFruits(state,level,random=Math.random){
  if(updateFruitRefresh(state))return;
  for(const f of state.fruits)if(!f.active&&state.elapsedMs>=f.respawnAt){
    const points=safeFruitPoints(state,level,f.id);if(!points.length)continue;
    const p=pick(points,random);Object.assign(f,{x:p.x,y:p.y,kind:pick(FRUIT_KINDS,random),active:true});state.events?.push({type:'respawn'});
  }
}
export function advanceMonsters(state,dt){
  const pc=center(state.player);
  for(const m of state.monsters)if(m.alive&&m.active){
    const mc=center(m),dx=pc.x-mc.x,dy=Math.abs(pc.y-mc.y);
    if(state.elapsedMs>=m.cooldownUntil&&state.elapsedMs>=m.chaseUntil&&Math.abs(dx)<=CHASE.range&&dy<=CHASE.verticalRange){
      m.dir=dx<0?-1:1;m.chaseUntil=state.elapsedMs+CHASE.duration;m.cooldownUntil=m.chaseUntil+CHASE.cooldown;state.events?.push({type:'chase'});
    }
    const charging=state.elapsedMs<m.chaseUntil,resting=!charging&&state.elapsedMs<m.cooldownUntil;
    if(!resting){
      if(!charging){if(m.x<m.minX)m.dir=1;else if(m.x>m.maxX)m.dir=-1;}
      const before=m.x;
      m.x+=m.dir*m.speed*(charging?CHASE.speedFactor:1)*dt;
      const left=charging?m.surfaceMin:m.minX,right=charging?m.surfaceMax:m.maxX;
      if(charging)m.x=clamp(m.x,left,right);
      else if(before>=left&&m.x<=left){m.x=left;m.dir=1;}else if(before<=right&&m.x>=right){m.x=right;m.dir=-1;}
    }
    if(m.kind==='mosquito'&&!resting)m.y=m.baseY+Math.sin(state.elapsedMs/330+Number(m.id.split('-')[1]))*18;
  }
}
function defeat(state,m,method,dir=state.player.dir){
  m.alive=false;m.active=false;m.exitUntil=state.elapsedMs+MONSTER_EXIT_MS;
  const c=center(m);state.events.push({type:'defeat',method,kind:m.kind,x:c.x,y:c.y,dir,exitUntil:m.exitUntil});
}
function hurt(state,cause){
  if(state.elapsedMs<state.invulnerableUntil)return;
  state.hearts--;state.invulnerableUntil=state.elapsedMs+PHYSICS.invulnerable;state.player.vy=-330;state.player.grounded=false;
  state.events.push({type:'hurt',cause});
  if(state.hearts===0){state.status='lost';state.events.push({type:'lost'});}
}
export function fireFruit(state,level){
  if(state.status!=='playing'||!state.ammo.length||state.elapsedMs<state.nextShotAt)return false;
  state.events??=[];
  const c=center(state.player),kind=state.ammo.shift();
  state.shots.push({id:`shot-${state.elapsedMs}`,kind,fromX:c.x,fromY:c.y,x:c.x,y:c.y,born:state.elapsedMs,dir:state.player.dir,distance:0});
  state.nextShotAt=state.elapsedMs+PHYSICS.shotCooldown;state.events?.push({type:'shoot'});updateFruitRefresh(state);return true;
}
export function advanceShots(state,level,dt){
  for(const s of state.shots){
    const delta=Math.min(PHYSICS.shotSpeed*dt,level.tile*PHYSICS.shotTiles-s.distance),oldX=s.x;
    s.x+=s.dir*delta;s.distance+=delta;
    const sweep={x:Math.min(oldX,s.x)-7,y:s.y-7,w:Math.abs(s.x-oldX)+14,h:14};
    const hit=state.monsters.filter(m=>m.alive&&m.active&&overlap(sweep,m)).sort((a,b)=>(a.x-b.x)*s.dir)[0];
    if(hit){defeat(state,hit,'fruit',s.dir);s.finished=true;}
    if(s.distance>=level.tile*PHYSICS.shotTiles||s.x>=level.width-level.tile||s.x<=level.tile)s.finished=true;
  }
  state.shots=state.shots.filter(s=>!s.finished);
}
export function stepPlatform(state,level,dt,random=Math.random,input={}){
  state.events=[];if(state.status!=='playing')return state.events;
  dt=clamp(dt,0,1/30);state.elapsedMs+=dt*1000;
  const oldFeet=state.player.y+state.player.h;
  advancePlayer(state,level,dt,input);advanceMonsters(state,dt);refreshFruits(state,level,random);
  const p=state.player,pc=center(p);
  for(const f of state.fruits)if(f.active&&Math.abs(f.x-pc.x)<p.w/2+11&&Math.abs(f.y-pc.y)<p.h/2+11){
    f.active=false;f.respawnAt=state.elapsedMs+FRUIT_RESPAWN;state.ammo.push(f.kind);state.collected++;state.events.push({type:'collect',x:f.x,y:f.y});
  }
  updateFruitRefresh(state);if(input.fire)fireFruit(state,level);advanceShots(state,level,dt);
  for(const m of state.monsters)if(m.alive&&m.active){
    const horizontal=p.x+p.w>m.x&&p.x<m.x+m.w;
    if(p.vy>0&&horizontal&&oldFeet<=m.y+8&&p.y+p.h>=m.y&&p.y<m.y+m.h){
      defeat(state,m,'stomp');p.y=m.y-p.h;p.vy=-420;p.grounded=false;state.coyoteUntil=-1;
    }else if(overlap(p,m))hurt(state,'monster');
    if(state.status!=='playing')break;
  }
  if(state.status==='playing'&&p.x+p.w>=level.goal.x+48&&p.y+p.h>level.goal.y+80){state.status='won';state.events.push({type:'won'});}
  return state.events;
}
