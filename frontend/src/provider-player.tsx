import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from './data';
import { sourceNames, type Source } from './playback-sources';

type Widget = { bind(event:string,fn:()=>void):void; unbind(event:string):void };
type WidgetFactory = ((iframe:HTMLIFrameElement)=>Widget)&{Events:{READY:string;FINISH:string;ERROR:string}};
type VideoPlayer = { destroy():void };
type VideoOptions = { events: { onReady:()=>void; onStateChange:(e:{data:number})=>void; onError:()=>void; onAutoplayBlocked:()=>void } };
type YouTube = { Player:new (iframe:HTMLIFrameElement, support:VideoOptions)=>VideoPlayer; PlayerState:{ENDED:number} };
type SpotifyController = { addListener(event:'ready'|'playback_update', handler:(event:{data?:{position:number;duration:number;isPaused:boolean}})=>void):void; play():void; destroy():void };
type SpotifyApi = { createController(element:HTMLElement, options:{uri:string;width:number;height:number}, ready:(controller:SpotifyController)=>void):void };
type ProviderWindow = Window&{
  SC?:{Widget:WidgetFactory}; YT?:YouTube; SpotifyIframeApi?:SpotifyApi;
  onYouTubeIframeAPIReady?:()=>void; onSpotifyIframeApiReady?:(api:SpotifyApi)=>void;
};
const handles=new Map<string,Promise<unknown>>();

function load<T>(url:string,read:()=>T|undefined,register?:(ready:()=>void)=>void):Promise<T> {
  const existing=read();
  if(existing)return Promise.resolve(existing);
  const pending=handles.get(url);
  if(pending)return pending as Promise<T>;
  const promise=new Promise<T>((resolve,reject)=>{
    const script=document.createElement('script');
    let timer=0;
    const fail=()=>{window.clearTimeout(timer);script.remove();reject(new Error('Player API unavailable.'));};
    const ready=()=>{
      const api=read();
      if(api){window.clearTimeout(timer);resolve(api);}
    };
    register?.(ready);
    script.src=url;
    script.async=true;
    script.addEventListener('load',ready,{once:true});
    script.addEventListener('error',fail,{once:true});
    timer=window.setTimeout(fail,12000);
    document.head.append(script);
  });
  handles.set(url,promise);
  void promise.catch(()=>handles.delete(url));
  return promise;
}

export function ProviderPlayer({source,onEnd,onFailure}:{source:Source;onEnd:()=>void;onFailure:()=>void}) {
  const {t}=useLocale();
  const [status,setStatus]=useState<'loading'|'ready'|'manual'|'connectivity'|'error'>('loading');
  const [retry,setRetry]=useState(0);
  const host=useRef<HTMLDivElement>(null);
  const iframe=useRef<HTMLIFrameElement>(null);
  const {kind,value,external}=source;
  const provider=kind==='audio'?'':sourceNames[kind];
  const playerTitle=t('Player from','مشغّل من')+' '+provider;

  useLayoutEffect(()=>{
    const w=window as ProviderWindow;
    let active=true;
    let clean=()=>{};
    const ready=()=>{if(active){window.clearTimeout(timer);setStatus('ready');}};
    const end=()=>{if(active)onEnd();};
    const error=()=>{if(active){window.clearTimeout(timer);setStatus('error');onFailure();}};
    const connection=()=>{if(active)setStatus(current=>current==='loading'||current==='ready'?'connectivity':current);};
    const timer=window.setTimeout(()=>{if(active)setStatus(current=>current==='loading'?'connectivity':current);},15000);
    if(kind==='soundcloud'){
      void load('https://w.soundcloud.com/player/api.js',()=>w.SC?.Widget).then(factory=>{
        if(!active||!iframe.current)return;
        const frame=iframe.current;
        const widget=factory(frame);
        const events=factory.Events;
        widget.bind(events.READY,ready);
        widget.bind(events.FINISH,end);
        widget.bind(events.ERROR,error);
        clean=()=>{
          if(frame.contentWindow){
            widget.unbind(events.READY);
            widget.unbind(events.FINISH);
            widget.unbind(events.ERROR);
          }
        };
      }).catch(connection);
    }
    if(kind==='youtube'){
      void load('https://www.youtube.com/iframe_api',()=>w.YT?.Player?w.YT:undefined,callback=>{
        const previous=w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady=()=>{previous?.();callback();};
      }).then(api=>{
        if(!active||!iframe.current)return;
        const frame=iframe.current;
        const player=new api.Player(frame,{events:{
          onReady:ready, onError:error,
          onStateChange:e=>{if(e.data===api.PlayerState.ENDED)end();if(e.data===1)ready();},
          onAutoplayBlocked:()=>{if(active){window.clearTimeout(timer);setStatus('manual');}},
        }});
        // The iframe belongs to React and is removed when the track changes.
        clean=()=>queueMicrotask(()=>{
          try { player.destroy(); } catch { /* The React-owned iframe may already be gone. */ }
        });
      }).catch(connection);
    }
    if(kind==='spotify'){
      void load('https://open.spotify.com/embed/iframe-api/v1',()=>w.SpotifyIframeApi,callback=>{
        const previous=w.onSpotifyIframeApiReady;
        w.onSpotifyIframeApiReady=api=>{w.SpotifyIframeApi=api;previous?.(api);callback();};
      }).then(api=>{
        if(!active||!host.current)return;
        const container=document.createElement('div');
        host.current.append(container);
        let controller:SpotifyController|undefined;
        clean=()=>{controller?.destroy();container.remove();};
        let previous=0;
        api.createController(container,{uri:'spotify:track:'+value,width:host.current.clientWidth,height:152},widget=>{
          if(!active){widget.destroy();return;}
          controller=widget;
          widget.addListener('ready',()=>{ready();if(active)widget.play();});
          widget.addListener('playback_update',event=>{
            const data=event.data;
            if(data&&active){
              if(data.isPaused&&data.duration>0&&(data.position>=data.duration-500||data.position===0&&previous>=data.duration-1500))end();
              previous=data.position;
            }
          });
        });
      }).catch(connection);
    }
    return ()=>{active=false;window.clearTimeout(timer);clean();};
  },[kind,value,onEnd,onFailure,retry]);

  const soundUrl='https://w.soundcloud.com/player/?'+new URLSearchParams({url:value,auto_play:'true',visual:'false'});
  const youtubeUrl='https://www.youtube-nocookie.com/embed/'+value+'?'+new URLSearchParams({
    enablejsapi:'1', origin:window.location.origin, autoplay:'1', playsinline:'1', rel:'0',
  });
  return <div className="provider-player">
    <div ref={host} className={kind==='youtube'?'provider-video':'provider-audio'}>
      {kind!=='spotify'&&<iframe key={retry} ref={iframe} src={kind==='youtube'?youtubeUrl:soundUrl}
        title={playerTitle} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen/>}
    </div>
    {status!=='ready'&&<div className="provider-status" role="status">
      {status==='loading'?t('Loading player…','جاري تحميل المشغّل…'): status==='manual'?
        t('Press play in the player to start.','اضغط تشغيل داخل المشغّل.') : status==='error'?
        t('This recording could not play here.','التسجيل مش متاح للتشغيل هنا.'):
        t('If playback hasn’t started, use the controls in the player.','لو التشغيل ما بدأش، اضغط تشغيل داخل المشغّل.')}
      {(status==='error'||status==='connectivity')&&external&&<span className="actions">
        <button type="button" className="text-link provider-retry" onClick={()=>{setStatus('loading');setRetry(n=>n+1);}}>{t('Retry','حاول تاني')}</button>
        <a className="text-link" href={external} target="_blank" rel="noopener noreferrer">{t('Open on','افتح على')} {provider}</a></span>}
    </div>}
  </div>;
}
