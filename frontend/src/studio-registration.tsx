import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useLocale, write } from './data';
import { Confirm, FormError, Toggle } from './editor-fields';
import { Feedback } from './public';
import { registrationEndpoint, type Option, type RegistrationField, type RegistrationSchema } from './registration';

export function RegistrationEditor() {
  const query=useApi<RegistrationSchema>(registrationEndpoint);
  return query.data?<Editor initial={query.data}/>:
    <Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>;
}

function newOption():Option{return {id:crypto.randomUUID(),labelAr:'',labelEn:'',detailAr:'',detailEn:''};}
function Editor({initial}:{initial:RegistrationSchema}) {
  const {t}=useLocale();
  const query=useQueryClient();
  const [draft,setDraft]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>();
  const [saved,setSaved]=useState(false);
  function fields(rows:RegistrationField[]){setSaved(false);setDraft(old=>({...old,fields:rows}));}
  function change(id:string,patch:Partial<RegistrationField>){
    fields(draft.fields.map(f=>f.id===id?{...f,...patch}:f));
  }
  function move(index:number,direction:number){
    const sorted=[...draft.fields];
    const target=index+direction;
    [sorted[index],sorted[target]]=[sorted[target],sorted[index]];
    fields(sorted);
  }
  return <><h1>{t('Registration form','استمارة الانضمام')}</h1>
    <form className="registration-editor" onSubmit={async event=>{
      event.preventDefault();setBusy(true);setError(undefined);setSaved(false);
      const complete=(option:Option)=>({...option,labelEn:option.labelEn.trim()||option.labelAr.trim()});
      try{
        const schema=await write<RegistrationSchema>(registrationEndpoint,'PUT',{
          ...draft,statuses:draft.statuses.map(complete),fields:draft.fields.map(field=>({...field,
            labelEn:field.labelEn.trim()||field.labelAr.trim(),options:field.options?.map(complete)})),
        });
        query.setQueryData([registrationEndpoint],schema);
        setDraft(schema);
        void query.invalidateQueries({queryKey:['join/form']});
        setSaved(true);
      }catch(ex){setError(ex);}finally{setBusy(false);}
    }}>
      {draft.fields.map((field,index)=><section className="panel" key={field.id} aria-label={field.labelAr||t('New field','حقل جديد')}>
        <div className="field-grid">
          <label>{t('Field title in Arabic','عنوان الحقل بالعربي')}
            <input value={field.labelAr} maxLength={160} required onChange={e=>change(field.id,{labelAr:e.target.value})}/></label>
          <label>{t('Field title in English','عنوان الحقل بالإنجليزي')}
            <input value={field.labelEn} maxLength={160} onChange={e=>change(field.id,{labelEn:e.target.value})}/></label>
          <label>{t('Field type','نوع الحقل')}
            <select value={field.kind}
              onChange={e=>change(field.id,{kind:e.target.value as RegistrationField['kind'],options:field.options?.length?field.options:[newOption()]})}>
              <option value="text">{t('Text','إدخال نص')}</option><option value="choice">{t('Choice list','قائمة اختيارات')}</option>
              <option value="date">{t('Date','تاريخ')}</option>
              <option value="photo" disabled={draft.fields.some(x=>x.id!==field.id&&x.kind==='photo')}>{t('Photo','صورة')}</option>
              <option value="recording" disabled={draft.fields.some(x=>x.id!==field.id&&x.kind==='recording')}>{t('Audio recording','تسجيل صوتي')}</option>
            </select></label>
          <div className="actions">
            <Toggle title={t('Required','إجباري')} checked={field.required} change={v=>change(field.id,{required:v})}/>
            <Toggle title={t('Visible','ظاهر')} checked={field.visible} change={v=>change(field.id,{visible:v})}/>
          </div>
          {field.kind==='text'&&<>
            <label>{t('Validation rule','قاعدة التحقق')}
              <select value={field.rule} onChange={e=>change(field.id,{rule:e.target.value as RegistrationField['rule'],digits:field.digits??11})}>
                <option value="any">{t('Any text','أي نص')}</option><option value="arabic">{t('Arabic letters only','حروف عربي فقط')}</option>
                <option value="digits">{t('Exact number of English digits','عدد محدد من الأرقام الإنجليزية')}</option>
              </select></label>
            {field.rule==='digits'&&<label>{t('Number of digits','عدد الأرقام')}
              <input type="number" min={1} max={32} value={field.digits??''} required onChange={e=>change(field.id,{digits:e.target.valueAsNumber||null})}/></label>}
          </>}
          {field.kind==='choice'&&<div className="wide">
            <Toggle title={t('Allow more than one choice','السماح بأكثر من اختيار')} checked={field.multiple} change={v=>change(field.id,{multiple:v})}/>
            <Options options={field.options??[]} change={options=>change(field.id,{options})}/>
          </div>}
        </div>
        <div className="actions">
          <button type="button" className="button outline" disabled={!index} onClick={()=>move(index,-1)}>{t('Move up','انقل لأعلى')}</button>
          <button type="button" className="button outline" disabled={index===draft.fields.length-1}
            onClick={()=>move(index,1)}>{t('Move down','انقل لأسفل')}</button>
          <Confirm title={t('Remove field','حذف الحقل')} action={async()=>fields(draft.fields.filter(item=>item.id!==field.id))}>
            {t('After saving, “'+field.labelEn+'” will disappear from the form. Saved answers stay in applications and Excel.',
              'بعد الحفظ، «'+field.labelAr+'» هيختفي من الاستمارة. الإجابات القديمة هتفضل موجودة في الطلبات وملف Excel.')}
          </Confirm>
        </div>
      </section>)}
      <div><button type="button" className="button outline" onClick={()=>fields([...draft.fields,{id:crypto.randomUUID(),
        labelAr:'',labelEn:'',kind:'text',required:false,visible:true,rule:'any',multiple:false}])}>{t('Add field','أضف حقل')}</button></div>
      <section className="panel"><h2>{t('Application statuses','حالات الطلب')}</h2>
        <Options statuses options={draft.statuses} change={statuses=>{setSaved(false);setDraft(old=>({...old,statuses}));}}/>
      </section>
      <FormError error={error}/>
      {saved&&<p role="status" className="form-success">{t('Form saved.','اتحفظت الاستمارة.')}</p>}
      <div><button className="button dark" disabled={busy}>{busy?t('Saving…','جاري الحفظ…'):t('Save registration form','احفظ الاستمارة')}</button></div>
    </form></>;
}

function Options({options,change,statuses=false}:{options:Option[];change:(rows:Option[])=>void;statuses?:boolean}) {
  const {t}=useLocale();
  function set(id:string,patch:Partial<Option>){change(options.map(option=>option.id===id?{...option,...patch}:option));}
  return <div className="link-editor">{options.map(option=><div className="link-fields" key={option.id}>
    <label>{t('Option in Arabic','الاختيار بالعربي')}<input required maxLength={160} value={option.labelAr} onChange={e=>set(option.id,{labelAr:e.target.value})}/></label>
    <label>{t('Option in English','الاختيار بالإنجليزي')}<input maxLength={160} value={option.labelEn} onChange={e=>set(option.id,{labelEn:e.target.value})}/></label>
    {!statuses&&<>
      <label>{t('Follow-up prompt in Arabic (optional)','سؤال إضافي بالعربي (اختياري)')}<input maxLength={160} value={option.detailAr??''} onChange={e=>set(option.id,{detailAr:e.target.value})}/></label>
      <label>{t('Follow-up prompt in English (optional)','سؤال إضافي بالإنجليزي (اختياري)')}<input maxLength={160} value={option.detailEn??''} onChange={e=>set(option.id,{detailEn:e.target.value})}/></label>
    </>}
    {(!statuses||option.id!=='new')&&<Confirm title={statuses?t('Remove status','حذف الحالة'):t('Remove option','حذف الاختيار')}
      action={async()=>change(options.filter(x=>x.id!==option.id))}>
      {statuses?t('“'+option.labelEn+'” can be removed after applications using it are moved to another status.',
        'تقدر تحذف «'+option.labelAr+'» بعد نقل الطلبات اللي بتستخدمها لحالة تانية.'):
        t('“'+option.labelEn+'” will disappear from the list after saving. Previously submitted answers stay.',
          '«'+option.labelAr+'» هيختفي من الاختيارات بعد الحفظ. الإجابات القديمة هتفضل موجودة.')}
    </Confirm>}
  </div>)}<button type="button" className="button outline" onClick={()=>change([...options,newOption()])}>
    {statuses?t('Add status','أضف حالة'):t('Add option','أضف اختيار')}</button></div>;
}
