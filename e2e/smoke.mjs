// Prueba de humo: abre el HTML generado desde file:// en Chromium y recorre las pestañas.
// Uso: npm run build && npm run e2e   (requiere Playwright instalado)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.env.SHOTS || '';
const file = pathToFileURL(path.resolve('dist/index.html')).href;
const errs = [];
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1440, height: 1000 } });
pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
await pg.goto(file);
await pg.waitForSelector('#plan g#fx', { state: 'attached', timeout: 15000 });
const info = await pg.evaluate(() => document.querySelector('.runinfo')?.textContent);
console.log('runinfo:', info);
const shot = async n => { if (out) await pg.screenshot({ path: path.join(out, n), fullPage: true }); };
// saltar al martes 10:00 y reproducir un momento
await pg.click('.daybar button:nth-child(2)');
await pg.waitForTimeout(300);
await shot('plan.png');
await pg.click('.ctl .btn.pri'); await pg.waitForTimeout(1200); await pg.click('.ctl .btn.pri');
await pg.click('nav button:nth-child(2)'); await pg.waitForTimeout(400); await shot('results.png');
await pg.click('nav button:nth-child(4)'); await pg.waitForTimeout(300);
const sections = await pg.locator('.subnav button').count();
if (sections !== 9) errs.push('Configuración debería tener 9 secciones: ' + sections);
await pg.click('.subnav button:nth-child(4)'); await pg.waitForTimeout(300); await shot('config.png');
// editar dotación del turno día (sorting = 1), verificar que se re-simula y deshacer
const before = await pg.evaluate(() => document.querySelector('.runinfo')?.textContent);
const inp = pg.locator('.shift').first().locator('.staffgrid input').nth(2);
const v0 = await inp.inputValue();
await inp.fill('1'); await inp.press('Tab');
await pg.waitForFunction(b => document.querySelector('.runinfo')?.textContent !== b, before, { timeout: 10000 });
await pg.click('.topbar button:has-text("↶")'); await pg.waitForTimeout(400);
const v1 = await pg.locator('.shift').first().locator('.staffgrid input').nth(2).inputValue();
console.log('deshacer: sorting', v0, '→ 1 →', v1);
if (v1 !== v0) errs.push('deshacer no volvió al valor anterior');
await inp.fill('1'); await inp.press('Tab'); await pg.waitForTimeout(300);
// plano: desplegable de indicadores y panel de zona
await pg.click('nav button:nth-child(1)'); await pg.waitForSelector('#plan g#fx', { state: 'attached' });
await pg.click('.kpibar summary'); await pg.waitForTimeout(200);
const kp = await pg.locator('.kpigrid .stat').count();
const delta = await pg.locator('.kpigrid .delta').count();
console.log('indicadores:', kp, '· con cambio frente a antes:', delta);
if (kp !== 5) errs.push('el desplegable debería tener 5 indicadores');
await pg.locator('#plan .zhit[data-zone^="sort:"]').click();
await pg.waitForSelector('.zpanel', { timeout: 5000 });
console.log('panel de zona:', await pg.locator('.zpanel h2').textContent());
await shot('zone.png');
// reporte A4
await pg.click('nav button:nth-child(5)'); await pg.waitForSelector('.report .page', { timeout: 5000 });
const pages = await pg.locator('.report .page').count();
console.log('reporte: páginas', pages, '·', (await pg.locator('.rep-ctl textarea').inputValue()).slice(0, 60) + '…');
if (pages < 7) errs.push('el reporte debería tener al menos 7 páginas');
// la conclusión editada se conserva al ir a otra pestaña y volver
await pg.fill('.rep-ctl textarea', 'Conclusión de prueba');
await pg.click('nav button:nth-child(1)'); await pg.click('nav button:nth-child(5)'); await pg.waitForSelector('.rep-ctl textarea');
if (await pg.locator('.rep-ctl textarea').inputValue() !== 'Conclusión de prueba') errs.push('se perdió la conclusión editada al cambiar de pestaña');
await shot('report.png');
// cambiar idioma
await pg.click('.langsw button:nth-child(2)'); await pg.waitForTimeout(300);
const navEn = await pg.evaluate(() => document.querySelector('nav')?.textContent);
console.log('nav EN:', navEn);
await pg.click('nav button:nth-child(1)'); await pg.waitForTimeout(500); await shot('plan_en.png');

// editor de disposición: arrastrar una zona cambia las distancias y vuelve a simular
pg.on('dialog', d => d.accept(d.type() === 'prompt' ? (/meters|metros/.test(d.message()) ? '40' : '1') : undefined));
await pg.click('.ctl button:has-text("✎")');
await pg.waitForSelector('#layout');
const firstDist = () => pg.evaluate(() => document.querySelectorAll('.edfoot table')[1]?.querySelector('tbody tr td:nth-child(3)')?.textContent);
const d0 = await firstDist();
const z = await pg.locator('#layout .ez.k-group rect:not(.hd)').first().boundingBox();
const run0 = await pg.evaluate(() => document.querySelector('.runinfo')?.textContent);
await pg.mouse.move(z.x + z.width / 2, z.y + z.height / 2); await pg.mouse.down();
await pg.mouse.move(z.x + z.width / 2 - 60, z.y + z.height / 2 + 4, { steps: 5 }); await pg.mouse.up();
await pg.waitForFunction(b => document.querySelector('.runinfo')?.textContent !== b, run0, { timeout: 10000 });
const d1 = await firstDist();
console.log('distancia canastos → reverificación:', d0, '→', d1);
if (d0 === d1) errs.push('mover la zona no cambió la distancia');
// planos de fondo: DXF (con unidades), imagen y PDF
const dxf = ['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','90','4','70','1','10','0','20','0','10','60000','20','0','10','60000','20','30000','10','0','20','30000',
  '0','CIRCLE','10','10000','20','10000','40','500','0','ENDSEC','0','EOF'].join('\n');
const input = pg.locator('.editor input[type=file]');
await input.setInputFiles({ name: 'plano.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
await pg.waitForSelector('#layout path.p-cad', { state: 'attached', timeout: 10000 });
const size = await pg.evaluate(() => [...document.querySelectorAll('.editor .fld.inl input')].map(i => i.value).join(' × '));
console.log('DXF cargado, bodega de', size, 'm');
if (size !== '60 × 30') errs.push('el DXF no tomó sus medidas: ' + size);
const p2 = await b.newPage();
await p2.setContent('<style>html,body{margin:0;overflow:hidden}</style><svg xmlns="http://www.w3.org/2000/svg" width="780" height="380" style="display:block"><rect x="10" y="10" width="760" height="360" fill="none" stroke="#000" stroke-width="4"/><line x1="10" y1="190" x2="770" y2="190" stroke="#000" stroke-width="4"/></svg>');
const pdf = await p2.pdf({ width: '800px', height: '400px', printBackground: true });
const png = await p2.screenshot();
await p2.close();
await input.setInputFiles({ name: 'plano.png', mimeType: 'image/png', buffer: png });
await pg.waitForSelector('#layout image.p-bgimg', { state: 'attached', timeout: 10000 });
// fijar escala: dos clics y 40 m (el diálogo se responde arriba)
const L = await pg.locator('#layout').boundingBox();
await pg.mouse.click(L.x + 80, L.y + 120); await pg.mouse.click(L.x + 480, L.y + 120);
await pg.waitForTimeout(400);
await input.setInputFiles({ name: 'plano.pdf', mimeType: 'application/pdf', buffer: pdf });
await pg.waitForFunction(() => /plano\.pdf/.test(document.querySelector('.toast')?.textContent ?? ''), null, { timeout: 15000 });
const ink = await pg.evaluate(async () => {
  const img = new Image(); img.src = document.querySelector('#layout image.p-bgimg').getAttribute('href'); await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n;
});
console.log('PDF cargado:', await pg.evaluate(() => document.querySelector('.toast')?.textContent), '· píxeles oscuros:', ink);
if (!ink) errs.push('el PDF se rasterizó en blanco');
await shot('editor.png');
await pg.click('.editor .ctl .btn.pri:last-of-type');
await pg.waitForSelector('#plan image.p-bgimg', { state: 'attached', timeout: 10000 });
await shot('plan_bg.png');
const worker = await pg.evaluate(() => typeof Worker);
console.log('Worker:', worker);
console.log('ERRORS:', errs.length ? errs : 'ninguno');
await b.close();
if (errs.length) process.exit(1);
