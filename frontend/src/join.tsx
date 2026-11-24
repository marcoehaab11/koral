import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AudioLines, CheckCircle2 } from 'lucide-react';
import { ApiError, useApi, useErrorText, useLocale, write } from './data';
import { Audition, type Take } from './audition';
import { Feedback } from './public';
import { nameIds, type PublicRegistration, type RegistrationField } from './registration';
import { usePlayback } from './playback';

const photoLimit=5*1024*1024;
const photoAccept='.jpg,.jpeg,.png,.webp';
const arabicName=/^[\u0621-\u063A\u0641-\u0652\u0670\u0671-\u06D3 ]+$/u;

export function JoinChoir() {
  const {l,t}=useLocale();
  const schema=useApi<PublicRegistration>('join/form');
  return <div className="shell page join-page">
    <div className="join-intro"><span className="brand-mark"><AudioLines size={22}/></span>
      <h1>{l('join')}</h1><p>{t('Registration for Youssef El-Seddik Choir','الاشتراك في كورال يوسف الصديق')}</p>
    </div>
    {!schema.data?<Feedback pending={schema.isPending} error={schema.error} onRetry={()=>schema.refetch()}/>:
      !schema.data.fields.length?<Feedback empty={t('Registration is currently closed.','التسجيل مغلق حاليًا.')}/>:
      <RegistrationForm schema={schema.data} reload={()=>void schema.refetch()}/>}
  </div>;
}

function RegistrationForm({schema,reload}:{schema:PublicRegistration;reload:()=>void}) {
  const {t,l}=useLocale();
  const errorText=useErrorText();
  const playback=usePlayback();
  const backing=useApi<{url:string;title:string}>('join/backing',schema.fields.some(f=>f.kind==='recording'));
  const [values,setValues]=useState<Record<string,string[]>>({});
  const [details,setDetails]=useState<Record<string,string>>({});
  const [photo,setPhoto]=useState<File>();
  const [take,setTake]=useState<Take|null>(null);
  const [consent,setConsent]=useState(false);
  const [recording,setRecording]=useState(false);
  const [pending,setPending]=useState(false);
  const [sent,setSent]=useState(false);
  const [failure,setFailure]=useState<unknown>();
  const [errors,setErrors]=useState<Record<string,string>>({});
  const form=useRef<HTMLFormElement>(null);
  const missing=t('This field is required.','الخانة دي مطلوبة.');
  const label=(f:RegistrationField)=>t(f.labelEn,f.labelAr);
  const shown=schema.fields;
  function set(id:string,value:string[]) {
    setValues(old=>({...old,[id]:value}));
    setErrors(old=>({...old,[id]:''}));
  }
  function feedback(id:string) {
    return errors[id]&&<small className="field-error" id={'error-'+id}>{errors[id]}</small>;
  }
  function accessibility(id:string) {
    return {'aria-invalid':!!errors[id],'aria-describedby':errors[id]?'error-'+id:undefined};
  }
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(recording||pending)return;
    const invalid:Record<string,string>={};
    const answers:Record<string,string[]>={};
    setFailure(undefined);
    for(const field of shown) {
      const selected=(values[field.id]??[]).map(value=>value.trim()).filter(Boolean);
      if(field.kind==='photo'||field.kind==='recording') {
        const file=field.kind==='photo'?photo:take?.file;
        if(!file&&field.required)invalid[field.id]=missing;
        if(file&&field.kind==='photo'&&(file.size>photoLimit||!/\.(jpe?g|png|webp)$/i.test(file.name)))
          invalid[field.id]=t('Use a JPG, PNG or WebP image up to 5 MB.','اختار صورة JPG أو PNG أو WebP بحد أقصى ٥ ميجابايت.');
        continue;
      }
      if(!selected.length){if(field.required)invalid[field.id]=missing;continue;}
      if(field.kind==='date'){
        const [year,month,day]=selected[0].split('-').map(Number);
        const birthday=new Date(Date.UTC(year,month-1,day));
        if(!year||!month||!day||birthday.getUTCMonth()!==month-1||birthday.getUTCDate()!==day||birthday>new Date()){
          invalid[field.id]=t('Choose a valid date.','اختار تاريخ ميلاد صحيح.');
          continue;
        }
      }
      if(field.kind==='text'&&field.rule==='arabic'&&(!arabicName.test(selected[0])||!/\p{L}/u.test(selected[0])))
        invalid[field.id]=t('Use Arabic letters only.','اكتب حروف عربي فقط.');
      if(field.kind==='text'&&field.rule==='digits'&&(!/^[0-9]+$/.test(selected[0])||selected[0].length!==field.digits))
        invalid[field.id]=t('Enter exactly '+field.digits+' digits (0–9).','اكتب '+field.digits+' رقم بالإنجليزي (0–9).');
      if(field.kind==='choice'&&field.options?.some(option=>selected.includes(option.id)&&(option.detailAr||option.detailEn)&&!details[field.id+'.'+option.id]?.trim()))
        invalid[field.id]=t('Fill in the details for your choice.','اكتب التفاصيل المطلوبة للاختيار.');
      answers[field.id]=selected;
    }
    if(!consent)invalid.consent=missing;
    setErrors(invalid);
    if(Object.keys(invalid).length){
      const first=Object.keys(invalid)[0];
      requestAnimationFrame(()=>form.current?.querySelector<HTMLElement>('[data-field="'+first+'"] :is(input, select, button)')?.focus());
      return;
    }
    setPending(true);
    const audio=shown.some(f=>f.kind==='recording')?take:null;
    const image=shown.some(f=>f.kind==='photo')?photo:undefined;
    const application={revision:schema.revision,consent,answers,details,backingAudio:audio?.backing,recordingMixed:!!audio?.mixed};
    try {
      if(audio||image){
        const body=new FormData();
        body.append('application',JSON.stringify(application));
        if(audio)body.append('recording',audio.file);
        if(image)body.append('photo',image);
        await write('join','POST',body);
      }else await write('join','POST',application);
      setSent(true);
    }catch(error) {
      if(error instanceof ApiError&&Object.keys(error.fields).length){
        setErrors(Object.fromEntries(Object.keys(error.fields).map(id=>[id,t('Check this field.','راجع الخانة دي.')])));
      }else setFailure(error);
    }finally{setPending(false);}
  }

  if(sent)return <section className="panel join-panel join-confirm"><CheckCircle2 size={34}/>
    <h2 tabIndex={-1} ref={node=>node?.focus()}>{t('Application received','طلبك وصل')}</h2>
    <p>{t('The choir team will review your application.','فريق الكورال هيراجع طلبك.')}</p>
    <Link to="/" className="text-link">{l('home')}</Link></section>;

  return <form ref={form} className="panel join-panel" noValidate onSubmit={submit}>
    <div className="field-grid">
      {shown.map(field=>{
        const id=field.id, title=label(field), selected=values[id]??[];
        const area=field.kind==='text'&&nameIds.includes(id)?'':'wide';
        if(field.kind==='recording')return <div className="wide" key={id} data-field={id}>
          {backing.data?<Audition label={title} backing={backing.data.url}
            title={backing.data.url.startsWith('/media/')?t('Audition backing track','تراك اختبار الصوت'):backing.data.title}
            value={take} change={item=>{setTake(item);setErrors(old=>({...old,[id]:''}));}}
            required={field.required} busyChanged={setRecording} stopSitePlayback={playback.close}/>:
            <Feedback pending={backing.isPending} error={backing.error} onRetry={()=>backing.refetch()}/>}
          {feedback(id)}
        </div>;
        if(field.kind==='date')return <fieldset className="wide registration-date" key={id} data-field={id} {...accessibility(id)}>
          <legend>{title}{field.required?' *':''}</legend>
          <BirthDate id={id} value={selected[0]??''} change={date=>set(id,[date])}/>{feedback(id)}
        </fieldset>;
        if(field.kind==='choice')return <div className="wide" key={id} data-field={id}>
          <label>{title}{field.required?' *':''}
            <select {...accessibility(id)} multiple={field.multiple} required={field.required}
              value={field.multiple?selected:(selected[0]??'')}
              onChange={e=>set(id,Array.from(e.target.selectedOptions,x=>x.value))}>
              {!field.multiple&&<option value="">{t('Choose an option','اختار إجابة')}</option>}
              {field.options?.map(x=><option value={x.id} key={x.id}>{t(x.labelEn,x.labelAr)}</option>)}
            </select>
          </label>
          {field.options?.filter(x=>selected.includes(x.id)&&(x.detailAr||x.detailEn)).map(option=>{
            const key=id+'.'+option.id;
            return <label key={key}>{t(option.detailEn??'',option.detailAr??'')} *
              <input value={details[key]??''} maxLength={300} required dir="auto"
                onChange={event=>setDetails(old=>({...old,[key]:event.target.value}))}/>
            </label>;
          })}{feedback(id)}
        </div>;
        if(field.kind==='photo')return <div className="wide" key={id} data-field={id}><label>{title}{field.required?' *':''}
          <input type="file" accept={photoAccept} required={field.required} {...accessibility(id)}
            onChange={e=>{setPhoto(e.target.files?.[0]);setErrors(old=>({...old,[id]:''}));}}/>
        </label><small className="metadata">{t('JPG, JPEG, PNG or WebP · up to 5 MB','JPG أو JPEG أو PNG أو WebP · حد أقصى ٥ ميجابايت')}</small>
        {feedback(id)}</div>;
        return <div className={area} key={id} data-field={id}><label>{title}{field.required?' *':''}
          <input value={selected[0]??''} type={field.id==='whatsapp'?'tel':'text'} dir={field.rule==='digits'?'ltr':'auto'}
            inputMode={field.rule==='digits'?'numeric':undefined} required={field.required} maxLength={field.rule==='digits'?field.digits??32:300}
            {...accessibility(id)} onChange={e=>set(id,[e.target.value])}/>
        </label>{feedback(id)}</div>;
      })}
      <div className="wide join-consent" data-field="consent"><label className="toggle">
        <input type="checkbox" checked={consent} required {...accessibility('consent')} onChange={e=>setConsent(e.target.checked)}/>
        {t('I agree to let the choir team review my details and attachments.','موافق إن فريق الكورال يراجع بياناتي والملفات اللي أرفقتها.')}
      </label>{feedback('consent')}</div>
      {failure!=null&&<p className="wide form-error" role="alert">{errorText(failure)}{' '}
        {failure instanceof ApiError&&failure.status===409&&<button type="button" className="text-link" onClick={reload}>{t('Reload form','حدّث الاستمارة')}</button>}</p>}
      <div className="wide actions"><button type="submit" className="button dark" disabled={pending||recording}>
        {pending?t('Sending…','جاري الإرسال…'):t('Send application','ابعت طلب الانضمام')}
      </button></div>
    </div>
  </form>;
}

function BirthDate({id,value,change}:{id:string;value:string;change:(value:string)=>void}) {
  const {t}=useLocale();
  const parts=value.split('-');
  const year=new Date().getFullYear();
  const selects=[
    {part:2,label:t('Day','اليوم'),values:Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'))},
    {part:1,label:t('Month','الشهر'),values:Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'))},
    {part:0,label:t('Year','السنة'),values:Array.from({length:year-1899},(_,i)=>String(year-i))},
  ];
  return <div className="registration-date-fields">{selects.map(({part,label,values})=><div key={part}>
    <label htmlFor={id+'-date-'+part}>{label}</label>
    <select id={id+'-date-'+part} value={parts[part]??''} onChange={e=>{parts[part]=e.target.value;change(parts.some(Boolean)?parts.join('-'):'');}}>
      <option value="">—</option>{values.map(option=><option key={option}>{option}</option>)}
    </select></div>)}</div>;
}
