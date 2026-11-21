import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { AudioLines, CalendarDays, Camera, Disc3, Headphones, Menu, Music2, Play, Search, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ApiError, api, params, useApi, useLocale, type ChoirGroup, type Entry, type Page, type Platform, type Resource } from './data';

import { clock } from './audio-player';
import { PlaybackProvider, usePlayback } from './playback';
import { sourcesFor, youtubeId } from './playback-sources';

function youtube(url: string) { const id=youtubeId(url); return id ? 'https://www.youtube-nocookie.com/embed/'+id : undefined; }

const JoinChoir = lazy(() => import('./join').then(module => ({ default: module.JoinChoir })));

export function Brand({studio=false}:{studio?:boolean}) {
  const {profile,t}=useLocale();
  return <Link to={studio?'/ADMIN':'/'} className="brand">
    {profile.logo ? <img src={profile.logo} alt="" /> : <span className="brand-mark"><AudioLines size={22}/></span>}
    <span>{t(profile.nameEn,profile.nameAr)}{studio && <small>{t('Studio','الاستوديو')}</small>}</span>
  </Link>;
}
export function Language() {
  const {lang,change,settings,t}=useLocale();
  if (!settings.english || !settings.arabic) return null;
  const label=t('Switch to Arabic','التبديل إلى الإنجليزية');
  return <button type="button" className="language" lang={lang==='en'?'ar':'en'}
    aria-label={label} title={label} onClick={()=>change(lang==='en'?'ar':'en')}>
    {lang==='en'?<svg aria-hidden="true" viewBox="0 0 30 18" width="27" height="17">
      <path fill="#ce1126" d="M0 0h30v6H0z"/><path fill="#fff" d="M0 6h30v6H0z"/><path fill="#000" d="M0 12h30v6H0z"/>
      <path fill="#b28629" d="M13 7.5h4v2.4l-2 1.2-2-1.2zM14.4 7h1.2v1h-1.2z"/>
    </svg>:<svg aria-hidden="true" viewBox="0 0 30 18" width="27" height="17">
      <path fill="#142657" d="M0 0h30v18H0z"/><path stroke="#fff" strokeWidth="4" d="m0 0 30 18M30 0 0 18"/>
      <path stroke="#ce1126" strokeWidth="1.5" d="m0 0 30 18M30 0 0 18"/>
      <path stroke="#fff" strokeWidth="6" d="M15 0v18M0 9h30"/><path stroke="#ce1126" strokeWidth="3.6" d="M15 0v18M0 9h30"/>
    </svg>}</button>;
}
export function Feedback({pending,error,empty,onRetry}:{pending?:boolean;error?:unknown;empty?:string;onRetry?:()=>void}) {
  const {t}=useLocale();
  const missing=error instanceof ApiError && error.status===404;
  return <div className="feedback" role={error?'alert':'status'}>
    {pending ? <><span className="spinner" aria-hidden="true"/>{t('Loading…','جارٍ التحميل…')}</>
      : error ? <>{missing?t('This page is unavailable.','هذه الصفحة غير متاحة.'):t('Could not load this content.','تعذر تحميل المحتوى.')}
        {!missing&&onRetry&&<button className="button outline" onClick={onRetry}>{t('Try again','حاول مجدداً')}</button>}</> : empty}
  </div>;
}
function Header() {
  const {l,t}=useLocale();
  const [open,setOpen]=useState(false);
  const menu=useRef<HTMLButtonElement>(null);
  const navigation=useRef<HTMLElement>(null);
  const location=useLocation();
  useEffect(()=>setOpen(false),[location.pathname,location.search]);
  useEffect(()=>{if(open)navigation.current?.querySelector('a')?.focus();},[open]);
  return <header className="site-header" onKeyDown={event=>{
    if(event.key==='Escape'&&open){setOpen(false);menu.current?.focus();}
  }}><div className="shell header-row">
    <Brand/><nav ref={navigation} aria-label={t('Main navigation','القائمة الرئيسية')} id="main-navigation" className={open?'navigation open':'navigation'}>
      {(['home','albums','songs','about','gallery','join'] as const).map(key =>
        <NavLink end={key==='home'} key={key} to={key==='home'?'/':'/'+key}>{l(key)}</NavLink>)}
    </nav><div className="header-tools">
      <Link className="icon-button" to="/search" aria-label={l('search')}><Search size={21}/></Link>
      <Language/><button ref={menu} className="icon-button menu-button" type="button" aria-expanded={open} aria-controls="main-navigation"
        aria-label={open?t('Close menu','أغلق القائمة'):t('Open menu','افتح القائمة')} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
    </div></div></header>;
}
function Footer() {
  const {profile,settings,l,t}=useLocale();
  const address=t(profile.addressEn,profile.addressAr);
  const footerCopy=t(settings.footerEn,settings.footerAr)||(!address?t(profile.introEn,profile.introAr):'');
  const hasSocial=!!profile.social?.length;
  return <footer className="site-footer"><div className="shell">
    <div className="footer-grid">
      <div className="footer-identity">
        <Brand/>{footerCopy&&<p>{footerCopy}</p>}<Contact/>
      </div>
      <div className={'footer-links'+(hasSocial?' has-social':'')}>
        <div className="footer-section">
          <h2 id="footer-navigation-heading">{t('Explore','تصفّح الموقع')}</h2>
          <nav className="footer-navigation" aria-labelledby="footer-navigation-heading">
            {(['about','albums','songs','gallery','members','events','join'] as const)
              .filter(key=>(key!=='members'||settings.members)&&(key!=='events'||settings.events))
              .map(key=><Link key={key} to={'/'+key}>{l(key)}</Link>)}
          </nav>
        </div>
        {hasSocial&&<div className="footer-section footer-social">
          <h2>{t('Follow the choir','تابع الكورال')}</h2>
          <Platforms links={profile.social} layout="footer"/>
        </div>}
      </div>
    </div>
    <div className="footer-end"><span>© {new Date().getFullYear()} {t(profile.nameEn,profile.nameAr)}</span>
      {!profile.cover&&<a href="https://unsplash.com/photos/a-large-choir-and-musicians-perform-on-a-dark-stage-w1TkFlNKEos" target="_blank" rel="noreferrer">{t('Illustrative choir photograph · Unsplash','صورة توضيحية للكورال · Unsplash')}</a>}
    </div>
  </div></footer>;
}
function Contact() {
  const {profile,t}=useLocale();
  if (!profile.email && !profile.phone && !t(profile.addressEn,profile.addressAr)) return null;
  return <address>{profile.email&&<a href={'mailto:'+profile.email}>{profile.email}</a>}{profile.phone&&<a href={'tel:'+profile.phone}>{profile.phone}</a>}
    {t(profile.addressEn,profile.addressAr)&&<span>{t(profile.addressEn,profile.addressAr)}</span>}</address>;
}
const platformBrands = [
  { key:'facebook', name:'Facebook', nameAr:'فيسبوك', hosts:['facebook.com','fb.com','fb.me'], file:'facebook.svg' },
  { key:'instagram', name:'Instagram', nameAr:'إنستجرام', hosts:['instagram.com'], file:'instagram.svg' },
  { key:'youtube', name:'YouTube', nameAr:'يوتيوب', hosts:['youtube.com','youtu.be'], file:'youtube.svg' },
  { key:'anghami', name:'Anghami', nameAr:'أنغامي', hosts:['anghami.com'], file:'anghami-lockup.png' },
  { key:'soundcloud', name:'SoundCloud', nameAr:'ساوند كلاود', hosts:['soundcloud.com','snd.sc'], file:'soundcloud.svg' },
  { key:'spotify', name:'Spotify', nameAr:'سبوتيفاي', hosts:['spotify.com','spotify.link','spoti.fi'], file:'spotify.svg' },
  { key:'applemusic', name:'Apple Music', nameAr:'آبل ميوزك', hosts:['music.apple.com'], file:'applemusic.svg' },
  { key:'deezer', name:'Deezer', nameAr:'ديزر', hosts:['deezer.com','deezer.page.link'], file:'deezer.svg' },
];
function identifyPlatform(item:Platform) {
  let host='';
  try {host=new URL(item.url).hostname;} catch { /* Use the saved platform name for legacy links. */ }
  const key=item.platformName.toLowerCase().replace(/\s+/g,'');
  return platformBrands.find(brand=>brand.hosts.some(domain=>host===domain||host.endsWith('.'+domain)))
    ?? platformBrands.find(brand=>brand.key===key);
}
function socialAccountName(item:Platform,platform:string|undefined,fallback:string) {
  try {
    const segment=decodeURIComponent(new URL(item.url).pathname.split('/')[1]??'');
    if(platform==='youtube'&&segment.startsWith('@'))return segment;
    if((platform==='facebook'||platform==='instagram'||platform==='soundcloud')&&segment!=='profile.php'&&/^[\w.-]+$/.test(segment))
      return '@'+segment;
  } catch { /* Fall back to the saved account name. */ }
  return item.label||((platform==='youtube'||platform==='anghami')?fallback:item.platformName);
}
export function Platforms({links,layout='default'}:{links:Platform[]|null;layout?:'default'|'compact'|'footer'|'detail'}) {
  const {t,profile}=useLocale();
  if (!links?.length) return null;
  return <div className={'platforms platforms-'+layout} role="group"
    aria-label={layout==='footer'?t('Choir social links','حسابات الكورال'):t('Available platforms','المنصات المتاحة')}>
    {[...links].sort((a,b)=>a.sort-b.sort).map((item,i)=>{
    const brand=identifyPlatform(item);
    const label=layout==='footer'?socialAccountName(item,brand?.key,t(profile.nameEn,profile.nameAr)):
      layout==='detail'&&brand?t(brand.name,brand.nameAr):item.label||brand?.name||item.platformName;
    const accessibleName=layout==='footer'&&brand?t(brand.name,brand.nameAr)+' · '+label:label;
    return <a className="platform" key={item.url+i} href={item.url} target="_blank" rel="noopener noreferrer" aria-label={accessibleName} title={accessibleName}
      data-brand={brand?.key}>
      {brand&&<img className={brand.key==='anghami'?'anghami-mark':undefined} src={'/media/social/'+brand.file} width={32} height={32} alt=""/>}
      {(!brand||layout==='detail'||layout==='footer')&&<span dir="auto">{label}</span>}</a>;
  })}</div>;
}
function Cover({url,kind,className=''}:{url:string;kind?:Resource;className?:string}) {
  const Icon=kind==='gallery'?Camera:kind==='events'?CalendarDays:kind==='songs'?Music2:Disc3;
  return <div className={'cover '+className}>{url?<img src={url} loading="lazy" alt=""/>:<div className="cover-placeholder"><Icon size={36} strokeWidth={1}/></div>}</div>;
}
function Photo({cover,mobile,alt='',hero=false}:{cover:string;mobile?:string;alt?:string;hero?:boolean}) {
  const image=<img className="photo" src={cover||'/media/choir.webp'} srcSet={cover?undefined:'/media/choir-800.webp 800w, /media/choir.webp 1920w'}
    sizes={hero?'100vw':'(max-width: 760px) 100vw, 50vw'} alt={alt} fetchPriority={hero?'high':undefined} loading={hero?'eager':'lazy'}/>;
  return mobile?<picture><source media="(max-width: 640px)" srcSet={mobile}/>{image}</picture>:image;
}
function Heading({title,children}:{title:string;children?:ReactNode}) {
  return <div className="page-heading"><h1>{title}</h1>{children}</div>;
}
function Section({title,href,children}:{title:string;href:string;children:ReactNode}) {
  const {t}=useLocale();
  return <section className="shell section"><div className="section-heading"><h2>{title}</h2><Link className="text-link" to={href}>{t('View all','عرض الكل')}</Link></div>{children}</section>;
}
function useTitle(title:string) {
  const {profile,settings,t}=useLocale();
  const brand=t(settings.titleEn,settings.titleAr)||t(profile.nameEn,profile.nameAr);
  useEffect(()=>{document.title=title?title+' | '+brand:brand;},[title,brand]);
}
function Home() {
  const {profile,settings,t,l}=useLocale();
  const reduce=useReducedMotion();
  useTitle('');
  const intro=t(profile.introEn,profile.introAr)||t('Choral music, lyrics, and moments from the stage.','موسيقى الكورال وكلمات الأغاني ولحظات من المسرح.');
  return <>
    <section className="hero"><div className="shell hero-layout">
      <motion.div className="hero-inner" initial={reduce?false:{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.55}}>
        <div className="hero-kicker">{profile.logo ? <img src={profile.logo} alt=""/> : <AudioLines size={20}/>}
          <span lang={t('ar','en')}>{t(profile.nameAr,profile.nameEn)}</span></div>
        <h1>{t(profile.nameEn,profile.nameAr)}</h1><p>{intro}</p>
        <div className="actions"><Link className="button primary" to="/albums"><Headphones size={18}/>{t('Explore our music','اكتشف موسيقانا')}</Link>
          <Link className="button ghost" to="/about">{t('About the choir','عن الكورال')}</Link></div>
      </motion.div>
      <div className="hero-media"><Photo cover={profile.cover} mobile={profile.coverMobile} hero
        alt={profile.cover===profile.aboutImage?t(profile.aboutImageAltEn,profile.aboutImageAltAr):''}/></div>
    </div></section>
    {settings.homeAlbums && <Section title={t('Featured albums','ألبومات مختارة')} href="/albums"><Preview resource="albums" suffix="?featured=true&size=3"/></Section>}
    {settings.homeSongs && <Section title={t('Latest songs','أحدث الترانيم')} href="/songs"><Preview resource="songs" suffix="?order=latest&size=4" rows/></Section>}
    {settings.homeFeaturedSongs && <Section title={t('Featured songs','ترانيم مختارة')} href="/songs?filter=featured">
      <Preview resource="songs" suffix="?featured=true&size=4" rows/></Section>}
    {settings.homeAbout && <section className="about-band"><div className="shell about-preview">
      <Photo cover={profile.aboutImage||profile.cover} alt={profile.aboutImage?t(profile.aboutImageAltEn,profile.aboutImageAltAr):''}/><div>
      <h2>{t('About the choir','عن الكورال')}</h2><p>{t(profile.aboutEn,profile.aboutAr) ? intro : t('Explore the voices behind the music.','اكتشف الأصوات وراء الموسيقى.')}</p>
      <Link className="button outline" to="/about">{l('about')}</Link></div></div></section>}
    {settings.homeGallery && <Section title={t('From the gallery','من المعرض')} href="/gallery"><Preview resource="gallery" suffix="?featured=true&size=3"/></Section>}
    {settings.homeEvents && settings.events && <UpcomingPreview/>}
  </>;
}
function UpcomingPreview() {
  const {l}=useLocale();
  const query=useApi<Page<Entry>>('events?upcoming=true&size=3&order=date');
  return query.data?.items.length ? <Section title={l('events')} href="/events"><Cards items={query.data.items} resource="events"/></Section> : null;
}
function Preview({resource,suffix,rows}:{resource:Resource;suffix:string;rows?:boolean}) {
  const {t}=useLocale();
  const query=useApi<Page<Entry>>(resource+suffix);
  if (query.isPending||query.isError) return <Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>;
  if (!query.data.items.length) return <Feedback empty={resource==='albums'?t('Featured releases will appear here.','ستظهر الإصدارات المختارة هنا.'):
    resource==='songs'?t('New recordings will appear here.','ستظهر التسجيلات الجديدة هنا.'):t('Selected photos will appear here.','ستظهر الصور المختارة هنا.')}/>;
  return rows?<Tracklist entries={query.data.items}/>:<Cards items={query.data.items} resource={resource}/>;
}
function About() {
  const {profile,t,l}=useLocale();
  useTitle(l('about'));
  return <div className="shell page"><Heading title={t('About the choir','عن الكورال')}/>
    <div className="about-preview page-about"><Photo cover={profile.aboutImage||profile.cover}
      alt={profile.aboutImage?t(profile.aboutImageAltEn,profile.aboutImageAltAr):''}/><div><h2>{t(profile.nameEn,profile.nameAr)}</h2>
      {profile.founded&&<p>{t('Founded','تأسس')} {profile.founded}</p>}
      <p className="prose">{t(profile.aboutEn,profile.aboutAr)||t(profile.introEn,profile.introAr)||t('Explore our music and find lyrics for each published song.','استكشف موسيقانا واقرأ كلمات الأغاني المنشورة.')}</p>
      <Link className="text-link" to="/albums">{l('albums')}</Link></div></div>
    <div className="prose-grid">{[
      [t('History','التاريخ'),t(profile.historyEn,profile.historyAr)],[t('Mission','الرسالة'),t(profile.missionEn,profile.missionAr)],
      [t('Vision','الرؤية'),t(profile.visionEn,profile.visionAr)],[t('Choir director','قائد الكورال'),t(profile.directorEn,profile.directorAr)],
    ].filter(([,value])=>value).map(([title,value])=><section key={title}><h2>{title}</h2><p className="prose">{value}</p></section>)}</div><Contact/><Platforms links={profile.social}/>
  </div>;
}
function Pager({page,total,size,change}:{page:number;total:number;size:number;change:(page:number)=>void}) {
  const {t}=useLocale();
  const pages=Math.ceil(total/size);
  if(pages<=1)return null;
  return <nav className="pager" aria-label={t('Pages','الصفحات')}><button className="button outline" disabled={page<=1} onClick={()=>change(page-1)}>{t('Previous','السابق')}</button>
    <span>{page} / {pages}</span><button className="button outline" disabled={page>=pages} onClick={()=>change(page+1)}>{t('Next','التالي')}</button></nav>;
}
function Index({resource}:{resource:Resource}) {
  const {l,t,settings}=useLocale();
  const [state,setState]=useSearchParams();
  const page=Math.max(1,Number(state.get('page'))||1);
  const q=state.get('q')??'';
  const filter=state.get('filter')??'';
  const year=state.get('year')??'';
  const group=state.get('group')??'';
  const sorting=state.get('sort')??'';
  const allowed=resource==='members'?settings.members:resource==='events'?settings.events:true;
  const categories=useApi<Page<Entry>>('categories?size=100',resource==='gallery');
  const groups=useApi<ChoirGroup[]>('choir-groups',resource==='albums');
  const query=useApi<Page<Entry>>(resource+params({q,page,size:12,featured:(resource==='albums'||resource==='songs')&&filter==='featured'?true:undefined,
    year:resource==='albums'?year:undefined,group:resource==='albums'&&Number(group)>0?group:undefined,
    category:resource==='gallery'&&Number(filter)>0?filter:undefined,
    upcoming:resource==='events'?filter!=='past':undefined,order:resource==='events'?(filter==='past'?'latest':'date'):sorting}),allowed);
  useTitle(l(resource));
  function update(key:string,value:string) {
    const next=new URLSearchParams(state);
    if(value)next.set(key,value);else next.delete(key);
    if(key!=='page')next.delete('page');
    setState(next,{replace:key==='q'});
  }
  if(!allowed)return <div className="shell page"><Feedback error={new ApiError(404,'')}/></div>;
  return <div className="shell page"><Heading title={l(resource)}/><div className="filters">
    <label className="search-field"><Search size={19}/><input aria-label={l('search')} placeholder={l('search')} value={q} onChange={e=>update('q',e.target.value)}/></label>
    {(resource==='albums'||resource==='songs')&&<select aria-label={t('Featured filter','تصفية المميّزة')} value={filter} onChange={e=>update('filter',e.target.value)}>
      <option value="">{resource==='albums'?t('All albums','كل الألبومات'):t('All songs','كل الأغاني')}</option>
      <option value="featured">{t('Featured','مختارة')}</option></select>}
    {resource==='albums'&&<input type="number" min="1" max="9999" aria-label={t('Release year','سنة الإصدار')} placeholder={t('Release year','سنة الإصدار')} value={year} onChange={e=>update('year',e.target.value)}/>}
    {resource==='albums'&&!!groups.data?.length&&<select aria-label={l('groups')} value={group} onChange={e=>update('group',e.target.value)}>
      <option value="">{t('All choir groups','كل فرق الكورال')}</option>
      {groups.data.map(x=><option key={x.id} value={x.id}>{t(x.nameEn,x.nameAr)}</option>)}</select>}
    {resource==='gallery'&&<><select aria-label={l('categories')} value={filter} onChange={e=>update('filter',e.target.value)}>
      <option value="">{t('All categories','كل التصنيفات')}</option>{categories.data?.items.map(x=><option key={x.id} value={x.id}>{t(x.titleEn,x.titleAr)}</option>)}</select>
      <select aria-label={t('Sort gallery','ترتيب المعرض')} value={sorting} onChange={e=>update('sort',e.target.value)}>
      <option value="">{t('Display order','ترتيب العرض')}</option><option value="latest">{t('Most recent','الأحدث')}</option></select></>}
    {resource==='events'&&<select aria-label={t('Event dates','تواريخ الفعاليات')} value={filter} onChange={e=>update('filter',e.target.value)}>
      <option value="">{t('Upcoming','القادمة')}</option><option value="past">{t('Past','السابقة')}</option></select>}
    </div>{query.isPending||query.isError?<Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/>:
      query.data.items.length ? <>{resource==='songs'?<Tracklist entries={query.data.items}/>:<Cards items={query.data.items} resource={resource}/>}
        <Pager page={page} total={query.data.total} size={12} change={n=>update('page',String(n))}/></>:
        <Feedback empty={t('No items to display.','لا توجد عناصر للعرض.')}/>}
  </div>;
}
function Cards({items,resource}:{items:Entry[];resource:Resource}) {
  const {t,date}=useLocale();
  const [selected,setSelected]=useState<Entry>();
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();},[selected]);
  return <div className="cards">{items.map(item=>{
    const title=t(item.titleEn,item.titleAr);
    return <article className={'media-card '+resource} key={item.id}>
      {resource==='gallery'?<button className="media-trigger" onClick={()=>setSelected(item)} aria-label={title}>
        <Cover url={item.image} kind={resource}/>{item.video&&<span className="overlay-play"><Play size={22}/></span>}</button>:
      resource==='albums'?<Link to={'/albums/'+item.slug} aria-label={title}><Cover url={item.image} kind={resource}/></Link>:<Cover url={item.image} kind={resource}/>}
      {resource==='albums'&&<div className="album-platforms"><Platforms links={item.links} layout="compact"/></div>}
      <div className="card-copy">{item.date&&<span className="metadata">{date(item.date,resource==='albums')}</span>}
        <h3>{resource==='albums'?<Link to={'/albums/'+item.slug}>{title}</Link>:title}</h3>
        {resource==='albums'&&item.trackCount>0&&<span className="metadata">{item.trackCount} {t(item.trackCount===1?'track':'tracks','مقطع')}</span>}
        {resource==='members'&&<span className="metadata">{t(item.positionEn,item.positionAr)}</span>}
        {resource==='events'&&<span className="metadata">{[item.location,item.end&&date(item.end),item.status==='cancelled'?t('Cancelled','ملغاة'):item.status==='postponed'?t('Postponed','مؤجلة'):''].filter(Boolean).join(' · ')}</span>}
        {(resource==='gallery'?t(item.captionEn,item.captionAr):t(item.descriptionEn,item.descriptionAr))&&
          <p className="prose">{resource==='gallery'?t(item.captionEn,item.captionAr):t(item.descriptionEn,item.descriptionAr)}</p>}
        {resource==='albums'&&<Link className="text-link" to={'/albums/'+item.slug}>{t('View album','عرض الألبوم')}</Link>}
        {resource==='events'&&item.registration&&<a className="text-link" href={item.registration} target="_blank" rel="noreferrer">{t('Register','التسجيل')}</a>}
      </div></article>;
    })}{resource==='gallery'&&<dialog ref={dialog} onClose={()=>setSelected(undefined)} aria-labelledby="gallery-viewer-title">
      {selected&&<div className="viewer"><button className="icon-button" onClick={()=>dialog.current?.close()} aria-label={t('Close viewer','إغلاق العارض')}><X/></button>
      <h2 id="gallery-viewer-title">{t(selected.titleEn,selected.titleAr)}</h2>
      {selected.video ? youtube(selected.video)?<iframe title={t(selected.titleEn,selected.titleAr)} src={youtube(selected.video)} allowFullScreen/>:
        selected.video.startsWith('/uploads/')?<video src={selected.video} controls/>:<a className="button outline" href={selected.video} target="_blank" rel="noreferrer">{t('Watch video','شاهد الفيديو')}</a>:
        <img src={selected.image} alt={t(selected.captionEn,selected.captionAr)||t(selected.titleEn,selected.titleAr)}/>}
        <p>{t(selected.descriptionEn,selected.descriptionAr)}</p></div>}
      </dialog>}</div>;
}
function Tracklist({entries}:{entries:Entry[]}) {
  const {t}=useLocale();
  const playback=usePlayback();
  return <div className="tracklist">{entries.map(item=><article className="track" key={item.id}>
    <Cover url={item.image} kind="songs"/><div className="track-name">
      <Link to={'/songs/'+item.slug}>{t(item.titleEn,item.titleAr)}</Link>
      {item.albumSlug&&<Link className="metadata" to={'/albums/'+item.albumSlug}>{t(item.albumTitleEn,item.albumTitleAr)}</Link>}</div>
    <div className="track-platforms"><Platforms links={item.links} layout="compact"/></div>
    <div className="track-controls">
      {!!item.duration&&<span className="metadata" dir="ltr">{clock(item.duration)}</span>}
      {!!sourcesFor(item).length&&<button type="button" className={'icon-button track-play'+(playback.current===item.id?' playing':'')}
        aria-label={t('Play','شغّل')+' '+t(item.titleEn,item.titleAr)}
        onClick={()=>playback.start([item])}><Play size={19}/></button>}
    </div>
  </article>)}</div>;
}
function AlbumPlay({album}:{album:Entry}) {
  const {t}=useLocale();
  const playback=usePlayback();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  if(!album.trackCount)return null;
  async function play() {
    setBusy(true);
    setError('');
    const request=playback.begin();
    try {
      const first=await api<Page<Entry>>('songs'+params({album:album.id,size:100}));
      const entries=[...first.items];
      for(let page=2;page<=Math.ceil(first.total/first.pageSize);page++){
        const next=await api<Page<Entry>>('songs'+params({album:album.id,size:100,page}));
        entries.push(...next.items);
      }
      const unique=[...new Map(entries.map(item=>[item.id,item])).values()];
      if(!unique.some(item=>sourcesFor(item).length))
        setError(t('This album has no recordings that can play on the site yet.','مفيش تسجيلات متاحة للتشغيل على الموقع في الألبوم ده لسه.'));
      else playback.start(unique,request);
    }catch{setError(t('The album could not be loaded. Try again.','الألبوم ما اتحمّلش. حاول تاني.'));}
    finally{setBusy(false);}
  }
  return <>
    <button type="button" className="button dark" disabled={busy} onClick={()=>void play()}>
      <Play size={17}/>{busy?t('Preparing album…','جاري تجهيز الألبوم…'):t('Play full album','شغّل الألبوم كامل')}</button>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </>;
}
function Detail({resource}:{resource:'albums'|'songs'}) {
  const {slug}=useParams();
  const {t,l,date,lang}=useLocale();
  const query=useApi<Entry>(resource+'/'+slug);
  const playback=usePlayback();
  const [page,setPage]=useState(1);
  const item=query.data;
  const tracks=useApi<Page<Entry>>('songs'+params({album:item?.id,page,size:24}),resource==='albums'&&!!item);
  const [lyrics,setLyrics]=useState<'ar'|'en'|null>(null);
  const title=item?t(item.titleEn,item.titleAr):l(resource);
  useTitle(title);
  if(!item)return <div className="shell page"><Feedback pending={query.isPending} error={query.error} onRetry={()=>query.refetch()}/></div>;
  const lyricLang=lyrics??(lang==='ar'&&item.lyricsAr?'ar':item.lyricsEn?'en':'ar');
  return <div className="shell page"><Link className="text-link" to={'/'+resource}>{l(resource)}</Link>
    <div className="detail-grid"><Cover url={item.image} kind={resource}/><div><Heading title={title}/>
      {item.date&&<span className="metadata">{date(item.date)}</span>}{item.albumSlug&&<p><Link className="text-link" to={'/albums/'+item.albumSlug}>{t(item.albumTitleEn,item.albumTitleAr)}</Link></p>}
      <p className="prose">{t(item.descriptionEn,item.descriptionAr)}</p>
      {resource==='albums'?<AlbumPlay album={item}/>:!!sourcesFor(item).length&&
        <button type="button" className="button dark" onClick={()=>playback.start([item])}>
          <Play size={17}/>{t('Play hymn','شغّل الترنيمة')}</button>}
      {!!item.links?.length&&<section className="detail-listening">
        <p>{resource==='albums'?t('Listen to the full album on','يمكنكم الاستماع إلى الألبوم كاملًا عبر'):
          t('Listen to this hymn on','يمكنكم الاستماع إلى الترنيمة عبر')}</p>
        <Platforms links={item.links} layout="detail"/>
      </section>}
    </div></div>
    {resource==='albums'?<section className="detail-section"><h2>{t('Tracklist','قائمة المقاطع')}</h2>
      {tracks.data?.items.length?<><Tracklist entries={tracks.data.items}/><Pager page={page} total={tracks.data.total} size={24} change={setPage}/></>:
      <Feedback pending={tracks.isPending} error={tracks.error} empty={t('No published tracks yet.','لا توجد مقاطع منشورة بعد.')} onRetry={()=>tracks.refetch()}/>}</section>:
    <div className="prose-grid detail-section">{(item.lyricsEn||item.lyricsAr)&&<section><h2>{t('Lyrics','الكلمات')}</h2>
      {item.lyricsEn&&item.lyricsAr&&<div className="actions">
        <button className="button outline" aria-pressed={lyricLang==='ar'} onClick={()=>setLyrics('ar')} lang="ar">العربية</button>
        <button className="button outline" aria-pressed={lyricLang==='en'} onClick={()=>setLyrics('en')} lang="en">English</button>
      </div>}<p className="lyrics" lang={lyricLang} dir={lyricLang==='ar'?'rtl':'ltr'}>{lyricLang==='ar'?item.lyricsAr:item.lyricsEn}</p></section>}
      {[item.composer,item.lyricist,item.arranger,item.conductor].some(Boolean)&&<section><h2>{t('Credits','فريق العمل')}</h2><dl className="credits">
      {[[t('Composer','الملحن'),item.composer],[t('Lyricist','كاتب الكلمات'),item.lyricist],[t('Arranger','الموزع'),item.arranger],[t('Conductor','قائد الكورال'),item.conductor]]
        .filter(([,name])=>name).map(([role,name])=><div key={role}><dt>{role}</dt><dd>{name}</dd></div>)}</dl></section>}</div>}
  </div>;
}
function SearchPage() {
  const {l,t}=useLocale();
  const [state,setState]=useSearchParams();
  const q=state.get('q')??'';
  const [term,setTerm]=useState(q);
  useEffect(()=>setTerm(q),[q]);
  const result=useApi<Partial<Record<Resource,Page<Entry>>>>('search'+params({q}),!!q);
  useTitle(l('search'));
  const rows=Object.entries(result.data??{}).filter(([,page])=>page.items.length) as [Resource,Page<Entry>][];
  return <div className="shell page"><Heading title={l('search')}/><form className="filters" onSubmit={e=>{e.preventDefault();setState(term.trim()?{q:term.trim()}:{});}}>
    <label className="search-field"><Search size={18}/><input value={term} onChange={e=>setTerm(e.target.value)} aria-label={l('search')} placeholder={t('Search the choir archive','ابحث في أرشيف الكورال')}/></label>
    <button className="button dark">{l('search')}</button></form>
    {!q?<Feedback empty={t('Find albums, songs, members, and events.','ابحث عن الألبومات والأغاني والأعضاء والفعاليات.')}/>:
      result.isPending||result.isError?<Feedback pending={result.isPending} error={result.error} onRetry={()=>result.refetch()}/>:
      !rows.length?<Feedback empty={t('No matching results.','لا توجد نتائج مطابقة.')}/>:
      rows.map(([resource,page])=><section className="detail-section" key={resource}><h2>{l(resource)}</h2>
        {resource==='songs'?<Tracklist entries={page.items}/>:<Cards items={page.items} resource={resource}/>}
        {page.total>page.items.length&&<Link className="text-link" to={'/'+resource+params({q})}>{t('View more results','عرض المزيد من النتائج')}</Link>}</section>)}
  </div>;
}
export function PublicSite() {
  const {t,publicError}=useLocale();
  const {pathname}=useLocation();
  const main=useRef<HTMLElement>(null);
  const previous=useRef(pathname);
  useEffect(()=>{
    if(previous.current===pathname)return;
    previous.current=pathname;
    window.scrollTo(0,0);
    main.current?.focus({preventScroll:true});
  },[pathname]);
  return <PlaybackProvider><div className="site"><a className="skip" href="#main">{t('Skip to content','انتقل إلى المحتوى')}</a><Header/>
    <main ref={main} id="main" tabIndex={-1}>{publicError&&<Feedback error/>}<Suspense fallback={<Feedback pending/>}><Routes><Route index element={<Home/>}/><Route path="about" element={<About/>}/>
      {(['albums','songs','gallery','members','events'] as const).map(x=><Route key={x} path={x} element={<Index key={x} resource={x}/>}/>)}
      <Route path="albums/:slug" element={<Detail resource="albums" key={pathname}/>}/><Route path="songs/:slug" element={<Detail resource="songs" key={pathname}/>}/>
      <Route path="search" element={<SearchPage/>}/><Route path="join" element={<JoinChoir/>}/><Route path="*" element={<div className="shell page"><Feedback error={new ApiError(404,'')}/></div>}/>
    </Routes></Suspense></main><Footer/></div></PlaybackProvider>;
}
