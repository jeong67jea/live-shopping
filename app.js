/*
  live-shopping / app.js  — Robust Patch
  - Works on GitHub Pages (no serverless); optionally uses Cloudflare Functions if present
  - Auto image fetch from buy_url via r.jina.ai (og:image / ld+json / first <img>), with http->https proxy
  - Placeholder fallback chain
  - countries.json: supports both flat array [{iso2,continent,enabled}] and
    nested {order:[...], byContinent:{'아시아':[...], ...}} forms
  - Config selectors normalized (fixes [data-role="#grid"] → [data-role="grid"])
*/

(() => {
  'use strict';

  // ===== Default config (overridden by config.json or window.LiveConfig) ====
  const DefaultConfig = {
    hideDiag: true,
    autoRefreshSeconds: 0,
    useProxyOG: true,
    catalogApi: "",
    selectors: {
      grid: '#grid, #cards, [data-role="grid"], .cards',
      diag: '#diag, .diag, [data-role="diag"]',
      count: '#count, .count, [data-role="count"]',
      search: '#q, #search, input[type="search"], [data-role="search"]',
      continent: '#continent, [data-role="continent"]',
      countryBadges: '[data-iso2], [data-country]'
    },
    continents: [
      { id: 'AS', name: '아시아' },
      { id: 'EU', name: '유럽' },
      { id: 'NA', name: '북아메리카' },
      { id: 'SA', name: '남아메리카' },
      { id: 'AF', name: '아프리카' },
      { id: 'OC', name: '오세아니아' }
    ],
    defaultCountry: 'KR'
  };

  // ===== Utils =============================================================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
  function merge(a, b) { return Object.assign({}, a, b, { selectors: Object.assign({}, a.selectors, (b&&b.selectors)||{}) }); }
  function sanitizeUrl(u) { try { const url = new URL(u); if (url.protocol==='http:'||url.protocol==='https:') return url.toString(); } catch {} return ''; }
  function absolutize(u, baseURL) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return (new URL(baseURL)).protocol + u;
    const base = new URL(baseURL);
    if (u.startsWith('/')) return base.origin + u;
    const path = base.pathname.replace(/\/[^/]*$/, '/');
    return base.origin + path + u.replace(/^\.\//,'');
  }
  function getBasePath() {
    const p = location.pathname;
    const i = p.indexOf('/live-shopping/');
    if (i >= 0) return p.slice(0, i + '/live-shopping/'.length);
    return p.replace(/[^/]+$/, '');
  }
  function summary(items) {
    const raw = items.length;
    const invalidUrl = items.filter(v => !sanitizeUrl(v.buy_url)).length;
    const visible = raw - invalidUrl;
    return { raw, visible, invalidUrl };
  }
  async function fetchJson(url, opts={}) {
    const res = await fetch(url, { cache: 'no-store', ...opts });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  // Normalize selectors like [data-role="#grid"] → [data-role="grid"]
  function normalizeSelectors(selObj) {
    const out = {};
    for (const k of Object.keys(selObj||{})) {
      const v = String(selObj[k]||'');
      out[k] = v.replace(/\[data-role="\#([^"]+)"\]/g, '[data-role="$1"]')
                .replace(/\[data-role='\#([^']+)'\]/g, "[data-role='$1']")
                .replace(/input\[type="\#([^"]+)"\]/g, 'input[type="$1"]')
                .replace(/input\[type='\#([^']+)'\]/g, "input[type='$1']");
    }
    return out;
  }

  async function loadConfig() {
    let cfg = DefaultConfig;
    try { if (window.LiveConfig) cfg = merge(cfg, window.LiveConfig); } catch {}
    try {
      const file = await fetchJson('config.json').catch(()=>null);
      if (file) cfg = merge(cfg, file);
    } catch {}
    cfg.selectors = normalizeSelectors(cfg.selectors);
    return cfg;
  }

  // ===== DIAG / Grid / Count ==============================================
  function createDiag(sel) {
    const el = $(sel); if (el) return el;
    const pre = document.createElement('pre');
    pre.id = 'diag';
    Object.assign(pre.style, {
      position:'fixed', bottom:'12px', right:'12px', background:'rgba(0,0,0,.75)', color:'#0f0',
      padding:'10px 12px', borderRadius:'8px', font:'12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      maxWidth:'42vw', maxHeight:'40vh', overflow:'auto'
    });
    document.body.appendChild(pre);
    return pre;
  }
  function getDiag(sel, hide) { return hide ? { textContent:'', set textContent(v){} } : createDiag(sel); }
  function getCountEl(sel) {
    let el = document.querySelector(sel);
    if (el) return el;
    const cand = Array.from(document.querySelectorAll('button, a, span, div'));
    el = cand.find(n => /^\s*표시\s*:/.test((n.textContent || '').trim()));
    if (el) return el;
    const badge = document.createElement('span');
    badge.id = 'count'; badge.className='badge'; badge.textContent='표시: 0개';
    Object.assign(badge.style, { marginLeft:'8px', padding:'6px 10px', border:'1px solid #e6e9f0', borderRadius:'999px', background:'#fff' });
    (document.querySelector('.toolbar, .filters, header') || document.body).appendChild(badge);
    return badge;
  }
  function getGrid(sel) {
    const el = $(sel); if (el) return el;
    const div = document.createElement('div');
    div.id='grid';
    Object.assign(div.style, { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px' });
    document.body.appendChild(div);
    return div;
  }

  // ===== Image resolving (r.jina.ai) ======================================
  const OG_CACHE = new Map();
  async function fetchOgImageViaProxy(pageUrl, enable=true) {
    if (!enable || !pageUrl) return '';
    if (OG_CACHE.has(pageUrl)) return OG_CACHE.get(pageUrl);
    let proxied = '';
    try { const u = new URL(pageUrl); proxied = `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`; } catch { return ''; }
    try {
      const res = await fetch(proxied, { cache:'no-store' });
      if (!res.ok) throw 0;
      const text = await res.text();
      const metas = [
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
      ];
      for (const re of metas) {
        const m = text.match(re);
        if (m && m[1]) { const abs = absolutize(m[1], pageUrl); OG_CACHE.set(pageUrl, abs); return abs; }
      }
      const ld = text.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of ld) {
        try { const jsonTxt = block.replace(/^[\s\S]*?>/,'').replace(/<\/script>[\s\S]*$/,'').trim();
          const data = JSON.parse(jsonTxt);
          const img = deepFindImage(data);
          if (img) { const abs = absolutize(img, pageUrl); OG_CACHE.set(pageUrl, abs); return abs; }
        } catch {}
      }
      const m = text.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m && m[1]) { const abs = absolutize(m[1], pageUrl); OG_CACHE.set(pageUrl, abs); return abs; }
    } catch {}
    OG_CACHE.set(pageUrl, ''); return '';
  }
  function deepFindImage(data) {
    const arr = Array.isArray(data) ? data : [data];
    for (const obj of arr) {
      if (!obj || typeof obj!=='object') continue;
      if (typeof obj.image==='string') return obj.image;
      if (obj.image && typeof obj.image==='object') {
        if (typeof obj.image.url==='string') return obj.image.url;
        if (Array.isArray(obj.image) && obj.image.length) {
          const f = obj.image[0]; if (typeof f==='string') return f; if (f && typeof f.url==='string') return f.url;
        }
      }
      for (const k of Object.keys(obj)) { const v = obj[k]; if (v && typeof v==='object') { const r = deepFindImage(v); if (r) return r; } }
    }
    return '';
  }
  function wrapHttp(u) {
    if (!u) return '';
    if (/^http:\/\//i.test(u)) return 'https://images.weserv.nl/?url=' + encodeURIComponent(u.replace(/^http:\/\//,''));
    return u;
  }
  const PLACEHOLDER_CANDIDATES = [
    './assets/placeholder.png',
    '/live-shopping/assets/placeholder.png',
    '/assets/placeholder.png',
    '/placeholder.png'
  ];
  function nextPlaceholder(current) {
    const i = PLACEHOLDER_CANDIDATES.indexOf(current);
    return PLACEHOLDER_CANDIDATES[(i+1) % PLACEHOLDER_CANDIDATES.length];
  }
  async function resolveImage(item, cfg) {
    const direct = sanitizeUrl(item.image_url || '');
    if (direct) return wrapHttp(direct);
    const buy = sanitizeUrl(item.buy_url || '');
    if (buy) {
      const fromProxy = await fetchOgImageViaProxy(buy, cfg.useProxyOG);
      if (fromProxy) return wrapHttp(fromProxy);
    }
    return PLACEHOLDER_CANDIDATES[0];
  }

  // ===== Card =============================================================
  function makeCard(item, imgUrl) {
    const safeTitle = (item.title || '').toString();
    const safeBrand = (item.brand || '').toString();
    const price = typeof item.price === 'number' ? item.price : Number(item.price || 0);
    const currency = (item.currency || '').toString();
    const href = sanitizeUrl(item.buy_url) || '#';

    const el = document.createElement('article');
    el.className = 'card';
    Object.assign(el.style, { border:'1px solid #e6e9f0', borderRadius:'12px', overflow:'hidden', background:'#fff', display:'flex', flexDirection:'column' });

    const imgWrap = document.createElement('div');
    Object.assign(imgWrap.style, { aspectRatio:'1/1', overflow:'hidden', background:'#f6f7fa' });
    const img = document.createElement('img');
    img.loading='lazy'; img.decoding='async'; img.src=imgUrl; img.alt=safeTitle;
    Object.assign(img.style, { width:'100%', height:'100%', objectFit:'cover' });
    img.referrerPolicy='no-referrer';
    img.onerror = () => { img.src = nextPlaceholder(img.src); };
    imgWrap.appendChild(img);

    const body = document.createElement('div');
    Object.assign(body.style, { padding:'12px 14px', display:'grid', gap:'8px' });
    const brand = document.createElement('div'); brand.textContent = safeBrand; Object.assign(brand.style, { color:'#5f6b7a', fontSize:'12px' });
    const title = document.createElement('h3'); title.textContent = safeTitle; Object.assign(title.style, { margin:'0', fontSize:'15px', lineHeight:'1.35', fontWeight:'600' });
    const priceEl = document.createElement('div'); priceEl.textContent = price ? `${price.toLocaleString()} ${currency}` : ''; Object.assign(priceEl.style, { fontSize:'14px', fontWeight:'700' });
    const btn = document.createElement('a'); btn.textContent='구매하기'; btn.href=href; btn.target='_blank'; btn.rel='noopener noreferrer';
    Object.assign(btn.style, { display:'inline-block', textAlign:'center', background:'#0b6dd8', color:'#fff', padding:'10px 12px', borderRadius:'8px', textDecoration:'none', fontSize:'14px', marginTop:'4px' });
    body.append(brand, title, priceEl, btn);

    el.append(imgWrap, body);
    return el;
  }

  // ===== Data source ======================================================
  async function loadProducts(countryISO2, cfg) {
    // Try API first only if it returns 200; otherwise ignore quietly
    if (cfg.catalogApi) {
      try {
        const u = cfg.catalogApi + encodeURIComponent(countryISO2);
        const res = await fetch(u, { cache:'no-store' });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length) return list.slice(0,20);
        }
      } catch {}
    }
    // Fallback to local JSON
    const base = getBasePath();
    const urls = [
      `${base}data/products_${countryISO2}.json`,
      `data/products_${countryISO2}.json`,
      `./data/products_${countryISO2}.json`
    ];
    for (const url of urls) {
      try {
        const list = await fetchJson(url);
        if (Array.isArray(list) && list.length) return list.slice(0,20);
      } catch {}
    }
    return [];
  }

  // ===== Countries loader (supports 2 shapes) =============================
  function flattenCountries(raw) {
    if (!raw) return [];
    // Shape 1: flat array
    if (Array.isArray(raw)) {
      return raw.map(x => ({
        iso2: (x.iso2 || x.code || '').toUpperCase(),
        name: x.name || '',
        continent: (x.continent || x.region || '').toUpperCase(),
        enabled: x.enabled !== false
      })).filter(x => x.iso2);
    }
    // Shape 2: { order:[], byContinent:{ '아시아': [{code,name,enabled}, ...] } }
    const mapKoToId = { '아시아':'AS', '유럽':'EU', '북아메리카':'NA', '남아메리카':'SA', '아프리카':'AF', '오세아니아':'OC' };
    const by = raw.byContinent || {};
    const out = [];
    Object.keys(by).forEach(k => {
      const id = mapKoToId[k] || (k.toUpperCase());
      (by[k] || []).forEach(rec => {
        out.push({
          iso2: (rec.iso2 || rec.code || '').toUpperCase(),
          name: rec.name || '',
          continent: id,
          enabled: rec.enabled !== false
        });
      });
    });
    return out;
  }

  // ===== Render loop ======================================================
  async function renderApp(cfg, countryISO2) {
    const grid = getGrid(cfg.selectors.grid);
    const countEl = getCountEl(cfg.selectors.count);
    const diag = getDiag(cfg.selectors.diag, cfg.hideDiag);

    grid.innerHTML='';
    let items=[], err=null;
    try { items = await loadProducts(countryISO2, cfg); } catch(e){ err = e.message||String(e); }
    const s0 = summary(items);

    const qEl = $(cfg.selectors.search);
    const needle = (qEl && qEl.value) ? qEl.value.trim().toLowerCase() : '';
    const filtered = !needle ? items : items.filter(v => {
      const t=(v.title||'').toLowerCase(), b=(v.brand||'').toLowerCase();
      return t.includes(needle) || b.includes(needle);
    });
    const s1 = summary(filtered);

    let resolved=0;
    for (const it of filtered) {
      const hrefOk = sanitizeUrl(it.buy_url); if (!hrefOk) continue;
      const imgUrl = await resolveImage(it, cfg);
      if (imgUrl && !PLACEHOLDER_CANDIDATES.includes(imgUrl)) resolved++;
      grid.appendChild(makeCard(it, imgUrl));
    }
    countEl.textContent = `표시: ${grid.children.length}개`;

    const diagObj = { state:{ country: countryISO2 },
      DIAG:{ source: cfg.catalogApi ? 'API' : 'local_json', count_raw:s0.raw, visible_after_url_filter:s1.visible, invalid_buy_url:s1.invalidUrl, rendered:grid.children.length, img_resolved:resolved },
      error: err || null };
    try { diag.textContent = JSON.stringify(diagObj, null, 2); } catch {}
  }

  // ===== Continent/Country filtering =====================================
  async function setupContinentCountry(cfg) {
    let raw=null; try { raw = await fetchJson('countries.json'); } catch {}
    if (!raw) return;
    const flat = flattenCountries(raw);
    const setEnabled = new Set(flat.filter(c => c.enabled).map(c => c.iso2));
    const continentSel = $(cfg.selectors.continent);
    if (!continentSel) return;

    // If it's a <select>, populate options if empty
    if (continentSel.tagName === 'SELECT' && !continentSel.options.length) {
      cfg.continents.forEach(c => {
        const opt = document.createElement('option'); opt.value=c.id; opt.textContent=c.name; continentSel.appendChild(opt);
      });
    }

    continentSel.addEventListener('change', () => {
      const id = continentSel.value;
      const allowed = new Set(flat.filter(c => c.enabled && c.continent === id).map(c => c.iso2));
      $all(cfg.selectors.countryBadges).forEach(b => {
        const iso = (b.getAttribute('data-iso2') || b.getAttribute('data-country') || '').toUpperCase();
        if (!iso) return;
        b.style.display = allowed.has(iso) ? '' : 'none';
      });
    });

    // Initial visibility by enabled list (if no continent chosen)
    if (setEnabled.size) {
      $all(cfg.selectors.countryBadges).forEach(b => {
        const iso = (b.getAttribute('data-iso2') || b.getAttribute('data-country') || '').toUpperCase();
        if (!iso) return;
        b.style.display = setEnabled.has(iso) ? '' : 'none';
      });
    }
  }

  // ===== Init =============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    const cfg = await loadConfig();
    const url = new URL(location.href);
    let country = (url.searchParams.get('country') || url.searchParams.get('iso2') || cfg.defaultCountry || 'KR').toUpperCase();

    await setupContinentCountry(cfg).catch(()=>{});

    const s = $(cfg.selectors.search);
    if (s) { let t=null; s.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>renderApp(cfg, country), 120); }); }
    $all(cfg.selectors.countryBadges).forEach(el => {
      el.addEventListener('click', () => {
        const iso = (el.getAttribute('data-iso2') || el.getAttribute('data-country') || '').toUpperCase();
        if (/^[A-Z]{2}$/.test(iso)) { country = iso; renderApp(cfg, country); }
      });
    });

    renderApp(cfg, country);
    if (Number(cfg.autoRefreshSeconds) > 0) setInterval(() => renderApp(cfg, country), Number(cfg.autoRefreshSeconds) * 1000);

    window.LiveShopping = { render: (iso)=>renderApp(cfg, iso||country), resolveImage, cfg };
  });
})();