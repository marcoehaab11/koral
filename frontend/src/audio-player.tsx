import { useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { useLocale } from './data';

export const clock=(n:number)=> isFinite(n)?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'0:00';
export function Player({src,autoPlay,onEnd}:{src:string;autoPlay?:boolean;onEnd?:()=>void}) {
  const {t}=useLocale();
  const audio=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [time,setTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(1);
  const toggle=async()=>{
    const el=audio.current!;
    if(!el.paused){el.pause();return;}
    document.querySelectorAll('audio').forEach(other=>{if(other!==el)other.pause();});
    setFailed(false);setBusy(true);
    try { if(el.error)el.load(); await el.play(); }catch{setFailed(true);setBusy(false);}
  };
  return <div className="player"><audio ref={audio} src={src} preload="none" autoPlay={autoPlay} onPlay={()=>setPlaying(true)} onPlaying={()=>setBusy(false)}
    onPause={()=>{setPlaying(false);setBusy(false);}} onWaiting={()=>setBusy(true)} onEnded={()=>{setPlaying(false);onEnd?.();}}
    onError={()=>{setPlaying(false);setBusy(false);setFailed(true);}} onDurationChange={e=>setDuration(e.currentTarget.duration||0)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}/>
    <button type="button" className="play-button" onClick={toggle} aria-label={playing?t('Pause','إيقاف مؤقت'):t('Play','تشغيل')}>{playing?<Pause size={19}/>:<Play size={19}/>}</button>
    <div className="scrub"><span className="timestamps" dir="ltr">{clock(time)} / {clock(duration)}</span>
      <input type="range" min={0} max={duration||1} step=".1" value={time} disabled={!duration}
        aria-label={t('Seek position','موضع التشغيل')} onChange={e=>{audio.current!.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}/></div>
    <div className="volume"><Volume2 size={18}/><input type="range" min={0} max={1} step=".05" value={volume}
      aria-label={t('Volume','مستوى الصوت')} onChange={e=>{audio.current!.volume=Number(e.target.value);setVolume(Number(e.target.value));}}/></div>
    {(busy||failed)&&<span className="player-state" role="status">{failed?t('Audio could not play. Press play to retry.','تعذر تشغيل الصوت. اضغط تشغيل لإعادة المحاولة.'):t('Buffering…','جارٍ التحميل…')}</span>}
  </div>;
}
