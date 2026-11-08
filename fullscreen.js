// Keep the calibration dialog and controls inside the fullscreen element.
export function mountGameFullscreen(root,button,onChange){
  const doc=root.ownerDocument,win=doc.defaultView;
  let expanded=false,disposed=false,pending=false,active=false;
  const native=()=>doc.fullscreenElement===root||doc.webkitFullscreenElement===root;
  const exitNative=()=>Promise.resolve((doc.exitFullscreen||doc.webkitExitFullscreen)?.call(doc)).catch(()=>{});
  function sync(){
    if(disposed)return;
    const next=expanded||native();
    root.classList.toggle('platform-fullscreen',next);
    doc.body.classList.toggle('platform-fullscreen-open',next);
    button.textContent=next?'⛶ 退出全屏':'⛶ 全屏';
    button.setAttribute('aria-label',next?'退出游戏全屏':'游戏全屏');
    button.setAttribute('aria-pressed',String(next));
    button.title=next?'退出全屏（Esc / F）':'游戏全屏，方便投屏（F）';
    if(next!==active){active=next;onChange(next);}
  }
  async function toggle(){
    if(disposed||pending)return;
    pending=true;
    try{
      if(native())await exitNative();
      else if(expanded){expanded=false;sync();}
      else{
        try{
          const request=root.requestFullscreen||root.webkitRequestFullscreen;
          if(!request||doc.fullscreenEnabled===false)throw Error('Fullscreen unavailable');
          await request.call(root);
          if(disposed){if(native())void exitNative();return;}
          sync();
        }catch{
          // Embedded or older browsers can still expand the game to the viewport.
          if(!disposed){expanded=true;sync();}
        }
      }
    }finally{pending=false;}
  }
  const key=event=>{
    if((event.code==='Escape'||event.key==='Escape')&&(expanded||native())){
      event.preventDefault();event.stopImmediatePropagation();void toggle();
    }
  };
  button.addEventListener('click',toggle);
  doc.addEventListener('fullscreenchange',sync);doc.addEventListener('webkitfullscreenchange',sync);
  win.addEventListener('keydown',key,true);
  sync();
  return {toggle,isActive:()=>expanded||native(),destroy(){
    disposed=true;button.removeEventListener('click',toggle);
    doc.removeEventListener('fullscreenchange',sync);doc.removeEventListener('webkitfullscreenchange',sync);
    win.removeEventListener('keydown',key,true);
    root.classList.remove('platform-fullscreen');doc.body.classList.remove('platform-fullscreen-open');
    if(native())void exitNative();
  }};
}
