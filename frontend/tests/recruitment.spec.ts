import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const microphone=process.env.KORAL_QA_MIC_WAV;
const audioEvidence=process.env.KORAL_QA_AUDIO_DIR;
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  ...(microphone?['--use-file-for-fake-audio-capture='+microphone]:[])]}});

test('bilingual application with default backing reaches the CRM and remains editable', async ({page,request,context}) => {
  await context.grantPermissions(['microphone']);
  await page.addInitScript(()=>{
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(this:AudioNode,...args:unknown[]) {
      if(args[0]===this.context.destination&&this instanceof GainNode){
        const probe=this.context.createAnalyser();
        Reflect.apply(connect,this,[probe]);
        Object.assign(window,{auditionSpeaker:probe});
      }
      return Reflect.apply(connect,this,args);
    } as typeof connect;
  });
  expect((await request.get('/api/admin/applications')).status()).toBe(401);
  expect((await request.post('/api/join',{data:{name:'Salma Example'}})).status()).toBe(400);
  expect((await request.get('/api/join')).ok()).toBe(false);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Join the choir'}).click();
  await expect(page).toHaveURL(/\/join$/);
  await page.getByRole('button',{name:'Switch to Arabic'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/join-390-ar.png',import.meta.url)),fullPage:true});

  await page.getByRole('button',{name:'ابعت طلب الانضمام'}).click();
  await expect(page.getByLabel('الاسم بالكامل',{exact:true})).toBeFocused();
  await expect(page.getByLabel('الاسم بالكامل',{exact:true})).toHaveAttribute('aria-invalid','true');
  await page.getByLabel('الاسم بالكامل',{exact:true}).fill('سلمى اختبار');
  await page.getByLabel('البريد الإلكتروني',{exact:true}).fill('salma@example.test');
  await page.getByLabel('رقم التليفون (اختياري)',{exact:true}).fill('+20 100 123 4567');
  await page.getByRole('combobox').selectOption('alto');
  await page.getByLabel('خبرتك في الغنا (اختياري)',{exact:true}).fill('خبرة في غناء الكورال');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'ابدأ التسجيل'}).click();
  await expect(page.getByRole('timer')).toContainText('3 / 90');
  await expect.poll(()=>page.evaluate(()=>{
    const probe=(window as Window & {auditionSpeaker?:AnalyserNode}).auditionSpeaker;
    if(!probe||probe.context.state!=='running')return 0;
    const wave=new Float32Array(probe.fftSize);
    probe.getFloatTimeDomainData(wave);
    return Math.sqrt(wave.reduce((sum,x)=>sum+x*x,0)/wave.length);
  })).toBeGreaterThan(.001);
  await page.getByRole('button',{name:'وقّف التسجيل'}).click();
  await expect(page.getByText('التسجيل بالصوت والموسيقى')).toBeVisible();
  await expect(page.getByLabel('التسجيل الصوتي',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ابعت طلب الانضمام'}).click();
  await expect(page.getByRole('heading',{name:'طلبك وصل'})).toBeFocused();

  const publicToken=(await (await request.get('/api/auth/csrf')).json()).token;
  const duplicate=await request.post('/api/join',{headers:{'X-CSRF-TOKEN':publicToken},data:{
    name:'Duplicate',email:'SALMA@example.test',phone:'',voice:'unsure',experience:'',consent:true,
  }});
  expect(duplicate.status()).toBe(204);
  expect((await request.get('/api/admin/applications')).status()).toBe(401);
  await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).click();
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/ADMIN/login');
  await page.getByLabel('Email',{exact:true}).fill('ADMIN@ADMIN.COM');
  await page.getByLabel('Password',{exact:true}).fill('Admin@123456');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('link',{name:'Join applications',exact:true}).click();
  const applicant=page.getByRole('link',{name:/salma@example\.test/});
  await expect(applicant).toHaveCount(1);
  await page.getByLabel('Search applicants').fill('SALMA');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(applicant).toBeVisible();
  await applicant.click();
  await expect(page.getByRole('heading',{name:'سلمى اختبار'})).toBeVisible();
  await expect(page.getByText('خبرة في غناء الكورال')).toBeVisible();
  const detailPath='/api/admin/applications/'+page.url().split('/').at(-1);
  const original=(await (await page.request.get(detailPath)).json());
  expect(original.recordedWithBacking).toBe(true);
  expect(original.recordingMixed).toBe(true);
  if(audioEvidence)writeFileSync(join(audioEvidence,'default-mixed.webm'),await (await page.request.get(original.recordingUrl)).body());
  expect(original.backingAudio).toBe((await (await request.get('/api/join/backing')).json()).url);
  await page.getByRole('combobox',{name:'Application status'}).selectOption('audition');
  await page.getByLabel('Internal notes').fill('Schedule a voice check.');
  await page.getByRole('button',{name:'Save application'}).click();
  await expect(page.getByRole('status').getByText('Application updated.')).toBeVisible();
  const staffToken=(await (await page.request.get('/api/auth/csrf')).json()).token;
  expect((await page.request.put(detailPath,{headers:{'X-CSRF-TOKEN':staffToken},data:{
    status:'declined',notes:'Stale revision',revision:original.revision,
  }})).status()).toBe(409);
  await page.reload();
  await expect(page.getByLabel('Internal notes')).toHaveValue('Schedule a voice check.');
  await expect(page.getByRole('combobox',{name:'Application status'})).toHaveValue('audition');
  await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/applications-desktop-en.png',import.meta.url))});
  await page.getByRole('link',{name:'Join applications',exact:true}).last().click();
  await page.getByRole('combobox',{name:'Filter by status'}).selectOption('accepted');
  await expect(page.getByText('No applications match these filters.')).toBeVisible();
  await page.getByRole('combobox',{name:'Filter by status'}).selectOption('audition');
  await applicant.click();
  await page.getByRole('button',{name:'Delete application',exact:true}).click();
  await page.getByRole('button',{name:'Confirm deletion'}).click();
  await expect(page.getByText('New join requests will appear here.')).toBeVisible();
});

test.describe('group auditions', () => {
  test('assigns an album and a private accompanied recording to a choir group', async ({page,request,context}) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/ADMIN/login');
    await page.getByLabel('Email',{exact:true}).fill('admin@admin.com');
    await page.getByLabel('Password',{exact:true}).fill('Admin@123456');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('link',{name:'Choir groups',exact:true}).click();
    await page.getByLabel('Name in English').fill('Adult choir');
    await page.getByLabel('Name in Arabic').fill('كورال الكبار');
    await page.getByLabel('Require a voice recording').check();
    await page.getByLabel('Backing track (MP3)',{exact:true}).setInputFiles(fileURLToPath(new URL('./fixtures/tone.mp3',import.meta.url)));
    await page.getByLabel('Backing track title').fill('Practice melody');
    await page.getByRole('button',{name:'Save choir group'}).click();
    await expect(page.getByLabel('Select a choir group')).not.toHaveValue('0');
    const groupId=Number(await page.getByLabel('Select a choir group').inputValue());

    const links=[{platformName:'Spotify',url:'https://open.spotify.com/playlist/37i9dQZF1DX4Wsb4d7NKfP',label:'Spotify',sort:0}];
    const album={titleEn:'Group album',titleAr:'ألبوم الفرقة',slug:'group-album',published:true,groupIds:[groupId],links};
    const token=(await (await page.request.get('/api/auth/csrf')).json()).token;
    const headers={'X-CSRF-TOKEN':token};
    const trackOnly={...album,links:[{...links[0],url:'https://open.spotify.com/track/37i9dQZF1DX4Wsb4d7NKfP'}]};
    expect((await page.request.post('/api/admin/albums',{headers,data:trackOnly})).status()).toBe(400);
    const savedAlbum=await page.request.post('/api/admin/albums',{headers,data:album});
    expect(savedAlbum.status()).toBe(201);
    const {id:albumId}=await savedAlbum.json();
    await page.goto('/albums?group='+groupId);
    await page.getByRole('heading',{name:'Group album',exact:true}).getByRole('link').click();
    await expect(page.getByRole('link',{name:'Spotify',exact:true})).toHaveCount(0);

    await page.setViewportSize({width:390,height:844});
    await page.goto('/join');
    await page.getByLabel('Choose a choir group').selectOption(String(groupId));
    await page.getByLabel('Full name',{exact:true}).fill('Audition Example');
    await page.getByLabel('Email',{exact:true}).fill('audition@example.test');
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'Send application'}).click();
    await expect(page.getByRole('alert')).toContainText('Add a voice recording');
    await page.getByRole('button',{name:'Start recording'}).click();
    await expect(page.getByRole('timer')).toContainText('3 / 90');
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/audition-mobile.png',import.meta.url)),fullPage:true});
    await page.getByRole('button',{name:'Stop recording'}).click();
    await expect(page.getByLabel('Voice recording',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Send application'}).click();
    await expect(page.getByRole('heading',{name:'Application received'})).toBeVisible();

    await page.goto('/ADMIN/applications');
    await page.getByRole('combobox',{name:'Choir groups',exact:true}).selectOption(String(groupId));
    await page.getByRole('link',{name:/Audition Example/}).click();
    const player=page.getByLabel('Voice recording',{exact:true});
    await expect(player).toBeVisible();
    await expect(page.getByRole('button',{name:'Play voice with backing track'})).toHaveCount(0);
    const path='/api/admin/applications/'+page.url().split('/').at(-1)+'/recording';
    expect((await request.get(path)).status()).toBe(401);
    const media=await page.request.get(path,{headers:{Range:'bytes=0-11'}});
    expect(media.status()).toBe(206);
    expect(media.headers()['cache-control']).toContain('no-store');
    if(audioEvidence)writeFileSync(join(audioEvidence,'custom-mixed.webm'),await (await page.request.get(path)).body());
    await player.evaluate((audio:HTMLAudioElement)=>audio.play());
    await expect.poll(()=>player.evaluate((audio:HTMLAudioElement)=>audio.currentTime)).toBeGreaterThan(.1);
    const applicantPath=path.replace('/recording','');
    expect((await page.request.delete('/api/admin/choir-groups/'+groupId,{headers})).status()).toBe(409);
    await page.goto('/ADMIN/choir-groups');
    await page.getByLabel('Select a choir group').selectOption(String(groupId));
    await page.getByRole('button',{name:'Delete choir group'}).click();
    const confirmation=page.getByRole('dialog');
    await expect(confirmation).toContainText('1 album assignments');
    await expect(confirmation).toContainText('1 applications');
    await expect(confirmation).toContainText('backing MP3 will stay');
    await confirmation.getByRole('button',{name:'Confirm deletion'}).click();
    await expect(page.getByLabel('Select a choir group')).toHaveValue('0');
    const preserved=await (await page.request.get(applicantPath)).json();
    expect(preserved.applicant).toMatchObject({groupId:null,groupEn:'Adult choir'});
    expect(preserved.recordingMixed).toBe(true);
    expect((await page.request.get(path)).ok()).toBe(true);
    expect((await (await page.request.get('/api/admin/albums/'+albumId)).json()).groupIds).toEqual([]);
    expect((await page.request.get(preserved.backingAudio)).ok()).toBe(true);
  });
});
