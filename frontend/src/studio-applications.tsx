import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Search } from 'lucide-react';
import { ApiError, params, useApi, useLocale, write, type ChoirGroup, type Page } from './data';
import { AuditionPlayer } from './audition';
import { Confirm, FormError } from './editor-fields';
import { Feedback } from './public';
import { statusLabels, voiceLabels, type Applicant, type ApplicationDetail, type ApplicationStatus } from './recruitment';

const endpoint='admin/applications';
const isList=(key:unknown)=>key===endpoint||String(key).startsWith(endpoint+'?');

function StatusSelect({value,change,filter=false}:{value:string;change:(value:ApplicationStatus|'')=>void;filter?:boolean}) {
  const {t}=useLocale();
  return <label>{filter?t('Filter by status','فلترة حسب الحالة'):t('Application status','حالة الطلب')}
    <select value={value} onChange={e=>change(e.target.value as ApplicationStatus|'')}>
      {filter&&<option value="">{t('All statuses','كل الحالات')}</option>}
      {Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{t(label[0],label[1])}</option>)}
    </select></label>;
}

export function ApplicationsList() {
  const {l,t,date}=useLocale();
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<ApplicationStatus|''>('');
  const [group,setGroup]=useState('');
  const [page,setPage]=useState(1);
  const groups=useApi<ChoirGroup[]>('choir-groups');
  const result=useApi<Page<Applicant>>(endpoint+params({q:query,status,page,group}));
  const data=result.data;
  const pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  return <><h1>{l('applications')}</h1><div className="panel list-panel">
    <form className="filters recruitment-filters" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setPage(1);}}>
      <label>{t('Search applicants','ابحث في الطلبات')}<input type="search" maxLength={120} value={search}
        placeholder={t('Name, email, or phone','الاسم أو البريد أو التليفون')}
        onChange={event=>{setSearch(event.target.value);if(!event.target.value){setQuery('');setPage(1);}}}/></label>
      <StatusSelect filter value={status} change={v=>{setStatus(v);setPage(1);}}/>
      {!!groups.data?.length&&<label>{l('groups')}<select value={group} onChange={e=>{setGroup(e.target.value);setPage(1);}}>
        <option value="">{t('All groups','كل الفرق')}</option><option value="0">{t('Unassigned','من غير فرقة')}</option>
        {groups.data.map(row=><option key={row.id} value={row.id}>{t(row.nameEn,row.nameAr)}</option>)}
      </select></label>}
      <button className="button outline"><Search size={16}/>{l('search')}</button>
    </form>
    {!data?<Feedback pending={result.isPending} error={result.error} onRetry={()=>result.refetch()}/>:
      <><p className="metadata" role="status">{t('Matching applications','عدد الطلبات المطابقة')} · {data.total}</p>
        {data.items.length?<ul className="applicant-list">{data.items.map(item=><li key={item.id}>
          <Link to={String(item.id)}><strong dir="auto">{item.name}</strong><span className="metadata" dir="ltr">{item.email}</span>
            {item.groupId&&<span className="metadata">{t(item.groupEn,item.groupAr)}</span>}</Link>
          <span className={'status '+(item.status==='accepted'?'published':'')}>{t(statusLabels[item.status][0],statusLabels[item.status][1])}</span>
          <time className="metadata" dateTime={item.createdAt}>{date(item.createdAt)}</time>
        </li>)}</ul>:<Feedback empty={query||status||group?t('No applications match these filters.','مفيش طلبات مطابقة للبحث.'):
          t('New join requests will appear here.','طلبات الانضمام الجديدة هتظهر هنا.')}/>}
        {(page>1||pages>1)&&<nav className="pager" aria-label={t('Application pages','صفحات الطلبات')}>
          <button className="button outline" disabled={page<=1} onClick={()=>setPage(page-1)}>{t('Previous','السابق')}</button>
          <span>{page} / {pages}</span>
          <button className="button outline" disabled={page>=pages} onClick={()=>setPage(page+1)}>{t('Next','التالي')}</button>
        </nav>}</>}
  </div></>;
}

export function ApplicationRoute() {
  const {id}=useParams();
  const result=useApi<ApplicationDetail>(endpoint+'/'+id);
  return result.data?<ApplicationEditor key={id} entry={result.data} reload={async()=> (await result.refetch()).data}/>:
    <Feedback pending={result.isPending} error={result.error} onRetry={()=>result.refetch()}/>;
}

function ApplicationEditor({entry,reload}:{entry:ApplicationDetail;reload:()=>Promise<ApplicationDetail|undefined>}) {
  const {l,t,date}=useLocale();
  const queries=useQueryClient();
  const navigate=useNavigate();
  const [status,setStatus]=useState(entry.applicant.status);
  const [notes,setNotes]=useState(entry.notes);
  const [revision,setRevision]=useState(entry.revision);
  const [error,setError]=useState<unknown>();
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const {applicant}=entry;
  const path=endpoint+'/'+applicant.id;
  function reset(data:ApplicationDetail) {
    setStatus(data.applicant.status);setNotes(data.notes);setRevision(data.revision);
  }
  return <div className="application-editor"><Link className="text-link" to="/ADMIN/applications">{l('applications')}</Link>
    <h1 dir="auto">{applicant.name}</h1>
    <section className="panel application-info">
      <h2>{t('Application details','تفاصيل الطلب')}</h2>
      <dl>
        <div><dt>{t('Email','البريد الإلكتروني')}</dt><dd><a dir="ltr" href={'mailto:'+encodeURIComponent(applicant.email)}><Mail size={16}/>{applicant.email}</a></dd></div>
        {applicant.phone&&<div><dt>{t('Phone','رقم التليفون')}</dt><dd><a dir="ltr" href={'tel:'+applicant.phone.replace(/[ ()]/g,'')}><Phone size={16}/>{applicant.phone}</a></dd></div>}
        <div><dt>{t('Voice part','الطبقة الصوتية')}</dt><dd>{t(voiceLabels[applicant.voice][0],voiceLabels[applicant.voice][1])}</dd></div>
        {applicant.groupId&&<div><dt>{t('Choir group','فرقة الكورال')}</dt><dd>{t(applicant.groupEn,applicant.groupAr)}</dd></div>}
        <div><dt>{t('Submitted','تاريخ التقديم')}</dt><dd>{date(applicant.createdAt)}</dd></div>
      </dl>
      {entry.experience&&<div><h2>{t('Singing experience','الخبرة في الغنا')}</h2><p className="prose" dir="auto">{entry.experience}</p></div>}
    </section>
    {entry.recordingUrl&&<section className="panel application-info">
      <h2>{t('Voice recording','التسجيل الصوتي')}</h2>
      {entry.backingTitle&&<p>{entry.backingTitle}</p>}
      <AuditionPlayer voice={entry.recordingUrl} backing={entry.recordedWithBacking?entry.backingAudio:undefined}/>
    </section>}
    <form className="panel editor" onSubmit={async event=>{
      event.preventDefault();setBusy(true);setSaved(false);setError(undefined);
      try {
        const data=await write<ApplicationDetail>(path,'PUT',{status,notes,revision});
        queries.setQueryData([path],data);reset(data);setSaved(true);
        void queries.invalidateQueries({predicate:q=>isList(q.queryKey[0])});
      }catch(ex){setError(ex);}finally{setBusy(false);}
    }}>
      <div className="field-grid">
        <StatusSelect value={status} change={value=>{if(value){setStatus(value);setSaved(false);}}}/>
        <label className="wide">{t('Internal notes','ملاحظات داخلية')}
          <textarea rows={5} maxLength={4000} dir="auto" value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false);}}/>
        </label>
      </div>
      <FormError error={error}/>{saved&&<p className="form-success" role="status">{t('Application updated.','تم حفظ تحديثات الطلب.')}</p>}
      <div className="actions"><button className="button dark" disabled={busy}>{t('Save application','احفظ الطلب')}</button>
        {error instanceof ApiError&&error.status===409&&<button type="button" className="button outline" onClick={async()=>{
          const latest=await reload();
          if(latest){reset(latest);setError(undefined);}
        }}>{t('Load saved version','حمّل آخر نسخة محفوظة')}</button>}</div>
    </form>
    <Confirm title={t('Delete application','احذف الطلب')} action={async()=>{
      await write(path,'DELETE');
      queries.removeQueries({queryKey:[path],exact:true});
      void queries.invalidateQueries({predicate:q=>isList(q.queryKey[0])});
      navigate('/ADMIN/applications',{replace:true});
    }}>{t('This permanently removes the application and its internal notes.','الطلب والملاحظات الداخلية هيتحذفوا نهائيًا.')}</Confirm>
  </div>;
}
