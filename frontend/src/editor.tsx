import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { z } from 'zod';
import { ApiError, params, useApi, useLocale, write, type ChoirGroup, type Entry, type Page, type Platform, type Resource } from './data';
import { Feedback } from './public';
import { Confirm, FieldInput, Fieldset, FormError, MediaField, PlatformFields, Toggle, field, pair, text, type Field } from './editor-fields';
export { FormError } from './editor-fields';
export { ProfileRoute, Staff } from './profile-editor';

const initial:Partial<Entry>={titleEn:'',titleAr:'',descriptionEn:'',descriptionAr:'',image:'',audio:'',lyricsEn:'',lyricsAr:'',
  composer:'',lyricist:'',arranger:'',conductor:'',slug:'',positionEn:'',positionAr:'',location:'',registration:'',video:'',
  links:[],groupIds:[],published:false,featured:false,sort:0,status:'scheduled'};
const fields:Record<Resource,Field[]> = {
  albums:[field('date','Release date','تاريخ الإصدار','date')],
  songs:[field('slug','URL slug','رابط الصفحة','slug',true),field('date','Release date','تاريخ الإصدار','date'),
    field('duration','Duration in seconds','المدة بالثواني','number'),field('composer','Composer','الملحن'),field('lyricist','Lyricist','كاتب الكلمات'),
    field('arranger','Arranger','الموزع'),field('conductor','Conductor','قائد الكورال')],
  gallery:pair('caption','Caption','التعليق'),categories:[],members:pair('position','Position','الدور'),
  events:[field('date','Start date and time','تاريخ ووقت البداية','datetime-local',true),field('end','End date and time','تاريخ ووقت النهاية','datetime-local'),
    field('location','Location','المكان'),field('registration','Registration link','رابط التسجيل','url')],
};
export function EditorRoute({resource}:{resource:Resource}) {
  const {id}=useParams();
  const query=useApi<Entry>('admin/'+resource+'/'+id,id!=='new');
  if(id==='new')return <Editor resource={resource} key="new"/>;
  if(!query.data)return <Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>;
  return <Editor resource={resource} item={query.data} key={query.data.id}/>;
}
function Relationship({resource,value,change}:{resource:'albums'|'categories'|'songs';value:unknown;change:(value:number|null)=>void}) {
  const {t,l}=useLocale();
  const [search,setSearch]=useState('');
  const options=useApi<Page<Entry>>('admin/'+resource+params({q:search,size:100}));
  return <div><label>{t('Find by title','ابحث بالعنوان')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <label>{l(resource)}<select value={text(value)} onChange={e=>change(e.target.value?Number(e.target.value):null)}>
      <option value="">{t('None','بدون')}</option>
      {options.data?.items.map(row=><option key={row.id} value={row.id}>{t(row.titleEn,row.titleAr)}</option>)}
      {Number(value)>0&&!options.data?.items.some(row=>row.id===value)&&<option value={text(value)}>#{text(value)}</option>}
    </select></label><FormError error={options.error}/></div>;
}
function Editor({resource,item}:{resource:Resource;item?:Entry}) {
  const {t,l}=useLocale();
  const [data,setData]=useState<Record<string,unknown>>({...initial,...item});
  const [error,setError]=useState<unknown>();
  const [busy,setBusy]=useState(false);
  const [uploads,setUploads]=useState(0);
  const [saved,setSaved]=useState(false);
  const query=useQueryClient();
  const navigate=useNavigate();
  const path='admin/'+resource+(item?'/'+item.id:'');
  const groups=useApi<ChoirGroup[]>('choir-groups',resource==='albums');
  const set=(key:string,value:unknown)=>{setSaved(false);setData(d=>({...d,[key]:value}));};
  const input=(f:Field)=><FieldInput key={f.key} item={f} value={data[f.key]} change={v=>set(f.key,v)}/>;
  const media=(key:string,title:string,bucket:string,kind:'image'|'audio'|'video')=><MediaField title={title} value={text(data[key])}
    bucket={bucket} kind={kind} busy={delta=>setUploads(n=>n+delta)} change={v=>set(key,v)}/>;
  const links=(data.links??[]) as Platform[];
  const groupIds=(data.groupIds??[]) as number[];
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError(undefined);setSaved(false);
    const validation=z.object({titleEn:z.string().trim().min(1).max(180),titleAr:z.string().trim().min(1).max(180)}).safeParse(data);
    if(!validation.success){setError(new ApiError(400,t('Enter both titles, up to 180 characters each.','أدخل العنوانين، بحد أقصى ١٨٠ حرفاً لكل منهما.')));return;}
    if(links.some(x=>!z.url({protocol:/^https?$/}).safeParse(x.url).success)){
      setError(new ApiError(400,t('Use HTTP or HTTPS links.','استخدم روابط HTTP أو HTTPS.')));return;
    }
    setBusy(true);
    try{
      const row=await write<Entry>(path,item?'PUT':'POST',{...data,slug:resource==='albums'?undefined:data.slug,sort:data.sort??0});
      query.setQueryData(['admin/'+resource+'/'+row.id],row);
      void query.invalidateQueries();
      setSaved(true);
      if(!item)navigate('/ADMIN/'+resource+'/'+row.id,{replace:true});
    }catch(e){setError(e);}finally{setBusy(false);}
  }
  return <><Link className="text-link" to={'/ADMIN/'+resource}>{l(resource)}</Link><h1>{item?t(item.titleEn,item.titleAr):t('New entry','عنصر جديد')}</h1>
    <form className="editor" onSubmit={save}>
      <Fieldset title={t('Details','التفاصيل')}>
        {pair('title',resource==='members'?'Name':'Title',resource==='members'?'الاسم':'العنوان',undefined,true).map(input)}
        {pair('description',resource==='members'?'Biography':'Description',
          resource==='members'?'السيرة':'الوصف','textarea').map(input)}
        {fields[resource].map(input)}
        {resource==='songs'&&<Relationship resource="albums" value={data.albumId} change={v=>set('albumId',v)}/>}
        {resource==='gallery'&&<Relationship resource="categories" value={data.categoryId} change={v=>set('categoryId',v)}/>}
        {resource==='events'&&<label>{t('Event status','حالة الفعالية')}<select value={text(data.status)} onChange={e=>set('status',e.target.value)}>
          <option value="scheduled">{t('Scheduled','مجدولة')}</option><option value="postponed">{t('Postponed','مؤجلة')}</option><option value="cancelled">{t('Cancelled','ملغاة')}</option></select></label>}
      </Fieldset>
      {resource!=='categories'&&<Fieldset title={t('Media','الوسائط')}>
        {media('image',t('Cover image','صورة الغلاف'),resource,'image')}
        {resource==='songs'&&media('audio',t('MP3 audio','ملف MP3'),'audio','audio')}
        {resource==='gallery'&&<><label className="wide">{t('Video URL','رابط الفيديو')}<input type="url" dir="ltr" value={text(data.video).startsWith('/')?'':text(data.video)}
          onChange={e=>set('video',e.target.value)}/></label>{media('video',t('MP4 video','ملف MP4'),'gallery','video')}</>}
      </Fieldset>}
      {resource==='songs'&&<><Fieldset title={t('Lyrics','الكلمات')}>{pair('lyrics','Lyrics','الكلمات','textarea').map(input)}</Fieldset>
        <Fieldset title={t('Streaming platforms','منصات الاستماع')}><PlatformFields value={links} change={v=>set('links',v)}/></Fieldset></>}
      {resource==='albums'&&<>
        <Fieldset title={l('groups')}>
          {groups.data?.length?groups.data.map(group=><Toggle key={group.id} title={t(group.nameEn,group.nameAr)}
            checked={groupIds.includes(group.id)} change={checked=>set('groupIds',checked?[...groupIds,group.id]:groupIds.filter(id=>id!==group.id))}/>):
            <Feedback pending={groups.isPending} error={groups.error} empty={t('No choir groups have been created yet.','لسه مفيش فرق اتعملت.')}/>}
        </Fieldset>
        <Fieldset title={t('Full album links','روابط الألبوم بالكامل')}><PlatformFields album value={links} change={v=>set('links',v)}/></Fieldset>
      </>}
      <Fieldset title={t('Publishing','النشر')}>
        <Toggle checked={Boolean(data.published)} title={t('Published','منشور')} change={v=>set('published',v)}/>
        <Toggle checked={Boolean(data.featured)} title={t('Featured','مميز')} change={v=>set('featured',v)}/>
        {input(field('sort','Display order','ترتيب العرض','number'))}
      </Fieldset>
      <FormError error={error}/>{saved&&<p className="form-success" role="status">{t('Changes saved.','تم حفظ التغييرات.')}</p>}
      <div className="actions"><button className="button dark" disabled={busy||uploads>0}>{busy?t('Saving…','جارٍ الحفظ…'):
        data.published?t('Save published entry','احفظ العنصر المنشور'):t('Save draft','احفظ المسودة')}</button>
        <Link className="button outline" to={'/ADMIN/'+resource}>{t('Back to list','العودة إلى القائمة')}</Link>
        {item&&<Confirm title={t('Delete entry','حذف العنصر')} action={async()=>{await write(path,'DELETE');void query.invalidateQueries();navigate('/ADMIN/'+resource);}}>
          {t('This entry will be removed permanently.','سيُحذف هذا العنصر نهائياً.')}</Confirm>}</div>
    </form>{resource==='albums'&&item&&<AlbumOrder id={item.id}/>}</>;
}
function AlbumOrder({id}:{id:number}) {
  const {t}=useLocale();
  const query=useQueryClient();
  const [rows,setRows]=useState<Entry[]>();
  const [songId,setSongId]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState<unknown>();
  const request=useApi<Page<Entry>>('admin/songs'+params({album:id,size:100}));
  const items=rows??request.data?.items??[];
  function move(index:number,to:number){
    const list=[...items];const [entry]=list.splice(index,1);list.splice(to,0,entry);setRows(list);setSaved(false);
  }
  async function updateTrack(song:number,method:'PUT'|'DELETE') {
    setBusy(true);setError(undefined);setSaved(false);
    try {
      await write('admin/albums/'+id+'/tracks/'+song,method);
      setSongId(null);
      await query.invalidateQueries();
    }catch(ex){setError(ex);}finally{setBusy(false);}
  }
  return <section className="panel track-order"><h2>{t('Album track order','ترتيب مقاطع الألبوم')}</h2>
    <p>{t('Drag tracks or use the arrow buttons to reorder. Assigning a song moves it here from its current album.','اسحب المقاطع أو استخدم الأسهم للترتيب. تعيين أغنية ينقلها من ألبومها الحالي إلى هنا.')}</p>
    {!request.data?<Feedback pending={request.isPending} error={request.error} onRetry={()=>request.refetch()}/>:
      request.data.total>100?<p>{t('For albums over 100 tracks, edit each song’s display order.','للألبومات التي تتجاوز ١٠٠ مقطع، عدّل ترتيب كل أغنية.')}</p>:
      items.length?<ol>{items.map((song,i)=><li key={song.id} draggable={!busy} onDragStart={e=>e.dataTransfer.setData('text/plain',String(song.id))}
        onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=items.findIndex(x=>x.id===Number(e.dataTransfer.getData('text/plain')));if(from>=0)move(from,i);}}>
        <Link to={'/ADMIN/songs/'+song.id}>{t(song.titleEn,song.titleAr)}</Link>
        <button className="icon-button" aria-label={t('Move track up','ارفع المقطع')} disabled={!i||busy} onClick={()=>move(i,i-1)}><ArrowUp size={16}/></button>
        <button className="icon-button" aria-label={t('Move track down','اخفض المقطع')} disabled={i===items.length-1||busy} onClick={()=>move(i,i+1)}><ArrowDown size={16}/></button>
        <button className="button outline" disabled={busy||!!rows} onClick={()=>void updateTrack(song.id,'DELETE')}>{t('Remove from album','أزل من الألبوم')}</button>
      </li>)}</ol>:<Feedback empty={t('No songs assigned.','لا توجد أغانٍ معيّنة.')}/>}
    <fieldset className="track-assignment" disabled={busy||!!rows}>
      <legend>{t('Assign a song','عيّن أغنية')}</legend>
      <Relationship resource="songs" value={songId} change={setSongId}/>
      <button className="button outline" disabled={songId===null} onClick={()=>songId!==null&&void updateTrack(songId,'PUT')}>
        {t('Add to album','أضف إلى الألبوم')}</button>
    </fieldset>
    <FormError error={error}/>{saved&&<p role="status">{t('Track order saved.','تم حفظ ترتيب المقاطع.')}</p>}
    {rows&&<button className="button dark" disabled={busy} onClick={async()=>{setBusy(true);setError(undefined);try{
      await write('admin/albums/'+id+'/order','PUT',{ids:rows.map(x=>x.id)});await query.invalidateQueries();setRows(undefined);setSaved(true);
    }catch(e){setError(e);}finally{setBusy(false);}}}>{t('Save track order','احفظ ترتيب المقاطع')}</button>}
  </section>;
}
