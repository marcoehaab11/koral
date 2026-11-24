import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useLocale, write, type Platform, type Profile, type Session, type Settings } from './data';
import { Feedback } from './public';
import { Confirm, FieldInput, Fieldset, FormError, MediaField, PlatformFields, Toggle, field, pair, text, type Field } from './editor-fields';

export function ProfileRoute({kind}:{kind:'choir'|'settings'}) {
  const query=useApi<Profile|Settings>('admin/'+kind);
  return query.data?<ProfileForm key={kind} kind={kind} value={query.data}/>:<Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>;
}
function ProfileForm({kind,value}:{kind:'choir'|'settings';value:Profile|Settings}) {
  const {t,l}=useLocale();
  const [data,setData]=useState<Record<string,unknown>>({...value});
  const [error,setError]=useState<unknown>();
  const [busy,setBusy]=useState(false);
  const [uploads,setUploads]=useState(0);
  const [saved,setSaved]=useState(false);
  const query=useQueryClient();
  const set=(key:string,value:unknown)=>{setSaved(false);setData(d=>({...d,[key]:value}));};
  const render=(f:Field)=><FieldInput key={f.key} item={f} value={data[f.key]} change={v=>set(f.key,v)}/>;
  const image=(key:string,title:string)=><MediaField title={title} value={text(data[key])} bucket="choir" kind="image"
    busy={n=>setUploads(x=>x+n)} change={v=>set(key,v)}/>;
  const toggles=[
    ['english','English','الإنجليزية'],['arabic','Arabic','العربية'],['members','Members page','صفحة الأعضاء'],['events','Events page','صفحة الفعاليات'],
    ['homeAlbums','Featured albums','الألبومات المختارة'],['homeSongs','Latest songs','أحدث الأغاني'],['homeAbout','About preview','نبذة عن الكورال'],
    ['homeGallery','Gallery preview','مختارات المعرض'],['homeEvents','Events preview','الفعاليات المقبلة'],
    ['homeFeaturedSongs','Featured songs','الأغاني المختارة'],['homeJoin','Join button on the homepage','زر الانضمام في الصفحة الرئيسية'],
  ];
  return <><h1>{l(kind)}</h1><form className="editor" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError(undefined);setSaved(false);
    try{await write('admin/'+kind,'PUT',data);await query.invalidateQueries();setSaved(true);}catch(e){setError(e);}finally{setBusy(false);}
  }}>
    {kind==='choir'?<>
      <Fieldset title={t('Identity','الهوية')}>{[...pair('name','Choir name','اسم الكورال',undefined,true),field('founded','Foundation year','سنة التأسيس','number'),
        ...pair('director','Director','القائد'),...pair('intro','Introduction','المقدمة','textarea')].map(render)}
        {image('logo',t('Logo','الشعار'))}{image('cover',t('Cover photo','صورة الغلاف'))}
        {image('coverMobile',t('Cover photo for small screens','صورة الغلاف للموبايل'))}</Fieldset>
      <Fieldset title={t('About the choir','عن الكورال')}>{[...pair('about','About','النبذة','textarea'),...pair('history','History','التاريخ','textarea'),
        ...pair('mission','Mission','الرسالة','textarea'),...pair('vision','Vision','الرؤية','textarea'),
        ...pair('aboutImageAlt','Photo description for screen readers','وصف الصورة لقارئات الشاشة')].map(render)}
        {image('aboutImage',t('About photo','صورة عن الكورال'))}</Fieldset>
      <Fieldset title={t('Contact and socials','التواصل والحسابات')}>{[field('email','Email','البريد الإلكتروني','email'),field('phone','Phone','الهاتف'),
        ...pair('address','Address','العنوان')].map(render)}<PlatformFields social value={(data.social??[]) as Platform[]} change={v=>set('social',v)}/></Fieldset>
    </>:<>
      <Fieldset title={t('Metadata and footer','بيانات الموقع والتذييل')}>{[...pair('title','Site title','عنوان الموقع'),
        ...pair('description','Site description','وصف الموقع','textarea'),...pair('footer','Footer text','نص التذييل','textarea')].map(render)}
        {image('favicon',t('Favicon','أيقونة الموقع'))}</Fieldset>
      <Fieldset title={t('Language and visibility','اللغة والظهور')}>
        <label>{t('Default language','اللغة الافتراضية')}<select value={text(data.defaultLanguage)} onChange={e=>set('defaultLanguage',e.target.value)}>
          <option value="en">English</option><option value="ar">العربية</option></select></label>
        {toggles.map(([key,en,ar])=><Toggle key={key} title={t(en,ar)} checked={Boolean(data[key])} change={v=>set(key,v)}/>)}
      </Fieldset>
    </>}
    <FormError error={error}/>{saved&&<p className="form-success" role="status">{t('Changes saved.','تم حفظ التغييرات.')}</p>}
    <div><button className="button dark" disabled={busy||uploads>0}>{busy?t('Saving…','جارٍ الحفظ…'):t('Save changes','احفظ التغييرات')}</button></div>
  </form></>;
}
type StaffAccount=Session&{id:string};
export function Staff() {
  const {t,l}=useLocale();
  const query=useQueryClient();
  const request=useApi<StaffAccount[]>('admin/users');
  const current=useApi<Session>('auth/me');
  const [error,setError]=useState<unknown>();
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  return <><h1>{l('users')}</h1><form className="editor" onSubmit={async e=>{
    e.preventDefault();setError(undefined);setSaved(false);setBusy(true);
    const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));
    try{await write('admin/users','POST',data);form.reset();await query.invalidateQueries({queryKey:['admin/users']});setSaved(true);}
    catch(error){setError(error);}finally{setBusy(false);}
  }}>
    <Fieldset title={t('Create staff account','إنشاء حساب للفريق')}>
      <label>{t('Email','البريد الإلكتروني')}<input name="email" type="email" required autoComplete="off"/></label>
      <label>{t('Temporary password','كلمة مرور مؤقتة')}<input name="password" type="password" minLength={12} required autoComplete="new-password"/></label>
      <label>{t('Role','الدور')}<select name="role"><option value="ContentEditor">{t('Content Editor','محرر محتوى')}</option>
        <option value="SuperAdmin">{t('Super Admin','مدير النظام')}</option></select></label>
      <div className="wide"><button className="button dark" disabled={busy}>{t('Create account','أنشئ الحساب')}</button></div>
      <div className="wide"><FormError error={error}/>{saved&&<p role="status">{t('Account created.','تم إنشاء الحساب.')}</p>}</div>
    </Fieldset></form>
    <div className="panel staff-list">{request.data?<ul>{request.data.map(user=><li key={user.id}>
      <span dir="ltr">{user.email}</span><span>{user.roles.includes('SuperAdmin')?t('Super Admin','مدير النظام'):t('Content Editor','محرر محتوى')}</span>
      {current.data?.email!==user.email&&<Confirm title={t('Delete account','حذف الحساب')} action={async()=>{await write('admin/users/'+user.id,'DELETE');await request.refetch();}}>
        {t('Remove access for','أزل وصول')} {user.email}.</Confirm>}</li>)}</ul>:
      <Feedback pending={request.isPending} error={request.error} onRetry={()=>request.refetch()}/>}</div></>;
}
