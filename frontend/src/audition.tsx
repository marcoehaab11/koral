import { useEffect, useRef, useState } from 'react';
import { useLocale } from './data';

export const recordingLimit=8*1024*1024;
const recordingSeconds=90;
const formats=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'];
export type Take={file:File;backing:string;mixed?:boolean};

export function AuditionPlayer({voice,backing,beforePlay}:{voice:string;backing?:string;beforePlay?:()=>void}) {
  const {t}=useLocale();
  const lead=useRef<HTMLAudioElement>(null);
  const track=useRef<HTMLAudioElement>(null);
  const [mixed,setMixed]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const main=lead.current, music=track.current;
    return ()=>{main?.pause();music?.pause();};
  },[]);
  function sync() {
    const main=lead.current, music=track.current;
    if(main&&music&&music.readyState&&Math.abs(main.currentTime-music.currentTime)>.2&&main.currentTime<music.duration)
      music.currentTime=main.currentTime;
  }
  async function playTogether() {
    const main=lead.current, music=track.current;
    if(!main||!music)return;
    beforePlay?.();
    setMixed(true);setError(false);
    try {
      main.currentTime=0;music.currentTime=0;
      await Promise.all([main.play(),music.play()]);
    } catch {music.pause();main.pause();setMixed(false);setError(true);}
  }
  return <div className="audition-player">
    {backing&&<div className="actions">
      <button type="button" className="button outline" onClick={()=>void playTogether()}>{t('Play voice with backing track','اسمع الصوت مع الموسيقى')}</button>
      {mixed&&<button type="button" className="button outline" onClick={()=>{track.current?.pause();setMixed(false);}}>
        {t('Listen to voice only','اسمع الصوت بس')}</button>}
    </div>}
    <audio ref={lead} src={voice} controls preload="metadata" aria-label={t('Voice recording','التسجيل الصوتي')}
      onPlay={()=>{beforePlay?.();if(mixed){sync();void track.current?.play().catch(()=>setError(true));}}}
      onPause={()=>track.current?.pause()} onEnded={()=>track.current?.pause()} onSeeked={sync}
      onRateChange={e=>{if(track.current)track.current.playbackRate=e.currentTarget.playbackRate;}}/>
    {backing&&<audio ref={track} src={backing} preload="none"/>}
    {error&&<p role="alert" className="form-error">{t('The voice and music could not play together.','تعذّر تشغيل الصوت مع الموسيقى.')}</p>}
  </div>;
}

export function Audition({backing,title,label,required,value,change,busyChanged,stopSitePlayback}:{
  backing:string;title:string;label?:string;required:boolean;value:Take|null;change:(value:Take|null)=>void;busyChanged:(busy:boolean)=>void;
  stopSitePlayback:()=>void;
}) {
  const {t}=useLocale();
  const [state,setState]=useState<'ready'|'starting'|'recording'|'stopping'>('ready');
  const [error,setError]=useState('');
  const [elapsed,setElapsed]=useState(0);
  const [url,setUrl]=useState('');
  const audio=useRef<HTMLAudioElement>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const mixer=useRef<AudioContext|null>(null);
  const loadingTrack=useRef<AbortController|null>(null);
  const timer=useRef<number|undefined>(undefined);
  const mounted=useRef(false);

  function stopMedia() {
    clearInterval(timer.current);
    audio.current?.pause();
    loadingTrack.current?.abort();
    loadingTrack.current=null;
    const context=mixer.current;
    mixer.current=null;
    if(context&&context.state!=='closed')void context.close().catch(()=>{});
    stream.current?.getTracks().forEach(track=>track.stop());
    stream.current=null;
  }
  useEffect(()=>{
    mounted.current=true;
    return ()=>{
      mounted.current=false;
      clearInterval(timer.current);
      if(recorder.current?.state==='recording')recorder.current.stop();
      stopMedia();
      busyChanged(false);
    };
  },[busyChanged]);
  useEffect(()=>{
    if(!value){setUrl('');return;}
    const next=URL.createObjectURL(value.file);
    setUrl(next);
    return ()=>URL.revokeObjectURL(next);
  },[value]);

  function stop() {
    if(recorder.current?.state!=='recording')return;
    setState('stopping');
    recorder.current.stop();
    stopMedia();
  }
  async function start() {
    stopSitePlayback();
    audio.current?.pause();
    setError('');setElapsed(0);setState('starting');busyChanged(true);
    let valid=true;
    let startingMusic=false;
    try {
      // Unlock speaker output during the click, before the permission prompt.
      const context=backing?new AudioContext():null;
      mixer.current=context;
      const ready=context?.resume();
      void ready?.catch(()=>{});
      const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true}});
      if(!mounted.current){mic.getTracks().forEach(track=>track.stop());return;}
      stream.current=mic;
      let recordingStream=mic;
      let music:AudioBufferSourceNode|undefined;
      if(context){
        startingMusic=true;
        const abort=new AbortController();
        loadingTrack.current=abort;
        const response=await fetch(backing,{signal:abort.signal,headers:{Range:'bytes=0-'}});
        if(!response.ok||response.status===204)throw new Error('Backing track unavailable');
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        await ready;
        if(!mounted.current)return;
        if(context.state!=='running')throw new Error('Audio output is unavailable');
        const output=context.createMediaStreamDestination();
        const voice=context.createGain();
        const backingGain=context.createGain();
        voice.gain.value=.7;
        backingGain.gain.value=.28;
        context.createMediaStreamSource(mic).connect(voice).connect(output);
        music=context.createBufferSource();
        music.buffer=buffer;
        music.loop=true;
        // Monitor just the music. The saved stream receives both inputs.
        music.connect(backingGain);
        backingGain.connect(context.destination);
        backingGain.connect(output);
        recordingStream=output.stream;
        startingMusic=false;
      }
      const mimeType=formats.find(type=>MediaRecorder.isTypeSupported(type));
      const recording=new MediaRecorder(recordingStream,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:96000});
      const chunks:BlobPart[]=[];
      recorder.current=recording;
      recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recording.onerror=()=>{
        valid=false;
        if(mounted.current)setError(t('Recording stopped unexpectedly. Try again or upload a file.','التسجيل وقف. حاول تاني أو ارفع ملف.'));
        stop();
      };
      recording.onstop=()=>{
        stopMedia();
        if(!mounted.current)return;
        setState('ready');busyChanged(false);
        if(!valid)return;
        const type=recording.mimeType||mimeType||'audio/webm';
        const extension=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
        const file=new File(chunks,'audition.'+extension,{type});
        if(file.size&&file.size<=recordingLimit)change({file,backing,mixed:!!music});
        else setError(t('Recording is empty or larger than 8 MB. Try again.','التسجيل فاضي أو أكبر من ٨ ميجابايت. حاول تاني.'));
      };
      function interrupted() {
        if(!mounted.current||recording.state!=='recording')return;
        valid=false;
        setError(t('Audio was interrupted. Try recording again.','الصوت اتقطع أثناء التسجيل. جرّب تسجّل تاني.'));
        stop();
      }
      mic.getAudioTracks().forEach(track=>track.addEventListener('ended',interrupted,{once:true}));
      if(context){
        context.onstatechange=()=>{
          if(mixer.current===context&&context.state!=='running')interrupted();
        };
      }
      recording.start();
      music?.start();
      change(null);setState('recording');
      const started=performance.now();
      timer.current=window.setInterval(()=>{
        const seconds=Math.floor((performance.now()-started)/1000);
        setElapsed(Math.min(recordingSeconds,seconds));
        if(seconds>=recordingSeconds)stop();
      },250);
    } catch (failure) {
      valid=false;
      if(recorder.current?.state==='recording')recorder.current.stop();
      stopMedia();
      if(mounted.current){
        const blocked=failure instanceof DOMException&&failure.name==='NotAllowedError';
        setError(startingMusic?(blocked?t('Tap Start recording again to play the music.','دوس ابدأ التسجيل تاني لتشغيل الموسيقى.'):
          t('The backing music could not play. Try again or upload a file.','الموسيقى المصاحبة ما اشتغلتش. حاول تاني أو ارفع ملف.')):
          t('Could not start recording. Allow microphone access and try again, or upload a file.',
            'ما قدرناش نبدأ التسجيل. اسمح بالميكروفون وحاول تاني، أو ارفع ملف.'));
        setState('ready');busyChanged(false);
      }
    }
  }

  const canRecord=!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined'&&(!backing||typeof AudioContext!=='undefined');
  return <fieldset className="join-audition wide">
    <legend>{label??t('Voice recording','التسجيل الصوتي')} {required?t('(required)','(مطلوب)'):t('(optional)','(اختياري)')}</legend>
    {backing&&<>
      <span>{title}</span>
      <p className="metadata">{t('Use headphones so the recording captures your voice clearly.','استخدم سماعات عشان التسجيل يلقط صوتك بوضوح.')}</p>
      <audio ref={audio} src={backing} controls={state==='ready'} preload="metadata" aria-label={t('Preview backing track','اسمع التراك المصاحب')}
        onPlay={stopSitePlayback}/>
    </>}
    {canRecord&&<div className="actions">
      {state==='recording'?<button type="button" className="button dark" onClick={stop}>{t('Stop recording','وقّف التسجيل')}</button>:
        <button type="button" className="button outline" disabled={state!=='ready'} onClick={()=>void start()}>
          {state==='starting'?t('Starting…','جاري البدء…'):state==='stopping'?t('Saving recording…','جاري حفظ التسجيل…'):
            value?t('Record again','سجّل تاني'):t('Start recording','ابدأ التسجيل')}</button>}
      {state==='recording'&&<span role="timer">{elapsed} / {recordingSeconds} {t('sec','ثانية')}</span>}
    </div>}
    {!canRecord&&<p className="metadata">{t('Recording is unavailable in this browser. You can upload an audio file below.',
      'التسجيل مش متاح في المتصفح ده. تقدر ترفع ملف صوتي من الاختيار اللي تحت.')}</p>}
    <label>{t('Or upload an audio file (up to 8 MB)','أو ارفع ملف صوتي (لحد ٨ ميجابايت)')}
      <input type="file" accept=".webm,.ogg,.m4a,.mp4,.mp3,.wav,audio/*" disabled={state!=='ready'} onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;
        if(!file.size||file.size>recordingLimit){setError(t('Choose an audio file up to 8 MB.','اختار ملف صوتي لحد ٨ ميجابايت.'));return;}
        setError('');audio.current?.pause();change({file,backing:''});
      }}/>
    </label>
    {url&&state==='ready'&&<>
      {value?.mixed&&<p>{t('Recording with music','التسجيل بالصوت والموسيقى')}</p>}
      <AuditionPlayer key={url} voice={url} backing={value?.mixed?undefined:value?.backing} beforePlay={()=>{stopSitePlayback();audio.current?.pause();}}/>
      <button type="button" className="button outline" onClick={()=>change(null)}>{t('Remove recording','احذف التسجيل')}</button>
    </>}
    {error&&<p role="alert" className="form-error">{error}</p>}
  </fieldset>;
}
