/*
  live-shopping / app.js
  - GitHub Pages 친화: 서버리스 없이 동작 (옵션: Cloudflare Functions 사용 시 자동 활용)
  - image_url 없으면: r.jina.ai 프록시로 buy_url에서 og:image 추출 (실패 시 placeholder)
  - DIAG(진단 패널) 숨김 옵션
  - 셀렉터 커스터마이즈 (config.json로 오버라이드)
  - 6대주/국가 드롭다운(선택) 및 자동 새로고침 지원
*/

(() => {
  'use strict';

  // ===== 기본 설정 (config.json로 덮어쓰기 가능) ===========================
  const DefaultConfig = {
    hideDiag: true,                       // 진단 패널 숨김
    autoRefreshSeconds: 0,                // 0=끄기, N초마다 재로딩
    useProxyOG: true,                     // r.jina.ai로 이미지 추출
    catalogApi: "",                       // 예: "/api/top?country=" (없으면 /data/*.json 사용)
    selectors: {
      grid: '#grid, #cards, [data-role=\"grid\"], .cards',
      diag: '#diag, .diag, [data-role=\"diag\"]',
      count: '#count, .count, [data-role=\"count\"]',
      search: '#q, #search, input[type=\"search\"], [data-role=\"search\"]',
      continent: '#continent, [data-role=\"continent\"]',
      countryBadges: '[data-iso2], [data-country]'
    },
    // 6대주 코드(AS/AF/EU/NA/SA/OC) 매핑. countries.json에 continent 필드가 있으면 그것 사용.
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

  // ===== 전역 유틸 ========================================================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
  function merge(a, b) { return Object.assign({}, a, b, { selectors: Object.assign({}, a.selectors, b.selectors || {}) }); }

  function sanitizeUrl(u) {
    try {
      const url = new URL(u);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch {}
    return '';
  }

  function absolutize(u, baseURL) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return (new URL(baseURL)).protocol + u;
    const base = new URL(baseURL);
    if (u.startsWith('/')) return base.origin + u;
    const path = base.pathname.replace(/\/[^/]*$/, '/');
    return base.origin + path + u.replace(/^\.\//, '');
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
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    return res.json();
  }

  async function loadConfig() {
    // window.LiveConfig 우선 → /config.json → 기본
    try {
      if (window.LiveConfig) return merge(DefaultConfig, window.LiveConfig);
    } catch {}
    try {
      const cfg = await fetchJson('config.json').catch(()=>null);
      if (cfg) return merge(DefaultConfig, cfg);
    } catch {}
    return DefaultConfig;
  }

  // ===== 진단/카운트/컨테이너 ==============================================
  function createDiag(sel) {
    const el = $(sel);
    if (el) return el;
    const pre = document.createElement('pre');
    pre.id = 'diag';
    pre.style.position = 'fixed';
    pre.style.bottom = '12px';
    pre.style.right = '12px';
    pre.style.background = 'rgba(0,0,0,.75)';
    pre.style.color = '#0f0';
    pre.style.padding = '10px 12px';
    pre.style.borderRadius = '8px';
    pre.style.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    pre.style.maxWidth = '42vw';
    pre.style.maxHeight = '40vh';
    pre.style.overflow = 'auto';
    document.body.appendChild(pre);
    return pre;
  }

  function getDiag(sel, hide) {
    if (hide) {
      return { textContent:'', set textContent(v){} };
    }
    return createDiag(sel);
  }

  function getCountEl(sel) {
    let el = document.querySelector(sel);
    if (el) return el;
    const candidates = Array.from(document.querySelectorAll('button, a, span, div'));
    el = candidates.find(n => /^\s*표시\s*:/.test((n.textContent || '').trim()));
    if (el) return el;

    const badge = document.createElement('span');
    badge.id = 'count';
    badge.className = 'badge';
    badge.textContent = '표시: 0개';
    badge.style.marginLeft = '8px';
    badge.style.padding = '6px 10px';
    badge.style.border = '1px solid #e6e9f0';
    badge.style.borderRadius = '999px';
    badge.style.background = '#fff';
    (document.querySelector('.toolbar, .filters, header') || document.body).appendChild(badge);
    return badge;
  }

  function getGrid(sel) {
    const el = $(sel);
    if (el) return el;
    const div = document.createElement('div');
    div.id = 'grid';
    div.style.display = 'grid';
    div.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
    div.style.gap = '16px';
    document.body.appendChild(div);
    return div;
  }

  // ===== 이미지 해석(r.jina.ai 사용) =======================================
  const OG_CACHE = new Map();
  async function fetchOgImageViaProxy(pageUrl, enable=true) {
    if (!enable) return '';
    if (!pageUrl) return '';
    if (OG_CACHE.has(pageUrl)) return OG_CACHE.get(pageUrl);
    let proxied = '';
    try {
      const u = new URL(pageUrl);
      proxied = `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
    } catch { return ''; }

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
        if (m && m[1]) {
          const abs = absolutize(m[1], pageUrl);
          OG_CACHE.set(pageUrl, abs);
          return abs;
        }
      }
      const ld = text.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of ld) {
        const jsonTxt = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>[\s\S]*$/, '').trim();
        try {
          const data = JSON.parse(jsonTxt);
          const img = extractImageFromLD(data);
          if (img) {
            const abs = absolutize(img, pageUrl);
            OG_CACHE.set(pageUrl, abs);
            return abs;
          }
        } catch {}
      }
      const m = text.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m && m[1]) {
        const abs = absolutize(m[1], pageUrl);
        OG_CACHE.set(pageUrl, abs);
        return abs;
      }
    } catch {}
    OG_CACHE.set(pageUrl, '');
    return '';
  }

  function extractImageFromLD(data) {
    const arr = Array.isArray(data) ? data : [data];
    for (const obj of arr) {
      if (!obj || typeof obj !== 'object') continue;
      if (typeof obj.image === 'string') return obj.image;
      if (obj.image && typeof obj.image === 'object') {
        if (typeof obj.image.url === 'string') return obj.image.url;
        if (Array.isArray(obj.image) && obj.image.length) {
          const f = obj.image[0];
          if (typeof f === 'string') return f;
          if (f && typeof f.url === 'string') return f.url;
        }
      }
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object') {
          const r = extractImageFromLD(v);
          if (r) return r;
        }
      }
    }
    return '';
  }

  // ===== 카드 렌더 =========================================================
  const PLACEHOLDER_IMG = './assets/placeholder.png';

  async function resolveImage(item, cfg) {
    const direct = sanitizeUrl(item.image_url || '');
    if (direct) return direct;
    const buy = sanitizeUrl(item.buy_url || '');
    if (buy) {
      const fromProxy = await fetchOgImageViaProxy(buy, cfg.useProxyOG);
      if (fromProxy) return fromProxy;
    }
    return PLACEHOLDER_IMG;
  }

  function makeCard(item, imgUrl) {
    const safeTitle = (item.title || '').toString();
    const safeBrand = (item.brand || '').toString();
    const price = typeof item.price === 'number' ? item.price : Number(item.price || 0);
    const currency = (item.currency || '').toString();
    const href = sanitizeUrl(item.buy_url) || '#';

    const el = document.createElement('article');
    el.className = 'card';
    el.style.border = '1px solid #e6e9f0';
    el.style.borderRadius = '12px';
    el.style.overflow = 'hidden';
    el.style.background = '#fff';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';

    const imgWrap = document.createElement('div');
    imgWrap.style.aspectRatio = '1/1';
    imgWrap.style.overflow = 'hidden';
    imgWrap.style.background = '#f6f7fa';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = imgUrl;
    img.alt = safeTitle;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.src = PLACEHOLDER_IMG; };
    imgWrap.appendChild(img);

    const body = document.createElement('div');
    body.style.padding = '12px 14px';
    body.style.display = 'grid';
    body.style.gap = '8px';

    const brand = document.createElement('div');
    brand.textContent = safeBrand;
    brand.style.color = '#5f6b7a';
    brand.style.fontSize = '12px';

    const title = document.createElement('h3');
    title.textContent = safeTitle;
    title.style.margin = '0';
    title.style.fontSize = '15px';
    title.style.lineHeight = '1.35';
    title.style.fontWeight = '600';

    const priceEl = document.createElement('div');
    priceEl.textContent = price ? `${price.toLocaleString()} ${currency}` : '';
    priceEl.style.fontSize = '14px';
    priceEl.style.fontWeight = '700';

    const btn = document.createElement('a');
    btn.textContent = '구매하기';
    btn.href = href;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.style.display = 'inline-block';
    btn.style.textAlign = 'center';
    btn.style.background = '#0b6dd8';
    btn.style.color = '#fff';
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '8px';
    btn.style.textDecoration = 'none';
    btn.style.fontSize = '14px';
    btn.style.marginTop = '4px';

    body.append(brand, title, priceEl, btn);
    el.append(imgWrap, body);
    return el;
  }

  // ===== 데이터 소스: API 우선 → 로컬 JSON ================================
  async function loadProducts(countryISO2, cfg) {
    // 1) API 우선
    if (cfg.catalogApi) {
      const u = cfg.catalogApi + encodeURIComponent(countryISO2);
      try {
        const list = await fetchJson(u);
        if (Array.isArray(list) && list.length) return list.slice(0, 20);
      } catch {}
    }
    // 2) 로컬 JSON (data/products_<ISO2>.json)
    const base = getBasePath();
    const urls = [
      `${base}data/products_${countryISO2}.json`,
      `data/products_${countryISO2}.json`,
      `./data/products_${countryISO2}.json`
    ];
    for (const url of urls) {
      try {
        const list = await fetchJson(url);
        if (Array.isArray(list) && list.length) return list.slice(0, 20);
      } catch {}
    }
    return [];
  }

  // ===== 렌더 루프 =========================================================
  async function renderApp(cfg, countryISO2) {
    const grid = getGrid(cfg.selectors.grid);
    const countEl = getCountEl(cfg.selectors.count);
    const diag = getDiag(cfg.selectors.diag, cfg.hideDiag);

    grid.innerHTML = '';
    let items = [];
    let err = null;
    try {
      items = await loadProducts(countryISO2, cfg);
    } catch (e) {
      err = e.message || String(e);
    }

    const s0 = summary(items);
    const qEl = $(cfg.selectors.search);
    const needle = (qEl && qEl.value) ? qEl.value.trim().toLowerCase() : '';
    const filtered = !needle ? items : items.filter(v => {
      const t = (v.title || '').toLowerCase();
      const b = (v.brand || '').toLowerCase();
      return t.includes(needle) || b.includes(needle);
    });
    const s1 = summary(filtered);

    let resolved = 0;
    for (const it of filtered) {
      const hrefOk = sanitizeUrl(it.buy_url);
      if (!hrefOk) continue;
      const imgUrl = await resolveImage(it, cfg);
      if (imgUrl && imgUrl !== PLACEHOLDER_IMG) resolved++;
      grid.appendChild(makeCard(it, imgUrl));
    }
    countEl.textContent = `표시: ${grid.children.length}개`;

    const diagObj = {
      state: { country: countryISO2 },
      DIAG: {
        source: cfg.catalogApi ? 'API' : 'local_json',
        count_raw: s0.raw,
        visible_after_url_filter: s1.visible,
        invalid_buy_url: s1.invalidUrl,
        rendered: grid.children.length,
        img_resolved: resolved
      },
      error: err || null
    };
    try { diag.textContent = JSON.stringify(diagObj, null, 2); } catch {}
  }

  // ===== 대륙/국가 선택 (선택적으로 UI 생성) ===============================
  async function setupContinentCountry(cfg) {
    // countries.json이 있으면 읽어서 enabled/continent 기준으로 사용
    let countries = null;
    try { countries = await fetchJson('countries.json'); } catch {}
    const continentSel = $(cfg.selectors.continent);
    if (!continentSel) return; // 페이지에 없으면 스킵

    if (continentSel.tagName === 'SELECT') {
      continentSel.innerHTML = '';
      cfg.continents.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        continentSel.appendChild(opt);
      });
    }

    // 대륙 변경 시 국가 배지 필터링(배지가 data-iso2로 존재할 때)
    continentSel.addEventListener('change', () => {
      const id = continentSel.value;
      const badges = $all(cfg.selectors.countryBadges);
      if (!badges.length || !countries) return;
      // countries.json: [{iso2:'KR', continent:'AS', enabled:true}, ...]
      const allowed = new Set(countries.filter(c => c.enabled && c.continent === id).map(c => c.iso2.toUpperCase()));
      badges.forEach(b => {
        const iso = (b.getAttribute('data-iso2') || b.getAttribute('data-country') || '').toUpperCase();
        if (!iso) return;
        b.style.display = allowed.has(iso) ? '' : 'none';
      });
    });
  }

  // ===== 초기화/자동 새로고침 ==============================================
  document.addEventListener('DOMContentLoaded', async () => {
    const cfg = await loadConfig();
    const url = new URL(location.href);
    let country = (url.searchParams.get('country') || url.searchParams.get('iso2') || cfg.defaultCountry || 'KR').toUpperCase();

    // 대륙/국가 UI
    setupContinentCountry(cfg).catch(()=>{});

    // 검색 입력 이벤트
    const s = $(cfg.selectors.search);
    if (s) {
      let t=null; s.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>renderApp(cfg, country), 120); });
    }

    // 국가 배지 클릭 이벤트
    $all(cfg.selectors.countryBadges).forEach(el => {
      el.addEventListener('click', () => {
        const iso = (el.getAttribute('data-iso2') || el.getAttribute('data-country') || '').toUpperCase();
        if (/^[A-Z]{2}$/.test(iso)) {
          country = iso;
          renderApp(cfg, country);
        }
      });
    });

    renderApp(cfg, country);

    // 자동 새로고침
    if (Number(cfg.autoRefreshSeconds) > 0) {
      setInterval(() => renderApp(cfg, country), Number(cfg.autoRefreshSeconds) * 1000);
    }

    // 디버그 노출
    window.LiveShopping = { render: (iso)=>renderApp(cfg, iso||country), cfg };
  });
})();