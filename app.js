/*  live-shopping / app.js — Nav Injection Patch
    - 상단 툴바 자동 생성(대륙 선택, 검색, 표시카운트)
    - countries.json 평면/중첩 스키마 모두 지원, enabled 국가만 배지 생성
    - 이미지 자동 추출(r.jina.ai) + http→https 프록시(weserv)
    - GitHub Pages에서 API 404는 조용히 무시하고 /data/products_XX.json Fallback
*/
(() => {
  'use strict';

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

  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
  function merge(a,b){ return Object.assign({}, a, b, { selectors: Object.assign({}, a.selectors, (b&&b.selectors)||{}) }); }
  function sanitizeUrl(u){ try{ const url=new URL(u); if(url.protocol==='http:'||url.protocol==='https:') return url.toString(); }catch{} return ''; }
  function absolutize(u, baseURL){ if(!u) return ''; if(/^https?:\/\//i.test(u)) return u; if(u.startsWith('//')) return (new URL(baseURL)).protocol + u; const base=new URL(baseURL); if(u.startsWith('/')) return base.origin+u; const path=base.pathname.replace(/\/[^/]*$/,'/'); return base.origin+path+u.replace(/^\.\//,''); }
  function getBasePath(){ const p=location.pathname; const i=p.indexOf('/live-shopping/'); return i>=0 ? p.slice(0,i+'/live-shopping/'.length) : p.replace(/[^/]+$/,''); }
  async function fetchJson(url,opts={}){ const r=await fetch(url,{cache:'no-store',...opts}); if(!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); }
  function normalizeSelectors(s){ const o={}; for(const k of Object.keys(s||{})){ const v=String(s[k]||''); o[k]=v.replace(/\[data-role="\#([^"]+)"\]/g,'[data-role="$1"]').replace(/\[data-role='\#([^']+)'\]/g,"[data-role='$1']").replace(/input\[type="\#([^"]+)"\]/g,'input[type="$1"]').replace(/input\[type='\#([^']+)'\]/g,"input[type='$1']"); } return o; }
  function summary(items){ const raw=items.length; const invalid=items.filter(v=>!sanitizeUrl(v.buy_url)).length; return {raw, visible: raw-invalid, invalidUrl: invalid}; }

  const OG = new Map();
  async function fetchOg(pageUrl, enable=true){
    if(!enable||!pageUrl) return ''; if(OG.has(pageUrl)) return OG.get(pageUrl);
    let prox=''; try{ const u=new URL(pageUrl); prox=`https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`; }catch{ return ''; }
    try{
      const res=await fetch(prox,{cache:'no-store'}); if(!res.ok) throw 0;
      const t=await res.text();
      const metas=[
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
      ];
      for(const re of metas){ const m=t.match(re); if(m&&m[1]){ const abs=absolutize(m[1],pageUrl); OG.set(pageUrl,abs); return abs; } }
      const ld=t.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)||[];
      for(const b of ld){ try{ const j=b.replace(/^[\s\S]*?>/,'').replace(/<\/script>[\s\S]*$/,'').trim(); const d=JSON.parse(j); const img=deepFindImage(d); if(img){ const abs=absolutize(img,pageUrl); OG.set(pageUrl,abs); return abs; } }catch{} }
      const m=t.match(/<img[^>]+src=["']([^"']+)["']/i); if(m&&m[1]){ const abs=absolutize(m[1],pageUrl); OG.set(pageUrl,abs); return abs; }
    }catch{} OG.set(pageUrl,''); return '';
  }
  function deepFindImage(d){
    const arr=Array.isArray(d)?d:[d];
    for(const o of arr){
      if(!o||typeof o!=='object') continue;
      if(typeof o.image==='string') return o.image;
      if(o.image&&typeof o.image==='object'){
        if(typeof o.image.url==='string') return o.image.url;
        if(Array.isArray(o.image)&&o.image.length){
          const f=o.image[0]; if(typeof f==='string') return f; if(f&&typeof f.url==='string') return f.url;
        }
      }
      for(const k of Object.keys(o)){ const v=o[k]; if(v&&typeof v==='object'){ const r=deepFindImage(v); if(r) return r; } }
    }
    return '';
  }
  function wrapHttp(u){ return /^http:\/\//i.test(u) ? 'https://images.weserv.nl/?url='+encodeURIComponent(u.replace(/^http:\/\//,'')) : u; }
  const PLACEHOLDERS=['./assets/placeholder.png','/live-shopping/assets/placeholder.png','/assets/placeholder.png','/placeholder.png'];
  function nextPh(curr){ const i=PLACEHOLDERS.indexOf(curr); return PLACEHOLDERS[(i+1)%PLACEHOLDERS.length]; }
  async function resolveImage(item,cfg){ const d=sanitizeUrl(item.image_url||''); if(d) return wrapHttp(d); const buy=sanitizeUrl(item.buy_url||''); if(buy){ const g=await fetchOg(buy,cfg.useProxyOG); if(g) return wrapHttp(g); } return PLACEHOLDERS[0]; }

  function ensureToolbar(){
    let bar = $('.toolbar'); if(bar) return bar;
    bar = document.createElement('div'); bar.className='toolbar';
    Object.assign(bar.style,{display:'flex',alignItems:'center',gap:'10px',margin:'10px 0'});
    const title=$('h1,h2')||document.createElement('h2'); if(!title.parentNode){ title.textContent='쇼핑 LIVE'; document.body.prepend(title); }
    title.after(bar);
    return bar;
  }
  function buildSelect(id,label){
    const wrap=document.createElement('div'); Object.assign(wrap.style,{display:'flex',alignItems:'center',gap:'6px'});
    const lab=document.createElement('span'); lab.textContent=label; lab.style.fontSize='13px'; lab.style.color='#5f6b7a';
    const sel=document.createElement('select'); sel.id=id;
    Object.assign(sel.style,{padding:'6px 8px',border:'1px solid #dfe3ea',borderRadius:'8px'});
    wrap.append(lab,sel); return {wrap, sel};
  }
  function buildSearch(){ const input=document.createElement('input'); input.type='search'; input.placeholder='상품명 검색'; Object.assign(input.style,{padding:'6px 10px',border:'1px solid #dfe3ea',borderRadius:'8px',minWidth:'220px'}); input.id='q'; return input; }
  function buildCount(){ const span=document.createElement('span'); span.id='count'; span.textContent='표시: 0개'; Object.assign(span.style,{marginLeft:'auto',padding:'6px 10px',border:'1px solid #e6e9f0',borderRadius:'999px',background:'#fff'}); return span; }
  function buildCountryStrip(){ const box=document.createElement('div'); box.className='countries-strip'; Object.assign(box.style,{display:'flex',gap:'8px',overflowX:'auto',padding:'6px 2px',borderTop:'1px dashed #e9edf4',borderBottom:'1px dashed #e9edf4',margin:'6px 0 10px'}); return box; }

  function flattenCountries(raw){
    if(!raw) return [];
    if(Array.isArray(raw)){
      return raw.map(x=>({ iso2:(x.iso2||x.code||'').toUpperCase(), name:x.name||'', continent:(x.continent||x.region||'').toUpperCase(), enabled:x.enabled!==false })).filter(x=>x.iso2);
    }
    const map={ '아시아':'AS','유럽':'EU','북아메리카':'NA','남아메리카':'SA','아프리카':'AF','오세아니아':'OC' };
    const out=[]; const by=raw.byContinent||{};
    Object.keys(by).forEach(k=>{
      const id=map[k]||(k.toUpperCase());
      (by[k]||[]).forEach(rec=>{
        out.push({ iso2:(rec.iso2||rec.code||'').toUpperCase(), name:rec.name||'', continent:id, enabled: rec.enabled!==false });
      });
    });
    return out;
  }

  function injectNav(cfg, flat){
    const bar = ensureToolbar();
    let continentSel = $(cfg.selectors.continent);
    if(!continentSel){
      const {wrap, sel} = buildSelect('continent','대륙');
      continentSel = sel; bar.append(wrap);
      cfg.continents.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
    }
    let search = $(cfg.selectors.search); if(!search){ search = buildSearch(); bar.append(search); }
    let count = $(cfg.selectors.count); if(!count){ count = buildCount(); bar.append(count); }

    const strip = buildCountryStrip(); bar.after(strip);
    const enabled = flat.filter(c=>c.enabled);
    const makeBadge = (c)=>{
      const a=document.createElement('button');
      a.textContent = c.name || c.iso2;
      a.setAttribute('data-iso2', c.iso2);
      a.setAttribute('data-continent', c.continent);
      Object.assign(a.style,{padding:'6px 10px',border:'1px solid #e0e6ef',borderRadius:'999px',background:'#fff',cursor:'pointer',whiteSpace:'nowrap',fontSize:'13px'});
      a.addEventListener('click', () => {
        const url = new URL(location.href); url.searchParams.set('country', c.iso2); history.replaceState(null,'',url.toString());
        window.LiveShopping && window.LiveShopping.render && window.LiveShopping.render(c.iso2);
        strip.querySelectorAll('button').forEach(b=>b.style.background='#fff');
        a.style.background='#eef5ff';
      });
      return a;
    };
    enabled.forEach(c => strip.appendChild(makeBadge(c)));

    continentSel.addEventListener('change', ()=>{
      const id = continentSel.value;
      strip.querySelectorAll('button').forEach(b=>{
        b.style.display = (b.getAttribute('data-continent') === id) ? '' : 'none';
      });
    });
  }

  function getGrid(sel){ const el=$(sel); if(el) return el; const d=document.createElement('div'); d.id='grid'; Object.assign(d.style,{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))',gap:'16px'}); document.body.appendChild(d); return d; }
  function getCountEl(sel){ let el=$(sel); if(el) return el; const span=document.createElement('span'); span.id='count'; span.textContent='표시: 0개'; document.body.prepend(span); return span; }
  function getDiag(sel,hide){ if(hide) return {textContent:'', set textContent(v){}}; let el=$(sel); if(el) return el; const pre=document.createElement('pre'); pre.id='diag'; Object.assign(pre.style,{position:'fixed',bottom:'12px',right:'12px',background:'rgba(0,0,0,.75)',color:'#0f0',padding:'10px 12px',borderRadius:'8px',font:'12px ui-monospace,Menlo,Consolas,monospace',maxWidth:'42vw',maxHeight:'40vh',overflow:'auto'}); document.body.appendChild(pre); return pre; }

  function makeCard(item, imgUrl){
    const t=(item.title||'')+''; const b=(item.brand||'')+''; const price=typeof item.price==='number'?item.price:Number(item.price||0);
    const currency=(item.currency||'')+''; const href=sanitizeUrl(item.buy_url)||'#';
    const el=document.createElement('article'); el.className='card';
    Object.assign(el.style,{border:'1px solid #e6e9f0',borderRadius:'12px',overflow:'hidden',background:'#fff',display:'flex',flexDirection:'column'});
    const imgWrap=document.createElement('div'); Object.assign(imgWrap.style,{aspectRatio:'1/1',overflow:'hidden',background:'#f6f7fa'});
    const img=document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.src=imgUrl; img.alt=t; Object.assign(img.style,{width:'100%',height:'100%',objectFit:'cover'}); img.referrerPolicy='no-referrer'; img.onerror=()=>{ img.src=nextPh(img.src); };
    imgWrap.appendChild(img);
    const body=document.createElement('div'); Object.assign(body.style,{padding:'12px 14px',display:'grid',gap:'8px'});
    const brand=document.createElement('div'); brand.textContent=b; Object.assign(brand.style,{color:'#5f6b7a',fontSize:'12px'});
    const title=document.createElement('h3'); title.textContent=t; Object.assign(title.style,{margin:'0',fontSize:'15px',lineHeight:'1.35',fontWeight:'600'});
    const p=document.createElement('div'); p.textContent=price?`${price.toLocaleString()} ${currency}`:''; Object.assign(p.style,{fontSize:'14px',fontWeight:'700'});
    const btn=document.createElement('a'); btn.textContent='구매하기'; btn.href=href; btn.target='_blank'; btn.rel='noopener noreferrer'; Object.assign(btn.style,{display:'inline-block',textAlign:'center',background:'#0b6dd8',color:'#fff',padding:'10px 12px',borderRadius:'8px',textDecoration:'none',fontSize:'14px',marginTop:'4px'});
    body.append(brand,title,p,btn); el.append(imgWrap,body); return el;
  }

  async function loadProducts(iso,cfg){
    if(cfg.catalogApi){
      try{ const u=cfg.catalogApi+encodeURIComponent(iso); const r=await fetch(u,{cache:'no-store'}); if(r.ok){ const list=await r.json(); if(Array.isArray(list)&&list.length) return list.slice(0,20); } }catch{}
    }
    const base=getBasePath();
    for(const url of [`${base}data/products_${iso}.json`,`data/products_${iso}.json`,`./data/products_${iso}.json`]){
      try{ const list=await fetchJson(url); if(Array.isArray(list)&&list.length) return list.slice(0,20); }catch{}
    }
    return [];
  }

  async function renderApp(cfg, iso){
    const grid=getGrid(cfg.selectors.grid);
    const countEl=getCountEl(cfg.selectors.count);
    const diag=getDiag(cfg.selectors.diag, cfg.hideDiag);

    grid.innerHTML='';
    let items=[], err=null;
    try{ items = await loadProducts(iso, cfg); }catch(e){ err=e.message||String(e); }
    const s0=summary(items);

    const q=$(cfg.selectors.search); const needle=(q&&q.value)?q.value.trim().toLowerCase():''; 
    const filtered=!needle?items:items.filter(v=>((v.title||'').toLowerCase().includes(needle) || (v.brand||'').toLowerCase().includes(needle)));
    const s1=summary(filtered);

    let resolved=0;
    for(const it of filtered){
      if(!sanitizeUrl(it.buy_url)) continue;
      const img=await resolveImage(it, cfg);
      if(img && !['./assets/placeholder.png','/live-shopping/assets/placeholder.png','/assets/placeholder.png','/placeholder.png'].includes(img)) resolved++;
      grid.appendChild(makeCard(it,img));
    }
    countEl.textContent = `표시: ${grid.children.length}개`;

    try{ diag.textContent = JSON.stringify({state:{country:iso}, DIAG:{rendered:grid.children.length, count_raw:s0.raw, visible_after_url_filter:s1.visible, invalid_buy_url:s1.invalidUrl, img_resolved:resolved}, error:err||null}, null, 2); }catch{}
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let cfg = DefaultConfig;
    try{ const file = await fetchJson('config.json').catch(()=>null); if(file) cfg = merge(cfg, file); }catch{}
    cfg.selectors = normalizeSelectors(cfg.selectors);

    let raw=null; try{ raw=await fetchJson('countries.json'); }catch{}
    const flat = (function flattenCountries(raw){
      if(!raw) return [];
      if(Array.isArray(raw)){
        return raw.map(x=>({ iso2:(x.iso2||x.code||'').toUpperCase(), name:x.name||'', continent:(x.continent||x.region||'').toUpperCase(), enabled:x.enabled!==false })).filter(x=>x.iso2);
      }
      const map={ '아시아':'AS','유럽':'EU','북아메리카':'NA','남아메리카':'SA','아프리카':'AF','오세아니아':'OC' };
      const out=[]; const by=raw.byContinent||{};
      Object.keys(by).forEach(k=>{
        const id=map[k]||(k.toUpperCase());
        (by[k]||[]).forEach(rec=>{
          out.push({ iso2:(rec.iso2||rec.code||'').toUpperCase(), name:rec.name||'', continent:id, enabled: rec.enabled!==false });
        });
      });
      return out;
    })(raw);

    (function injectNav(){
      const bar = ensureToolbar();
      let continentSel = $(cfg.selectors.continent);
      if(!continentSel){
        const {wrap, sel} = buildSelect('continent','대륙');
        continentSel = sel; bar.append(wrap);
        cfg.continents.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
      }
      let search = $(cfg.selectors.search); if(!search){ search = buildSearch(); bar.append(search); }
      let count = $(cfg.selectors.count); if(!count){ count = buildCount(); bar.append(count); }
      const strip = buildCountryStrip(); bar.after(strip);
      const enabled = flat.filter(c=>c.enabled);
      const makeBadge = (c)=>{
        const a=document.createElement('button');
        a.textContent = c.name || c.iso2;
        a.setAttribute('data-iso2', c.iso2);
        a.setAttribute('data-continent', c.continent);
        Object.assign(a.style,{padding:'6px 10px',border:'1px solid #e0e6ef',borderRadius:'999px',background:'#fff',cursor:'pointer',whiteSpace:'nowrap',fontSize:'13px'});
        a.addEventListener('click', () => {
          const url = new URL(location.href); url.searchParams.set('country', c.iso2); history.replaceState(null,'',url.toString());
          window.LiveShopping && window.LiveShopping.render && window.LiveShopping.render(c.iso2);
          strip.querySelectorAll('button').forEach(b=>b.style.background='#fff');
          a.style.background='#eef5ff';
        });
        return a;
      };
      enabled.forEach(c => strip.appendChild(makeBadge(c)));
      continentSel.addEventListener('change', ()=>{ const id = continentSel.value; strip.querySelectorAll('button').forEach(b=>{ b.style.display = (b.getAttribute('data-continent') === id) ? '' : 'none'; }); });
    })();

    const url = new URL(location.href);
    let country = (url.searchParams.get('country') || url.searchParams.get('iso2') || cfg.defaultCountry || 'KR').toUpperCase();

    const s=$(cfg.selectors.search); if(s){ let t=null; s.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>renderApp(cfg, country), 120); }); }

    $all(cfg.selectors.countryBadges).forEach(el => {
      el.addEventListener('click', () => {
        const iso=(el.getAttribute('data-iso2')||el.getAttribute('data-country')||'').toUpperCase();
        if(/^[A-Z]{2}$/.test(iso)){ country=iso; renderApp(cfg, country); }
      });
    });

    renderApp(cfg, country);
    if(Number(cfg.autoRefreshSeconds)>0) setInterval(()=>renderApp(cfg, country), Number(cfg.autoRefreshSeconds)*1000);

    window.LiveShopping = { render:(iso)=>renderApp(cfg, iso||country), resolveImage, cfg };
  });
})();
)();
