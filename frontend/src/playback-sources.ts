import type { Entry } from './data';

export type Source = { kind: 'audio' | 'soundcloud' | 'youtube' | 'spotify'; value: string; external?: string };
export const sourceNames = { soundcloud:'SoundCloud', youtube:'YouTube', spotify:'Spotify' };

export function youtubeId(url:string) {
  try {
    const value=new URL(url);
    const id=value.hostname==='youtu.be'?value.pathname.slice(1):
      ['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(value.hostname)
        ?value.searchParams.get('v')??value.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1]:undefined;
    return id&&/^[\w-]{11}$/.test(id)?id:undefined;
  } catch { return undefined; }
}

export function sourcesFor(track:Entry):Source[] {
  const sources:Source[]=track.audio?[{kind:'audio',value:track.audio}]:[];
  for (const {url} of track.links??[]) {
    const id=youtubeId(url);
    if(id){sources.push({kind:'youtube',value:id,external:url});continue;}
    try {
      const link=new URL(url);
      const part=link.pathname.split('/')[2];
      if (['soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(link.hostname) &&
          /^\/[\w-]+\/[\w-]+\/?$/.test(link.pathname) && !['tracks','sets','albums','likes','reposts','popular-tracks','followers','following'].includes(part)) {
        sources.push({kind:'soundcloud',value:'https://soundcloud.com'+link.pathname,external:url});
      }
      const token=link.pathname.match(/^\/track\/([A-Za-z0-9]{22})\/?$/)?.[1];
      if(link.hostname==='open.spotify.com'&&token)sources.push({kind:'spotify',value:token,external:url});
    } catch { /* Other links remain available on the track page. */ }
  }
  const order=['audio','soundcloud','youtube','spotify'];
  return sources.filter((source,i)=>sources.findIndex(x=>x.kind===source.kind&&x.value===source.value)===i)
    .sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
}
