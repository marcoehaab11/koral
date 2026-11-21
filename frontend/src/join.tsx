import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { AudioLines, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { ApiError, useApi, useErrorText, useLocale, write, type ChoirGroup } from './data';
import { Audition, type Take } from './audition';
import { usePlayback } from './playback';
import { voiceLabels, type Voice } from './recruitment';

type Fields = { name: string; email: string; phone: string; voice: Voice; experience: string; consent: boolean };

export function JoinChoir() {
  const {t,l,profile,settings}=useLocale();
  const errorText=useErrorText();
  const playback=usePlayback();
  const [failure,setFailure]=useState<unknown>();
  const [sent,setSent]=useState(false);
  const [groupId,setGroupId]=useState(0);
  const [take,setTake]=useState<Take|null>(null);
  const [recording,setRecording]=useState(false);
  const groups=useApi<ChoirGroup[]>('choir-groups');
  const defaultBacking=useApi<{url:string;title:string}>('join/backing');
  const openGroups=groups.data?.filter(group=>group.accepting)??[];
  const group=openGroups.find(item=>item.id===groupId);
  const backing=group?.backingAudio||defaultBacking.data?.url||'';
  const backingTitle=group?.backingAudio?group.backingTitle:t(defaultBacking.data?.title??'Audition backing track','تراك اختبار الصوت');
  const confirmation=useRef<HTMLHeadingElement>(null);
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<Fields>({defaultValues:{voice:'unsure',consent:false}});
  const title=l('join');
  const name=t(settings.titleEn,settings.titleAr)||t(profile.nameEn,profile.nameAr);
  useEffect(()=>{document.title=title+' | '+name;},[title,name]);
  useEffect(()=>{if(sent)confirmation.current?.focus();},[sent]);

  const schema=z.object({
    name:z.string().trim().min(2).max(120),
    email:z.email().max(254),
    phone:z.string().trim().refine(value=>!value || (/^\+?[\p{Nd} ()-]{7,30}$/u.test(value) && [7,8,9,10,11,12,13,14,15].includes(value.replace(/[^\p{Nd}]/gu,'').length))),
    voice:z.enum(['unsure','soprano','alto','tenor','bass','other']),
    experience:z.string().trim().max(1500),
    consent:z.literal(true),
  });
  const nameError=t('Enter your full name, up to 120 characters.','اكتب اسمك بالكامل، بحد أقصى ١٢٠ حرف.');
  const emailError=t('Enter a valid email address.','اكتب بريد إلكتروني صحيح.');
  const phoneError=t('Enter a phone number with 7 to 15 digits, or leave it blank.','اكتب رقم تليفون من ٧ لـ١٥ رقم، أو سيب الخانة فاضية.');
  const consentError=t('Agree to let the choir team review your application and contact you.','وافق على مراجعة فريق الكورال للطلب والتواصل معاك.');
  function hint(field:keyof Fields) {
    return errors[field]?.message?<small id={'join-'+field+'-error'} className="field-error">{errors[field]?.message}</small>:null;
  }
  function accessible(field:keyof Fields) {
    return {'aria-invalid':!!errors[field], 'aria-describedby':errors[field]?'join-'+field+'-error':undefined};
  }

  return <div className="shell page join-page">
    <div className="join-intro"><span className="brand-mark"><AudioLines size={22}/></span><h1>{title}</h1>
      <p>{t('Tell us a little about yourself and the voice you’d like to bring to the choir.','عرّفنا بنفسك وبالصوت اللي حابب تشارك بيه في الكورال.')}</p>
    </div>
    {sent?<section className="panel join-panel join-confirm">
      <CheckCircle2 size={34}/><h2 ref={confirmation} tabIndex={-1}>{t('Application received','طلبك وصل')}</h2>
      <p>{t('The choir team will review your application and may contact you about the next steps.','فريق الكورال هيراجع طلبك وممكن يتواصل معاك بخصوص الخطوات الجاية.')}</p>
      <Link to="/" className="text-link">{l('home')}</Link>
    </section>:<form className="panel join-panel" noValidate onSubmit={handleSubmit(async values=>{
      setFailure(undefined);
      const result=schema.safeParse({...values,email:values.email.trim()});
      if(!result.success){setFailure(new ApiError(400,t('Review your application and try again.','راجع بيانات طلبك وحاول تاني.')));return;}
      if((groups.data?.length&&!group)||recording)return;
      if(group?.recordingRequired&&!take){
        setFailure(new ApiError(400,t('Add a voice recording for this group.','ضيف تسجيل صوتي للفرقة دي.')));return;
      }
      const application={...result.data,groupId:group?.id,backingAudio:take?.backing,recordedWithBacking:!!take?.backing};
      try {
        if(take){
          const data=new FormData();
          data.append('application',JSON.stringify(application));
          data.append('recording',take.file);
          await write('join','POST',data);
        } else await write('join','POST',application);
        setSent(true);setTake(null);
      } catch(error) {
        if(error instanceof ApiError&&error.status===409){void groups.refetch();void defaultBacking.refetch();}
        setFailure(error);
      }
    })}>
      <div className="field-grid">
        {openGroups.length>0&&<label className="wide">{t('Choose a choir group','اختار فرقة الكورال')}
          <select required value={groupId||''} disabled={recording||isSubmitting} onChange={e=>{
            setGroupId(Number(e.target.value));setTake(null);setFailure(undefined);
          }}>
            <option value="">{t('Select a group','اختار الفرقة')}</option>
            {openGroups.map(item=><option value={item.id} key={item.id}>{t(item.nameEn,item.nameAr)}</option>)}
          </select>
        </label>}
        <div className="wide"><label htmlFor="join-name">{t('Full name','الاسم بالكامل')}</label>
          <input id="join-name" autoComplete="name" required maxLength={120} {...accessible('name')}
            {...register('name',{validate:v=>schema.shape.name.safeParse(v).success||nameError})}/>{hint('name')}</div>
        <div><label htmlFor="join-email">{t('Email','البريد الإلكتروني')}</label>
          <input id="join-email" type="email" autoComplete="email" dir="ltr" required maxLength={254} {...accessible('email')}
            {...register('email',{validate:v=>schema.shape.email.safeParse(v.trim()).success||emailError})}/>{hint('email')}</div>
        <div><label htmlFor="join-phone">{t('Phone (optional)','رقم التليفون (اختياري)')}</label>
          <input id="join-phone" type="tel" autoComplete="tel" dir="ltr" maxLength={30} {...accessible('phone')}
            {...register('phone',{validate:v=>schema.shape.phone.safeParse(v).success||phoneError})}/>{hint('phone')}</div>
        <div className="wide"><label htmlFor="join-voice">{t('Voice part','الطبقة الصوتية')}</label>
          <select id="join-voice" {...register('voice')}>
            {(Object.entries(voiceLabels)).map(([key,label])=><option key={key} value={key}>{t(label[0],label[1])}</option>)}
          </select></div>
        <div className="wide"><label htmlFor="join-experience">{t('Singing experience (optional)','خبرتك في الغنا (اختياري)')}</label>
          <textarea id="join-experience" rows={4} maxLength={1500} dir="auto" {...register('experience')}/></div>
        {!!groups.data&&(!groups.data.length||group)&&!!backing&&
          <Audition key={String(groupId)+backing} backing={backing} title={backingTitle}
            required={!!group?.recordingRequired} value={take} change={next=>{setTake(next);setFailure(undefined);}}
            busyChanged={setRecording} stopSitePlayback={playback.close}/>}
        {!!groups.data&&(!groups.data.length||group)&&!backing&&<p className="wide metadata" role="status">
          {defaultBacking.isError?t('The backing track could not be loaded.','تعذّر تحميل التراك المصاحب.'):
            t('Loading the backing track…','جارٍ تحميل التراك المصاحب…')}
          {defaultBacking.isError&&<> <button type="button" className="text-link" onClick={()=>void defaultBacking.refetch()}>
            {t('Retry','حاول تاني')}</button></>}
        </p>}
        <div className="wide join-consent"><label className="toggle">
          <input type="checkbox" required {...accessible('consent')} {...register('consent',{validate:v=>v||consentError})}/>
          {t('I agree to let the choir team review my details and any recording I submit, and contact me about joining.',
            'موافق إن فريق الكورال يراجع بياناتي وأي تسجيل أرفعه ويتواصل معايا بخصوص الانضمام.')}
        </label>{hint('consent')}</div>
      </div>
      {failure!==undefined&&<p className="form-error" role="alert">{errorText(failure)}</p>}
      {groups.isError&&<p className="form-error" role="alert">{t('Could not load the choir groups.','فرق الكورال ما اتحمّلتش.')}
        {' '}<button type="button" className="text-link" onClick={()=>void groups.refetch()}>{t('Try again','حاول تاني')}</button></p>}
      {!!groups.data?.length&&!openGroups.length&&<p role="status">{t('Applications are currently closed.','التقديم مقفول حاليًا.')}</p>}
      <button className="button dark" disabled={isSubmitting||recording||!groups.data||!!groups.data.length&&!group}>
        {isSubmitting?t('Sending…','جاري إرسال الطلب…'):t('Send application','ابعت طلب الانضمام')}</button>
    </form>}
  </div>;
}
