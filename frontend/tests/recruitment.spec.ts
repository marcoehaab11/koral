import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});

test('bilingual application with default backing reaches the CRM and remains editable', async ({page,request,context}) => {
  await context.grantPermissions(['microphone']);
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
  const backing=page.locator('audio[aria-label="اسمع التراك المصاحب"]');
  await expect.poll(()=>backing.evaluate((audio:HTMLAudioElement)=>!audio.paused&&audio.currentTime>.15)).toBe(true);
  await page.getByRole('button',{name:'وقّف التسجيل'}).click();
  await expect(page.getByRole('button',{name:'اسمع الصوت مع الموسيقى'})).toBeVisible();
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
    expect((await page.request.post('/api/admin/albums',{headers,data:album})).status()).toBe(201);
    await page.goto('/albums?group='+groupId);
    await page.getByRole('heading',{name:'Group album',exact:true}).getByRole('link').click();
    await expect(page.getByRole('link',{name:'Spotify',exact:true})).toHaveAttribute('href',links[0].url);

    await page.setViewportSize({width:390,height:844});
    await page.goto('/join');
    await page.getByLabel('Choose a choir group').selectOption(String(groupId));
    await page.getByLabel('Full name',{exact:true}).fill('Audition Example');
    await page.getByLabel('Email',{exact:true}).fill('audition@example.test');
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'Send application'}).click();
    await expect(page.getByRole('alert')).toContainText('Add a voice recording');
    await page.getByRole('button',{name:'Start recording'}).click();
    await expect(page.getByRole('timer')).toContainText('1 / 90');
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/visual/audition-mobile.png',import.meta.url)),fullPage:true});
    await page.getByRole('button',{name:'Stop recording'}).click();
    await expect(page.getByLabel('Voice recording',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Send application'}).click();
    await expect(page.getByRole('heading',{name:'Application received'})).toBeVisible();

    await page.goto('/ADMIN/applications');
    await page.getByRole('combobox',{name:'Choir groups',exact:true}).selectOption(String(groupId));
    await page.getByRole('link',{name:/Audition Example/}).click();
    await expect(page.getByRole('button',{name:'Play voice with backing track'})).toBeVisible();
    const path='/api/admin/applications/'+page.url().split('/').at(-1)+'/recording';
    expect((await request.get(path)).status()).toBe(401);
    const media=await page.request.get(path,{headers:{Range:'bytes=0-11'}});
    expect(media.status()).toBe(206);
    expect(media.headers()['cache-control']).toContain('no-store');
    await page.getByRole('button',{name:'Play voice with backing track'}).click();
    await expect(page.getByRole('button',{name:'Listen to voice only'})).toBeVisible();
  });
});
