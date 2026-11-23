export function youtubeId(url:string) {
  try {
    const value=new URL(url);
    const id=value.hostname==='youtu.be'?value.pathname.slice(1):
      ['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(value.hostname)
        ?value.searchParams.get('v')??value.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1]:undefined;
    return id&&/^[\w-]{11}$/.test(id)?id:undefined;
  } catch { return undefined; }
}
