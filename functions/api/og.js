export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get('url');
  if(!target) return new Response(JSON.stringify({error:'missing url'}),{status:400,headers:{'content-type':'application/json'}});
  try{
    const r = await fetch(target, {headers:{'user-agent':'Mozilla/5.0 (compatible; LiveShopBot/1.0)'}});
    const html = await r.text();
    const base = new URL(target);
    function abs(p){ if(!p) return ''; if(p.startsWith('//')) return base.protocol+p; if(p.startsWith('/')) return base.origin+p; return p; }
    const metas=[
      /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
    ];
    for(const re of metas){ const m=html.match(re); if(m){ return new Response(JSON.stringify({image:abs(m[1])}), {headers:{'content-type':'application/json'}}); } }
    const imgs=[...html.matchAll(/<img[^>]+>/gi)].map(x=>x[0]);
    let best='', score=0;
    for(const tag of imgs){
      const m = tag.match(/\s(?:data-src|data-original|src)=["']([^"']+)["']/i);
      if(!m) continue;
      let src = abs(m[1].trim());
      const w = +(tag.match(/\s(?:data-width|width)=["']?(\d+)/i)||[])[1]||0;
      const h = +(tag.match(/\s(?:data-height|height)=["']?(\d+)/i)||[])[1]||0;
      const s = w*h;
      if(s>score){ score=s; best=src; }
    }
    return new Response(JSON.stringify({image:best||''}), {headers:{'content-type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({image:''}), {headers:{'content-type':'application/json'}});
  }
}
