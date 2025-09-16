/*
  live-shopping / app.js (GitHub Pages Quick Patch)
  - Functions(/api/og) 미사용
  - image_url 없을 때 플레이스홀더 사용
  - 이미지 필수 필터 제거
  - products_<ISO2>.json을 fetch 하되 캐시 비활성화
  - 진단 패널에 raw/visible/invalid 표시
*/

(() => {
  'use strict';

  // === 설정 ================================================================
  const USE_FUNCTIONS = false; // GitHub Pages에서는 서버리스 함수 사용 안 함
  const PLACEHOLDER_IMG = './assets/placeholder.png'; // 리포에 추가하세요
  const DEFAULT_COUNTRY = 'KR'; // 초기 선택 국가 (없으면 KR)

  // 셀렉터(페이지 구조가 다르면 필요에 맞게 수정)
  const SELECTORS = {
    grid: '#grid, #cards, [data-role=\"grid\"], .cards',
    diag: '#diag, .diag, [data-role=\"diag\"]',
    count: '#count, .count, [data-role=\"count\"]',
    search: '#q, #search, input[type=\"search\"], [data-role=\"search\"]',
    countryBadges: '[data-iso2], [data-country]',
  };

  // === 유틸 ================================================================
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function guessContainer() {
    const el = $(SELECTORS.grid);
    if (!el) {
      const div = document.createElement('div');
      div.id = 'grid';
      div.style.display = 'grid';
      div.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
      div.style.gap = '16px';
      document.body.appendChild(div);
      return div;
    }
    return el;
  }

  function guessDiag() {
    const el = $(SELECTORS.diag);
    if (!el) {
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
    return el;
  }

  function guessCountEl() {
    const el = $(SELECTORS.count);
    if (!el) {
      const span = document.createElement('span');
      span.id = 'count';
      span.style.position = 'fixed';
      span.style.top = '12px';
      span.style.right = '12px';
      span.style.background = '#111';
      span.style.color = '#fff';
      span.style.padding = '4px 8px';
      span.style.borderRadius = '6px';
      span.style.fontSize = '12px';
      document.body.appendChild(span);
      return span;
    }
    return el;
  }

  function getBasePath() {
    // /live-shopping/ 아래에서 동작하도록 경로 추정
    const p = location.pathname;
    const i = p.indexOf('/live-shopping/');
    if (i >= 0) return p.slice(0, i + '/live-shopping/'.length);
    // fallback: 문서가 루트면 '/'
    return p.replace(/[^/]+$/, '');
  }

  function sanitizeUrl(u) {
    try {
      const url = new URL(u);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString();
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function summary(items) {
    const raw = items.length;
    const invalidUrl = items.filter(v => !sanitizeUrl(v.buy_url)).length;
    const visible = raw - invalidUrl;
    return { raw, visible, invalidUrl };
  }

  async function resolveImage(item) {
    const direct = sanitizeUrl(item.image_url || '');
    if (direct) return direct;
    if (USE_FUNCTIONS) {
      // (패치 버전에서는 사용하지 않음)
      return PLACEHOLDER_IMG;
    }
    return PLACEHOLDER_IMG;
  }

  function cardTemplate(item, imgUrl) {
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

  // === 데이터 로딩 & 렌더 ==================================================
  async function fetchJsonWithFallbacks(urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (_) {}
    }
    throw new Error('All fetch attempts failed: ' + urls.join(' , '));
  }

  function detectISO2FromUI() {
    const url = new URL(location.href);
    const viaQuery = url.searchParams.get('country') || url.searchParams.get('iso2');
    if (viaQuery && /^[A-Z]{2}$/.test(viaQuery)) return viaQuery.toUpperCase();

    // active 배지에서 추출
    const active = document.querySelector('[data-iso2].active, [data-country].active');
    if (active) {
      const v = (active.getAttribute('data-iso2') || active.getAttribute('data-country') || '').toUpperCase();
      if (/^[A-Z]{2}$/.test(v)) return v;
    }
    return DEFAULT_COUNTRY;
  }

  function filterByQuery(items, q) {
    if (!q) return items;
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(v => {
      const t = (v.title || '').toString().toLowerCase();
      const b = (v.brand || '').toString().toLowerCase();
      return t.includes(needle) || b.includes(needle);
    });
  }

  async function render(countryISO2) {
    const base = getBasePath();
    const grid = guessContainer();
    const diag = guessDiag();
    const countEl = guessCountEl();

    grid.innerHTML = ''; // clear

    // data URL 후보 (상대/절대 혼용)
    const rel = `data/products_${countryISO2}.json`;
    const rel2 = `./data/products_${countryISO2}.json`;
    const abs = `${base}data/products_${countryISO2}.json`;
    const urls = [abs, rel, rel2];

    let items = [];
    let err = null;

    try {
      items = await fetchJsonWithFallbacks(urls);
    } catch (e) {
      err = e.message || String(e);
    }

    if (!Array.isArray(items)) items = [];

    const s0 = summary(items);
    const q = ($(SELECTORS.search) || {}).value || '';
    const filtered = filterByQuery(items, q);
    const s1 = summary(filtered);

    // 렌더
    for (const it of filtered) {
      const hrefOk = sanitizeUrl(it.buy_url);
      if (!hrefOk) continue; // 구매링크 없는 항목은 제외

      const imgUrl = await resolveImage(it);
      const card = cardTemplate(it, imgUrl);
      grid.appendChild(card);
    }

    // 카운트 & 진단
    countEl.textContent = `표시: ${grid.children.length}개`;

    const diagObj = {
      state: { country: countryISO2 },
      DIAG: {
        source: `products_${countryISO2}.json`,
        count_raw: s0.raw,
        visible_after_url_filter: s1.visible,
        invalid_buy_url: s1.invalidUrl,
        rendered: grid.children.length,
      },
      error: err || null,
      hint: 'GitHub Pages Quick Patch (no /api/og). image_url 없으면 placeholder 사용.'
    };
    try {
      diag.textContent = JSON.stringify(diagObj, null, 2);
    } catch {
      diag.textContent = String(diagObj);
    }
  }

  // === 이벤트 바인딩 =======================================================
  function bindSearch(countryISO2) {
    const inp = $(SELECTORS.search);
    if (!inp) return;
    let t = null;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => render(countryISO2), 120);
    });
  }

  function bindCountrySwitch() {
    // data-iso2 / data-country 배지를 클릭하면 렌더
    $all(SELECTORS.countryBadges).forEach(el => {
      el.addEventListener('click', () => {
        const iso =
          (el.getAttribute('data-iso2') || el.getAttribute('data-country') || '').toUpperCase();
        if (/^[A-Z]{2}$/.test(iso)) {
          render(iso);
        }
      });
    });
  }

  // === 초기화 =============================================================
  document.addEventListener('DOMContentLoaded', () => {
    const iso2 = detectISO2FromUI();
    bindSearch(iso2);
    bindCountrySwitch();
    render(iso2);
    // 전역 디버그
    window.LiveShopping = { render, resolveImage, sanitizeUrl };
  });
})();