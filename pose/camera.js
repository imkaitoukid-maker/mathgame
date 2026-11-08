const retryable = new Set(['OverconstrainedError', 'NotFoundError', 'CameraUnavailableError']);
const capture = { width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:30,max:30} };

export function stopCameraStream(stream) { stream?.getTracks().forEach(track=>track.stop()); }
/** @returns {'user'|'environment'|null} */
export function inferCameraFacing(track) {
  const facing=track.getSettings?.().facingMode;
  if(facing==='user'||facing==='environment')return facing;
  const label=track.label??'';
  if(/back|rear|environment|后置|後置|背面/i.test(label))return 'environment';
  if(/front|facetime|user|前置|前面/i.test(label))return 'user';
  return null;
}

/**
 * Acquire a camera without silently treating the same camera as a successful flip.
 * @param {*} mediaDevices
 * @param {'user'|'environment'} facing
 */
export async function requestCamera(mediaDevices, facing='user', options={}) {
  const { strict=false, previousDeviceId='', deviceId='', isCurrent=()=>true }=options;
  const checkCurrent=()=>{if(!isCurrent())throw new DOMException('Camera request cancelled','AbortError');};
  const acquire=async video=>{
    checkCurrent();
    const stream=await mediaDevices.getUserMedia({audio:false,video:{...capture,...video}});
    try{
      checkCurrent();
      const track=stream.getVideoTracks()[0];
      if(!track)throw new DOMException('No video track','NotFoundError');
      const settings=track.getSettings?.()??{},actual=inferCameraFacing(track);
      if(strict&&((actual&&actual!==facing)||(!actual&&previousDeviceId&&settings.deviceId===previousDeviceId))){
        throw new DOMException('The requested camera is unavailable','CameraUnavailableError');
      }
      return {stream,facing:actual??facing,deviceId:settings.deviceId??''};
    }catch(error){stopCameraStream(stream);throw error;}
  };
  try{
    return await acquire(deviceId?{deviceId:{exact:deviceId}}:{facingMode:strict?{exact:facing}:{ideal:facing}});
  }catch(error){
    checkCurrent();
    if(!strict||!retryable.has(error.name)||!mediaDevices.enumerateDevices)throw error;
    const devices=await mediaDevices.enumerateDevices();checkCurrent();
    const alternative=devices.find(device=>device.kind==='videoinput'&&device.deviceId!==previousDeviceId&&inferCameraFacing({label:device.label})===facing);
    if(!alternative)throw error;
    return acquire({deviceId:{exact:alternative.deviceId}});
  }
}
