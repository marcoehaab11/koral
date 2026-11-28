import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const photo=fileURLToPath(new URL('../public/media/choir-800.webp',import.meta.url));
const evidence=process.env.KORAL_QA_AUDIO_DIR;
const microphone=process.env.KORAL_QA_MIC_WAV;
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  ...(microphone?['--use-file-for-fake-audio-capture='+microphone]:[])]}});

async function write(request:APIRequestContext,path:string,method:string,data?:unknown){
  const {token}=await (await request.get('/api/auth/csrf')).json();
  return request.fetch('/api/'+path,{method,data,headers:{'X-CSRF-TOKEN':token}});
}

test('PDF defaults validate, stop accompanied recording automatically, and preserve the completed application',async({page,request,context})=>{
  await context.grantPermissions(['microphone']);
  await page.addInitScript(()=>{
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(this:AudioNode,...args:unknown[]){
      if(args[0]===this.context.destination&&this instanceof GainNode)Object.assign(window,{monitorGain:this.gain});
      return Reflect.apply(connect,this,args);
    } as typeof connect;
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('a[href="/join"]')).toHaveCount(0);
  expect((await request.get('/join')).status()).toBe(404);
  expect((await request.get('/api/join/form')).status()).toBe(404);
  await expect(await write(page.request,'auth/login','POST',{email:'admin@admin.com',password:'Admin@123456'})).toBeOK();
  const settings=await (await request.get('/api/settings')).json();
  await expect(await write(page.request,'admin/settings','PUT',{...settings,homeJoin:true,homeAnnouncement:true,
    announcementTitleAr:'ميعاد البروفة',announcementTitleEn:'Rehearsal time',
    announcementBodyAr:'الجمعة مساءً',announcementBodyEn:'Friday evening'})).toBeOK();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Rehearsal time'})).toBeVisible();
  await expect(page.locator('header a[href="/join"],footer a[href="/join"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Open menu'}).click();
  const mainNav=page.getByRole('navigation',{name:'Main navigation'});
  expect(await mainNav.getByRole('link').allTextContents()).toEqual(['Home','Albums','Songs','Gallery','About']);
  await page.keyboard.press('Escape');
  const joinLink=page.locator('.hero').getByRole('link',{name:'Join the choir'});
  await expect(joinLink).toBeVisible();
  await joinLink.click();
  await page.getByRole('button',{name:'Switch to Arabic'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.getByText('الاشتراك في كورال يوسف الصديق')).toBeVisible();
  await expect(page.getByLabel('اختار فرقة الكورال')).toHaveCount(0);
  const nameInputs=['الاسم الأول','اسم الأب','اسم الجد','اسم العائلة'].map(x=>page.getByLabel(x));
  const phone=page.getByLabel('رقم واتساب للتواصل');
  const send=page.getByRole('button',{name:'ابعت طلب الانضمام'});
  await send.click();
  await expect(nameInputs[0]).toBeFocused();
  await nameInputs[0].fill('Marco');
  await phone.fill('٠١٢٣٤٥٦٧٨٩٠');
  await send.click();
  await expect(page.getByText('اكتب حروف عربي فقط.')).toBeVisible();
  await expect(phone).toHaveAttribute('aria-invalid','true');
  for(const [index,text] of ['مريم','يوسف','سمير','مينا'].entries())await nameInputs[index].fill(text);
  await phone.fill('01234567890');
  await page.getByLabel('اليوم',{exact:true}).selectOption('29');
  await page.getByLabel('الشهر',{exact:true}).selectOption('02');
  await page.getByLabel('السنة',{exact:true}).selectOption('2008');
  await page.getByLabel('صورة شخصية').setInputFiles(photo);
  await expect(page.getByText(/JPG.*PNG.*WebP/)).toBeVisible();
  await page.getByLabel('المرحلة الدراسية').selectOption('university');
  await page.getByLabel('شاركت سابقًا').selectOption('no');
  await page.getByLabel('تيشيرت الكورال').selectOption('unavailable');
  await page.getByLabel('الكنيسة التي تواظب').selectOption('other');
  await page.getByLabel('مواهب فنية إضافية').selectOption('instrument');
  await expect(page.getByLabel('مواهب فنية إضافية')).not.toHaveAttribute('multiple');
  await page.getByRole('checkbox').check();
  await send.click();
  await expect(page.getByText('اكتب التفاصيل المطلوبة للاختيار.')).toHaveCount(3);
  await page.getByLabel('الكلية أو المعهد والمرحلة الدراسية').fill('كلية التربية');
  await page.getByLabel('اسم الكنيسة').fill('كنيسة مارجرجس');
  await page.getByLabel('اسم الآلة').fill('البيانو');
  const schema=await (await request.get('/api/join/form')).json();
  const invalid=await write(request,'join','POST',{revision:schema.revision,consent:true,
    answers:{'first-name':['مريم'],'second-name':['يوسف'],'third-name':['سمير'],'last-name':['Mina'],whatsapp:['012345678901']}});
  expect(invalid.status()).toBe(400);
  expect(Object.keys((await invalid.json()).errors)).toEqual(expect.arrayContaining(['last-name','whatsapp','photo','recording']));

  await page.clock.install();
  const volume=page.getByRole('slider',{name:'مستوى صوت الموسيقى المصاحبة'});
  await expect(volume).toHaveValue('1');
  await page.getByRole('button',{name:'ابدأ التسجيل'}).click();
  await expect(page.getByRole('timer')).toBeVisible();
  const gain=()=>page.evaluate(()=>(window as Window & {monitorGain?:AudioParam}).monitorGain?.value);
  await expect.poll(gain).toBe(1);
  await volume.focus();
  await volume.press('ArrowDown');
  await expect.poll(gain).toBeCloseTo(.95);
  await volume.press('End');
  await expect(page.getByRole('timer')).toContainText('2 / 90');
  await page.clock.fastForward(90_000);
  await expect(page.getByText('التسجيل بالصوت والموسيقى')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await send.click();
  await expect(page.getByRole('heading',{name:'طلبك وصل'})).toBeFocused();

  await page.goto('/ADMIN/applications');
  await page.getByLabel('ابحث في الطلبات').fill('٠١٢٣٤٥٦٧٨٩٠');
  await page.getByRole('button',{name:'البحث',exact:true}).click();
  await expect(page.getByText(/عدد الطلبات المطابقة.*1/)).toBeVisible();
  await page.getByLabel('ابحث في الطلبات').fill('مريم   مينا');
  await page.getByRole('button',{name:'البحث',exact:true}).click();
  await expect(page.getByText(/عدد الطلبات المطابقة.*1/)).toBeVisible();
  await page.getByRole('link',{name:/مريم يوسف سمير مينا/}).click();
  await expect(page.getByText('العزف — البيانو')).toBeVisible();
  const path='/api/admin/applications/'+page.url().split('/').at(-1);
  const data=await (await page.request.get(path)).json();
  expect(data.applicant.phone).toBe('01234567890');
  expect(data.recordingMixed).toBe(true);
  expect((await request.get(data.photoUrl)).status()).toBe(401);
  expect((await request.get(data.recordingUrl)).status()).toBe(401);
  expect((await page.request.get(data.photoUrl)).headers()['content-type']).toBe('image/webp');
  expect((await page.request.get(data.recordingUrl,{headers:{Range:'bytes=0-15'}})).status()).toBe(206);
  if(evidence)writeFileSync(join(evidence,'registration-mix.webm'),await (await page.request.get(data.recordingUrl)).body());
});

test('owner adds and reorders text and choice fields and removes them without losing historical export data',async({page,request},testInfo)=>{
  await expect(await write(page.request,'auth/login','POST',{email:'admin@admin.com',password:'Admin@123456'})).toBeOK();
  expect((await request.get('/api/admin/applications/export')).status()).toBe(401);
  const defaults=await (await request.get('/api/settings')).json();
  if(!defaults.homeJoin)await expect(await write(page.request,'admin/settings','PUT',{...defaults,homeJoin:true})).toBeOK();
  await page.goto('/ADMIN/registration-form');
  const add=page.getByRole('button',{name:'Add field',exact:true});
  await add.click();
  let field=page.getByRole('region',{name:'New field'});
  await field.getByLabel('Field title in Arabic').fill('اسم المدرسة');
  field=page.getByRole('region',{name:'اسم المدرسة'});
  await field.getByLabel('Required',{exact:true}).check();
  await field.getByRole('button',{name:'Move up'}).click();
  await add.click();
  field=page.getByRole('region',{name:'New field'});
  await field.getByLabel('Field title in Arabic').fill('أيام البروفة');
  field=page.getByRole('region',{name:'أيام البروفة'});
  await field.getByLabel('Field type').selectOption('choice');
  await field.getByLabel('Allow more than one choice').check();
  await field.getByLabel('Option in Arabic').first().fill('الجمعة');
  await field.getByRole('button',{name:'Add option'}).click();
  await field.getByLabel('Option in Arabic').last().fill('السبت');
  await page.getByRole('button',{name:'Add status'}).click();
  await page.getByLabel('Option in Arabic').last().fill('قيد المراجعة');
  await page.getByRole('button',{name:'Save registration form'}).click();
  await expect(page.getByText('Form saved.')).toBeVisible();
  const schema=await (await request.get('/api/join/form')).json();
  const school=schema.fields.find((x:{labelAr:string})=>x.labelAr==='اسم المدرسة');
  const rehearsal=schema.fields.find((x:{labelAr:string})=>x.labelAr==='أيام البروفة');
  expect(schema.fields.findIndex((x:{id:string})=>x.id===school.id)).toBeLessThan(schema.fields.findIndex((x:{id:string})=>x.id==='recording'));
  await page.goto('/join');
  await expect(page.getByLabel('اسم المدرسة')).toHaveAttribute('required','');
  await expect(page.getByLabel('أيام البروفة')).toHaveAttribute('multiple','');
  await expect(page.getByLabel('أيام البروفة')).not.toHaveAttribute('required','');

  const application={revision:schema.revision,consent:true,answers:{
    'first-name':['بطرس'],'second-name':['يوسف'],'third-name':['مينا'],'last-name':['سمير'],
    whatsapp:['01023456789'],'birth-date':['2006-09-05'],school:['p5'],previous:['yes'],shirt:['fits'],church:['mary'],talent:['writing'],
    [school.id]:['مدرسة السلام'],[rehearsal.id]:rehearsal.options.map((x:{id:string})=>x.id)}};
  const tone=readFileSync(new URL('./fixtures/tone.mp3',import.meta.url));
  const {token}=await (await request.get('/api/auth/csrf')).json();
  const submission=await request.post('/api/join',{headers:{'X-CSRF-TOKEN':token},multipart:{application:JSON.stringify(application),
    photo:{name:'portrait.webp',mimeType:'image/webp',buffer:readFileSync(photo)},
    recording:{name:'audition.mp3',mimeType:'audio/mpeg',buffer:tone}}});
  expect(submission.status(),await submission.text()).toBe(204);
  const filePath='/api/admin/applications/export?lang=ar';
  const response=await page.request.get(filePath);
  await expect(response).toBeOK();
  expect(response.headers()['content-type']).toContain('spreadsheetml');
  const workbook=await response.body();
  if(evidence)writeFileSync(join(evidence,'registration-export.xlsx'),workbook);
  const workbookPath=testInfo.outputPath('applications.xlsx');
  writeFileSync(workbookPath,workbook);
  const relationships=execFileSync('tar.exe',['-xOf',workbookPath,'xl/worksheets/_rels/sheet1.xml.rels'],{encoding:'utf8'});
  const targets=[...new Set(Array.from(relationships.matchAll(/Target="([^"]+)"/g),m=>m[1]))];
  expect(targets.length).toBeGreaterThanOrEqual(2);
  const attachments=await Promise.all(targets.map(url=>request.get(url)));
  attachments.forEach(item=>{
    expect(item.status()).toBe(200);
    expect(item.headers()['content-disposition']).toContain('attachment;');
  });
  expect(attachments.map(item=>item.headers()['content-type'])).toEqual(expect.arrayContaining(['image/webp','audio/mpeg']));
  expect((await request.get(targets[0]+'not-valid')).status()).toBe(404);
  const oldRows=await page.request.get('/api/admin/applications?q=01023456789');
  const id=(await oldRows.json()).items[0].id;
  await page.goto('/ADMIN/applications/'+id);
  await page.getByLabel('Application status').selectOption({label:'قيد المراجعة'});
  await page.getByRole('button',{name:'Save application'}).click();
  await expect(page.getByText('Application updated.')).toBeVisible();
  await page.goto('/ADMIN/registration-form');
  field=page.getByRole('region',{name:'أيام البروفة'});
  await field.getByRole('button',{name:'Remove option'}).first().click();
  await page.getByRole('button',{name:'Confirm deletion'}).click();
  field=page.getByRole('region',{name:'اسم المدرسة'});
  await field.getByRole('button',{name:'Remove field'}).click();
  await expect(page.getByRole('dialog')).toContainText('Saved answers stay');
  await page.getByRole('button',{name:'Confirm deletion'}).click();
  await page.getByRole('button',{name:'Save registration form'}).click();
  await expect(page.getByText('Form saved.')).toBeVisible();
  const after=await (await page.request.get('/api/admin/applications/'+id)).json();
  expect(after.answers).toContainEqual(expect.objectContaining({id:school.id,value:'مدرسة السلام'}));
  expect(after.answers).toContainEqual(expect.objectContaining({id:rehearsal.id,value:'الجمعة، السبت'}));
  const historic=await page.request.get(filePath);
  if(evidence)writeFileSync(join(evidence,'registration-export-historical.xlsx'),await historic.body());
  const filtered=await page.request.get(filePath+'&from=2000-01-01&to=2000-01-01');
  await expect(filtered).toBeOK();
  if(evidence)writeFileSync(join(evidence,'registration-export-empty.xlsx'),await filtered.body());
});
