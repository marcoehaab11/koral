import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

export type Lang = 'en' | 'ar';
export type Platform = { platformName: string; url: string; label: string; icon: string; sort: number; enabled?:boolean };
export type Entry = {
  id: number; titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; image: string;
  published: boolean; featured: boolean; sort: number; slug: string; date: string | null; albumId: number | null;
  audio: string; lyricsEn: string; lyricsAr: string; composer: string; lyricist: string; arranger: string; conductor: string;
  duration: number | null; links: Platform[] | null; categoryId: number | null; video: string;
  positionEn: string; positionAr: string; end: string | null; location: string; registration: string; status: string;
  trackCount: number; albumSlug: string; albumTitleEn: string; albumTitleAr: string; updatedAt: string | null;
  captionEn: string; captionAr: string; groupIds?: number[] | null;
};
export type ChoirGroup = { id: number; nameEn: string; nameAr: string; accepting: boolean; catalogSlot?:number|null; recruitmentEnabled?:boolean;
  recordingRequired: boolean; backingAudio: string; backingTitle: string; image?:string };
export type Profile = {
  nameEn: string; nameAr: string; logo: string; cover: string; introEn: string; introAr: string;
  aboutEn: string; aboutAr: string; founded: number | null; historyEn: string; historyAr: string; missionEn: string;
  missionAr: string; visionEn: string; visionAr: string; directorEn: string; directorAr: string;
  email: string; phone: string; addressEn: string; addressAr: string; social: Platform[] | null;
  coverMobile: string; aboutImage: string; aboutImageAltEn: string; aboutImageAltAr: string;
};
export type Settings = {
  titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; favicon: string; footerEn: string; footerAr: string;
  defaultLanguage: Lang; members: boolean; events: boolean; homeAlbums: boolean; homeSongs: boolean;
  homeAbout: boolean; homeGallery: boolean; homeEvents: boolean; english: boolean; arabic: boolean; homeFeaturedSongs:boolean; homeJoin:boolean;
  homeAnnouncement:boolean; announcementTitleEn:string; announcementTitleAr:string; announcementBodyEn:string; announcementBodyAr:string; announcementImage:string;
};
export type Page<T> = { items: T[]; total: number; pageNumber: number; pageSize: number };
export type Session = { email: string; mustChangePassword: boolean; roles: string[] };
export type Resource = 'albums' | 'songs' | 'gallery' | 'categories' | 'members' | 'events';
export const labels = {
  join: ['Join the choir','انضم للكورال'], applications: ['Join applications','طلبات الانضمام'], groups: ['Choir groups','فرق الكورال'],
  home: ['Home','الرئيسية'], about: ['About','عن الكورال'], albums: ['Albums','الألبومات'], songs: ['Songs','الترانيم'],
  gallery: ['Gallery','المعرض'], members: ['Members','الأعضاء'], events: ['Events','الفعاليات'], search: ['Search','البحث'],
  categories: ['Gallery categories','تصنيفات المعرض'], dashboard: ['Overview','نظرة عامة'], choir: ['Choir profile','ملف الكورال'],
  settings: ['Site settings','إعدادات الموقع'], users: ['Staff accounts','حسابات الفريق'], password: ['Change password','تغيير كلمة المرور'],
} as const;
const emptyProfile: Profile = {
  nameEn:'Koral Choir',nameAr:'كورال',logo:'',cover:'',introEn:'',introAr:'',aboutEn:'',aboutAr:'',founded:null,
  historyEn:'',historyAr:'',missionEn:'',missionAr:'',visionEn:'',visionAr:'',directorEn:'',directorAr:'',email:'',phone:'',
  addressEn:'',addressAr:'',social:null,coverMobile:'',aboutImage:'',aboutImageAltEn:'',aboutImageAltAr:'',
};
const emptySettings: Settings = {
  titleEn:'',titleAr:'',descriptionEn:'',descriptionAr:'',favicon:'',footerEn:'',footerAr:'',defaultLanguage:'en',
  members:true,events:true,homeAlbums:true,homeSongs:true,homeAbout:true,homeGallery:true,homeEvents:true,english:true,arabic:true,homeFeaturedSongs:false,homeJoin:false,
  homeAnnouncement:false,announcementTitleEn:'',announcementTitleAr:'',announcementBodyEn:'',announcementBodyAr:'',announcementImage:'',
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string[]> = {}) { super(message); }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await fetch('/api/' + path, { credentials: 'same-origin', ...options });
  if (!result.ok) {
    const data = await result.json().catch(() => ({}));
    throw new ApiError(result.status, data.detail ?? data.title ?? result.statusText, data.errors);
  }
  return result.status === 204 ? undefined as T : result.json();
}
export async function write<T>(path: string, method: string, data?: unknown) {
  const { token } = await api<{token:string}>('auth/csrf');
  const headers: Record<string,string> = { 'X-CSRF-TOKEN': token };
  if (data instanceof FormData) return api<T>(path, { method, headers, body:data });
  headers['Content-Type'] = 'application/json';
  return api<T>(path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
}
export async function upload(bucket: string, file: File, progress: (n:number)=>void) {
  const { token } = await api<{token:string}>('auth/csrf');
  return new Promise<string>((resolve,reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/media/' + bucket);
    xhr.setRequestHeader('X-CSRF-TOKEN', token);
    xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new ApiError(0,'Upload could not reach the server.'));
    xhr.onload = () => {
      let data: { url?: string; detail?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* IIS may return HTML */ }
      if (xhr.status === 200 && data.url) resolve(data.url);
      else reject(new ApiError(xhr.status, data.detail ?? 'Upload failed.'));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
export function useApi<T>(path: string, enabled = true) {
  return useQuery({queryKey:[path],queryFn:({signal})=>api<T>(path,{signal}),enabled,retry:(n,e)=> n < 1 && (!(e instanceof ApiError) || e.status >= 500)});
}
export const params = (value: Record<string, string | number | boolean | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(value).forEach(([key, item]) => { if (item !== undefined && item !== null && item !== '') query.set(key, String(item)); });
  return query.size ? '?' + query.toString() : '';
};
type Locale = {
  lang: Lang; change: (lang:Lang)=>void; t:(en:string,ar:string)=>string;
  l:(key:keyof typeof labels)=>string; date:(date:string|null, year?:boolean)=>string;
  profile:Profile; settings:Settings; publicError: boolean;
};
const Context = createContext<Locale>(null!);
export const useLocale = () => useContext(Context);
export function LocaleProvider({children}:{children:ReactNode}) {
  const choir = useApi<Profile>('choir');
  const site = useApi<Settings>('settings');
  const settings = site.data ?? emptySettings;
  const [selected,setSelected] = useState(() => localStorage.getItem('koral-language'));
  const lang: Lang = selected === 'en' && settings.english ? 'en' : selected === 'ar' && settings.arabic ? 'ar'
    : site.data ? settings.defaultLanguage : document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = (en:string, ar:string)=>lang === 'ar' ? ar : en;
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; },[lang]);
  return <Context.Provider value={{ lang, change:(value)=>{localStorage.setItem('koral-language',value);setSelected(value);},t,
    l:key=>t(labels[key][0],labels[key][1]),date:(value,year=false)=> value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en',
      year ? {year:'numeric',timeZone:'UTC'} : {dateStyle:'long',timeZone:'UTC'}).format(new Date(value)) : '',
    profile:choir.data ?? emptyProfile,settings,publicError:choir.isError || site.isError }}>{children}</Context.Provider>;
}
export function useErrorText() {
  const {t}=useLocale();
  return (error:unknown) => {
    if (!(error instanceof ApiError)) return t('Something went wrong. Please try again.','حدث خطأ. يرجى المحاولة مرة أخرى.');
    const messages:Record<number,[string,string]> = {
      0:['Could not reach the server.','تعذر الاتصال بالخادم.'], 400:['Check the entered values and try again.','تحقق من البيانات المدخلة وأعد المحاولة.'],
      401:['Check your email and password, or sign in again.','تحقق من البريد وكلمة المرور أو سجل الدخول مجدداً.'],
      403:['You do not have access to this action.','لا تملك الصلاحية لتنفيذ هذا الإجراء.'],
      404:['This item is unavailable.','هذا العنصر غير متاح.'], 409:['The content changed. Refresh and try again.','تغير المحتوى. حدّث الصفحة وأعد المحاولة.'],
      413:['The file exceeds the upload limit.','يتجاوز الملف الحد المسموح للرفع.'],415:['This file format is unsupported or invalid.','تنسيق الملف غير صالح أو غير مدعوم.'],
      429:['Too many attempts. Try again in a minute.','محاولات كثيرة. أعد المحاولة بعد دقيقة.'],
    };
    const message=messages[error.status];
    return message ? t(error.status === 400 ? Object.values(error.fields).flat().join(' ') || error.message || message[0] : message[0],message[1])
      : t('Something went wrong. Please try again.','حدث خطأ. يرجى المحاولة مرة أخرى.');
  };
}
