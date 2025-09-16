export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const u = url.searchParams.get('u');
  if (!u) return new Response(JSON.stringify({ error: 'missing u' }), { status: 400, headers: cors() });

  // 서버에서 대상 페이지를 받아 og:image 추출
  try {
    const res = await fetch(u, { redirect: 'follow' });
    const html = await res.text();
    const img = extractOg(html) || extractLD(html) || extractFirstImg(html) || '';
    return json({ image_url: absolutize(img, u) });
  } catch (e) {
    return json({ image_url: '' });
  }
}

function cors() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS'
  };
}
function json(obj, status=200) { return new Response(JSON.stringify(obj), { status, headers: cors() }); }

function absolutize(u, baseURL) {
  if (!u) return '';
  try {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return new URL(baseURL).protocol + u;
    const base = new URL(baseURL);
    if (u.startsWith('/')) return base.origin + u;
    const path = base.pathname.replace(/\/[^/]*$/, '/');
    return base.origin + path + u.replace(/^\.\//,'');
  } catch { return u; }
}
function extractOg(html) {
  const res = html.match(/<meta[^>]+property=[\"']og:image[\"'][^>]*content=[\"']([^\"']+)[\"']/i);
  const res2 = html.match(/<meta[^>]+property=[\"']og:image:secure_url[\"'][^>]*content=[\"']([^\"']+)[\"']/i);
  const res3 = html.match(/<meta[^>]+name=[\"']twitter:image[\"'][^>]*content=[\"']([^\"']+)[\"']/i);
  return (res && res[1]) || (res2 && res2[1]) || (res3 && res3[1]) || '';
}
function extractLD(html) {
  const blocks = html.match(/<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    try {
      const jsonTxt = b.replace(/^[\s\S]*?>/,'').replace(/<\/script>[\s\S]*$/,'').trim();
      const data = JSON.parse(jsonTxt);
      const img = deepFindImage(data);
      if (img) return img;
    } catch {}
  }
  return '';
}
function deepFindImage(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.image === 'string') return data.image;
  if (data.image && typeof data.image === 'object') {
    if (typeof data.image.url === 'string') return data.image.url;
    if (Array.isArray(data.image) && data.image.length) {
      const first = data.image[0];
      if (typeof first === 'string') return first;
      if (first && typeof first.url === 'string') return first.url;
    }
  }
  for (const k of Object.keys(data)) {
    const v = data[k];
    const r = deepFindImage(v);
    if (r) return r;
  }
  return '';
}
function extractFirstImg(html) {
  const m = html.match(/<img[^>]+src=[\"']([^\"']+)[\"']/i);
  return (m && m[1]) || '';
}