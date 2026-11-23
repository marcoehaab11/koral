import { test, expect, request as createRequest, type APIRequestContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const artwork=readFileSync(fileURLToPath(new URL('../public/media/choir-800.webp',import.meta.url)));
const tone=readFileSync(fileURLToPath(new URL('./fixtures/tone.mp3',import.meta.url)));
async function mutate(api:APIRequestContext, path:string, method:string, data?:unknown) {
  const csrf=await api.get('/api/auth/csrf');
  const {token}=await csrf.json();
  return api.fetch('/api/'+path,{method,data,headers:{'X-CSRF-TOKEN':token}});
}
async function upload(api:APIRequestContext,bucket:string,name:string,mimeType:string,buffer:Buffer) {
  const {token}=await (await api.get('/api/auth/csrf')).json();
  return api.post('/api/admin/media/'+bucket,{headers:{'X-CSRF-TOKEN':token},multipart:{file:{name,mimeType,buffer}}});
}
const base={titleEn:'Night rehearsal',titleAr:'بروفة ليلية',descriptionEn:'Workflow test',descriptionAr:'اختبار النشر'};

test('studio publishes an album and recording, protecting drafts and streaming byte ranges',async({page,baseURL})=>{
  const anonymous=await createRequest.newContext({baseURL});
  await expect(await anonymous.get('/api/admin/dashboard')).not.toBeOK();
  expect((await anonymous.get('/api/admin/dashboard')).status()).toBe(401);
  await page.goto('/ADMIN');
  await expect(page).toHaveURL(/\/ADMIN\/login$/);
  await page.getByLabel('Email',{exact:true}).fill('ADMIN@ADMIN.COM');
  await page.getByLabel('Password',{exact:true}).fill('Admin@123456');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  const api=page.request;
  expect((await api.post('/api/admin/albums',{data:{...base,slug:'no-csrf'}})).status()).toBe(400);
  expect((await mutate(api,'admin/albums','POST',{...base,slug:'Invalid slug'})).status()).toBe(400);
  expect((await upload(api,'albums','invalid.webp','image/webp',Buffer.alloc(16))).status()).toBe(415);

  await page.goto('/ADMIN/albums/new');
  await page.getByLabel('Title (English)').fill(base.titleEn);
  await page.getByLabel('Title (Arabic)').fill(base.titleAr);
  await expect(page.getByLabel('URL slug')).toHaveCount(0);
  await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'album.webp',mimeType:'image/webp',buffer:artwork});
  await expect(page.getByRole('img',{name:'Cover image'})).toBeVisible();
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page).toHaveURL(/\/ADMIN\/albums\/\d+$/);
  const albumId=Number(page.url().split('/').at(-1));
  const albumPath='admin/albums/'+albumId;
  const album=await (await api.get('/api/'+albumPath)).json();
  expect(album.slug).toBe('night-rehearsal');
  const duplicate=await mutate(api,'admin/albums','POST',{...base,titleEn:'Night Réhearsal!'});
  expect(duplicate.status()).toBe(201);
  const second=await duplicate.json();
  expect(second.slug).toBe('night-rehearsal-2');
  expect((await mutate(api,'admin/albums/'+second.id,'DELETE')).status()).toBe(204);
  expect((await anonymous.get('/api/albums/night-rehearsal')).status()).toBe(404);
  expect((await anonymous.get(album.image)).status()).toBe(404);

  await page.goto('/ADMIN/songs/new');
  await page.getByLabel('Title (English)').fill('Evening tone');
  await page.getByLabel('Title (Arabic)').fill('نغمة المساء');
  await page.getByLabel('URL slug').fill('evening-tone');
  await page.getByRole('combobox',{name:'Albums',exact:true}).selectOption(String(albumId));
  await page.getByLabel('Cover image',{exact:true}).setInputFiles({name:'song.webp',mimeType:'image/webp',buffer:artwork});
  await page.getByLabel('MP3 audio',{exact:true}).setInputFiles({name:'tone.mp3',mimeType:'audio/mpeg',buffer:tone});
  await page.getByLabel('Lyrics (English)').fill('An evening line\nA second line');
  await page.getByLabel('Lyrics (Arabic)').fill('سطر المساء\nسطر ثان');
  const links=[['Spotify','https://open.spotify.com/track/example'],['Anghami','https://play.anghami.com/song/123'],['YouTube','https://www.youtube.com/watch?v=M7lc1UVf-VE']];
  for(const [i,[platform,url]] of links.entries()){
    await page.getByRole('button',{name:'Add link'}).click();
    await page.getByRole('combobox',{name:'Platform '+(i+1),exact:true}).selectOption(platform);
    await page.getByLabel('Link URL').nth(i).fill(url);
  }
  await expect(page.getByRole('img',{name:'Cover image'})).toBeVisible();
  await expect(page.locator('audio')).toHaveAttribute('src',/\.mp3$/);
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page).toHaveURL(/\/ADMIN\/songs\/\d+$/);
  const songId=Number(page.url().split('/').at(-1));
  const songPath='admin/songs/'+songId;
  const song=await (await api.get('/api/'+songPath)).json();
  expect(song.albumId).toBe(albumId);
  expect((await anonymous.get('/api/songs/evening-tone')).status()).toBe(404);
  expect((await anonymous.get(song.audio)).status()).toBe(404);
  await page.getByRole('checkbox',{name:'Published',exact:true}).check();
  await page.getByRole('button',{name:'Save published entry'}).click();
  await expect(page.getByRole('status').getByText('Changes saved.')).toBeVisible();
  expect((await (await anonymous.get('/api/songs/evening-tone')).json()).albumId).toBeNull();
  const updatedAlbum=await mutate(api,albumPath,'PUT',{...album,slug:undefined,titleEn:'Renamed rehearsal',published:true,featured:true});
  await expect(updatedAlbum).toBeOK();
  expect((await updatedAlbum.json()).slug).toBe('night-rehearsal');
  expect((await mutate(api,albumPath+'/tracks/'+songId,'DELETE')).status()).toBe(204);
  expect((await (await anonymous.get('/api/songs/evening-tone')).json()).albumId).toBeNull();
  expect((await mutate(api,albumPath+'/tracks/'+songId,'PUT')).status()).toBe(204);
  expect((await (await anonymous.get('/api/songs/evening-tone')).json()).albumId).toBe(albumId);
  await expect(await mutate(api,albumPath+'/order','PUT',{ids:[songId]})).toBeOK();

  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Koral Choir'})).toBeVisible();
  await page.getByRole('link',{name:'View album'}).click();
  await expect(page).toHaveURL(/\/albums\/night-rehearsal$/);
  await page.getByRole('link',{name:'Evening tone',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evening tone'})).toBeVisible();
  await expect(page.getByText('An evening line A second line')).toBeVisible();
  await page.getByRole('button',{name:'العربية',exact:true}).click();
  await expect(page.getByText('سطر المساء سطر ثان')).toHaveAttribute('dir','rtl');
  for (const [platform,url] of links) {
    await expect(page.getByRole('link',{name:platform,exact:true})).toHaveAttribute('href',url);
    await expect(page.getByRole('link',{name:platform,exact:true})).toHaveAttribute('target','_blank');
  }
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({body:'Embedded player fixture'}));
  await page.getByRole('button',{name:'Play hymn'}).click();
  const dock=page.getByRole('complementary',{name:'Site player'});
  await dock.getByRole('combobox',{name:'Playback source'}).selectOption({label:'YouTube'});
  await expect(page.getByTitle('Player from YouTube')).toHaveAttribute('src',/youtube-nocookie\.com\/embed\/M7lc1UVf-VE\?/);
  await dock.getByRole('combobox',{name:'Playback source'}).selectOption({label:'Site audio'});
  await expect.poll(()=>page.locator('audio').evaluate(e=>(e as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const range=await anonymous.get(song.audio,{headers:{Range:'bytes=0-127'}});
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(128);
  expect(await (await anonymous.get('/songs/evening-tone')).text()).toContain('property="og:title" content="Evening tone');
  expect(await (await anonymous.get('/sitemap.xml')).text()).toContain('/songs/evening-tone');
  await page.goto('/search?q=Evening');
  await expect(page.getByRole('link',{name:'Evening tone',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Switch to Arabic'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','ar');
  await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await expect(await mutate(api,songPath,'PUT',{...song,published:false})).toBeOK();
  expect((await anonymous.get('/api/songs/evening-tone')).status()).toBe(404);
  expect((await anonymous.get(song.audio)).status()).toBe(404);
  expect((await mutate(api,songPath,'DELETE')).status()).toBe(204);
  expect((await mutate(api,albumPath,'DELETE')).status()).toBe(204);
  await anonymous.dispose();
});

test('role restrictions, password rotation, singleton edits, and remaining CRUD',async({request,baseURL})=>{
  const owner=request;
  await expect(await mutate(owner,'auth/login','POST',{email:'ADMIN@ADMIN.COM',password:'Admin@123456'})).toBeOK();
  await expect(await mutate(owner,'admin/choir','PUT',{nameEn:'Koral Choir',nameAr:'كورال'})).toBeOK();
  const setting=await (await owner.get('/api/settings')).json();
  await expect(await mutate(owner,'admin/settings','PUT',{...setting,members:false})).toBeOK();
  expect((await owner.get('/api/members')).status()).toBe(404);
  await expect(await mutate(owner,'admin/settings','PUT',setting)).toBeOK();
  const email='editor@example.test';
  const password='TempEditor@12345';
  await expect(await mutate(owner,'admin/users','POST',{email,password,role:'ContentEditor'})).toBeOK();
  const editor=await createRequest.newContext({baseURL});
  await expect(await mutate(editor,'auth/login','POST',{email,password})).toBeOK();
  expect((await editor.get('/api/admin/dashboard')).status()).toBe(403);
  await expect(await mutate(editor,'auth/password','POST',{current:password,password:'UpdatedEditor@12345'})).toBeOK();
  await expect(await editor.get('/api/admin/dashboard')).toBeOK();
  expect((await editor.get('/api/admin/users')).status()).toBe(403);
  expect((await editor.get('/api/admin/choir')).status()).toBe(403);
  for(const [resource,extras] of [
    ['members',{positionEn:'Singer'}],['events',{date:'2099-07-10T19:00:00Z',location:'Concert hall'}],
    ['categories',{}],['gallery',{video:'https://www.youtube.com/watch?v=M7lc1UVf-VE'}],
  ] as const){
    const draft=await mutate(editor,'admin/'+resource,'POST',{...base,...extras});
    await expect(draft).toBeOK();
    const item=await draft.json();
    const publicPath='/api/'+resource+(resource==='events'?'?upcoming=true':'');
    expect((await (await editor.get(publicPath)).json()).items.some((x:{id:number})=>x.id===item.id)).toBe(false);
    await expect(await mutate(editor,'admin/'+resource+'/'+item.id,'PUT',{...item,published:true})).toBeOK();
    expect((await (await editor.get(publicPath)).json()).items.some((x:{id:number})=>x.id===item.id)).toBe(true);
    expect((await mutate(editor,'admin/'+resource+'/'+item.id,'DELETE')).status()).toBe(204);
  }
  const accounts=await (await owner.get('/api/admin/users')).json();
  const id=accounts.find((a:{email:string})=>a.email===email).id;
  expect((await mutate(owner,'admin/users/'+id,'DELETE')).status()).toBe(204);
  expect((await editor.get('/api/admin/dashboard')).status()).toBe(401);
  expect((await mutate(owner,'auth/logout','POST')).status()).toBe(204);
  expect((await owner.get('/api/admin/dashboard')).status()).toBe(401);
  await editor.dispose();
});

test('public homepage and mobile menu fit desktop and mobile in English and Arabic',async({page})=>{
  for (const width of [1440,1024,768,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    const cover=page.locator('.hero img').last();
    await expect.poll(()=>cover.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const lang of ['en','ar']) {
      await expect(page.locator('html')).toHaveAttribute('lang',lang);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      await expect(page.getByRole('link',{name:lang==='en'?'Explore our music':'اكتشف موسيقانا'})).toBeVisible();
      await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/home-'+width+'-'+lang+'.png',import.meta.url)),animations:'disabled'});
      await page.getByRole('button',{name:lang==='en'?'Switch to Arabic':'التبديل إلى الإنجليزية'}).click();
    }
  }
  await page.getByRole('button',{name:'Open menu'}).click();
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Home'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open menu'})).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Gallery'}).click();
  await expect(page.getByRole('heading',{name:'Gallery'})).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  await page.goto('/ADMIN/login');
  await expect(page.getByRole('heading',{name:'Sign in to Studio'})).toBeVisible();
  await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/login-390.png',import.meta.url))});
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('input[type=email]')).toBeFocused();
  await expect(page.locator('input[type=email]')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('input[type=email]')).toHaveAccessibleDescription('This field is required.');
});

test('gallery photo opens and restores focus through the keyboard',async({page,request})=>{
  await expect(await mutate(request,'auth/login','POST',{email:'ADMIN@ADMIN.COM',password:'Admin@123456'})).toBeOK();
  const file=await upload(request,'gallery','gallery.webp','image/webp',artwork);
  await expect(file).toBeOK();
  const {url:image}=await file.json();
  const photo=await mutate(request,'admin/gallery','POST',{...base,image,published:true});
  await expect(photo).toBeOK();
  const {id}=await photo.json();
  await page.goto('/gallery');
  const opener=page.getByRole('button',{name:base.titleEn,exact:true});
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Close viewer'})).toBeFocused();
  await expect(dialog.getByRole('img',{name:base.titleEn})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect((await mutate(request,'admin/gallery/'+id,'DELETE')).status()).toBe(204);
});
