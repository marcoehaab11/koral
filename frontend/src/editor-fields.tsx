import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Upload, X } from 'lucide-react';
import { upload, useErrorText, useLocale, type Platform } from './data';
import { Player } from './audio-player';

export type Field={key:string;en:string;ar:string;type?:'textarea'|'number'|'date'|'datetime-local'|'email'|'url'|'slug';required?:boolean};
export const field=(key:string,en:string,ar:string,type?:Field['type'],required=false):Field=>({key,en,ar,type,required});
export const pair=(key:string,en:string,ar:string,type?:Field['type'],required=false)=>[
  field(key+'En',en+' (English)',ar+' (الإنجليزية)',type,required),field(key+'Ar',en+' (Arabic)',ar+' (العربية)',type,required),
];
export const text=(value:unknown)=>String(value??'');
export function FormError({error}:{error:unknown}) {
  const message=useErrorText();
  return error?<p className="form-error" role="alert">{message(error)}</p>:null;
}
export function FieldInput({item,value,change}:{item:Field;value:unknown;change:(value:unknown)=>void}) {
  const {t}=useLocale();
  const raw=text(value);
  let shown=raw;
  if(item.type==='date')shown=raw.slice(0,10);
  if(item.type==='datetime-local'&&raw){
    const date=new Date(raw);
    if(Number.isFinite(date.valueOf()))shown=new Date(date.valueOf()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  const dir=item.key.endsWith('Ar')?'rtl':item.key.endsWith('En')||['url','email','slug'].includes(item.type??'')?'ltr':undefined;
  return <label className={item.type==='textarea'?'wide':''}>{t(item.en,item.ar)}
    {item.type==='textarea'?<textarea dir={dir} required={item.required} rows={5} value={raw} onChange={e=>change(e.target.value)}/>:
      <input required={item.required} dir={dir} type={item.type==='slug'?'text':item.type??'text'}
        pattern={item.type==='slug'?'[a-z0-9]+(-[a-z0-9]+)*':undefined} min={item.type==='number'?0:undefined} value={shown} onChange={e=>{
          const v=e.target.value;
          change(item.type==='number'?(v===''?null:Number(v)):item.type==='date'||item.type==='datetime-local'?
            (v?new Date(item.type==='date'?v+'T00:00:00Z':v).toISOString():null):v);
        }}/>}
  </label>;
}
export function Fieldset({title,children}:{title:string;children:ReactNode}) {
  return <fieldset className="panel fieldset"><legend>{title}</legend><div className="field-grid">{children}</div></fieldset>;
}
export function Toggle({checked,title,change}:{checked:boolean;title:string;change:(checked:boolean)=>void}) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={e=>change(e.target.checked)}/>{title}</label>;
}
export function MediaField({title,value,bucket,kind,change,busy}:{title:string;value:string;bucket:string;kind:'image'|'audio'|'video';
  change:(url:string)=>void;busy:(delta:number)=>void}) {
  const {t}=useLocale();
  const [progress,setProgress]=useState<number>();
  const [error,setError]=useState<unknown>();
  const accept=kind==='image'?'.png,.jpg,.jpeg,.webp':kind==='audio'?'.mp3':'.mp4';
  return <div className="upload-field wide"><span>{title}</span>
    {value&&(kind==='image'?<img className="upload-image" src={value} alt={title}/>:kind==='audio'?<Player key={value} src={value}/>:
      value.startsWith('/uploads/')?<video controls src={value}/>:null)}
    <div className="actions"><label className="button outline upload-button"><Upload size={16}/>{value?t('Replace file','استبدال الملف'):t('Choose file','اختر ملفاً')}
      <input type="file" aria-label={title} accept={accept} disabled={progress!==undefined} onChange={async e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;
        setError(undefined);setProgress(0);busy(1);
        try{change(await upload(bucket,file,setProgress));}catch(ex){setError(ex);}finally{setProgress(undefined);busy(-1);}
      }}/></label>
      {value&&<button type="button" className="button outline" disabled={progress!==undefined} onClick={()=>change('')}>{t('Remove file','إزالة الملف')}</button>}</div>
    {progress!==undefined&&<progress value={progress} max={100} aria-label={t('Upload progress','تقدم الرفع')}/>}<FormError error={error}/>
  </div>;
}
const platforms=['Spotify','Anghami','YouTube','SoundCloud','Apple Music','Deezer','Other'];
export function PlatformFields({value,change,social=false,album=false}:{value:Platform[];change:(v:Platform[])=>void;social?:boolean;album?:boolean}) {
  const {t}=useLocale();
  function set(i:number,patch:Partial<Platform>){change(value.map((row,index)=>index===i?{...row,...patch}:row));}
  function order(rows:Platform[]){change(rows.map((x,sort)=>({...x,sort})));}
  function move(i:number,step:number){
    const rows=[...value];[rows[i],rows[i+step]]=[rows[i+step],rows[i]];order(rows);
  }
  return <div className="wide link-editor">{value.map((row,i)=>{
    const custom=social||!platforms.includes(row.platformName);
    return <div className="link-fields" key={i}>
      {!social&&<label>{t('Platform','المنصة')}<select aria-label={t('Platform','المنصة')+' '+(i+1)} value={custom?'Other':row.platformName}
        onChange={e=>set(i,{platformName:e.target.value==='Other'?'':e.target.value})}>
        {platforms.map(x=><option key={x} value={x}>{x==='Other'?t('Other','أخرى'):x}</option>)}</select></label>}
      {custom&&<label>{t('Platform name','اسم المنصة')}<input required value={row.platformName} onChange={e=>set(i,{platformName:e.target.value})}/></label>}
      <label>{album?t('Album or playlist URL','رابط الألبوم أو قائمة التشغيل'):t('Link URL','عنوان الرابط')}
        <input type="url" required dir="ltr" value={row.url} onChange={e=>set(i,{url:e.target.value})}/></label>
      <label>{t('Display label','اسم العرض')}<input value={row.label} onChange={e=>set(i,{label:e.target.value})}/></label>
      <div className="actions"><button type="button" className="icon-button" aria-label={t('Move link up','ارفع الرابط')} disabled={!i} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button>
      <button type="button" className="icon-button" aria-label={t('Move link down','اخفض الرابط')} disabled={i===value.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button>
      <button type="button" className="icon-button" aria-label={t('Remove link','أزل الرابط')} onClick={()=>order(value.filter((_,idx)=>idx!==i))}><X size={16}/></button></div>
    </div>;
  })}
  <button type="button" className="button outline" onClick={()=>change([...value,{platformName:social?'':'Spotify',url:'',label:'',icon:'',sort:value.length}])}><Plus size={16}/>{t('Add link','أضف رابطاً')}</button></div>;
}
export function Confirm({title,children,action}:{title:string;children:ReactNode;action:()=>Promise<void>}) {
  const {t}=useLocale();
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>();
  return <><button type="button" className="button danger" onClick={()=>{setError(undefined);dialog.current?.showModal();}}>{title}</button>
    <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();}} aria-label={title}><div className="confirm"><h2>{title}</h2><p>{children}</p>
      <FormError error={error}/><div className="actions"><button type="button" className="button outline" disabled={busy} onClick={()=>dialog.current?.close()}>{t('Cancel','إلغاء')}</button>
        <button type="button" className="button danger" disabled={busy} onClick={async()=>{setBusy(true);try{await action();dialog.current?.close();}catch(e){setError(e);}finally{setBusy(false);}}}>
          {busy?t('Deleting…','جارٍ الحذف…'):t('Confirm deletion','تأكيد الحذف')}</button></div></div></dialog></>;
}
