#!/usr/bin/env node
// Everything about a page that can be settled without asking a model anything.
//
// The point of this file is cost. A model call is the expensive part of verification and it is also
// the part that can be wrong, so anything a browser can measure directly should be measured directly:
// it costs nothing, it cannot hallucinate, and the number it returns is checkable by hand. What is
// left over — whether a design is any good, whether the artifact matches its brief — is the only
// thing worth paying for.
//
//   node verify.mjs <dir-or-url> [--landscape] [--widths a,b,c] [--json]
//
// Exit code is the number of failing checks, capped at 100, so it drops straight into CI.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const WIDTHS = [320, 390, 480, 600, 768, 900, 1024, 1180, 1280, 1366, 1440, 1512, 1600, 1728, 1920, 2560];
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

/* ── serve a directory, so relative URLs and 404s behave like they will in production ─────────── */
async function serve(dir) {
  const srv = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(dir, rel);
    try {
      const s = await stat(file);
      const target = s.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      // a real 404, not a silent fallback — a missing favicon must be visible as a missing favicon
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/`, stop: () => new Promise(r => srv.close(r)) };
}

/* ── in-page measurement ─────────────────────────────────────────────────────────────────────── */
// One evaluate per width. Runs via CDP rather than an injected <script> because a page with a strict
// CSP will block the injected tag, and refusing to measure a page for being secure is backwards.
const MEASURE = `(() => {
  const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && b.width > 1 && b.height > 1; };
  const all = Array.from(document.querySelectorAll('*'))
    .filter(e => !/^(SCRIPT|STYLE|META|LINK|HEAD|TITLE|BR)$/.test(e.tagName));
  // leaves only: an ancestor's box legitimately contains its children, so counting those as overlaps
  // reports every nested element as a defect
  const leaves = all.filter(e => vis(e) && (e.textContent || '').trim().length > 0 &&
    !Array.from(e.children).some(c => (c.textContent || '').trim().length > 0));
  const txt = e => (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 44);
  const sel = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id
    : (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/)[0] : ''));

  const overlaps = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) overlaps.push({ a: sel(a), b: sel(b), aText: txt(a), bText: txt(b),
      px: { x: Math.round(ox), y: Math.round(oy) }, area: Math.round(ox * oy) });
  }

  // text clipped away by an ancestor that hides its overflow — content that exists and cannot be read
  const clipped = [];
  for (const box of all.filter(e => vis(e) && getComputedStyle(e).overflow !== 'visible')) {
    const rb = box.getBoundingClientRect();
    for (const l of leaves) {
      if (!box.contains(l) || l === box) continue;
      const r = l.getBoundingClientRect();
      const out = Math.max(r.bottom - rb.bottom, rb.top - r.top, r.right - rb.right, rb.left - r.left);
      if (out > 2) clipped.push({ box: sel(box), text: txt(l), outBy: Math.round(out) });
    }
    // The loop above only sees a *child element* pushed outside its clipping ancestor. A box whose own
    // text node overruns it has no leaf to find, so it was invisible here: a fixed-height div holding
    // bare copy is the common case and it clips silently. Compare the box against itself instead.
    // Added 2026-08-17 after a seeded fixed-height note went undetected while a separate checker caught it.
    if (box.clientHeight > 0 && box.scrollHeight - box.clientHeight > 2) {
      const ownText = Array.from(box.childNodes)
        .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      if (ownText) clipped.push({ box: sel(box), text: ownText.slice(0, 40),
        outBy: Math.round(box.scrollHeight - box.clientHeight), self: true });
    }
  }

  // smallest rendered text, and the horizontal-scroll test a phone user meets first
  let min = null;
  for (const l of leaves) {
    const px = parseFloat(getComputedStyle(l).fontSize);
    if (px > 0 && (min === null || px < min.px)) min = { px: Math.round(px * 100) / 100, text: txt(l) };
  }

  const cs = getComputedStyle(document.documentElement);
  return {
    overlaps: overlaps.sort((a, b) => b.area - a.area).slice(0, 8), overlapCount: overlaps.length,
    clipped: clipped.slice(0, 8), clippedCount: clipped.length,
    smallestText: min,
    scrollOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    // container-query units resolving against the viewport is invisible unless you compare the two
    fontVsFrame: (() => {
      const cq = Array.from(all).filter(e => getComputedStyle(e).containerType !== 'normal');
      return cq.slice(0, 6).map(e => ({ sel: sel(e), width: Math.round(e.getBoundingClientRect().width),
        fontPx: Math.round(parseFloat(getComputedStyle(e).fontSize) * 1000) / 1000,
        declaredFont: (e.style.fontSize || '') }));
    })(),
    lang: document.documentElement.lang || '', title: document.title || '',
    landmarks: ['main', 'nav', 'header', 'footer', '[role=main]'].filter(s => document.querySelector(s)),
    focusable: document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length,
    controls: all.filter(e => vis(e) && /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(e.tagName)).length,
    repeatedUnits: (() => {
      const g = new Map();
      for (const e of all.filter(vis)) {
        if ((e.textContent || '').trim().length < 8) continue;
        const cls = typeof e.className === 'string' ? e.className.trim().split(/\\s+/)[0] : '';
        if (!cls) continue;
        const k = e.tagName + '.' + cls;
        g.set(k, (g.get(k) ?? 0) + 1);
      }
      let best = null;
      for (const [k, n] of g) if (n >= 2 && (!best || n > best.n)) best = { key: k, n };
      return best;
    })(),
  };
})()`;

// Contrast is arithmetic, so it is free. WCAG for the legal threshold, APCA Lc because WCAG passes
// things that are genuinely hard to read on light greys.
const CONTRAST = `(() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = s => { const m = (s || '').match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const bgOf = el => { let n = el; while (n && n !== document.documentElement) {
    const b = getComputedStyle(n).backgroundColor; const p = parse(b);
    if (p && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) return p; n = n.parentElement; } return [255, 255, 255]; };
  const apca = (txt, bg) => { const ty = Math.pow(lum(txt), 0.57), by = Math.pow(lum(bg), 0.56);
    return Math.abs(by - ty) * 1.14 * 100; };
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05 || r.width < 1) continue;
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const fg = parse(s.color), bg = bgOf(el);
    if (!fg) continue;
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const lc = apca(fg, bg);
    const lcNeed = px >= 24 ? 60 : px >= 16 ? 75 : 90;
    if (ratio < need || lc < lcNeed) out.push({
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      px: Math.round(px * 10) / 10, ratio: Math.round(ratio * 100) / 100, need,
      lc: Math.round(lc * 10) / 10, lcNeed, ariaHidden: el.closest('[aria-hidden="true"]') !== null,
    });
  }
  return out.slice(0, 20);
})()`;

/* ── the run ─────────────────────────────────────────────────────────────────────────────────── */
export async function verify({ target, widths = WIDTHS, landscape = false, outDir = null, readOnly = false }) {
  const isUrl = /^https?:\/\//.test(target);
  const server = isUrl ? null : await serve(target);
  const url = isUrl ? target : server.url;
  if (outDir) await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const findings = [];
  const add = (id, severity, claim, evidence) => findings.push({ id, severity, claim, evidence });

  try {
    // An authenticated app is a page like any other, but it cannot be reached without its session.
    // GAUNTLET_STATE points at a Playwright storageState file; unset, nothing changes.
    const stateFile = process.env.GAUNTLET_STATE;
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ...(stateFile ? { storageState: stateFile } : {}),
    });
    const page = await ctx.newPage();

    // listeners before goto: a synchronous throw during initial script evaluation is not replayed for
    // a listener that arrives afterwards, which is how a page that throws on every load reads as clean
    const pageErrors = [], consoleErrors = [], failed = [];
    page.on('pageerror', e => pageErrors.push(`${e.name}: ${e.message}`.slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400 && r.status() !== 401 && r.status() !== 403) failed.push(`${r.status()} ${r.url().slice(0, 120)}`); });

    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1200);

    /* runtime health */
    if (pageErrors.length) add('runtime-throw', 'blocker', `the page raises ${pageErrors.length} uncaught JS error(s) on load`, pageErrors.join(' · '));
    if (consoleErrors.length) add('console-error', 'high', `${consoleErrors.length} console error(s) on load`, consoleErrors.slice(0, 3).join(' · '));
    if (failed.length) add('failed-request', 'medium', `${failed.length} request(s) failed`, failed.slice(0, 5).join(' · '));

    /* third-party dependencies — a "self-contained" claim is checkable */
    const hosts = new Set();
    for (const r of await page.evaluate(`(() => performance.getEntriesByType('resource').map(e => e.name))()`)) {
      try { const h = new URL(r).host; if (h && !/^127\.0\.0\.1|localhost/.test(h)) hosts.add(h); } catch {}
    }
    if (hosts.size) add('third-party', 'medium', `loads ${hosts.size} third-party host(s) at runtime`, [...hosts].join(', '));

    /* the width sweep — two viewports cannot describe a curve */
    const rows = [];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: landscape ? Math.round(w * 9 / 16) : 900 });
      await page.waitForTimeout(320);
      const m = await page.evaluate(MEASURE);
      rows.push({ width: w, ...m });
      const bad = m.overlapCount > 0 || m.clippedCount > 0 || m.scrollOverflowPx > 2;
      if (bad && outDir) await page.screenshot({ path: path.join(outDir, `w${w}.png`) }).catch(() => {});
    }

    const overlapAt = rows.filter(r => r.overlapCount > 0).map(r => r.width);
    const clipAt = rows.filter(r => r.clippedCount > 0).map(r => r.width);
    const scrollAt = rows.filter(r => r.scrollOverflowPx > 2).map(r => r.width);
    const worst = rows.reduce((a, r) => (r.overlapCount > (a?.overlapCount ?? -1) ? r : a), null);

    if (overlapAt.length) {
      const ex = worst.overlaps[0];
      add('overlap', 'blocker', `text overlaps text at ${overlapAt.length} of ${widths.length} widths (${overlapAt.join(', ')})`,
        `worst is ${worst.overlapCount} pair(s) at ${worst.width}px${ex ? ` — "${ex.aText}" over "${ex.bText}" (${ex.px.x}x${ex.px.y}px)` : ''}`);
    }
    if (clipAt.length) {
      const w = rows.find(r => r.clippedCount > 0);
      add('clipped', 'blocker', `content is clipped away by its own container at ${clipAt.length} width(s) (${clipAt.join(', ')})`,
        `${w.clippedCount} piece(s) at ${w.width}px — e.g. "${w.clipped[0].text}" is ${w.clipped[0].outBy}px outside ${w.clipped[0].box}`);
    }
    if (scrollAt.length) add('h-scroll', 'high', `horizontal scrolling appears at ${scrollAt.join(', ')}px`,
      `up to ${Math.max(...rows.map(r => r.scrollOverflowPx))}px wider than the viewport`);

    // the trend matters as much as the fact: a defect that worsens as the window widens is a units bug
    const trend = (() => {
      const pts = rows.filter(r => r.overlapCount > 0);
      if (pts.length < 3) return null;
      const first = pts[0], last = pts[pts.length - 1];
      return last.overlapCount > first.overlapCount * 1.5 ? 'worsens as it widens'
        : first.overlapCount > last.overlapCount * 1.5 ? 'worsens as it narrows' : null;
    })();
    if (trend) add('overlap-trend', 'high', `the overlap ${trend}`, `${rows.filter(r => r.overlapCount).map(r => `${r.width}:${r.overlapCount}`).join(' ')}`);

    // container-query units declared on the element that IS the container resolve against the
    // viewport instead. Free to detect: hold the frame width constant and watch the font move.
    const cq = rows.map(r => ({ w: r.width, f: r.fontVsFrame[0] })).filter(x => x.f);
    if (cq.length >= 2) {
      const frames = new Set(cq.map(x => x.f.width)), fonts = new Set(cq.map(x => x.f.fontPx));
      if (frames.size <= 2 && fonts.size > 2) add('cqi-vs-viewport', 'blocker',
        `${cq[0].f.sel} uses a container-query font size that is resolving against the viewport, not its own frame`,
        `frame stays ${[...frames].join('/')}px while font goes ${cq.map(x => `${x.w}→${x.f.fontPx}px`).join(', ')} — proportional to the viewport, not the frame`);
    }

    const tiny = rows.map(r => r.smallestText).filter(Boolean).sort((a, b) => a.px - b.px)[0];
    if (tiny && tiny.px < 9) add('tiny-text', 'high', `text renders at ${tiny.px}px, below any legibility floor`, `"${tiny.text}"`);

    /* structure and keyboard access, at a normal width */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    const base = rows.find(r => r.width === 1440) ?? rows[rows.length - 1];
    if (!base.lang) add('no-lang', 'medium', 'the document declares no language', '<html> has no lang attribute');
    if (!base.title) add('no-title', 'medium', 'the document has no title', '');
    if (!base.landmarks.includes('main') && !base.landmarks.includes('[role=main]'))
      add('no-main', 'low', 'no main landmark, so assistive technology cannot skip to the content', `landmarks present: ${base.landmarks.join(', ') || 'none'}`);

    /* contrast */
    for (const c of (await page.evaluate(CONTRAST)).filter(c => !c.ariaHidden).slice(0, 6))
      add('contrast', c.ratio < c.need ? 'medium' : 'low',
        `"${c.text}" at ${c.px}px fails contrast`, `${c.ratio}:1 against a threshold of ${c.need}; APCA Lc ${c.lc} against ${c.lcNeed}`);

    /* real Tab presses — element.focus() does not match :focus-visible, so a scripted walk reports
       "no focus indicator" for pages that use the modern correct pattern */
    if (base.focusable > 0) {
      await page.evaluate(`(() => { window.__k = []; document.activeElement?.blur(); })()`);
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(`(() => { const el = document.activeElement;
          if (!el || el === document.body) return true;
          if (window.__k.some(r => r.el === el)) return true;
          const s = getComputedStyle(el);
          window.__k.push({ el, f: { ow: s.outlineWidth, os: s.outlineStyle, bs: s.boxShadow, bg: s.backgroundColor } });
          return false; })()`).catch(() => true);
        if (stop) break;
      }
      const walk = await page.evaluate(`(() => { document.activeElement?.blur();
        return window.__k.map(r => { const s = getComputedStyle(r.el);
          const u = { ow: s.outlineWidth, os: s.outlineStyle, bs: s.boxShadow, bg: s.backgroundColor };
          const ring = (parseFloat(r.f.ow) > 0 && r.f.os !== 'none') || (r.f.bs !== 'none' && r.f.bs !== u.bs);
          return { tag: r.el.tagName.toLowerCase(), text: (r.el.textContent || '').trim().slice(0, 24),
            indicated: ring || JSON.stringify(u) !== JSON.stringify(r.f) }; }); })()`);
      const blind = walk.filter(r => !r.indicated);
      if (blind.length) add('no-focus-ring', 'medium', `${blind.length} of ${walk.length} focusable elements show no focus indicator`,
        blind.slice(0, 4).map(b => `${b.tag}:${b.text}`).join(', '));
    }

    /* press every control and report the ones where nothing observably happened */
    if (!readOnly && base.controls > 0) {
      const tagged = await page.evaluate(`(() => Array.from(document.querySelectorAll('button,[role=button],a[href],summary'))
        .filter(e => { const s = getComputedStyle(e), b = e.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && b.width > 1 && b.height > 1; })
        .map((e, i) => { e.setAttribute('data-vfy', String(i));
          return { i, text: (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30) }; }))()`);
      const dead = [];
      for (const c of tagged.slice(0, 14)) {
        const before = await page.evaluate(() => ({ h: document.body.innerHTML.length, u: location.href }));
        let reqs = 0; const onR = () => reqs++;
        page.on('request', onR);
        await page.locator(`[data-vfy="${c.i}"]`).click({ timeout: 3500, force: true }).catch(() => {});
        await page.waitForTimeout(550);
        page.off('request', onR);
        const after = await page.evaluate(() => ({ h: document.body.innerHTML.length, u: location.href })).catch(() => before);
        if (after.h === before.h && after.u === before.u && reqs === 0) dead.push(c.text || `control ${c.i}`);
        if (after.u !== before.u) { await page.goBack({ waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(400); }
      }
      if (dead.length) add('dead-control', 'high', `${dead.length} of ${Math.min(tagged.length, 14)} control(s) did nothing when pressed`, dead.map(d => `"${d}"`).join(', '));
    }

    /* the print path — for anything meant to be handed round as a PDF, this IS an output */
    const pdfPath = outDir ? path.join(outDir, 'print.pdf') : path.join(process.cwd(), '.verify-print.pdf');
    const hasPrintCss = await page.evaluate(`(() => {
      for (const s of document.styleSheets) { try { for (const r of s.cssRules)
        if (r.conditionText?.includes('print') || r.constructor.name === 'CSSPageRule') return true; } catch {} }
      return false; })()`);
    await page.emulateMedia({ media: 'print' });
    const printMeasure = await page.evaluate(MEASURE);
    await page.pdf({ path: pdfPath, landscape, printBackground: true }).catch(() => {});
    await page.emulateMedia({ media: 'screen' });
    if (existsSync(pdfPath)) {
      const buf = await readFile(pdfPath);
      const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      const units = base.repeatedUnits?.n ?? null;
      if (!hasPrintCss) add('no-print-css', units ? 'medium' : 'low', 'no print stylesheet at all — no @media print, no @page, no break control',
        `printing produced ${pages} page(s)${units ? ` for ${units} ${base.repeatedUnits.key} unit(s)` : ''}`);
      if (units && pages && pages < units) add('print-slices', 'medium',
        `${units} content unit(s) print onto ${pages} page(s), so units are cut across page breaks`, `PDF kept at ${pdfPath}`);
      if (printMeasure.overlapCount > base.overlapCount) add('print-overlap', 'medium',
        `layout degrades under print media: ${printMeasure.overlapCount} overlapping pair(s) against ${base.overlapCount} on screen`, '');
    }

    if (outDir) {
      await writeFile(path.join(outDir, 'measured.json'), JSON.stringify({ url, widths, readOnly, rows, findings }, null, 1));
      await page.screenshot({ path: path.join(outDir, 'full.png'), fullPage: true }).catch(() => {});
    }
    return { url, findings, rows, readOnly, cost: 0 };
  } finally {
    await browser.close().catch(() => {});
    if (server) await server.stop();
  }
}

/* ── cli ─────────────────────────────────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--'));
  if (!target) { console.error('usage: node verify.mjs <dir-or-url> [--landscape] [--read-only] [--widths a,b,c] [--out dir] [--json]'); process.exit(1); }
  const flag = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
  const r = await verify({
    target: /^https?:\/\//.test(target) ? target : path.resolve(target),
    landscape: args.includes('--landscape'),
    widths: flag('widths')?.split(',').map(Number) ?? WIDTHS,
    outDir: flag('out'),
    readOnly: args.includes('--read-only'),
  });
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 1)); }
  else {
    const order = { blocker: 0, high: 1, medium: 2, low: 3 };
    console.log(`\n${r.findings.length} finding(s) — measured, $0.00, no model involved\n`);
    for (const f of r.findings.sort((a, b) => order[a.severity] - order[b.severity]))
      console.log(`[${f.severity}] ${f.claim}\n    ${f.evidence}\n`);
  }
  process.exit(Math.min(100, r.findings.length));
}
