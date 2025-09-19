/*
  live-shopping / app.js  — Robust Patch (2025-09-17)
  - GitHub Pages 친화: 서버리스 API 없어도 동작, 있으면 자동 활용
  - 이미지 자동 추출: r.jina.ai 로 buy_url에서 og:image/LD+JSON/첫 <img> 파싱
  - http 이미지는 https 프록시(weserv)로 우회
  - placeholder 경로 폴백 체인
  - countries.json: 평면형/중첩형(한글 대륙명) 모두 지원
  - config.json의 잘못된 셀렉터([data-role="#grid"]) 자동 정규화
*/

(() => {
  'use strict';

  // ===== Default config (config.json 또는 window.LiveConfig로 덮어쓰기) =====
  const DefaultConfig = {
    hideDiag: true,
    autoRefreshSeconds: 0,
    useProxyOG: true,
    catalogApi: "", // GitHub Pages만 쓰면 빈 문자열 유지
    selectors: {
      grid: '#grid, #cards, [data-role=\"grid\"], .cards',
      diag: '#diag, .diag, [data-role=\"diag\"]',
      count: '#count, .count, [data-role=\"count\"]',
      search: '#q, #search, input[type=\"search\"], [data-role=\"search\"]',
      continent: '#continent, [data-role=\"continent\"]',
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
  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
  function merge(a,b){ return Object.assign({}, a, b, { selectors: Object.assign({}, a.selectors, (b&&b.selectors)||{}) }); }
  function sanitizeUrl(u){ try{ const url=new URL(u); if(url.protocol==='http:'||url.protocol==='https:') return url.toString(); }catch{} return ''; }
  function absolutize(u, baseURL){
    if(!u) return '';
    if(/^https?:\/\//i.test(u)) return u;
    if(u.startsWith('//')) return (new URL(baseURL)).protocol + u;
    const base = new URL(baseURL);
    if(u.startsWith('/')) return base.origin + u;
    const path = base.pathname.replace(/\/[^/]*$/, '/');
    return base.origin + path + u.replace(/^\.\//,'');
  }
  function getBasePath(){
    const p=location.pathname; const i=p.indexOf('/live-shopping/');
    return i>=0 ? p.slice(0, i + '/live-shopping/'.length) : p.replace(/[^/]+$/, '');
  }
  function summary(items){
    const raw=items.length; const invalid=items.filter(v=>!sanitizeUrl(v.buy_url)).length;
    return { raw, visible: raw-invalid, invalidUrl: invalid };
  }
  async function fetchJson(url, opts={}){
    const res = await fetch(url, { cache:'no-store', ...opts });
    if(!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }
  function normalizeSelectors(s){
    const out={}; for(const k of Object.keys(s||{})){
      const v=String(s[k]||'');
      out[k]=v.replace(/\[data-role="\#([^"]+)"\]/g,'[data-role="$1"]')
              .replace(/\[data-role='\#([^']+)'\]/g,"[data-role='$1']")
              .replace(/input\[type="\#([^"]+)"\]/g,'input[type="$1"]')
              .replace(/input\[type='\#([^']+)'\]/g,"input[type='$1']");
    } return out;
  }
  async function loadConfig(){
    let cfg = DefaultConfig;
    try{ if(window.LiveConfig) cfg=merge(cfg, window.LiveConfig); }catch{}
    try{ const file = await fetchJson('config.json').catch(()=>null); if(file) cfg=merge(cfg,file);}catch{}
    cfg.selectors = normalizeSelectors(cfg.selectors);
    return cfg;
  }

  // ===== DIAG / GRID / COUNT ==============================================
  function createDiag(sel){
    const el=$(sel); if(el) return el;
    const pre=document.createElement('pre'); pre.id='diag';
    Object.assign(pre.style, { position:'fixed', bottom:'12px', right:'12px', background:'rgba(0,0,0,.75)', color:'#0f0',
      padding:'10px 12px', borderRadius:'8px', font:'12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      maxWidth:'42vw', maxHeight:'40vh', overflow:'auto' });
    document.body.appendChild(pre); return pre;
  }
  function getDiag(sel, hide){ return hide ? { textContent:'', set textContent(v){} } : createDiag(sel); }
  function getCountEl(sel){
    let el=document.querySelector(sel); if(el) return el;
    el = Array.from(document.querySelectorAll('button,a,span,div')).find(n => /^\s*표시\s*:/.test((n.textContent||'').trim()));
    if(el) return el;
    const badge=document.createElement('span'); badge.id='count'; badge.className='badge'; badge.textContent='표시: 0개';
    Object.assign(badge.style, { marginLeft:'8px', padding:'6px 10px', border:'1px solid #e6e9f0', borderRadius:'999px', background:'#fff' });
    (document.querySelector('.toolbar, .filters, header')||document.body).appendChild(badge);
    return badge;
  }
  function getGrid(sel){
    const el=$(sel); if(el) return el;
    const div=document.createElement('div'); div.id='grid';
    Object.assign(div.style,{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:'16px' });
    document.body.appendChild(div); return div;
  }

  // ===== Image resolving ===================================================
  const OG_CACHE=new Map();
  async function fetchOgImageViaProxy(pageUrl, enable=true){
    if(!enable||!pageUrl) return ''; if(OG_CACHE.has(pageUrl)) return OG_CACHE.get(pageUrl);
    let proxied=''; try{ const u=new URL(pageUrl); proxied=`https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`; }catch{ return ''; }
    try{
      const res=await fetch(proxied,{cache:'no-store'}); if(!res.ok) throw 0;
      const text=await res.text();
      const metas=[
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
      ];
      for(const re of metas){ const m=text.match(re); if(m&&m[1]){ const abs=absolutize(m[1],pageUrl); OG_CACHE.set(pageUrl,abs); return abs; } }
      const ld=text.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)||[];
      for(const block of ld){ try{ const jsonTxt=block.replace(/^[\s\S]*?>/,'').replace(/<\/script>[\s\S]*$/,'').trim();
        const data=JSON.parse(jsonTxt); const img=deepFindImage(data); if(img){ const abs=absolutize(img,pageUrl); OG_CACHE.set(pageUrl,abs); return abs; }
      }catch{}}
      const m=text.match(/<img[^>]+src=["']([^"']+)["']/i); if(m&&m[1]){ const abs=absolutize(m[1],pageUrl); OG_CACHE.set(pageUrl,abs); return abs; }
    }catch{} OG_CACHE.set(pageUrl,''); return '';
  }
  function deepFindImage(data){
    const arr=Array.isArray(data)?data:[data]; for(const obj of arr){
      if(!obj||typeof obj!=='object') continue;
      if(typeof obj.image==='string') return obj.image;
      if(obj.image&&typeof obj.image==='object'){
        if(typeof obj.image.url==='string') return obj.image.url;
        if(Array.isArray(obj.image)&&obj.image.length){
          const f=obj.image[0]; if(typeof f==='string') return f; if(f&&typeof f.url==='string') return f.url;
        }
      }
      for(const k of Object.keys(obj)){ const v=obj[k]; if(v&&typeof v==='object'){ const r=deepFindImage(v); if(r) return r; } }
    } return '';
  }
  function wrapHttp(u){
    if(!u) return ''; return /^http:\/\//i.test(u) ? 'https://images.weserv.nl/?url='+encodeURIComponent(u.replace(/^http:\/\//,'')) : u;
  }
  const PLACEHOLDER_CANDIDATES=[ './assets/placeholder.png', '/live-shopping/assets/placeholder.png', '/assets/placeholder.png', '/placeholder.png' ];
  function nextPlaceholder(curr){ const i=PLACEHOLDER_CANDIDATES.indexOf(curr); return PLACEHOLDER_CANDIDATES[(i+1)%PLACEHOLDER_CANDIDATES.length]; }
  async function resolveImage(item,cfg){
    const direct=sanitizeUrl(item.image_url||''); if(direct) return wrapHttp(direct);
    const buy=sanitizeUrl(item.buy_url||''); if(buy){ const from=await fetchOgImageViaProxy(buy,cfg.useProxyOG); if(from) return wrapHttp(from); }
    return PLACEHOLDER_CANDIDATES[0];
  }

  // ===== Card =============================================================
  function makeCard(item,imgUrl){
    const t=(item.title||'')+''; const b=(item.brand||'')+'';
    const price=typeof item.price==='number'?item.price:Number(item.price||0);
    const currency=(item.currency||'')+''; const href=sanitizeUrl(item.buy_url)||'#';
    const el=document.createElement('article'); el.className='card';
    Object.assign(el.style,{border:'1px solid #e6e9f0',borderRadius:'12px',overflow:'hidden',background:'#fff',display:'flex',flexDirection:'column'});
    const imgWrap=document.createElement('div'); Object.assign(imgWrap.style,{aspectRatio:'1/1',overflow:'hidden',background:'#f6f7fa'});
    const img=document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.src=imgUrl; img.alt=t; Object.assign(img.style,{width:'100%',height:'100%',objectFit:'cover'}); img.referrerPolicy='no-referrer'; img.onerror=()=>{ img.src=nextPlaceholder(img.src); };
    imgWrap.appendChild(img);
    const body=document.createElement('div'); Object.assign(body.style,{padding:'12px 14px',display:'grid',gap:'8px'});
    const brand=document.createElement('div'); brand.textContent=b; Object.assign(brand.style,{color:'#5f6b7a',fontSize:'12px'});
    const title=document.createElement('h3'); title.textContent=t; Object.assign(title.style,{margin:'0',fontSize:'15px',lineHeight:'1.35',fontWeight:'600'});
    const priceEl=document.createElement('div'); priceEl.textContent=price?`${price.toLocaleString()} ${currency}`:''; Object.assign(priceEl.style,{fontSize:'14px',fontWeight:'700'});
    const btn=document.createElement('a'); btn.textContent='구매하기'; btn.href=href; btn.target='_blank'; btn.rel='noopener noreferrer';
    Object.assign(btn.style,{display:'inline-block',textAlign:'center',background:'#0b6dd8',color:'#fff',padding:'10px 12px',borderRadius:'8px',textDecoration:'none',fontSize:'14px',marginTop:'4px'});
    body.append(brand,title,priceEl,btn); el.append(imgWrap,body); return el;
  }

  // ===== Data source ======================================================
  async function loadProducts(iso,cfg){
    if(cfg.catalogApi){ // API 우선, 실패(404 등)이면 조용히 패스
      try{
        const u=cfg.catalogApi+encodeURIComponent(iso);
        const res=await fetch(u,{cache:'no-store'});
        if(res.ok){ const list=await res.json(); if(Array.isArray(list)&&list.length) return list.slice(0,20); }
      }catch{}
    }
    const base=getBasePath();
    for(const url of [`${base}data/products_${iso}.json`,`data/products_${iso}.json`,`./data/products_${iso}.json`]){
      try{ const list=await fetchJson(url); if(Array.isArray(list)&&list.length) return list.slice(0,20); }catch{}
    }
    return [];
  }

  // ===== countries.json 로더 (두 가지 스키마 지원) =========================
  function flattenCountries(raw){
    if(!raw) return [];
    if(Array.isArray(raw)){ // 평면형
      return raw.map(x=>({
        iso2: (x.iso2||x.code||'').toUpperCase(),
        name: x.name||'',
        continent: (x.continent||x.region||'').toUpperCase(),
        enabled: x.enabled!==false
      })).filter(x=>x.iso2);
    }
    // 중첩형: { order:[], byContinent:{'아시아':[ {code,name,enabled}, ... ]} }
    const map={ '아시아':'AS','유럽':'EU','북아메리카':'NA','남아메리카':'SA','아프리카':'AF','오세아니아':'OC' };
    const by=raw.byContinent||{}; const out=[];
    Object.keys(by).forEach(k=>{
      const id=map[k]||(k.toUpperCase());
      (by[k]||[]).forEach(rec=>{
        out.push({ iso2:(rec.iso2||rec.code||'').toUpperCase(), name:rec.name||'', continent:id, enabled: rec.enabled!==false });
      });
    });
    return out;
  }

  // ===== Render ===========================================================
  async function renderApp(cfg, iso){
    const grid=getGrid(cfg.selectors.grid);
    const countEl=getCountEl(cfg.selectors.count);
    const diag=getDiag(cfg.selectors.diag, cfg.hideDiag);
    grid.innerHTML='';

    let items=[], err=null;
    try{ items = await loadProducts(iso, cfg); }catch(e){ err=e.message||String(e); }
    const s0=summary(items);

    const qEl=$(cfg.selectors.search); const needle=(qEl&&qEl.value)?qEl.value.trim().toLowerCase():'';
    const filtered=!needle?items:items.filter(v=>((v.title||'').toLowerCase().includes(needle) || (v.brand||'').toLowerCase().includes(needle)));
    const s1=summary(filtered);

    let resolved=0;
    for(const it of filtered){
      if(!sanitizeUrl(it.buy_url)) continue;
      const img=await resolveImage(it, cfg); if(img && !['./assets/placeholder.png','/live-shopping/assets/placeholder.png','/assets/placeholder.png','/placeholder.png'].includes(img)) resolved++;
      grid.appendChild(makeCard(it, img));
    }
    countEl.textContent = `표시: ${grid.children.length}개`;

    const diagObj={ state:{country:iso}, DIAG:{ source: cfg.catalogApi?'API':'local_json', count_raw:s0.raw, visible_after_url_filter:s1.visible, invalid_buy_url:s1.invalidUrl, rendered:grid.children.length, img_resolved:resolved }, error:err||null };
    try{ diag.textContent = JSON.stringify(diagObj,null,2); }catch{}
  }

  // ===== 대륙/국가 UI 바인딩 ===============================================
  async function setupContinentCountry(cfg){
    let raw=null; try{ raw=await fetchJson('countries.json'); }catch{}
    if(!raw) return;
    const flat=flattenCountries(raw);
    const enabledSet=new Set(flat.filter(c=>c.enabled).map(c=>c.iso2));
    const continentSel=$(cfg.selectors.continent);
    if(!continentSel) return;

    if(continentSel.tagName==='SELECT' && !continentSel.options.length){
      cfg.continents.forEach(c=>{ const opt=document.createElement('option'); opt.value=c.id; opt.textContent=c.name; continentSel.appendChild(opt); });
    }
    continentSel.addEventListener('change', ()=>{
      const id=continentSel.value;
      const allowed=new Set(flat.filter(c=>c.enabled && c.continent===id).map(c=>c.iso2));
      $all(cfg.selectors.countryBadges).forEach(b=>{
        const iso=(b.getAttribute('data-iso2')||b.getAttribute('data-country')||'').toUpperCase();
        if(!iso) return; b.style.display = allowed.has(iso) ? '' : 'none';
      });
    });

    // 초기: enabled 목록 기준으로 표시/숨김
    if(enabledSet.size){
      $all(cfg.selectors.countryBadges).forEach(b=>{
        const iso=(b.getAttribute('data-iso2')||b.getAttribute('data-country')||'').toUpperCase();
        if(!iso) return; b.style.display = enabledSet.has(iso) ? '' : 'none';
      });
    }
  }

  // ===== Init =============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    const cfg = await loadConfig();
    const url = new URL(location.href);
    let country = (url.searchParams.get('country') || url.searchParams.get('iso2') || cfg.defaultCountry || 'KR').toUpperCase();

    await setupContinentCountry(cfg).catch(()=>{});

    const s=$(cfg.selectors.search); if(s){ let t=null; s.addEventListener('input',()=>{clearTimeout(t); t=setTimeout(()=>renderApp(cfg,country),120);}); }
    $all(cfg.selectors.countryBadges).forEach(el=>{
      el.addEventListener('click', ()=>{
        const iso=(el.getAttribute('data-iso2')||el.getAttribute('data-country')||'').toUpperCase();
        if(/^[A-Z]{2}$/.test(iso)){ country=iso; renderApp(cfg,country); }
      });
    });

    renderApp(cfg, country);
    if(Number(cfg.autoRefreshSeconds)>0) setInterval(()=>renderApp(cfg, country), Number(cfg.autoRefreshSeconds)*1000);

    window.LiveShopping = { render:(iso)=>renderApp(cfg, iso||country), resolveImage, cfg };
  });
})();