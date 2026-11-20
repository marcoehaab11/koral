import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('bilingual application reaches the private CRM and remains editable after reload', async ({page,request}) => {
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
