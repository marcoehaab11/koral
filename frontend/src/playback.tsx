import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, ListMusic, SkipBack, SkipForward, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocale, type Entry } from './data';
import { Player } from './audio-player';
import { ProviderPlayer } from './provider-player';
import { sourcesFor, sourceNames, type Source } from './playback-sources';

type QueueItem={entry:Entry;sources:Source[]};
type Queue={items:QueueItem[];index:number;source:number;revision:number};
type Actions={
  begin:()=>number;
  start:(entries:Entry[],token?:number)=>boolean;
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
  const generation=useRef(0);
  const revision=useRef(0);
  const begin=useCallback(()=>++generation.current,[]);
  const nextRevision=useCallback(()=>++revision.current,[]);
  const start=useCallback((entries:Entry[],token=begin())=>{
    if(token!==generation.current)return false;
    const items=entries.map(entry=>({entry,sources:sourcesFor(entry)})).filter(x=>x.sources.length);
    if(!items.length)return false;
    const next=nextRevision();
    setQueue({items,index:0,source:0,revision:next});
    return true;
  },[begin,nextRevision]);
  function close(){begin();setQueue(undefined);}
  return <Playback.Provider value={{begin,start,current:queue?.items[queue.index].entry.id}}>
    {children}
    {queue&&<PlaybackDock queue={queue} update={setQueue} close={close} nextRevision={nextRevision}/>}
  </Playback.Provider>;
}

function PlaybackDock({queue,update,close,nextRevision}:{queue:Queue;update:React.Dispatch<React.SetStateAction<Queue|undefined>>;close:()=>void;nextRevision:()=>number}) {
  const {t}=useLocale();
  const [showQueue,setShowQueue]=useState(false);
  const root=useRef<HTMLElement>(null);
  const {items,index,source,revision}=queue;
  const current=items[index];
  const track=current.entry;
  const media=current.sources[source];
  const title=t(track.titleEn,track.titleAr);
  const provider=media.kind==='audio'?t('Site audio','صوت الموقع'):sourceNames[media.kind];
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
    update(active=>active&&active.revision===revision&&active.index===index&&active.source===source&&index+1<active.items.length
      ? {...active,index:index+1,source:0}:active);
  },[update,revision,index,source]);
  const nextSource=useCallback(()=>{
    update(active=>active&&active.revision===revision&&active.index===index&&active.source===source&&source+1<active.items[index].sources.length
      ? {...active,source:source+1}:active);
  },[update,revision,index,source]);
  function playIndex(target:number) {
    const next=nextRevision();
    update(active=>active&&target>=0&&target<active.items.length?
      {...active,index:target,source:0,revision:next}:active);
  }

  return <aside className="playback-dock" ref={root} aria-label={t('Site player','مشغّل الترانيم')}>
    <div className="playback-header">
      <div className="playback-art" aria-hidden="true">{track.image?<img src={track.image} alt=""/>:<AudioLines size={21}/>}</div>
      <div className="playback-title" aria-live="polite"><Link to={'/songs/'+track.slug}>{title}</Link>
        <span>{provider}{items.length>1&&<span> · {index+1} / {items.length}</span>}</span></div>
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
      {media.kind==='audio'?<Player key={revision+':'+index+':'+source} src={media.value} autoPlay onEnd={onEnd} onFailure={nextSource}/>:
        <ProviderPlayer key={revision+':'+index+':'+source} source={media} onEnd={onEnd} onFailure={nextSource}/>}
      {current.sources.length>1&&<label className="playback-source">{t('Playback source','مصدر التشغيل')}
        <select value={source} onChange={event=>{
          const selected=Number(event.target.value);
          update(active=>active&&active.revision===revision&&active.index===index?{...active,source:selected}:active);
        }}>
          {current.sources.map((option,i)=><option key={option.kind+option.value} value={i}>
            {option.kind==='audio'?t('Site audio','صوت الموقع'):sourceNames[option.kind]}
          </option>)}
        </select>
      </label>}
    </div>
    {showQueue&&items.length>1&&<ol className="playback-list" id="playback-list">
      {items.map(({entry},i)=><li key={entry.id}><button type="button" aria-current={i===index?'true':undefined} onClick={()=>playIndex(i)}>
        <span>{i+1}</span>{t(entry.titleEn,entry.titleAr)}</button></li>)}
    </ol>}
  </aside>;
}
