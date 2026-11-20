import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AudioLines, Disc3, Menu, Plus, X } from 'lucide-react';
import { z } from 'zod';
import { ApiError, params, useApi, useLocale, write, type Entry, type Page, type Resource, type Session } from './data';
import { Brand, Feedback, Language } from './public';
import { EditorRoute, ProfileRoute, Staff, FormError } from './editor';
import { ApplicationRoute, ApplicationsList } from './studio-applications';

const resources: Resource[]=['albums','songs','gallery','categories','members','events'];
function Auth({state,change=false}:{state?:Session;change?:boolean}) {
  const {t}=useLocale();
  const queries=useQueryClient();
  const navigate=useNavigate();
  const {register,handleSubmit,formState,reset}=useForm<{email:string;password:string;current:string}>();
  const [error,setError]=useState<unknown>();
  const [saved,setSaved]=useState(false);
  const required=t('This field is required.','هذا الحقل مطلوب.');
  async function submit(values:{email:string;password:string;current:string}) {
    setError(undefined);setSaved(false);
    const schema=change?z.object({current:z.string().min(1),password:z.string().min(12).max(256)}):
      z.object({email:z.email(),password:z.string().min(1).max(256)});
    if(!schema.safeParse(values).success){setError(new ApiError(400,t('Check the field requirements.','تحقق من متطلبات الحقول.')));return;}
    try {
      const session=await write<Session>('auth/'+(change?'password':'login'),'POST',values);
      queries.setQueryData(['auth/me'],session);
      if(change&&!state?.mustChangePassword){reset();setSaved(true);}
      else navigate(session.mustChangePassword?'/ADMIN/password':'/ADMIN',{replace:true});
    }catch(ex){setError(ex);}
  }
  return <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
    <h1>{change?t('Change your password','غيّر كلمة المرور'):t('Sign in to Studio','الدخول إلى الاستوديو')}</h1>
    {state?.mustChangePassword&&<p>{t('Choose a new password to open the dashboard.','اختر كلمة مرور جديدة لفتح لوحة التحكم.')}</p>}
    {change?<label>{t('Current password','كلمة المرور الحالية')}<input type="password" autoComplete="current-password"
      aria-invalid={!!formState.errors.current} aria-describedby={formState.errors.current?'auth-current-error':undefined} {...register('current',{required})}/>
      {formState.errors.current&&<small id="auth-current-error" role="alert">{formState.errors.current.message}</small>}</label>:
      <label>{t('Email','البريد الإلكتروني')}<input type="email" dir="ltr" autoComplete="username"
        aria-invalid={!!formState.errors.email} aria-describedby={formState.errors.email?'auth-email-error':undefined} {...register('email',{required})}/>
      {formState.errors.email&&<small id="auth-email-error" role="alert">{formState.errors.email.message}</small>}</label>}
    <label>{change?t('New password','كلمة المرور الجديدة'):t('Password','كلمة المرور')}<input type="password" autoComplete={change?'new-password':'current-password'}
      aria-invalid={!!formState.errors.password} aria-describedby={formState.errors.password?'auth-password-error':undefined}
      {...register('password',{required,minLength:change?{value:12,message:t('Use at least 12 characters.','استخدم ١٢ حرفاً على الأقل.')}:undefined})}/>
      {formState.errors.password&&<small id="auth-password-error" role="alert">{formState.errors.password.message}</small>}</label>
    <FormError error={error}/>{saved&&<p role="status" className="form-success">{t('Password changed.','تم تغيير كلمة المرور.')}</p>}
    <button className="button dark" disabled={formState.isSubmitting}>{formState.isSubmitting?t('Please wait…','يرجى الانتظار…'):
      change?t('Save password','احفظ كلمة المرور'):t('Sign in','تسجيل الدخول')}</button>
  </form>;
}
function SignInScreen({children}:{children:React.ReactNode}) {
  return <div className="login"><header><Brand studio/><Language/></header><main>{children}</main><div className="login-image" aria-hidden="true"/></div>;
}
export default function Studio() {
  const {t,l,profile}=useLocale();
  const [nav,setNav]=useState(false);
  const [logoutError,setLogoutError]=useState<unknown>();
  const session=useApi<Session|null>('auth/me');
  const navigate=useNavigate();
  const queries=useQueryClient();
  const studioTitle=t(profile.nameEn+' Studio','استوديو '+profile.nameAr);
  useEffect(()=>{document.title=studioTitle;},[studioTitle]);
  if(session.isPending)return <Feedback pending/>;
  if(session.isError&&(!(session.error instanceof ApiError)||session.error.status!==401))
    return <Feedback error={session.error} onRetry={()=>session.refetch()}/>;
  if(!session.data)return <Routes><Route path="login" element={<SignInScreen><Auth/></SignInScreen>}/>
    <Route path="*" element={<Navigate to="/ADMIN/login" replace/>}/></Routes>;
  const user=session.data;
  const owner=user.roles.includes('SuperAdmin');
  async function logout(){
    try{await write('auth/logout','POST');queries.removeQueries({predicate:q=>String(q.queryKey[0]).startsWith('admin/')});
      queries.setQueryData(['auth/me'],null);navigate('/ADMIN/login',{replace:true});}catch(ex){setLogoutError(ex);}
  }
  const signout=<button className="button outline" onClick={logout}>{t('Sign out','تسجيل الخروج')}</button>;
  if(user.mustChangePassword)return <Routes><Route path="password" element={<SignInScreen><Auth state={user} change/>
    <FormError error={logoutError}/>{signout}</SignInScreen>}/><Route path="*" element={<Navigate to="/ADMIN/password" replace/>}/></Routes>;
  return <div className="studio"><aside className={nav?'studio-sidebar open':'studio-sidebar'} id="studio-nav"><Brand studio/>
    <nav aria-label={t('Studio navigation','قائمة الاستوديو')}>
      <NavLink end to="/ADMIN" onClick={()=>setNav(false)}>{l('dashboard')}</NavLink>
      {owner&&<NavLink to="/ADMIN/applications" onClick={()=>setNav(false)}>{l('applications')}</NavLink>}
      {resources.map(key=><NavLink key={key} to={'/ADMIN/'+key} onClick={()=>setNav(false)}>{l(key)}</NavLink>)}
      {owner&&(['choir','settings','users'] as const).map(key=><NavLink key={key} to={'/ADMIN/'+key} onClick={()=>setNav(false)}>{l(key)}</NavLink>)}
      <NavLink to="/ADMIN/password" onClick={()=>setNav(false)}>{l('password')}</NavLink>
    </nav><Link className="studio-public" to="/">{t('View public site','عرض الموقع')}</Link></aside>
    <div className="studio-main"><header className="studio-header"><button className="icon-button studio-menu" aria-controls="studio-nav" aria-expanded={nav}
      aria-label={t('Toggle menu','إظهار القائمة')} onClick={()=>setNav(!nav)}>{nav?<X/>:<Menu/>}</button>
      <span className="staff-email" dir="ltr">{user.email}</span><Language/>{signout}</header>
      <main className="studio-content"><FormError error={logoutError}/><Routes>
        <Route index element={<Dashboard/>}/><Route path="login" element={<Navigate to="/ADMIN" replace/>}/>
        {resources.map(resource=><Route key={resource} path={resource}>
          <Route index element={<AdminList key={resource} resource={resource}/>}/><Route path=":id" element={<EditorRoute key={resource} resource={resource}/>}/>
        </Route>)}
        {owner&&<><Route path="choir" element={<ProfileRoute kind="choir"/>}/><Route path="settings" element={<ProfileRoute kind="settings"/>}/>
          <Route path="users" element={<Staff/>}/>
          <Route path="applications" element={<ApplicationsList/>}/><Route path="applications/:id" element={<ApplicationRoute/>}/></>}
        <Route path="password" element={<Auth state={user} change/>}/>
        <Route path="*" element={<Feedback error={new ApiError(404,'')}/>}/>
      </Routes></main>
    </div></div>;
}
type Activity={actor:string;action:string;resource:string;entryId:number|null;at:string};
type Overview={albums:number;songs:number;published:number;drafts:number;gallery:number;upcoming:number;recent:Activity[];activity:Activity[]};
function Dashboard() {
  const {t,l,date}=useLocale();
  const request=useApi<Overview>('admin/dashboard');
  const data=request.data;
  const labels:Record<string,string>={create:t('Created','إضافة'),update:t('Updated','تحديث'),delete:t('Deleted','حذف'),
    upload:t('Uploaded','رفع'),reorder:t('Reordered','إعادة ترتيب'),'change-password':t('Changed password','تغيير كلمة المرور')};
  function timeline(rows:Activity[]) {
    return rows.length?<ul className="activity">{rows.map((row,i)=><li key={row.at+i}>
      <span>{labels[row.action]||row.action}{' · '}{row.resource==='applications'?l('applications'):resources.includes(row.resource as Resource)?l(row.resource as Resource):row.resource}
        {row.entryId!=null?' #'+row.entryId:''}{row.actor?' · '+row.actor:''}</span><time dateTime={row.at}>{date(row.at)}</time>
    </li>)}</ul>:<Feedback empty={t('No activity yet.','لا يوجد نشاط بعد.')}/>;
  }
  return <><h1>{l('dashboard')}</h1>{!data?<Feedback pending={request.isPending} error={request.error} onRetry={()=>request.refetch()}/>:
    <><div className="stats">{([
      ['albums',l('albums')],['songs',l('songs')],['published',t('Published songs','الأغاني المنشورة')],['drafts',t('Draft songs','مسودات الأغاني')],
      ['gallery',l('gallery')],['upcoming',t('Upcoming events','الفعاليات القادمة')],
    ] as const).map(([key,label])=><article key={key}><AudioLines size={19}/><strong>{data[key]}</strong><span>{label}</span></article>)}</div>
      <div className="dashboard-grid"><section className="panel"><h2>{t('Recently added','أضيف مؤخراً')}</h2>{timeline(data.recent)}</section>
      <section className="panel"><h2>{t('Recent activity','النشاط الأخير')}</h2>{timeline(data.activity)}</section></div></>}</>;
}
function AdminList({resource}:{resource:Resource}) {
  const {t,l,date}=useLocale();
  const [page,setPage]=useState(1);
  const [q,setQ]=useState('');
  const query=useApi<Page<Entry>>('admin/'+resource+params({q,page,size:20}));
  const data=query.data;
  return <><div className="studio-heading"><h1>{l(resource)}</h1><Link className="button dark" to="new"><Plus size={17}/>{t('Create new','إضافة جديد')}</Link></div>
    <div className="panel list-panel"><input type="search" aria-label={t('Filter entries','تصفية العناصر')} placeholder={t('Filter by title or description','تصفية حسب العنوان أو الوصف')}
      value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/>
      {!data?<Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>:
      data.items.length?<><ul className="entry-list">{data.items.map(item=><li key={item.id}>
        {item.image?<img src={item.image} alt=""/>:<span className="entry-img"><Disc3 size={20}/></span>}
        <Link to={String(item.id)}>{t(item.titleEn,item.titleAr)}</Link>
        <span className={'status '+(item.published?'published':'')}>{item.published?t('Published','منشور'):t('Draft','مسودة')}</span>
        <time>{date(item.updatedAt)}</time></li>)}</ul>
        {data.total>20&&<div className="pager"><button className="button outline" disabled={page===1} onClick={()=>setPage(page-1)}>{t('Previous','السابق')}</button>
        <span>{page} / {Math.ceil(data.total/20)}</span><button className="button outline" disabled={page>=Math.ceil(data.total/20)} onClick={()=>setPage(page+1)}>{t('Next','التالي')}</button></div>}</>:
      <Feedback empty={t('No matching entries.','لا توجد عناصر مطابقة.')}/>}</div>
  </>;
}
