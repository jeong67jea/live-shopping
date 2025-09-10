
/* strict v11.2: 데모 이미지 금지 + 서버/함수 OG 해상기 우선 사용 */
const REQUIRE_REAL_IMAGE=true;
const REQUIRE_BUY_URL=true;
const AUTO_INTERVAL_MS = 120000;
let autoTimer=null, CONFIG=null, DIAG={};

const state={continent:'아시아',country:'KR',search:'',gridSize:20,products:[]};
const el=s=>document.querySelector(s), els=s=>document.querySelectorAll(s);

window.addEventListener('DOMContentLoaded', init);
async function init(){ await loadConfig(); await loadCountries(); bindUI(); await loadProducts(); await enforceStrict(); render(); toggleAutoRefresh(); }

async function loadConfig(){
  CONFIG={buySearchTemplate:'https://www.google.com/search?q={q}', ogResolver:'/api/og?url={u}'}; // Pages Functions 경로
  try{ const r=await fetch('config.json',{cache:'no-store'}); if(r.ok){ const j=await r.json(); Object.assign(CONFIG,j); } }catch(e){}
}
function bindUI(){
  el('#search')?.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase(); render();});
  el('#country')?.addEventListener('change',async e=>{state.country=e.target.value; await loadProducts(); await enforceStrict(); render();});
  el('#refresh')?.addEventListener('click',async()=>{ await loadProducts(true); await enforceStrict(); render();});
  el('#toggleAuto')?.addEventListener('click',toggleAutoRefresh);
  el('#diagnose')?.addEventListener('click',()=>{ const d=el('.dock'); d.classList.toggle('open'); dumpDiag(); });
}
function toggleAutoRefresh(){
  const b=el('#toggleAuto');
  if(autoTimer){ clearInterval(autoTimer); autoTimer=null; b.textContent='자동새로고침: OFF'; }
  else { autoTimer=setInterval(async()=>{ await loadProducts(true); await enforceStrict(); render(); }, AUTO_INTERVAL_MS); b.textContent='자동새로고침: ON'; }
}

/* Countries */
async function loadCountries(){
  try{ const r=await fetch('data/countries.json?cb='+Date.now()); const j=await r.json(); window.__countries=j; }
  catch(e){ window.__countries={order:['아시아'],byContinent:{'아시아':[{'code':'KR','name':'대한민국'}]}}; }
  const menu=el('.menu'); menu.innerHTML='';
  __countries.order.forEach(ct=>{ const b=document.createElement('button'); b.textContent=ct; b.className=(ct===state.continent?'active':''); b.onclick=async()=>{state.continent=ct; els('.menu button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); populateCountrySelect(); renderCountryBar(); await loadProducts(); await enforceStrict(); render();}; menu.appendChild(b); });
  populateCountrySelect(); renderCountryBar();
}
function populateCountrySelect(){ const sel=el('#country'); const list=__countries.byContinent[state.continent]||[]; sel.innerHTML=''; list.forEach(c=>{const o=document.createElement('option'); o.value=c.code; o.textContent=c.name; sel.appendChild(o);}); if(!list.find(x=>x.code===state.country)){ state.country=list[0]?.code||''; } sel.value=state.country; }
function renderCountryBar(){ const bar=el('#countrybar'); const list=__countries.byContinent[state.continent]||[]; bar.innerHTML=''; list.forEach(c=>{const b=document.createElement('button'); b.className='pill'+(c.code===state.country?' active':''); b.textContent=c.name; b.title=c.code; b.onclick=async()=>{state.country=c.code; el('#country').value=c.code; await loadProducts(); await enforceStrict(); render();}; bar.appendChild(b);}); }

/* Products */
async function loadProducts(isAuto=false){
  DIAG.source='products_'+state.country+'.json';
  try{ const r=await fetch('data/'+DIAG.source+'?cb='+(isAuto?Date.now():'0'),{cache:'no-store'}); if(!r.ok) throw 0; state.products=await r.json(); DIAG.count_raw=state.products.length; }
  catch(e){ state.products=[]; DIAG.count_raw=0; }
}
async function enforceStrict(){
  let list = REQUIRE_BUY_URL ? state.products.filter(p=>!!(p.buy_url||p.url)) : state.products.slice();
  const resolved = await Promise.all(list.map(preResolveImage));
  state.products = resolved.filter(Boolean).slice(0, state.gridSize);
  DIAG.count_strict = state.products.length;
}
async function preResolveImage(p){
  const cur = {...p};
  let url = cur.image && /^https?:\/\//i.test(cur.image) ? cur.image : '';
  if(!url && cur.image && !/^https?:\/\//i.test(cur.image)) url = cur.image;
  if(!url && cur.image_url) url = cur.image_url;
  if(!url && cur.buy_url){
    url = await resolveViaFunction(cur.buy_url);
    if(!url) url = await resolveViaReader(cur.buy_url);
  }
  if(!url) return null;
  cur.__image = url;
  return cur;
}
async function resolveViaFunction(pageUrl){
  try{
    if(!CONFIG.ogResolver) return '';
    const endpoint = CONFIG.ogResolver.replace('{u}', encodeURIComponent(pageUrl));
    const r=await fetch(endpoint,{cache:'no-store'});
    if(!r.ok) return '';
    const j=await r.json();
    return j.image||'';
  }catch(e){ return ''; }
}

/* fallback to r.jina.ai reader */
async function resolveViaReader(pageUrl){
  try{
    const u=new URL(pageUrl);
    const prox=`https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
    const r=await fetch(prox,{cache:'no-store'}); if(!r.ok) return '';
    const html=await r.text();
    const metaREs=[
      /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
    ];
    for(const re of metaREs){ const m=html.match(re); if(m){ let img=m[1].trim(); if(img.startsWith('//')) img=u.protocol+img; else if(img.startsWith('/')) img=u.origin+img; return img; } }
    const imgTags=[...html.matchAll(/<img[^>]+>/gi)].map(x=>x[0]);
    const pick = imgTags.map(tag=>{
      const m = tag.match(/\s(?:data-src|data-original|src)=["']([^"']+)["']/i);
      if(!m) return null;
      let src=m[1].trim();
      if(src.startsWith('//')) src=u.protocol+src;
      else if(src.startsWith('/')) src=u.origin+src;
      const w = (tag.match(/\s(?:data-width|width)=["']?(\d+)/i)||[])[1]||0;
      const h = (tag.match(/\s(?:data-height|height)=["']?(\d+)/i)||[])[1]||0;
      return {src, score: (parseInt(w)||0) * (parseInt(h)||0)};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    if(pick.length){ return pick[0].src; }
    return '';
  }catch(e){ return ''; }
}

const IMG_PROXY = url => { try{ const u=new URL(url); return `https://images.weserv.nl/?url=${encodeURIComponent(u.host+u.pathname+u.search)}`; }catch(e){ return url; } };
function setSmartImage(imgEl,url){ let tried=false; imgEl.onerror=()=>{ if(!tried){ tried=true; imgEl.src=IMG_PROXY(url); } }; imgEl.src=url; }

/* Render */
function render(){
  const grid=el('#grid'); grid.innerHTML='';
  const q=state.search; const list=state.products.filter(p=>!q||(String(p.title||'').toLowerCase().includes(q)||String(p.brand||'').toLowerCase().includes(q)));
  const rc=el('#resultCount'); if(rc) rc.textContent=list.length;
  list.forEach(p=>grid.appendChild(renderCard(p)));
}
function renderCard(p){
  const card=document.createElement('div'); card.className='card'; card.innerHTML=`
    <div class="thumb"><span class="live">LIVE</span><img alt="" loading="lazy" src=""></div>
    <div class="body">
      <div class="title">${escapeHtml(p.title||'')}</div>
      <div class="meta">${escapeHtml(p.brand||'')} · ${p.sku||''} · ${state.country}</div>
      <div class="price"><div class="now">${formatCurrency(p.price, p.currency||guessCur(state.country))}</div></div>
      <div class="footer"><button class="btn primary" data-buy>바로구매</button></div>
    </div>`;
  const img = card.querySelector('img'); setSmartImage(img, p.__image);
  card.querySelector('[data-buy]').onclick=()=>window.open(p.buy_url||p.url,'_blank');
  return card;
}

/* Utils */
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function formatCurrency(v,cur='USD'){ try{ return new Intl.NumberFormat(undefined,{style:'currency',currency:cur}).format(v||0); }catch(e){ return (v||0).toLocaleString()+' '+cur; } }
function guessCur(code){ const map={KR:'KRW',JP:'JPY',CN:'CNY',US:'USD',GB:'GBP',EU:'EUR'}; return map[code]||'USD'; }

/* 진단 패널 */
(function(){ const d=document.createElement('pre'); d.className='dock'; document.body.appendChild(d); })();
function dumpDiag(){ const d=document.querySelector('.dock'); d.textContent = JSON.stringify({state:{continent:state.continent,country:state.country},DIAG}, null, 2); }
