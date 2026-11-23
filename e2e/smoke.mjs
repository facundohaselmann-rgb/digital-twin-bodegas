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
await pg.click('nav button:nth-child(3)'); await pg.waitForTimeout(300); await shot('config.png');
// editar dotación del turno día (sorting = 1) y verificar que se re-simula
const before = await pg.evaluate(() => document.querySelector('.runinfo')?.textContent);
const inp = pg.locator('.shift').first().locator('.staffgrid input').nth(2);
await inp.fill('1'); await inp.press('Tab');
await pg.waitForFunction(b => document.querySelector('.runinfo')?.textContent !== b, before, { timeout: 10000 });
// cambiar idioma
await pg.click('.langsw button:nth-child(2)'); await pg.waitForTimeout(300);
const navEn = await pg.evaluate(() => document.querySelector('nav')?.textContent);
console.log('nav EN:', navEn);
await pg.click('nav button:nth-child(1)'); await pg.waitForTimeout(500); await shot('plan_en.png');
const worker = await pg.evaluate(() => typeof Worker);
console.log('Worker:', worker);
console.log('ERRORS:', errs.length ? errs : 'ninguno');
await b.close();
if (errs.length) process.exit(1);
