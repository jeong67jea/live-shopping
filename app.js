/* live-shopping / app.js v2 (syntax-safe)
   - 상단 툴바(대륙 셀렉트, 검색, 카운트) 자동 생성
   - countries.json (평면/중첩) 모두 지원, enabled 국가만 배지 생성
   - GitHub Pages: /api 없이 /data/products_<ISO2>.json 로드
   - 이미지: og:image / twitter:image / 첫 <img> 추출, http 이미지는 weserv 프록시
*/
(() => {
  'use strict';

  // ---------- 기본 설정 ----------
  const CFG = {
    hideDiag: false,
    autoRefreshSeconds: 0,
    useProxyOG: true,
    catalogApi: "",                       // Pages 단독 사용이므로 비움
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

  // ---------- 유틸 ----------
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));
  const okUrl = (u)=>{ try{ const x=new URL(u); return x.protocol==='http:'||x.protocol==='https:'; }catch{ return false; } };
  const absUrl = (u, base)=>{
    if(!u) return '';
    if(/^https?:\/\//i.test(u)) return u;
    if(u.startsWith('//')) return (new URL(base)).protocol + u;
    const b=new URL(base);
    if(u.startsWith('/')) return b.origin+u;
    const p=b.pathname.replace(/\/[^/]*$/,'/');
    return b.origin + p + u.replace(/^\.\//,'');
  };
  const getBasePath = ()=>{
    const p=location.pathname;
    const i=p.indexOf('/live-shopping/');
    return i>=0 ? p.slice(0,i+'/live-shopping/'.length) : p.replace(/[^/]+$/,'');
  };
  const jget = async (url)=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(url+' -> '+r.status);
    return r.json();
  };

  // ---------- 이미지 추출 ----------
  const OG_CACHE = new Map();
  async function fetchOgImage(pageUrl){
    if(!pageUrl) return '';
    if(OG_CACHE.has(pageUrl)) return OG_CACHE.get(pageUrl);
    let prox='';
    try{ const u=new URL(pageUrl); prox=`https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`; }
    catch{ OG_CACHE.set(pageUrl,''); return ''; }
    try{
      const res=await fetch(prox,{cache:'no-store'}); if(!res.ok) throw 0;
      const html=await res.text();

      const metas = [
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
      ];
      for(const re of metas){
        const m=html.match(re);
        if(m && m[1]){ const u=absUrl(m[1], pageUrl); OG_CACHE.set(pageUrl,u); return u; }
      }
      const mImg = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if(mImg && mImg[1]){ const u=absUrl(mImg[1], pageUrl); OG_CACHE.set(pageUrl,u); return u; }
    }catch{}
    OG_CACHE.set(pageUrl,''); return '';
  }
  const wrapHttp = (u)=> /^http:\/\//i.test(u) ? ('https://images.weserv.nl/?url='+encodeURIComponent(u.replace(/^http:\/\//,''))) : u;
  const PLACEHOLDERS = ['./assets/placeholder.png','/live-shopping/assets/placeholder.png','/assets/placeholder.png','/placeholder.png'];
  const nextPh = (curr)=> PLACEHOLDERS[(PLACEHOLDERS.indexOf(curr)+1)%PLACEHOLDERS.length];

  async function resolveImage(item){
    const direct = (item.image_url && okUrl(item.image_url)) ? item.image_url : '';
    if(direct) return wrapHttp(direct);
    const buy = (item.buy_url && okUrl(item.buy_url)) ? item.buy_url : '';
    if(buy){
      const og = await fetchOgImage(buy);
      if(og) return wrapHttp(og);
    }
    return PLACEHOLDERS[0];
  }

  // ---------- UI 생성 ----------
  function ensureToolbar(){
    let bar = $('.toolbar'); if(bar) return bar;
    bar = document.createElement('div'); bar.className='toolbar';
    Object.assign(bar.style,{display:'flex',alignItems:'center',gap:'10px',margin:'10px 0'});
    const title=$('h1,h2')||document.createElement('h2'); if(!title.parentNode){ title.textContent='쇼핑 LIVE'; document.body.prepend(title); }
    title.after(bar); return bar;
  }
  function buildSelect(id,label){
    const wrap=document.createElement('div'); Object.assign(wrap.style,{display:'flex',alignItems:'center',gap:'6px'});
    const lab=document.createElement('span'); lab.textContent=label; lab.style.cssText='font-size:13px;color:#5f6b7a';
    const sel=document.createElement('select'); sel.id=id; sel.style.cssText='padding:6px 8px;border:1px solid #dfe3ea;border-radius:8px';
    wrap.append(lab,sel); return {wrap,sel};
  }
  function buildSearch(){
    const input=document.createElement('input'); input.type='search'; input.placeholder='상품명 검색';
    input.id='q'; input.style.cssText='padding:6px 10px;border:1px solid #dfe3ea;border-radius:8px;min-width:220px';
    return input;
  }
  function buildCount(){
    const span=document.createElement('span'); span.id='count'; span.textContent='표시: 0개';
    span.style.cssText='margin-left:auto;padding:6px 10px;border:1px solid #e6e9f0;border-radius:999px;background:#fff';
    return span;
  }
  function buildCountryStrip(){
    const box=document.createElement('div'); box.className='countries-strip';
    box.style.cssText='display:flex;gap:8px;overflow-x:auto;padding:6px 2px;border-top:1px dashed #e9edf4;border-bottom:1px dashed #e9edf4;margin:6px 0 10px';
    return box;
  }

  // countries.json 평면/중첩 → 평탄화
  function flattenCountries(raw){
    if(!raw) return [];
    if(Array.isArray(raw)){
      return raw.map(x=>({
        iso2:(x.iso2||x.code||'').toUpperCase(),
        name:x.name||'',
        continent:(x.continent||x.region||'').toUpperCase(),
        enabled:x.enabled!==false
      })).filter(x=>x.iso2);
    }
    const map={ '아시아':'AS','유럽':'EU','북아메리카':'NA','남아메리카':'SA','아프리카':'AF','오세아니아':'OC' };
    const out=[]; const by=raw.byContinent||{};
    Object.keys(by).forEach(k=>{
      const id=map[k]||(k.toUpperCase());
      (by[k]||[]).forEach(r=>{
        out.push({ iso2:(r.iso2||r.code||'').toUpperCase(), name:r.name||'', continent:id, enabled:r.enabled!==false });
      });
    });
    return out;
  }

  function diagEl(){
    if(CFG.hideDiag) return { set textContent(v){} };
    let el = $(CFG.selectors.diag);
    if(el) return el;
    el=document.createElement('pre'); el.id='diag';
    el.style.cssText='position:fixed;right:12px;bottom:12px;background:rgba(0,0,0,.75);color:#0f0;padding:10px 12px;border-radius:8px;font:12px ui-monospace,Menlo,Consolas,monospace;max-width:42vw;max-height:40vh;overflow:auto';
    document.body.appendChild(el); return el;
  }

  function gridEl(){
    let el=$(CFG.selectors.grid);
    if(el) return el;
    el=document.createElement('div'); el.id='grid';
    el.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px';
    document.body.appendChild(el); return el;
  }

  // ---------- 네비 + 배지 ----------
  function injectNav(flat){
    const bar = ensureToolbar();

    // 대륙 Select
    let continentSel = $(CFG.selectors.continent);
    if(!continentSel){
      const {wrap, sel} = buildSelect('continent','대륙');
      continentSel=sel; bar.append(wrap);
      CFG.continents.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
    }

    // 검색
    let search = $(CFG.selectors.search); if(!search){ search=buildSearch(); bar.append(search); }

    // 카운트
    let count = $(CFG.selectors.count); if(!count){ count=buildCount(); bar.append(count); }

    // 국가 배지
    const strip = buildCountryStrip(); bar.after(strip);
    const enabled = flat.filter(c=>c.enabled);
    const makeBadge = (c)=>{
      const b=document.createElement('button');
      b.textContent=c.name || c.iso2;
      b.setAttribute('data-iso2', c.iso2);
      b.setAttribute('data-continent', c.continent);
      b.style.cssText='padding:6px 10px;border:1px solid #e0e6ef;border-radius:999px;background:#fff;cursor:pointer;white-space:nowrap;font-size:13px';
      b.addEventListener('click', ()=>{
        const u=new URL(location.href); u.searchParams.set('country', c.iso2); history.replaceState(null,'',u.toString());
        window.LiveShopping && window.LiveShopping.render && window.LiveShopping.render(c.iso2);
        strip.querySelectorAll('button').forEach(x=>x.style.background='#fff');
        b.style.background='#eef5ff';
      });
      return b;
    };
    enabled.forEach(c=>strip.appendChild(makeBadge(c)));

    // 대륙 필터
    continentSel.addEventListener('change', ()=>{
      const id=continentSel.value;
      strip.querySelectorAll('button').forEach(b=>{
        b.style.display = (b.getAttribute('data-continent')===id) ? '' : 'none';
      });
    });
  }

  // ---------- 카드 ----------
  function card(item, imgUrl){
    const p=(typeof item.price==='number')?item.price:Number(item.price||0);
    const c=item.currency||'';
    const el=document.createElement('article'); el.className='card';
    el.style.cssText='border:1px solid #e6e9f0;border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column';
    const iw=document.createElement('div'); iw.style.cssText='aspect-ratio:1/1;overflow:hidden;background:#f6f7fa';
    const img=document.createElement('img'); img.src=imgUrl; img.loading='lazy'; img.decoding='async'; img.alt=item.title||''; img.referrerPolicy='no-referrer';
    img.style.cssText='width:100%;height:100%;object-fit:cover'; img.onerror=()=>{ img.src=nextPh(img.src); };
    iw.appendChild(img);
    const bd=document.createElement('div'); bd.style.cssText='padding:12px 14px;display:grid;gap:8px';
    const brand=document.createElement('div'); brand.textContent=item.brand||''; brand.style.cssText='color:#5f6b7a;font-size:12px';
    const title=document.createElement('h3'); title.textContent=item.title||''; title.style.cssText='margin:0;font-size:15px;line-height:1.35;font-weight:600';
    const price=document.createElement('div'); price.textContent=p?`${p.toLocaleString()} ${c}`:''; price.style.cssText='font-size:14px;font-weight:700';
    const a=document.createElement('a'); a.textContent='구매하기'; a.href=(okUrl(item.buy_url)?item.buy_url:'#'); a.target='_blank'; a.rel='noopener noreferrer';
    a.style.cssText='display:inline-block;text-align:center;background:#0b6dd8;color:#fff;padding:10px 12px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:4px';
    bd.append(brand,title,price,a); el.append(iw,bd); return el;
  }

  // ---------- 데이터 로드 ----------
  async function loadProducts(iso){
    if(CFG.catalogApi){
      try{
        const r=await fetch(CFG.catalogApi+encodeURIComponent(iso),{cache:'no-store'});
        if(r.ok){ const list=await r.json(); if(Array.isArray(list)&&list.length) return list.slice(0,20); }
      }catch{}
    }
    const base=getBasePath();
    const tries=[`${base}data/products_${iso}.json`,`data/products_${iso}.json`,`./data/products_${iso}.json`];
    for(const u of tries){ try{ const j=await jget(u); if(Array.isArray(j)&&j.length) return j.slice(0,20); }catch{} }
    return [];
  }

  // ---------- 렌더 ----------
  async function render(iso){
    const grid=gridEl();
    const countEl = $('#count, .count, [data-role="count"]') || (()=>{ const s=document.createElement('span'); s.id='count'; s.textContent='표시: 0개'; document.body.prepend(s); return s; })();
    const diag=diagEl();

    grid.innerHTML='';
    let items=[], err=null;
    try{ items=await loadProducts(iso); }catch(e){ err=String(e); }

    const q=$('#q, #search, input[type="search"], [data-role="search"]');
    const needle=(q&&q.value)?q.value.trim().toLowerCase():'';
    const list=!needle?items:items.filter(v=>((v.title||'').toLowerCase().includes(needle)||(v.brand||'').toLowerCase().includes(needle)));

    let resolved=0;
    for(const it of list){
      if(!okUrl(it.buy_url)) continue;
      const img=await resolveImage(it);
      if(img && !PLACEHOLDERS.includes(img)) resolved++;
      grid.appendChild(card(it,img));
    }
    countEl.textContent=`표시: ${grid.children.length}개`;

    try{
      diag.textContent = JSON.stringify(
        { state:{country:iso}, DIAG:{rendered:grid.children.length, count_raw:items.length, filtered:list.length, img_resolved:resolved}, error:err||null },
        null, 2
      );
    }catch{}
  }

  // ---------- 부팅 ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    // countries.json 로드
    let flat=[];
    try{
      const raw = await jget('countries.json').catch(()=>null);
      flat = flattenCountries(raw||[]);
    }catch{}

    // 네비 주입
    injectNav(flat);

    // 검색 반응
    const s=$('#q'); if(s){ let t; s.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>render(country),120); }); }

    // 국가 결정
    const url=new URL(location.href);
    let country=(url.searchParams.get('country')||url.searchParams.get('iso2')||CFG.defaultCountry||'KR').toUpperCase();

    // 첫 렌더
    await render(country);

    // 외부에서 호출할 수 있게
    window.LiveShopping={ render:(iso)=>render(iso||country) };
  });
})();
