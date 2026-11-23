import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useLocale, write, type ChoirGroup } from './data';
import { Fieldset, FormError, MediaField, Toggle } from './editor-fields';
import { Feedback } from './public';

const endpoint='admin/choir-groups';
const empty:ChoirGroup={id:0,nameEn:'',nameAr:'',accepting:true,recordingRequired:false,backingAudio:'',backingTitle:'',recruitmentEnabled:true};

export function ChoirGroups() {
  const {l,t}=useLocale();
  const groups=useApi<ChoirGroup[]>(endpoint);
  const [selected,setSelected]=useState(0);
  if(!groups.data)return <Feedback pending={groups.isPending} error={groups.error} onRetry={()=>groups.refetch()}/>;
  const group=groups.data.find(row=>row.id===selected)??empty;
  return <>
    <h1>{l('groups')}</h1>
    <label>{t('Select a choir group','اختار فرقة')}
      <select value={group.id} onChange={event=>setSelected(Number(event.target.value))}>
        <option value={0}>{t('Create a choir group','أضف فرقة')}</option>
        {groups.data.map(row=><option key={row.id} value={row.id}>{t(row.nameEn,row.nameAr)}</option>)}
      </select>
    </label>
    <GroupForm key={group.id} group={group} onSaved={row=>setSelected(row.id)}/>
  </>;
}

function GroupForm({group,onSaved}:{group:ChoirGroup;onSaved:(row:ChoirGroup)=>void}) {
  const {t}=useLocale();
  const [data,setData]=useState(group);
  const [uploads,setUploads]=useState(0);
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState<unknown>();
  const cache=useQueryClient();
  function set<K extends keyof ChoirGroup>(key:K,value:ChoirGroup[K]) {
    setSaved(false);
    setData(row=>({...row,[key]:value}));
  }
  return <form className="editor" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setSaved(false);setError(undefined);
    try {
      const row=await write<ChoirGroup>(endpoint+(group.id?'/'+group.id:''),group.id?'PUT':'POST',data);
      cache.setQueryData<ChoirGroup[]>([endpoint],list=>group.id?list?.map(item=>item.id===row.id?row:item):[...(list??[]),row]);
      void cache.invalidateQueries({queryKey:['choir-groups']});
      setData(row);setSaved(true);onSaved(row);
    } catch (failure) {setError(failure);} finally {setBusy(false);}
  }}>
    <Fieldset title={t('Group details','بيانات الفرقة')}>
      <label>{t('Name in English','الاسم بالإنجليزي')}
        <input value={data.nameEn} onChange={e=>set('nameEn',e.target.value)} required maxLength={120}/></label>
      <label>{t('Name in Arabic','الاسم بالعربي')}
        <input value={data.nameAr} onChange={e=>set('nameAr',e.target.value)} required maxLength={120}/></label>
      {data.catalogSlot&&<Toggle title={t('Include this choir in recruitment','استخدم الكورال ده في التقديم')}
        checked={data.recruitmentEnabled!==false} change={v=>set('recruitmentEnabled',v)}/>}
      {data.recruitmentEnabled!==false&&<>
        <Toggle title={t('Open for applications','التقديم مفتوح')} checked={data.accepting} change={v=>set('accepting',v)}/>
        <Toggle title={t('Require a voice recording','التسجيل الصوتي مطلوب')} checked={data.recordingRequired} change={v=>set('recordingRequired',v)}/>
      </>}
    </Fieldset>
    {data.recruitmentEnabled!==false&&<Fieldset title={t('Audition backing track','موسيقى اختبار الصوت')}>
      {!data.backingAudio&&<p className="wide metadata">{t('This group uses the site’s default track until you upload one.',
        'الفرقة هتستخدم التراك الافتراضي للموقع لحد ما ترفع تراك خاص بيها.')}</p>}
      <MediaField title={t('Backing track (MP3)','التراك المصاحب (MP3)')} bucket="audio" kind="audio" value={data.backingAudio}
        change={v=>set('backingAudio',v)} busy={delta=>setUploads(n=>n+delta)}/>
      {data.backingAudio&&<label>{t('Backing track title','اسم التراك المصاحب')}
        <input value={data.backingTitle} onChange={e=>set('backingTitle',e.target.value)} required maxLength={180}/></label>}
    </Fieldset>}
    <FormError error={error}/>
    {saved&&<p role="status" className="form-success">{t('Group saved.','اتحفظت بيانات الفرقة.')}</p>}
    <div><button className="button dark" disabled={busy||uploads>0}>{busy?t('Saving…','جاري الحفظ…'):t('Save choir group','احفظ الفرقة')}</button></div>
  </form>;
}
