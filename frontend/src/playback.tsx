import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, ListMusic, SkipBack, SkipForward, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocale, type Entry } from './data';
import { Player } from './audio-player';

type Queue={items:Entry[];index:number;revision:number};
type Actions={
  start:(entries:Entry[])=>void;
  close:()=>void;
  current:number|undefined;
};
const Playback=createContext<Actions|null>(null);
export function usePlayback() {
  const value=useContext(Playback);
  if(!value)throw new Error('Playback requires the public site.');
  return value;
}

export function PlaybackProvider({children}:{children:ReactNode}) {
  const [queue,setQueue]=useState<Queue>();
  const revision=useRef(0);
  const nextRevision=useCallback(()=>++revision.current,[]);
  const start=useCallback((entries:Entry[])=>{
    const items=entries.filter(track=>track.audio);
    if(items.length)setQueue({items,index:0,revision:nextRevision()});
  },[nextRevision]);
  const close=useCallback(()=>setQueue(undefined),[]);
  return <Playback.Provider value={{start,close,current:queue?.items[queue.index].id}}>
    {children}
    {queue&&<PlaybackDock queue={queue} update={setQueue} close={close} nextRevision={nextRevision}/>}
  </Playback.Provider>;
}

function PlaybackDock({queue,update,close,nextRevision}:{queue:Queue;update:React.Dispatch<React.SetStateAction<Queue|undefined>>;close:()=>void;nextRevision:()=>number}) {
  const {t}=useLocale();
  const [showQueue,setShowQueue]=useState(false);
  const root=useRef<HTMLElement>(null);
  const {items,index,revision}=queue;
  const track=items[index];
  const title=t(track.titleEn,track.titleAr);
  useEffect(()=>{
    const element=root.current;
    if(!element)return;
    const resize=new ResizeObserver(()=>{
      document.documentElement.style.setProperty('--playback-height',Math.ceil(element.getBoundingClientRect().height)+'px');
    });
    resize.observe(element);
    return ()=>{resize.disconnect();document.documentElement.style.removeProperty('--playback-height');};
  },[]);

  const onEnd=useCallback(()=>{
    update(active=>active&&active.revision===revision&&active.index===index&&index+1<active.items.length
      ? {...active,index:index+1}:active);
  },[update,revision,index]);
  function playIndex(target:number) {
    const next=nextRevision();
    update(active=>active&&target>=0&&target<active.items.length?
      {...active,index:target,revision:next}:active);
  }

  return <aside className="playback-dock" ref={root} aria-label={t('Site player','مشغّل الترانيم')}>
    <div className="playback-header">
      <div className="playback-art" aria-hidden="true">{track.image?<img src={track.image} alt=""/>:<AudioLines size={21}/>}</div>
      <div className="playback-title" aria-live="polite"><Link to={'/songs/'+track.slug}>{title}</Link>
        <span>{t('Site audio','صوت الموقع')}{items.length>1&&<span> · {index+1} / {items.length}</span>}</span></div>
      <div className="playback-tools">
        {items.length>1&&<>
          <button className="icon-button" type="button" aria-label={t('Previous track','الترنيمة السابقة')} disabled={index===0} onClick={()=>playIndex(index-1)}><SkipBack size={18}/></button>
          <button className="icon-button" type="button" aria-label={t('Next track','الترنيمة التالية')} disabled={index+1===items.length} onClick={()=>playIndex(index+1)}><SkipForward size={18}/></button>
          <button className="icon-button" type="button" aria-label={t('Play queue','قائمة التشغيل')} aria-expanded={showQueue} aria-controls="playback-list"
            onClick={()=>setShowQueue(value=>!value)}><ListMusic size={19}/></button></>}
        <button className="icon-button" type="button" aria-label={t('Close player','اقفل المشغّل')} onClick={close}><X size={19}/></button>
      </div>
    </div>
    <div className="playback-body">
      <Player key={revision+':'+index} src={track.audio} autoPlay onEnd={onEnd}/>
    </div>
    {showQueue&&items.length>1&&<ol className="playback-list" id="playback-list">
      {items.map((entry,i)=><li key={entry.id}><button type="button" aria-current={i===index?'true':undefined} onClick={()=>playIndex(i)}>
        <span>{i+1}</span>{t(entry.titleEn,entry.titleAr)}</button></li>)}
    </ol>}
  </aside>;
}
