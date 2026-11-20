import { expect, test, type APIRequestContext } from '@playwright/test';

async function write(request:APIRequestContext,path:string,method:string,data?:unknown) {
  const {token}=await (await request.get('/api/auth/csrf')).json();
  return request.fetch('/api/'+path,{method,data,headers:{'X-CSRF-TOKEN':token}});
}
const album={titleEn:'Playback verification',titleAr:'اختبار التشغيل',slug:'playback-check',published:true};
const soundcloud={platformName:'SoundCloud',url:'https://soundcloud.com/c6qaswvbbco9/gh1veypdnysm'};

test('album queue advances on SoundCloud finish and remains on the site across navigation',async({page,request})=>{
  await expect(await write(request,'auth/login','POST',{email:'ADMIN@ADMIN.COM',password:'Admin@123456'})).toBeOK();
  const released=await write(request,'admin/albums','POST',album);
  await expect(released).toBeOK();
  const {id:albumId}=await released.json();
  const ids:number[]=[];
  for(const [i,title] of ['First fixture','Second fixture'].entries()){
    const response=await write(request,'admin/songs','POST',{titleEn:title,titleAr:'ترنيمة '+i,slug:'playback-fixture-'+i,
      published:true,albumId,sort:i,links:[soundcloud]});
    await expect(response).toBeOK();
    ids.push((await response.json()).id);
  }
  await page.route('https://w.soundcloud.com/player/api.js', route=>route.fulfill({contentType:'application/javascript',body:`
    window.SC={Widget:Object.assign(()=>({
      bind:(event,callback)=>{window.mockWidgetCallbacks??={};window.mockWidgetCallbacks[event]=callback;
        if(event==='ready')queueMicrotask(callback);},
      unbind:(event)=>{delete window.mockWidgetCallbacks[event];}
    }),{Events:{READY:'ready',ERROR:'error',FINISH:'finish'}})};
  `}));
  await page.route('https://w.soundcloud.com/player/?**', route=>route.fulfill({contentType:'text/html',body:'<title>SoundCloud test frame</title>'}));
  await page.goto('/albums/playback-check');
  await page.getByRole('button',{name:'Play full album'}).click();
  const dock=page.getByRole('complementary',{name:'Site player'});
  await expect(dock.getByRole('link',{name:'First fixture'})).toBeVisible();
  await expect(dock.getByTitle('Player from SoundCloud')).toHaveAttribute('src',/auto_play=true/);
  await page.waitForFunction(()=>Boolean((window as any).mockWidgetCallbacks?.finish));
  const iframe=await dock.locator('iframe').elementHandle();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'About'}).click();
  await expect(page.getByRole('heading',{name:'About the choir'})).toBeVisible();
  expect(await iframe!.evaluate(el=>el.isConnected)).toBe(true);
  await page.evaluate(()=>(window as any).mockWidgetCallbacks.finish());
  await expect(dock.getByRole('link',{name:'Second fixture'})).toBeVisible();
  await expect(dock.getByRole('button',{name:'Next track'})).toBeDisabled();
  await dock.getByRole('button',{name:'Play queue'}).click();
  await dock.getByRole('button',{name:/First fixture/}).click();
  await expect(dock.getByRole('link',{name:'First fixture'})).toBeVisible();
  const language=page.getByRole('button',{name:'Switch to Arabic'});
  await expect(language.locator('svg')).toBeVisible();
  await language.click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  const arabicDock=page.getByRole('complementary',{name:'مشغّل الترانيم'});
  await expect(arabicDock.getByRole('link',{name:'ترنيمة 0'})).toBeVisible();
  await arabicDock.getByRole('button',{name:'اقفل المشغّل'}).click();
  await expect(arabicDock).toHaveCount(0);
  for(const id of ids)await expect(await write(request,'admin/songs/'+id,'DELETE')).toBeOK();
  await expect(await write(request,'admin/albums/'+albumId,'DELETE')).toBeOK();
});
