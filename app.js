/* Cosmic launch pack: presentation site. Data from data.json (tools/site_build.py). No framework. */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { blue: '#362cff', cream: '#ece9e0', ink: '#171726', sun: '#fdba31', fire: '#ef5541', pink: '#df7289', white: '#ffffff' };
const PAINT = ['blue', 'ink', 'cream', 'sun', 'fire', 'pink'];
let D, B; // data, boards
const DEMO = false; // true hides every download (review mode)
const LOCKED = 'Downloads open once the pack is approved';
if (DEMO) document.documentElement.classList.add('demo');

/* ── utilities ─────────────────────────────────────────── */
const toastEl = $('#toast'); let toastT;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2200); }
async function copy(text, what = 'Copied') { try { await navigator.clipboard.writeText(text); toast(`${what}`); } catch { toast('Copy not allowed here'); } }
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function saveUrl(url, name) { const a = document.createElement('a'); a.href = url; a.download = name || ''; document.body.append(a); a.click(); a.remove(); }
const svgCache = new Map();
async function svgText(src) { if (!svgCache.has(src)) svgCache.set(src, fetch(src).then(r => r.text())); return svgCache.get(src); }
function tintSvg(txt, hex) { return txt.replace(/(fill|stroke)="#[0-9a-fA-F]{6}"/g, `$1="${hex}"`); }
const dataUrl = (txt) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt);
async function tinted(src, colour) { const t = await svgText(src); return colour ? tintSvg(t, COL[colour] || colour) : t; }
async function svgToPng(txt, size = 1024, bg) {
  const img = new Image(); img.src = dataUrl(txt); await img.decode();
  const r = img.naturalWidth / img.naturalHeight || 1; const w = r >= 1 ? size : Math.round(size * r), hh = r >= 1 ? Math.round(size / r) : size;
  const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, hh); } x.drawImage(img, 0, 0, w, hh);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
const fileName = (s) => s.replace(/[^\w\-. ]+/g, '').trim();
/* make an SVG self-contained: every relative href (image, use) becomes a data: URL */
async function inlineRefs(txt, base) {
  const refs = [...new Set([...txt.matchAll(/(?:xlink:)?href="(?!#|data:|https?:)([^"]+)"/g)].map(m => m[1]))];
  for (const r of refs) { try { const res = await fetch(new URL(r, new URL(base || '.', location.href))); const blob = await res.blob();
    const url = await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(blob); }); txt = txt.split(`"${r}"`).join(`"${url}"`); } catch {} }
  return txt;
}
/* copy SVG markup so it pastes as vectors (Figma, Illustrator, Canva); plain text as the fallback */
async function copySvg(txt, base) {
  txt = await inlineRefs(txt, base); let done = false;
  try { if (window.ClipboardItem && navigator.clipboard.write && (!ClipboardItem.supports || ClipboardItem.supports('image/svg+xml'))) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([txt], { type: 'text/plain' }), 'image/svg+xml': new Blob([txt], { type: 'image/svg+xml' }) })]); done = true; } } catch {}
  if (!done) { try { await navigator.clipboard.writeText(txt); done = true; } catch {} }
  toast(done ? 'SVG copied — paste into Figma, Illustrator or Canva' : 'Copy not allowed here');
}
/* a zip of files fetched from the site: entries are [path-in-zip, href] */
async function zipFiles(entries, name, extra) {
  if (!window.JSZip) return toast('Zip library did not load');
  const z = new JSZip(); toast(`Preparing ${entries.length} files…`);
  for (const [path, href] of entries) z.file(path, await fetch(href).then(r => r.blob()));
  if (extra) Object.entries(extra).forEach(([k, v]) => z.file(k, v));
  saveBlob(await z.generateAsync({ type: 'blob' }), fileName(name) + '.zip'); toast('Download ready');
}
const setOf = (id) => D.sets.find(s => s.id === id);
/* editables: every place that offers a PNG also offers Canva + Illustrator + the full package.
   ed = { canva: [{label, href}], ai, aiLabel, pkg, pkgSize }; one .ai holds the whole set as artboards */
const unit = (s) => s.kind === 'print' ? 'pieces' : 'designs';
const aiLabelOf = (s) => s.boards.length > 1 ? `Illustrator · ${s.label.toLowerCase()} set (all ${s.boards.length} ${unit(s)})` : `Illustrator · ${s.label.toLowerCase()}`;
const edOf = (b) => { if (!b || b.nodl || !b.ai) return null; const s = setOf(b.set);
  return { canva: b.canva ? [{ label: 'Canva', href: b.canva }] : [], ai: b.ai, aiLabel: aiLabelOf(s), pkg: b.package, pkgSize: s.packageSize }; };
const canvaOf = (list) => list.filter(d => d.kind === 'canva').map(d => ({ label: d.label.replace('Canva template', 'Canva'), href: d.href }));
const edSet = (s) => s.nodl ? null : ({ canva: canvaOf(s.downloads), ai: s.ai, aiLabel: aiLabelOf(s), pkg: s.package, pkgSize: s.packageSize });
function edHtml(ed, o = {}) {
  if (!ed || DEMO) return '';
  const cls = o.cls || 'btn btn-line btn-s', ext = 'target="_blank" rel="noopener"';
  return ed.canva.map(c => `<a class="${cls}" data-ed="canva" href="${c.href}" download>${esc(c.label)}</a>`).join('')
    + (ed.ai ? `<a class="${cls}" data-ed="ai" href="${ed.ai}" ${ext}${o.short ? ` title="${esc(ed.aiLabel)}"` : ''}>${esc(o.short ? 'Illustrator' : ed.aiLabel)}</a>` : '')
    + (ed.pkg ? `<a class="${cls}" data-ed="pkg" href="${ed.pkg}" ${ext}>Full package${ed.pkgSize ? ' · ' + esc(ed.pkgSize) : ''}</a>` : '');
}
const packLabel = () => `Download the complete pack${D.fullPackageSize ? ` <small>· ${esc(D.fullPackageSize)}</small>` : ''}`;
const isStory = (b) => b.h >= 1900 && b.w < 1200;
const avatar = () => B['profile/01-comet']?.img || '';
const handle = 'cosmic';
const hashSpan = (t) => esc(t).replace(/(#\w+)/g, '<span class="h">$1</span>');

/* tint any <img data-tint> that points at a single-colour SVG */
async function applyTints(root = document) {
  for (const im of $$('img[data-tint]', root)) { const src = im.dataset.src || im.getAttribute('src'); im.dataset.src = src; im.src = dataUrl(await tinted(src, im.dataset.tint.trim())); }
  for (const im of $$('img[data-map]', root)) { const src = im.dataset.src || im.getAttribute('src'); im.dataset.src = src; const pairs = Object.fromEntries(im.dataset.map.split(',').map(x => x.split(':').map(s => s.toLowerCase())));
    const txt = (await svgText(src)).replace(/(fill|stroke)="(#[0-9a-fA-F]{6})"/g, (m, k, c) => `${k}="${pairs[c.toLowerCase()] || c}"`); im.src = dataUrl(txt); }
}

/* ── zips (in the browser, no duplicates on the server) ── */
async function zipBoards(ids, name, withCaptions = true) {
  if (DEMO) return toast(LOCKED);
  if (!window.JSZip) return toast('Zip library did not load');
  const z = new JSZip(); let n = 0; const lines = [];
  toast(`Preparing ${ids.length} files…`);
  for (const id of ids) {
    const b = B[id]; const blob = await fetch(b.png).then(r => r.blob()); z.file(`${b.set}/${b.name}.png`, blob); n++;
    if (withCaptions && (b.caption || b.alt)) lines.push(`${b.set}/${b.name}\n${b.caption ? 'Caption: ' + b.caption + '\n' : ''}${b.hashtags ? 'Hashtags: ' + b.hashtags + '\n' : ''}${b.alt ? 'Alt: ' + b.alt + '\n' : ''}`);
    if (n % 10 === 0) toast(`Packing ${n} / ${ids.length}…`);
  }
  if (lines.length) z.file('Captions.txt', lines.join('\n'));
  const blob = await z.generateAsync({ type: 'blob' }); saveBlob(blob, fileName(name) + '.zip'); toast('Download ready');
}

/* ── boot ─────────────────────────────────────────────── */
fetch('data.json').then(r => r.json()).then(d => { D = d; B = d.boards; init(); });

function init() {
  hero(); phone('grid'); campaign(); rebrand(); library(); brand(); icons(); voice(); printSec(); uniform(); mockups(); downloads();
  applyTints(); chrome();
}

/* ── chrome: nav state, reveal ────────────────────────── */
function chrome() {
  const top = $('.top'); addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 30), { passive: true });
  const links = $$('.top-nav a'); const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { links.forEach(a => a.classList.remove('on')); map.get(e.target.id)?.classList.add('on'); } }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section').forEach(s => io.observe(s));
  const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }), { threshold: .12 });
  $$('.sec-head, .block, .phase, .lib-set, .line-card, .pc').forEach(e => { e.classList.add('rv'); rv.observe(e); });
  document.addEventListener('keydown', e => {
    const open = $$('.modal:not([hidden])').pop(); if (!open) return;
    if (e.key === 'Tab') { const f = $$('button:not([disabled]), a[href], [tabindex="0"]', open).filter(x => x.offsetParent !== null || x === document.activeElement); if (f.length) { const a = f[0], z = f[f.length - 1];
      if (!open.contains(document.activeElement)) { e.preventDefault(); a.focus(); } else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } }
    if (e.key === 'Escape') closeModal(open);
    if (e.key === 'ArrowRight') open._next?.(); if (e.key === 'ArrowLeft') open._prev?.();
  });
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); }));
}
function openModal(m) { m.hidden = false; document.body.style.overflow = 'hidden'; m.querySelector('.x')?.focus(); }
function closeModal(m) { m.hidden = true; m._close?.(); m._close = null; if (!$$('.modal:not([hidden])').length) document.body.style.overflow = ''; }

/* ── hero ─────────────────────────────────────────────── */
function hero() {
  const s = D.stats;
  const fan = ['meet-arlo/01-cover', 'reveal/01-post', 'what-we-do/01-cover'].filter(id => B[id]);
  $('#fan').innerHTML = fan.map(id => `<button aria-label="Open ${esc(B[id].title)}"><img src="${B[id].img}" alt="${esc(B[id].alt)}"></button>`).join('');
  $$('#fan button').forEach((b, k) => b.addEventListener('click', () => openBoard(fan[k])));
  const hp = $('#heroPack'); if (hp) { hp.href = D.fullPackage; hp.target = '_blank'; hp.rel = 'noopener'; hp.innerHTML = packLabel(); hp.hidden = DEMO; }
  $('#heroStats').innerHTML = [[s.boards, 'designs'], [s.sets, 'sets'], [s.social, 'social posts'], [s.teaserShare + '%', 'teaser'], [s.print, 'print'], [D.mockups.length, 'mockups']]
    .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
}

/* ── the phone ────────────────────────────────────────── */
const IC = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.8"><path d="M12 20s-7-4.4-9.2-8.7C1.3 8.2 3.3 4.5 6.8 4.5c2 0 3.4 1.1 4.2 2.4.8-1.3 2.2-2.4 4.2-2.4 3.5 0 5.5 3.7 4 6.8C19 15.6 12 20 12 20z"/></svg>',
  com: '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.8"><path d="M20 12a8 8 0 1 1-3.3-6.5A8 8 0 0 1 20 12zM20 20l-2.6-2.6"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.8"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  multi: '<svg class="multi" viewBox="0 0 24 24" fill="#fff"><path d="M7 3h14v14h-2V5H7z"/><rect x="3" y="7" width="14" height="14" rx="1"/></svg>',
};
let phoneStory;
function phone(view) {
  const scr = $('#phoneScreen'); phoneStory?.stop(); scr.scrollTop = 0;
  $$('#feed .seg-btn').forEach(b => { const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  if (view === 'stories') { scr.innerHTML = '<div class="st"></div>'; phoneStory = storyPlayer($('.st', scr), D.stories, { loop: true, note: $('#feedHelp'), noteDefault: $('#feedHelp').dataset.def }); return; }
  $('#feedHelp').textContent = $('#feedHelp').dataset.def || $('#feedHelp').textContent; $('#feedHelp').dataset.def = $('#feedHelp').textContent;
  const status = `<div class="ig-status"><span>9:41</span><span>●●● 5G ▮</span></div>`;
  if (view === 'grid') {
    scr.innerHTML = `<div class="ig">${status}
      <div class="ig-bar"><span>${handle} ⌄</span><span>☰</span></div>
      <div class="ig-head"><div class="ig-av"><img src="${avatar()}" alt="Cosmic avatar"></div>
        <div class="ig-stats"><div><b>${D.feed.length}</b>posts</div><div><b>—</b>followers</div><div><b>—</b>following</div></div></div>
      <div class="ig-bio"><b>Cosmic</b><br>Property services. Done properly.<br>Owner-led. Austin-built. Painting · landscaping · property work.<br>We care, it shows.</div>
      <div class="ig-btns"><span class="b">Follow</span><span>Message</span><span>Estimate</span></div>
      <div class="ig-hl">${D.highlights.map((x, i) => `<button data-hl="${i}" aria-label="Highlight ${esc(x.label)}"><div class="ring"><img src="${B[x.cover].img}" alt=""></div><small>${esc(x.label)}</small></button>`).join('')}</div>
      <div class="ig-tabs"><span class="on">▦</span><span>▶</span><span>☺</span></div>
      <div class="ig-grid">${D.feed.map((p, i) => `<button class="ig-cell" data-post="${i}" aria-label="${esc(setOf(p.set).label)}"><img loading="lazy" src="${B[p.slides[0]].img}" alt="${esc(B[p.slides[0]].alt)}">${p.slides.length > 1 ? IC.multi : ''}</button>`).join('')}</div></div>`;
  } else {
    scr.innerHTML = `<div class="ig">${status}<div class="ig-bar"><span style="font-family:Georgia,serif;font-style:italic">Instagram</span><span>♡ ✉</span></div>
      ${D.feed.map((p, i) => { const b0 = B[p.slides[0]]; const s = setOf(p.set); const cap = b0.caption || s.caption || '';
        return `<article class="ig-post"><div class="ig-post-head"><img src="${avatar()}" alt=""><div><b>${handle}</b><small>Austin, Texas</small></div></div>
        <div class="ig-media"><div class="ig-track" data-i="${i}">${p.slides.map(id => `<img loading="lazy" src="${B[id].img}" alt="${esc(B[id].alt)}">`).join('')}</div>
        ${p.slides.length > 1 ? `<span class="ig-count">1/${p.slides.length}</span>` : ''}</div>
        <div class="ig-acts">${IC.heart}${IC.com}${IC.send}<span class="sv">${IC.save}</span></div>
        ${p.slides.length > 1 ? `<div class="ig-dots">${p.slides.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>` : ''}
        <div class="ig-cap"><b>${handle}</b> ${hashSpan(cap.length > 120 ? cap.slice(0, 120) + '…' : cap)}</div>
        <button class="ig-more" data-post="${i}">View post and files</button></article>`; }).join('')}</div>`;
    $$('.ig-track', scr).forEach(tr => tr.addEventListener('scroll', () => {
      const k = Math.round(tr.scrollLeft / tr.clientWidth), art = tr.closest('.ig-post');
      $$('.ig-dots i', art).forEach((d, j) => d.classList.toggle('on', j === k)); const c = $('.ig-count', art); if (c) c.textContent = `${k + 1}/${tr.children.length}`;
    }, { passive: true }));
  }
  $$('.ig-track', scr).forEach(tr => $$('img', tr).forEach((im, k) => { im.style.cursor = 'zoom-in'; im.addEventListener('click', () => openPost(D.feed[+tr.dataset.i].slides, k)); }));
  $$('[data-post]', scr).forEach(b => b.addEventListener('click', () => { const p = D.feed[+b.dataset.post]; openPost(p.slides, 0); }));
  $$('[data-hl]', scr).forEach(b => b.addEventListener('click', () => { const x = D.highlights[+b.dataset.hl]; openStories(x.stories.length ? x.stories : [x.cover]); }));
}
$$('#feed .seg-btn').forEach(b => b.addEventListener('click', () => phone(b.dataset.view)));

/* ── story player (inline in the phone, or in the modal) ── */
function storyPlayer(host, ids, { loop = false, onEnd, note, noteDefault } = {}) {
  const DUR = 5500; let i = 0, t0 = 0, paused = false, raf, elapsed = 0, dead = false;
  host.innerHTML = `<div class="st-bars">${ids.map(() => '<i><b></b></i>').join('')}</div>
    <div class="st-who"><img src="${avatar()}" alt=""><span>${handle}</span></div><img class="st-img" alt="">
    <button class="st-tap l" aria-label="Previous story"></button><button class="st-tap r" aria-label="Next story"></button>`;
  const bars = $$('.st-bars b', host), img = $('.st-img', host);
  function show(k) {
    i = k; elapsed = 0; t0 = performance.now(); const b = B[ids[i]]; img.src = b.img; img.alt = b.alt || b.title;
    bars.forEach((x, j) => x.style.width = j < i ? '100%' : '0%');
    if (note) note.textContent = b.note ? `Sticker: ${b.note.replace(/^(Link )?[Ss]ticker:\s*/, '')}` : (b.caption || b.title || '');
  }
  function next() { if (i < ids.length - 1) show(i + 1); else if (loop) show(0); else { stop(); onEnd?.(); } }
  function prev() { show(Math.max(0, i - 1)); }
  function tick(now) { if (dead) return; if (!paused) { elapsed = now - t0; bars[i].style.width = Math.min(100, elapsed / DUR * 100) + '%'; if (elapsed >= DUR) next(); } else t0 = now - elapsed; raf = requestAnimationFrame(tick); }
  function stop() { dead = true; cancelAnimationFrame(raf); if (note && noteDefault) note.textContent = noteDefault; }
  $('.st-tap.l', host).addEventListener('click', prev); $('.st-tap.r', host).addEventListener('click', next);
  host.addEventListener('pointerdown', () => paused = true); host.addEventListener('pointerup', () => paused = false); host.addEventListener('pointerleave', () => paused = false);
  show(0); raf = requestAnimationFrame(tick);
  return { stop, next, prev };
}
let modalStory;
function openStories(ids, start = 0) {
  const m = $('#storyModal'); openModal(m); const list = ids.slice(start).concat(ids.slice(0, start));
  $('#storyScreen').innerHTML = '<div class="st"></div>';
  modalStory = storyPlayer($('#storyScreen .st'), list, { onEnd: () => closeModal(m), note: $('#storyNote') });
  m._next = () => modalStory.next(); m._prev = () => modalStory.prev(); m._close = () => modalStory.stop();
}

/* ── post viewer ──────────────────────────────────────── */
function openPost(ids, start = 0) {
  const m = $('#postModal'); let i = start; const b0 = B[ids[0]]; const s = setOf(b0.set);
  const slides = $('#pmSlides'), dots = $('#pmDots');
  function render() {
    const b = B[ids[i]]; slides.innerHTML = `<img src="${b.img}" alt="${esc(b.alt || b.title)}">`;
    dots.innerHTML = ids.length > 1 ? ids.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('') : '';
    $('#pmPrev').disabled = i === 0; $('#pmNext').disabled = i === ids.length - 1;
    const cap = b.caption || s.caption || '', tags = b.hashtags || s.hashtags || '';
    $('#pmSide').innerHTML = `<p class="label">${esc(s.label)} · ${esc(s.channel)}${ids.length > 1 ? ` · ${i + 1} / ${ids.length}` : ''}</p>
      <h3 class="caps">${esc(b.ctitle || (ids.length > 1 && s.sequence ? s.label : b.title))}</h3>
      ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
      ${cap ? `<p class="cap">${esc(cap)}</p>` : ''}${tags ? `<p class="h">${esc(tags)}</p>` : ''}
      ${b.alt ? `<details><summary>Alt text</summary><p>${esc(b.alt)}</p></details>` : ''}
      <div class="dls">
        ${cap ? `<button class="btn btn-line btn-s" data-copy>Copy caption</button>` : ''}
        ${s.nodl ? '' : `<a class="btn btn-blue btn-s" href="${b.png}" download="${esc(b.name)}.png">Download this ${isStory(b) ? 'story' : 'design'} · PNG ${b.w}×${b.h}</a>
        ${ids.length > 1 ? `<button class="btn btn-line btn-s" data-zip>All ${ids.length} slides · ZIP</button>` : ''}`}
        ${edHtml(edOf(b))}
      </div>`;
    $('[data-copy]', m)?.addEventListener('click', () => copy(`${cap}\n\n${tags}`.trim(), 'Caption copied'));
    $('[data-zip]', m)?.addEventListener('click', () => zipBoards(ids, `Cosmic - ${s.label}`));
  }
  m._next = () => { if (i < ids.length - 1) { i++; render(); } }; m._prev = () => { if (i > 0) { i--; render(); } };
  $('#pmNext').onclick = m._next; $('#pmPrev').onclick = m._prev;
  let x0 = null; slides.onpointerdown = e => x0 = e.clientX; slides.onpointerup = e => { if (x0 === null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 40) (dx < 0 ? m._next : m._prev)(); x0 = null; };
  render(); openModal(m);
}
function openBoard(id) { const b = B[id]; const s = setOf(b.set); const list = s.boards; const k = list.indexOf(id);
  if (s.kind === 'merch') return lightbox(list.map(merchItem), k);
  if (s.kind === 'rebrand') { const g = list.filter(x => B[x].group === b.group); return openPost(g, g.indexOf(id)); }
  if (isStory(b) && (s.kind === 'stories' || s.kind === 'mixed')) return openStories(list.filter(x => isStory(B[x])), Math.max(0, list.filter(x => isStory(B[x])).indexOf(id)));
  openPost(s.kind === 'carousel' || s.sequence ? list : [id], s.kind === 'carousel' || s.sequence ? k : 0); }

/* ── campaign ─────────────────────────────────────────── */
function campaign() {
  const t = D.stats.teaserShare;
  $('#campaignLead').textContent = `${t}% of the social posts tease, introduce the characters and reveal the new brand. The rest introduces Cosmic, one website section at a time.`;
  $('#share').innerHTML = `<div class="a" style="flex:${t}">Tease · meet · reveal ${t}%</div><div class="b" style="flex:${100 - t}">Introduce · keep going ${100 - t}%</div>`;
  $('#phases').innerHTML = D.campaign.map((p, n) => `<li class="phase"><p class="label">Phase ${n + 1} · ${esc(p.phase)}</p><h3 class="caps">${esc(p.title)}</h3><p>${esc(p.text)}</p>
    <div class="phase-items">${p.items.map((it, k) => { const s = setOf(it.set); const id = it.board || s.boards[0]; const many = it.board ? 0 : s.boards.length;
      return `<button data-p="${n}" data-k="${k}" aria-label="${esc(s.label)}"><img loading="lazy" src="${B[id].img}" alt="">${many > 1 ? `<span class="badge">${many}</span>` : ''}</button>`; }).join('')}</div></li>`).join('');
  $$('#phases [data-p]').forEach(b => b.addEventListener('click', () => { const it = D.campaign[+b.dataset.p].items[+b.dataset.k]; const s = setOf(it.set);
    if (it.board) return openBoard(it.board); if (s.kind === 'stories') return openStories(s.boards); openPost(s.boards, 0); }));
}

/* ── library ──────────────────────────────────────────── */
let libChan = 'All', libView = 'sets';
function library() {
  const chans = ['All', ...new Set(D.sets.map(s => s.channel))];
  $('#libChips').innerHTML = chans.map(c => `<button class="chip${c === libChan ? ' on' : ''}" data-c="${c}">${c}<small>${c === 'All' ? D.stats.boards : D.sets.filter(s => s.channel === c).reduce((a, s) => a + s.boards.length, 0)}</small></button>`).join('');
  $$('#libChips .chip').forEach(b => b.addEventListener('click', () => { libChan = b.dataset.c; library(); }));
  $$('[data-lib]').forEach(b => b.onclick = () => { libView = b.dataset.lib; $$('[data-lib]').forEach(x => x.classList.toggle('on', x === b)); renderLib(); });
  $('#libSearch').oninput = renderLib; renderLib();
}
function cardHtml(id, hgt) {
  const b = B[id]; const w = Math.min(Math.round(hgt * b.w / b.h), 760);
  return `<div class="card" style="width:${libView === 'sets' ? w + 'px' : 'auto'}"><button class="im" data-open="${id}" style="${libView === 'sets' ? `height:${hgt}px;width:${w}px` : ''};border:0;padding:0;display:block;width:100%" aria-label="Open ${esc(b.title)}">
    <img loading="lazy" src="${b.img}" alt="${esc(b.alt || b.title)}"></button>
    <div class="cap"><span>${esc(b.title)}</span>${b.nodl ? '' : `<a class="dl" href="${b.png}" download="${esc(b.name)}.png" aria-label="Download PNG">PNG</a>`}</div></div>`;
}
function renderLib() {
  const q = $('#libSearch').value.trim().toLowerCase();
  const match = id => { const b = B[id]; return !q || `${b.title} ${b.caption} ${b.alt} ${setOf(b.set).label}`.toLowerCase().includes(q); };
  const sets = D.sets.filter(s => libChan === 'All' || s.channel === libChan);
  const body = $('#library-body');
  if (libView === 'grid') {
    const ids = sets.flatMap(s => s.boards).filter(match);
    body.innerHTML = ids.length ? `<div class="grid-all">${ids.map(id => cardHtml(id, 300)).join('')}</div>` : '<p class="empty">Nothing matches that search.</p>';
  } else {
    const html = sets.map(s => { const ids = s.boards.filter(match); if (!ids.length) return '';
      const hg = s.kind === 'banners' ? 210 : s.kind === 'email' ? 520 : s.kind === 'print' ? 300 : 330;
      return `<div class="lib-set"><div class="lib-set-head"><div><p class="label">${esc(s.channel)} · ${ids.length} design${ids.length > 1 ? 's' : ''}</p><h3 class="caps">${esc(s.label)}</h3>${s.intro || s.sub ? `<p>${esc(s.intro || s.sub)}</p>` : ''}</div>
        ${s.nodl ? '' : `<div class="meta"><button class="btn btn-blue btn-s" data-zipset="${s.id}">Download set · ZIP</button>${edHtml(edSet(s))}</div>`}</div>
        <div class="strip">${ids.map(id => cardHtml(id, hg)).join('')}</div></div>`; }).join('');
    body.innerHTML = html || '<p class="empty">Nothing matches that search.</p>';
  }
  $$('[data-open]', body).forEach(b => b.addEventListener('click', () => openBoard(b.dataset.open)));
  $$('[data-zipset]', body).forEach(b => b.addEventListener('click', () => { const s = setOf(b.dataset.zipset); zipBoards(s.boards, `Cosmic - ${s.label}`); }));
}

/* ── brand ────────────────────────────────────────────── */
function paintRow(host, current, onPick, list = PAINT) {
  host.innerHTML = list.map(c => `<button class="dot${c === current ? ' on' : ''}" data-c="${c}" style="background:${COL[c]}" aria-label="${c}" title="${c}"></button>`).join('');
  $$('.dot', host).forEach(b => b.addEventListener('click', () => { $$('.dot', host).forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.c); }));
}
const groundFor = c => c === 'cream' ? COL.blue : c === 'sun' || c === 'pink' ? COL.ink : COL.cream;
const artText = (item, colour) => item.mono && colour ? tinted(item.src, colour) : svgText(item.src);
async function downloadArt(item, colour, png = false, bg) {
  if (DEMO) return toast(LOCKED);
  const txt = await artText(item, colour); const nm = `${/^cosmic-/.test(item.name) ? '' : 'cosmic-'}${item.name}${colour && item.mono ? '-' + colour : ''}`;
  if (png) saveBlob(await svgToPng(txt, 1600, bg), `${nm}.png`);
  else saveBlob(new Blob([txt], { type: 'image/svg+xml' }), `${nm}.svg`);
  toast(`Downloaded ${item.label || item.name}`);
}
/* hover actions on a tile or card: Copy SVG + SVG download, without opening the preview */
function tileActs(btn, item, colour, host) {
  const box = h(`<span class="tacts"><span class="tact" role="button" tabindex="0" data-a="copy">Copy SVG</span><span class="tact" role="button" tabindex="0" data-a="dl">SVG ↓</span></span>`);
  const run = (a, e) => { e.stopPropagation(); e.preventDefault(); a === 'copy' ? artText(item, colour).then(t => copySvg(t, item.src)) : downloadArt(item, colour); };
  $$('.tact', box).forEach(t => { t.addEventListener('click', e => run(t.dataset.a, e)); t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') run(t.dataset.a, e); }); });
  (host || btn).append(box);
}
function brand() {
  const L = Object.fromEntries(D.brand.logos.map(l => [l.name, l]));
  const logoCards = [['cosmic-comet', 'cream', 'g-blue', 'Comet wordmark · on blue'], ['cosmic-comet', 'blue', 'g-cream', 'Comet wordmark · on cream'],
    ['cosmic-comet', 'cream', 'g-ink', 'Comet wordmark · on ink'], ['cosmic-burst', 'blue', 'g-cream', 'Burst wordmark'],
    ['cosmic-arlo-mark', 'cream', 'g-blue', 'Arlo mark · stacked'], ['arlo-curl', 'ink', 'g-sun', 'Arlo curl · avatar, stickers']].filter(x => L[x[0]]);
  $('#logos').innerHTML = logoCards.map(([n, c, g, l], k) => `<button class="logo-card ${g}" data-k="${k}"><img data-tint="${c}" src="${L[n].src}" alt="${esc(l)}"><div class="row"><span>${l}</span><span class="ra"></span></div></button>`).join('');
  const GR = { 'g-blue': 'blue', 'g-cream': 'cream', 'g-ink': 'ink', 'g-sun': 'sun' };
  const logoItems = logoCards.map(([n, c, g, l]) => artItem(L[n], c, GR[g], l, 'Logo'));
  $$('#logos .logo-card').forEach(b => { const [n, c] = logoCards[+b.dataset.k]; tileActs(b, L[n], c, $('.ra', b)); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(L[n], c, true); lightbox(logoItems, +b.dataset.k, b); }); });
  // colour
  $('#swatches').innerHTML = D.brand.palette.map(p => `<button class="sw" style="background:${p.hex};color:${p.ink}${p.hex === '#ECE9E0' ? ';box-shadow:inset 0 0 0 3px #171726' : ''}" data-hex="${p.hex}"><b>${p.name}</b><span>${p.hex} · ${p.role}</span></button>`).join('');
  $$('#swatches .sw').forEach(b => b.addEventListener('click', () => copy(b.dataset.hex, `${b.dataset.hex} copied`)));
  $('#usage').innerHTML = D.brand.palette.map(p => `<div style="flex:${p.share};background:${p.hex}" title="${p.name}"></div>`).join('');
  // type
  const ts = $('#typeSample'); const upd = () => { ts.style.fontWeight = $('#tw').value; ts.style.fontSize = $('#ts').value + 'px'; };
  $('#tw').oninput = upd; $('#ts').oninput = upd; upd();
  $$('#tcase .seg-btn').forEach(b => b.onclick = () => { $$('#tcase .seg-btn').forEach(x => x.classList.toggle('on', x === b)); ts.style.textTransform = b.dataset.case; });
  // lettering
  const letters = D.brand.lettering.filter(l => !/^(join-2|at-a-working|hero-lockup)$/.test(l.name));
  $('#lettering').innerHTML = letters.map((l, k) => `<button class="tile" data-k="${k}" title="${esc(l.label)}"><img ${l.mono ? 'data-tint="blue"' : ''} src="${l.src}" alt="${esc(l.label)}"><span class="nm">${esc(l.label)}</span></button>`).join('');
  const letterItems = letters.map(l => artItem(l, 'blue', 'cream', l.label, 'Lettering'));
  $$('#lettering .tile').forEach(b => { tileActs(b, letters[+b.dataset.k], 'blue'); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(letters[+b.dataset.k], 'blue', true); lightbox(letterItems, +b.dataset.k, b); }); });
  // Arlo
  const poses = D.brand.arlo.filter(a => a.mono); let arloC = 'blue';
  const drawArlo = async () => { $('#arloPoses').innerHTML = poses.map((a, k) => `<button class="tile" data-k="${k}" style="background:${groundFor(arloC)}"><img data-tint="${arloC}" src="${a.src}" alt="Arlo pose ${k + 1}"></button>`).join('');
    $$('#arloPoses .tile').forEach(b => { tileActs(b, poses[+b.dataset.k], arloC); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(poses[+b.dataset.k], arloC, true); lightbox(poses.map((a, k) => artItem(a, arloC, groundFor(arloC), `Arlo, pose ${k + 1}`, 'Character')), +b.dataset.k, b); }); }); applyTints($('#arloPoses')); };
  paintRow($('#arloPaint'), arloC, c => { arloC = c; drawArlo(); }); drawArlo();
  // Cosmo
  const cos = D.brand.cosmo.filter(c => !/^cosmo-(07|08|11|18|walk-arlo)$/.test(c.name));
  $('#cosmoGrid').innerHTML = cos.map((c, k) => `<button class="tile" data-k="${k}"><img loading="lazy" src="${c.src}" alt="Cosmo illustration"></button>`).join('');
  const cosItems = cos.map((c, k) => artItem(c, null, 'cream', `Cosmo, scene ${k + 1}`, 'Guest character'));
  $$('#cosmoGrid .tile').forEach(b => { tileActs(b, cos[+b.dataset.k], null); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(cos[+b.dataset.k], null, true); lightbox(cosItems, +b.dataset.k, b); }); });
  // stickers
  const st = D.brand.stickers.filter(s => !/^shape-/.test(s.name) && s.ar > 0.4); let stC = 'ink';
  const drawSt = () => { $('#stickers').innerHTML = st.map((s, k) => `<button class="tile" data-k="${k}" style="background:${groundFor(stC)}"><img ${s.mono ? `data-tint="${stC}"` : ''} loading="lazy" src="${s.src}" alt="${esc(s.label)}"></button>`).join('');
    $$('#stickers .tile').forEach(b => { tileActs(b, st[+b.dataset.k], stC); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(st[+b.dataset.k], stC, true); lightbox(st.map(s => artItem(s, stC, groundFor(stC), s.label, 'Sticker')), +b.dataset.k, b); }); }); applyTints($('#stickers')); };
  paintRow($('#stickerPaint'), stC, c => { stC = c; drawSt(); }, ['ink', 'blue', 'cream']); drawSt();
  // highlight covers
  $('#hlCovers').innerHTML = D.highlights.map((x, i) => `<button data-i="${i}"><div class="ring"><img src="${B[x.cover].img}" alt=""></div><small>${esc(x.label)}</small></button>`).join('');
  $$('#hlCovers button').forEach(b => b.addEventListener('click', () => { const x = D.highlights[+b.dataset.i]; openStories(x.stories.length ? x.stories : [x.cover]); }));
  badges();
}
/* Good Neighbor Club badge: each variant as its own SVG (colours are already in the files) */
const groundOf = n => /cream|white/.test(n) ? COL.blue : COL.cream;
const vecItem = (a, line) => ({ ...artItem({ src: a.href, mono: false, ar: a.ar, name: a.name }, null, null, a.label, line), ground: groundOf(a.name) });
function badges() {
  const list = D.badges || []; const host = $('#badges'); if (!host) return;
  host.innerHTML = list.map((a, k) => `<button class="tile" data-k="${k}" style="background:${groundOf(a.name)}"><img loading="lazy" src="${a.href}" alt="${esc(a.label)}"><span class="nm" style="color:${/cream|white/.test(a.name) ? COL.cream : ''}">${esc(a.label)}</span></button>`).join('');
  const items = list.map(a => vecItem(a, 'Good Neighbor Club badge'));
  $$('#badges .tile').forEach(b => { const a = list[+b.dataset.k]; tileActs(b, { src: a.href, name: a.name, mono: false, label: a.label }, null); b.addEventListener('click', () => lightbox(items, +b.dataset.k, b)); });
  $('#badgeZip').onclick = () => zipFiles(list.map(a => [a.file, a.href]), 'Cosmic - Good Neighbor Club badges');
}

/* ── icons ────────────────────────────────────────────── */
function icons() {
  const all = D.brand.icons; let cat = 'All', ic = 'blue', gr = 'cream';
  const catOf = n => n.startsWith('iso') ? 'Isometric' : n.startsWith('austin') ? 'Austin' : 'Interface';
  const cats = ['All', 'Isometric', 'Austin', 'Interface'];
  const chips = () => { $('#iconCats').innerHTML = cats.map(c => `<button class="chip${c === cat ? ' on' : ''}" data-c="${c}">${c}<small>${c === 'All' ? all.length : all.filter(i => catOf(i.name) === c).length}</small></button>`).join('');
    $$('#iconCats .chip').forEach(b => b.onclick = () => { cat = b.dataset.c; chips(); draw(); }); };
  async function draw() {
    const q = $('#iconSearch').value.trim().toLowerCase();
    const list = all.filter(i => (cat === 'All' || catOf(i.name) === cat) && (!q || i.label.includes(q) || i.name.includes(q)));
    $('#iconGrid').innerHTML = list.length ? list.map(i => `<button class="ico" data-n="${i.name}" style="background:${COL[gr]};color:${gr === 'cream' || gr === 'white' ? COL.ink : COL.cream}" title="${esc(i.label)}"><img ${i.mono ? `data-tint="${ic}"` : ''} src="${i.src}" alt="${esc(i.label)}"><span>${esc(i.label)}</span></button>`).join('') : '<p class="empty">No icon by that name. Try "roller", "house" or "texas".</p>';
    $$('#iconGrid .ico').forEach(b => { const it = all.find(x => x.name === b.dataset.n); tileActs(b, it, ic); b.addEventListener('click', e => { if (!DEMO && e.shiftKey) return downloadArt(it, ic, true);
      lightbox(list.map(x => artItem(x, ic, gr, x.label, 'Icon')), list.indexOf(it), b); }); });
    applyTints($('#iconGrid'));
  }
  chips(); paintRow($('#iconPaint'), ic, c => { ic = c; draw(); });
  paintRow($('#iconGround'), gr, c => { gr = c; draw(); }, ['cream', 'blue', 'ink', 'white']);
  $('#iconSize').oninput = e => $('#iconGrid').style.setProperty('--is', e.target.value + 'px');
  $('#iconSearch').oninput = draw; draw();
}

/* ── voice ────────────────────────────────────────────── */
function voice() {
  const lines = [['We care, it shows.', 'The tagline'], ['Beyond craft.', 'Secondary line'], ['In good hands.', 'Secondary line'], ['Property services. Done properly.', 'The line under the name'],
    ['Same places. Different standard.', 'The reveal'], ['Get a clear estimate.', 'The one call to action'],
    ['Give a damn. Know your craft. Leave it better.', 'The mantra (check with the client before using in public)'],
    ['Good work should keep working for you.', 'The Club'], ['No surprises. Do it properly. Leave it better. See it through.', 'Clarity · Craft · Care · Commit'],
    ['Owner-led. Austin-built. Here for the long haul.', 'Who we are'], ['Do it yourself. Do it properly.', 'DIY']];
  $('#lines').innerHTML = lines.map(([l, s]) => `<button class="line-card" data-l="${esc(l)}"><p>${esc(l)}</p><small>${esc(s)} · click to copy</small></button>`).join('');
  $$('#lines .line-card').forEach(b => b.addEventListener('click', () => copy(b.dataset.l, 'Line copied')));
  const tags = new Map();
  Object.values(B).forEach(b => (b.hashtags || '').split(/\s+/).filter(t => t.startsWith('#')).forEach(t => tags.set(t, (tags.get(t) || 0) + 1)));
  D.sets.forEach(s => (s.hashtags || '').split(/\s+/).filter(t => t.startsWith('#')).forEach(t => tags.set(t, (tags.get(t) || 0) + 3)));
  $('#tags').innerHTML = [...tags].sort((a, b) => b[1] - a[1]).map(([t]) => `<button class="tag">${esc(t)}</button>`).join('');
  $$('#tags .tag').forEach(b => b.addEventListener('click', () => copy(b.textContent, `${b.textContent} copied`)));
  const sets = D.sets.filter(s => ['feed-singles', 'carousel', 'mixed', 'stories'].includes(s.kind));
  $('#captions').innerHTML = sets.map(s => { const rows = s.kind === 'carousel' && s.caption ? [{ id: s.boards[0], cap: s.caption, tags: s.hashtags }]
      : s.boards.map(id => ({ id, cap: B[id].caption || (B[id].note ? 'Story · ' + B[id].note : ''), tags: B[id].hashtags || s.hashtags })).filter(r => r.cap);
    if (!rows.length) return '';
    return `<details class="cap-item"><summary>${esc(s.label)} <span class="label" style="color:inherit;opacity:.6">${rows.length} caption${rows.length > 1 ? 's' : ''}</span></summary>${rows.map(r => `<div class="cap-row"><img class="zm" tabindex="0" role="button" data-lb="${r.id}" loading="lazy" src="${B[r.id].img}" alt="Enlarge ${esc(B[r.id].title)}"><div><p>${esc(r.cap)}</p>${r.tags ? `<p class="h">${esc(r.tags)}</p>` : ''}</div><button class="btn btn-s" data-cap="${esc(r.cap + (r.tags ? '\n\n' + r.tags : ''))}">Copy</button></div>`).join('')}</details>`; }).join('');
  $$('#captions img[data-lb]').forEach(im => { const go = () => lightbox([boardItem(im.dataset.lb)], 0, im); im.addEventListener('click', go); im.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
  $$('#captions [data-cap]').forEach(b => b.addEventListener('click', () => copy(b.dataset.cap, 'Caption copied')));
}

/* ── print ────────────────────────────────────────────── */
function printSec() {
  const P = setOf('print'); if (!P) return;
  const NAMES = { 'hanger-estimate': ['Door hanger · Estimate', '4.25 × 11 in'], 'hanger-notice': ['Door hanger · Neighbor notice', '4.25 × 11 in'],
    'postcard-eddm': ['Postcard · Every-door mail', '9 × 6 in'], 'postcard-neighbor': ['Postcard · Neighbor', '6 × 4 in'], 'yard-sign-done': ['Yard sign · Job done', '24 × 18 in'],
    'yard-sign-wip': ['Yard sign · Work in progress', '24 × 18 in'], 'flyer': ['Flyer', '8.5 × 11 in'], 'thank-you': ['Thank-you card', '5 × 7 in'],
    'referral-card': ['Referral card', '3.5 × 2 in'], 'letter-rebrand': ['Rebrand letter', 'US letter'], 'business-card': ['Business cards', '3.5 × 2 in'],
    'letterhead': ['Letterhead', 'US letter'], 'envelope-10': ['#10 envelope', '9.5 × 4.125 in'] };
  const groups = new Map();
  P.boards.forEach(id => { const n = B[id].name.replace(/^\d+-/, ''); const key = Object.keys(NAMES).find(k => n.startsWith(k)) || n; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(id); });
  const side = id => (/-front/.test(id) ? 0 : /-back/.test(id) ? 1 : 0); // fronts first within a piece
  groups.forEach(ids => ids.sort((x, y) => side(x) - side(y) || x.localeCompare(y)));
  const faceLabel = id => { const mm = B[id].name.match(/-(front|back)(?:-(\w+))?$/); return mm ? (mm[1] === 'front' ? 'Front' : 'Back') + (mm[2] ? ' · ' + mm[2][0].toUpperCase() + mm[2].slice(1) : '') : 'Side'; };
  const G = [...groups.values()], T = [...groups.keys()].map(k => NAMES[k] || [k, '']);
  const pItems = G.map((ids, g) => ({ title: T[g][0], line: T[g][1], src: big(B[ids[0]]), w: B[ids[0]].w, h: B[ids[0]].h, dl: dlOf(B[ids[0]]), ed: edOf(B[ids[0]]), faces: ids.length > 1 ? ids.map(id => ({ label: faceLabel(id), src: big(B[id]), dl: dlOf(B[id]), ed: edOf(B[id]) })) : null }));
  $('#printGrid').innerHTML = [...groups].map(([k, ids], g) => { const [t, sz] = NAMES[k] || [k, '']; const f = B[ids[0]];
    return `<div class="pc-wrap"><button class="pc" data-g="${g}"><div class="pc-in"><div class="pc-face pc-front"><img loading="lazy" src="${f.img}" alt="${esc(t)}"></div>${ids.length > 1 ? `<div class="pc-face pc-back"><img alt=""></div>` : ''}</div>
      <div class="pc-meta"><b>${esc(t)}</b><span>${esc(sz)}</span></div>${ids.length > 1 ? `<div class="pc-hint">Click to flip · ${ids.length} sides</div>` : '<div class="pc-hint">Click to enlarge</div>'}</button>
      ${ids.length > 1 ? `<button class="zoom" data-z="${g}" aria-label="Enlarge ${esc(t)}, front and back">⤢</button>` : ''}
      <div class="pc-ed">${edHtml(edOf(f), { short: true })}</div></div>`; }).join('');
  $$('#printGrid .zoom').forEach(z => z.addEventListener('click', () => lightbox(pItems, +z.dataset.z, z)));
  $$('#printGrid .pc').forEach(btn => { const ids = G[+btn.dataset.g]; if (ids.length < 2) { btn.onclick = () => lightbox(pItems, +btn.dataset.g, btn); return; }
    let i = 0, flipped = false; const front = $('.pc-front img', btn), back = $('.pc-back img', btn);
    const fit = () => { const b = B[ids[0]]; $('.pc-in', btn).style.aspectRatio = `${b.w} / ${b.h}`; }; fit();
    btn.onclick = () => { if (touchOnly()) return lightbox(pItems, +btn.dataset.g, btn); const nx = (i + 1) % ids.length; (flipped ? front : back).src = B[ids[nx]].img; flipped = !flipped; btn.classList.toggle('flip', flipped); i = nx; }; });
  const pd = $('#printDl'); if (pd) { pd.innerHTML = `<button class="btn btn-blue btn-s" data-pz>All print pieces · PNG ZIP (${P.boards.length})</button>${edHtml(edSet(P))}`;
    $('[data-pz]', pd).onclick = () => zipBoards(P.boards, 'Cosmic - Print', false); }
  cardOptions();
}

/* business card options: the current card first, then each direction; click flips, the toggle swaps the back */
function cardOptions() {
  const C = D.cardOptions, root = $('#cardOptions'); if (!C || !root) return;
  const cur = C.current, bd = id => B[id];
  const all = [{ ...cur, front: { img: bd(cur.front.id).img, w: bd(cur.front.id).w, h: bd(cur.front.id).h, png: bd(cur.front.id).png, name: bd(cur.front.id).name }, backs: cur.backs.map(k => ({ label: k.label, img: bd(k.id).img, png: bd(k.id).png, name: bd(k.id).name })) }, ...C.options];
  const edC = { canva: canvaOf(C.downloads || []), ai: C.ai, aiLabel: `Illustrator · card options set (all ${C.options.length} directions)`, pkg: C.package, pkgSize: C.packageSize };
  const edO = o => o.ai ? { canva: o.canva ? [{ label: 'Canva', href: o.canva }] : [], ai: o.ai, aiLabel: edC.aiLabel, pkg: o.package, pkgSize: C.packageSize } : edOf(bd(cur.front.id));
  const optZip = all.flatMap(o => [[`${o.letter}/${o.front.name}.png`, o.front.png], ...o.backs.map(k => [`${o.letter}/${k.name}.png`, k.png])]);
  root.innerHTML = `<div class="co-head"><p class="label">Business card options</p><h3 class="caps">More ways to hand over a name</h3>
    <p class="lead">The current card, then ${C.options.length} directions to compare. Click a card to flip it; on hover the expand icon opens a big preview (on touch, tap a card). The toggle switches the back between Carlos and Roberto.</p>
    <div class="co-top"><button class="btn btn-blue btn-s" id="coZip">All card options · PNG ZIP (${optZip.length})</button>${edHtml(edC)}</div></div>
    <div class="co-grid">${all.map((o, n) => { const tall = o.front.h > o.front.w;
      return `<article class="co${n === 0 ? ' co-cur' : ''}" data-n="${n}"><div class="co-media"><button class="pc co-flip${tall ? ' tall' : ''}" style="aspect-ratio:${o.front.w} / ${o.front.h}" aria-label="Flip ${esc(o.name)}"><div class="pc-in">
        <div class="pc-face pc-front"><img loading="lazy" src="${o.front.img}" alt="${esc(o.name)}, front"></div><div class="pc-face pc-back"><img loading="lazy" src="${o.backs[0].img}" alt="${esc(o.name)}, back"></div></div></button>
<button class="zoom" data-n="${n}" aria-label="Enlarge ${esc(n === 0 ? 'the current card' : o.name)}, front and backs">⤢</button></div>
        <div class="pc-meta"><b>${n === 0 ? 'Current' : esc(o.letter) + ' · ' + esc(o.name)}</b><span>${esc(o.size)}</span></div>
        <p class="co-note">${esc(o.note)}</p>
        <div class="seg seg-s" role="group" aria-label="Back">${o.backs.map((k, i) => `<button class="seg-btn${i ? '' : ' on'}" data-b="${i}">${esc(k.label)}</button>`).join('')}</div>
        <div class="co-dl"><a class="btn btn-line btn-s" data-df href="${o.front.png}" download="${esc(o.front.name)}.png">Front · PNG</a><a class="btn btn-line btn-s" data-db href="${o.backs[0].png}" download="${esc(o.backs[0].name)}.png">Back · ${esc(o.backs[0].label)} · PNG</a>${edHtml(edO(o), { short: true })}</div></article>`; }).join('')}</div>`;
  const pdl = k => ({ href: k.png, name: `${k.name}.png`, label: 'PNG' });
  const cItems = all.map((o, n) => ({ title: n === 0 ? 'Current business card' : `${o.letter} · ${o.name}`, line: o.note, src: o.front.png, w: o.front.w, h: o.front.h, dl: pdl(o.front), ed: edO(o),
    faces: [{ label: 'Front', src: o.front.png, dl: pdl(o.front) }, ...o.backs.map(k => ({ label: 'Back · ' + k.label, src: k.png, dl: pdl(k) }))] }));
  $('#coZip', root).onclick = () => zipFiles(optZip, 'Cosmic - Business card options');
  $$('.co .zoom', root).forEach(z => z.addEventListener('click', () => lightbox(cItems, +z.dataset.n, z)));
  $$('.co', root).forEach(el => { const o = all[+el.dataset.n], card = $('.co-flip', el), back = $('.pc-back img', el);
    card.onclick = () => { if (touchOnly()) lightbox(cItems, +el.dataset.n, card); else card.classList.toggle('flip'); };
    $$('.seg-btn', el).forEach(b => b.onclick = () => { $$('.seg-btn', el).forEach(x => x.classList.toggle('on', x === b)); const k = o.backs[+b.dataset.b]; back.src = k.img; card.classList.add('flip'); const a = $('[data-db]', el); a.href = k.png; a.download = `${k.name}.png`; a.textContent = `Back · ${k.label} · PNG`; }); });
}

/* ── rebrand launch: the email as a mail preview, two swipeable carousels ── */
function rebrand() {
  const S = setOf('rebrand'); if (!S) return;
  const em = B[S.boards.find(id => B[id].group === 'email')];
  $('#rbMail').innerHTML = `<div class="mail-bar"><i></i><i></i><i></i><span>Inbox</span><button class="zoom-btn" id="mailZoom" aria-label="Open the email full height">Full height ⤢</button></div>
    <div class="mail-head"><p class="label">Subject</p><b>${esc(S.email.subject)}</b><p class="label">Preheader</p><p>${esc(S.email.preheader)}</p>
      <small>From Cosmic · To: customers · [TBC: LAUNCH DATE]</small></div>
    <div class="mail-body" tabindex="0" aria-label="Email, scroll to read"><img src="${em.img}" alt="${esc(em.alt)}" width="${em.w}" height="${em.h}"></div>`;
  const mailOpen = () => lightbox([{ title: 'Announcement email', line: `Subject: ${S.email.subject}`, src: big(em), w: em.w, h: em.h, scroll: true, dl: dlOf(em), ed: edOf(em) }], 0, $('#mailZoom'));
  $('#mailZoom').onclick = mailOpen; const mi = $('#rbMail .mail-body img'); mi.style.cursor = 'zoom-in'; mi.onclick = mailOpen;
  $('#rbCars').innerHTML = S.carousels.map(k => { const ids = S.boards.filter(id => B[id].group === k.key), b0 = B[ids[0]];
    return `<article class="rb-car" data-k="${k.key}"><div class="rb-car-media"><div class="rb-track">${ids.map((id, i) => `<button data-i="${i}" aria-label="Open slide ${i + 1} of ${ids.length}"><img loading="lazy" src="${B[id].img}" alt="${esc(B[id].alt)}"></button>`).join('')}</div>
      <button class="nav prev" aria-label="Previous slide" disabled>‹</button><button class="nav next" aria-label="Next slide">›</button>
      <div class="dots">${ids.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>
      <div class="rb-car-text"><p class="label">Carousel ${k.key.toUpperCase()} · ${ids.length} slides · Instagram</p><h3 class="caps">${esc(k.title)}</h3>
        <p class="cap">${esc(b0.caption)}</p><p class="h">${esc(b0.hashtags)}</p>
        <button class="btn btn-line btn-s" data-copy>Copy caption</button></div></article>`; }).join('');
  $$('#rbCars .rb-car').forEach(art => {
    const ids = S.boards.filter(id => B[id].group === art.dataset.k), tr = $('.rb-track', art), b0 = B[ids[0]];
    const at = () => Math.round(tr.scrollLeft / tr.clientWidth), go = n => tr.scrollTo({ left: n * tr.clientWidth, behavior: 'smooth' });
    const sync = () => { const k = at(); $$('.dots i', art).forEach((d, j) => d.classList.toggle('on', j === k)); $('.prev', art).disabled = k === 0; $('.next', art).disabled = k === ids.length - 1; };
    tr.addEventListener('scroll', sync, { passive: true });
    $('.prev', art).addEventListener('click', () => go(at() - 1)); $('.next', art).addEventListener('click', () => go(at() + 1));
    $$('.rb-track button', art).forEach(b => b.addEventListener('click', () => openPost(ids, +b.dataset.i)));
    $('[data-copy]', art).addEventListener('click', () => copy(`${b0.caption}\n\n${b0.hashtags}`.trim(), 'Caption copied'));
  });
}

/* ── uniform & patches: seven boards, the patch sheet first and widest ── */
const merchItem = id => ({ title: B[id].title, line: B[id].line, src: big(B[id]), w: B[id].w, h: B[id].h, dl: dlOf(B[id]), ed: edOf(B[id]) });
function uniform() {
  const S = setOf('merch'); if (!S) return;
  $('#umGrid').innerHTML = S.boards.map((id, i) => { const b = B[id];
    return `<button class="um${i ? '' : ' um-wide'}" data-i="${i}" aria-label="Open ${esc(b.title)} full size"><span class="um-im"><img loading="lazy" src="${b.img}" alt="${esc(b.alt)}" width="${b.w}" height="${b.h}"></span>
      <span class="um-meta"><b>${esc(b.title)}</b><span>${esc(b.line)}</span></span></button>`; }).join('');
  const ue = $('#umEd'); if (ue) ue.innerHTML = edHtml(edSet(S));
  $$('#umGrid .um').forEach(b => b.addEventListener('click', () => lightbox(S.boards.map(merchItem), +b.dataset.i, b)));
  uniformDl();
}
/* the uniform's own vectors (patches in blue and navy, chest block, painting lockup, flats, layouts): download, copy, ZIP */
function uniformDl() {
  const U = D.uniform, host = $('#umDl'); if (!U || !host) return;
  const vars = f => (f.variants || [{ colour: '', href: f.href, file: f.file, ar: f.ar }]).map(v => ({ ...v, name: v.file.replace(/\.svg$/, ''), label: f.label + (v.colour ? ' · ' + v.colour : '') }));
  const all = U.flatMap(g => g.files.flatMap(f => vars(f).map(v => [`${g.key}/${v.file}`, v.href])));
  host.innerHTML = `<div class="um-dl-head"><div><p class="label">Vector files</p><h3 class="caps">Download the artwork</h3><p>Every file is a clean SVG: patches, the chest block, the painting lockup, the garment flats and the layouts. Open one for a big preview, copy it to paste into Figma, Illustrator or Canva, or take the lot.</p></div>
    <div class="um-dl-btns"><button class="btn btn-blue" id="umZip">All uniform vectors · ZIP (${all.length})</button>${edHtml(edSet(setOf('merch')))}</div></div>` +
    U.map((g, gi) => { let n = 0; return `<div class="vg"><div class="vg-head"><h4 class="caps">${esc(g.title)}</h4><p>${esc(g.note)}</p></div><div class="vgrid">` + g.files.map(f => { const vs = vars(f), at = n; n += vs.length;
      return `<div class="vc"><button class="vc-im" data-g="${gi}" data-k="${at}" style="background:${groundOf(vs[0].name)}" aria-label="Preview ${esc(f.label)}"><img loading="lazy" src="${vs[0].href}" alt="${esc(f.label)}"></button><b>${esc(f.label)}</b>
        <div class="vc-acts">${vs.map(v => `<span class="vv"><a class="btn btn-line btn-s" href="${v.href}" download="${esc(v.file)}">${v.colour ? esc(v.colour) + ' SVG' : 'SVG'} ↓</a><button class="btn btn-s vcopy" data-href="${v.href}">${v.colour ? 'Copy ' + esc(v.colour) : 'Copy SVG'}</button></span>`).join('')}</div></div>`; }).join('') + `</div></div>`; }).join('');
  $$('#umDl .vc-im').forEach(b => { const g = U[+b.dataset.g]; const items = g.files.flatMap(f => vars(f)).map(v => vecItem(v, g.title)); b.addEventListener('click', () => lightbox(items, +b.dataset.k, b)); });
  $$('#umDl .vcopy').forEach(b => b.addEventListener('click', async () => copySvg(await svgText(b.dataset.href), b.dataset.href)));
  $('#umZip').onclick = () => zipFiles(all, 'Cosmic - Uniform vectors');
}

/* ── mockups ──────────────────────────────────────────── */
function mockups() {
  const M = D.mockups;
  $('#mockGrid').innerHTML = M.map((m, i) => `<button data-i="${i}"><img loading="lazy" src="${m.img}" alt="${esc(m.title)}"><span>${esc(m.title)}</span></button>`).join('');
  $$('#mockGrid button').forEach(b => b.addEventListener('click', () => lightbox(M.map(m => ({ title: m.title, line: 'Mockup', src: m.full || m.img, w: m.w, h: m.h, dl: { href: m.full || m.img, name: `cosmic-${m.name}.jpg`, label: 'JPG' } })), +b.dataset.i, b)));
}
/* ── the one shared lightbox: raster or SVG art, faces (front/back), scroll mode, keys, swipe, focus trap ── */
const big = b => (!b.nodl && b.w > 1100 ? b.png : b.img); // wide boards preview from the full PNG
const dlOf = b => b.nodl ? null : { href: b.png, name: `${b.name}.png`, label: 'PNG' };
const boardItem = id => { const b = B[id]; return { title: b.title, line: setOf(b.set).label, src: big(b), w: b.w, h: b.h, dl: dlOf(b), ed: edOf(b) }; };
const artItem = (a, colour, ground, title, line) => ({ title, line, art: { src: a.src, colour, mono: a.mono, ar: a.ar || 1, name: a.name, label: title }, ground: COL[ground] || ground });
let lbTok = 0;
const touchOnly = () => matchMedia('(hover: none)').matches;
async function lightbox(items, i, opener) {
  const m = $('#lightbox'), img = $('#lbImg'), stage = $('#lbStage'), faces = $('#lbFaces'), fig = $('.lb-fig', m); const trigger = opener || document.activeElement;
  const fit = (it, w, h, ar) => { // size the picture to the viewport; small art may grow up to 2.4x
    const narrow = innerWidth < 700, pad = it.art ? Math.round(Math.min(innerWidth, innerHeight) * .05) : 0;
    const bw = innerWidth * (narrow ? .94 : .86) - pad * 2, bh = innerHeight - (narrow ? 270 : 200) - pad * 2;
    if (it.scroll) { stage.style.maxHeight = (innerHeight - (narrow ? 255 : 180)) + 'px'; img.style.width = Math.min(760, innerWidth * .94 - 24) + 'px'; return; }
    stage.style.maxHeight = ''; const r = ar || (w && h ? w / h : 0);
    if (!r) { img.style.width = ''; return; }
    let pw = Math.min(bw, bh * r); if (w && !it.art) pw = Math.min(pw, w * 2.4); img.style.width = Math.round(pw) + 'px';
  };
  async function show() {
    const it = items[i], my = ++lbTok;
    m.setAttribute('aria-label', it.title); stage.className = 'lb-stage' + (it.scroll ? ' lb-scroll' : '') + (it.art ? ' lb-art' : ''); stage.style.background = it.ground || '';
    let src = it.faces ? it.faces[0].src : it.src;
    if (it.art) { const txt = it.art.mono && it.art.colour ? await tinted(it.art.src, it.art.colour) : await svgText(it.art.src); if (my !== lbTok) return; src = dataUrl(txt); }
    img.alt = it.title; img.draggable = false; fit(it, it.w, it.h, it.art?.ar); img.src = src;
    faces.hidden = !(it.faces && it.faces.length > 1);
    faces.innerHTML = faces.hidden ? '' : it.faces.map((x, k) => `<button class="seg-btn${k ? '' : ' on'}" data-f="${k}">${esc(x.label)}</button>`).join('');
    $$('.seg-btn', faces).forEach(b => b.onclick = () => { $$('.seg-btn', faces).forEach(x => x.classList.toggle('on', x === b)); const fc = it.faces[+b.dataset.f]; img.src = fc.src; img.alt = `${it.title}, ${fc.label}`; acts(it, +b.dataset.f); });
    $('#lbTitle').textContent = it.title; $('#lbLine').textContent = [it.line, items.length > 1 ? `${i + 1} / ${items.length}` : ''].filter(Boolean).join(' · ');
    $('#lbNote').textContent = ''; acts(it, 0);
    $('#lbPrev').disabled = i === 0; $('#lbNext').disabled = i === items.length - 1; stage.scrollTop = 0;
  }
  /* Download (PNG / SVG / JPG) and Copy SVG for the item on show; the Download follows the side picked */
  function acts(it, face) {
    const box = $('#lbActions'); if (DEMO) { box.innerHTML = ''; return; }
    if (it.art) {
      const a = it.art; box.innerHTML = `<button class="btn btn-cream btn-s" data-a="copy">Copy SVG</button><button class="btn btn-line btn-s" data-a="svg">Download SVG</button><button class="btn btn-line btn-s" data-a="png">Download PNG</button>`;
      const item = { src: a.src, mono: a.mono, name: a.name || 'art', label: a.label };
      $('[data-a=copy]', box).onclick = async () => copySvg(await artText(item, a.colour), a.src);
      $('[data-a=svg]', box).onclick = () => downloadArt(item, a.colour); $('[data-a=png]', box).onclick = () => downloadArt(item, a.colour, true);
    } else {
      const d = it.faces ? (it.faces[face].dl || it.dl) : it.dl;
      const nm = d && it.faces ? d.name.replace(/(\.\w+)$/, '') : '';
      const ed = (it.faces && it.faces[face].ed) || it.ed;
      box.innerHTML = (d ? `<a class="btn btn-cream btn-s" href="${d.href}" download="${esc(d.name)}">Download ${d.label || 'PNG'}${it.faces ? ' · ' + esc(it.faces[face].label) : ''}</a>` : '') + edHtml(ed);
    }
  }
  const rs = () => { const it = items[i]; fit(it, it.w, it.h, it.art?.ar); };
  m._next = () => { if (i < items.length - 1) { i++; show(); } }; m._prev = () => { if (i > 0) { i--; show(); } };
  $('#lbNext').onclick = m._next; $('#lbPrev').onclick = m._prev;
  let x0 = null; fig.onpointerdown = e => { x0 = e.target.closest('.lb-faces') ? null : e.clientX; }; fig.onpointerup = e => { if (x0 === null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 50) (dx < 0 ? m._next : m._prev)(); x0 = null; };
  addEventListener('resize', rs); m._close = () => { removeEventListener('resize', rs); trigger?.focus?.(); };
  await show(); openModal(m);
}

/* ── downloads ────────────────────────────────────────── */
function downloads() {
  const social = D.sets.filter(s => ['feed-singles', 'carousel', 'mixed', 'stories', 'highlights', 'avatars'].includes(s.kind)).flatMap(s => s.boards);
  const t = $('#dlTable');
  t.innerHTML = `<div class="dl-pack"><a class="btn btn-blue btn-pack" id="dlPack" href="${D.fullPackage}" target="_blank" rel="noopener">${packLabel()}</a><p>Everything in one zip: every PNG, the Canva templates and the Illustrator files.</p></div><div class="dl-all"><button class="btn btn-blue" data-all="social">All social designs · ZIP (${social.length})</button>
    <button class="btn btn-line" data-all="print">All print designs · ZIP (${setOf('print').boards.length})</button>
    <button class="btn btn-line" data-all="icons">Icon kit · SVG ZIP (${D.brand.icons.length})</button>
    <button class="btn btn-line" data-all="uniform">Uniform vectors · SVG ZIP</button>
    <button class="btn btn-line" data-all="badges">Club badges · SVG ZIP</button>
    <a class="btn btn-line" href="${D.repo}/releases/tag/v2" target="_blank" rel="noopener">All Illustrator files</a></div>` +
    D.sets.filter(s => !s.nodl).map(s => `<div class="dl-row"><img loading="lazy" src="${B[s.boards[0]].img}" alt=""><div><b>${esc(s.label)}</b><small>${esc(s.channel)} · ${s.boards.length} design${s.boards.length > 1 ? 's' : ''}</small></div>
      <small>${esc(s.sub || '')}</small><div class="row"><button class="btn btn-blue btn-s" data-zipset="${s.id}">PNG · ZIP</button>${edHtml(edSet(s))}</div></div>`).join('') +
    (D.cardOptions ? `<div class="dl-row"><img loading="lazy" src="${D.cardOptions.options[0].front.img}" alt=""><div><b>Business card options</b><small>Print · ${D.cardOptions.options.length + 1} directions</small></div><small>Front and both backs for each</small>
      <div class="row"><button class="btn btn-blue btn-s" data-optzip>PNG · ZIP</button>${edHtml({ canva: canvaOf(D.cardOptions.downloads), ai: D.cardOptions.ai, aiLabel: `Illustrator · card options set (all ${D.cardOptions.options.length} directions)`, pkg: D.cardOptions.package, pkgSize: D.cardOptions.packageSize })}</div></div>` : '');
  $('[data-optzip]', t)?.addEventListener('click', () => { const C = D.cardOptions; const all = [C.current, ...C.options];
    zipFiles(all.flatMap(o => { const fr = o.front.png ? o.front : B[o.front.id], bs = o.backs.map(k => k.png ? k : B[k.id]); return [[`${o.letter}/${fr.name}.png`, fr.png], ...bs.map(k => [`${o.letter}/${k.name}.png`, k.png])]; }), 'Cosmic - Business card options'); });
  $('[data-all="uniform"]', t).onclick = () => zipFiles(D.uniform.flatMap(g => g.files.flatMap(f => (f.variants || [f]).map(v => [`${g.key}/${v.file}`, v.href]))), 'Cosmic - Uniform vectors');
  $('[data-all="badges"]', t).onclick = () => zipFiles(D.badges.map(a => [a.file, a.href]), 'Cosmic - Good Neighbor Club badges');
  $$('[data-zipset]', t).forEach(b => b.addEventListener('click', () => { const s = setOf(b.dataset.zipset); zipBoards(s.boards, `Cosmic - ${s.label}`); }));
  $('[data-all="social"]', t).onclick = () => zipBoards(social, 'Cosmic - Social designs');
  $('[data-all="print"]', t).onclick = () => zipBoards(setOf('print').boards, 'Cosmic - Print designs', false);
  $('[data-all="icons"]', t).onclick = async () => { const z = new JSZip(); for (const i of D.brand.icons) z.file(`${i.name}.svg`, await svgText(i.src)); saveBlob(await z.generateAsync({ type: 'blob' }), 'Cosmic - Icon kit.zip'); toast('Icon kit ready'); };
}
})();
