// Cloudflare Pages Function: /api/top?country=KR
// 목적: 각 국가 인기상품 Top20을 API/스크랩퍼 어댑터로 취합해 JSON 배열 반환
// 실서비스용: 외부 API 키는 환경변수로 넣으세요 (Pages → Settings → Environment variables)

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const iso2 = (url.searchParams.get('country') || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) return json({ error: 'country (ISO2) required' }, 400);

  // 1) Provider 우선 (예: eBay/Rakuten/Amazon/Aliexpress 등) — 키가 없으면 skip
  try {
    const items = await fetchFromProviders(iso2, env);
    if (items && items.length) return json(items.slice(0, 20));
  } catch {}

  // 2) Fallback: 같은 사이트의 /data/products_<ISO2>.json
  try {
    const origin = (new URL(request.url)).origin;
    const res = await fetch(`${origin}/data/products_${iso2}.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return json(data.slice(0,20));
    }
  } catch {}

  return json([]);
}

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

// --- Provider 모음 --------------------------------------------------------
async function fetchFromProviders(iso2, env) {
  // 예시: eBay Browse API (많은 국가 지원) — env.EBAY_TOKEN 필요
  if (env.EBAY_TOKEN) {
    const items = await ebayTrending(iso2, env.EBAY_TOKEN).catch(()=>null);
    if (items && items.length) return items;
  }
  // 예시: 일본 → Rakuten Ranking API — env.RAKUTEN_APP_ID 필요
  if (iso2 === 'JP' && env.RAKUTEN_APP_ID) {
    const items = await rakutenRanking(env.RAKUTEN_APP_ID).catch(()=>null);
    if (items && items.length) return items;
  }
  // TODO: Amazon PA-API(국가별), Walmart(US), BestBuy(CA/US), Yahoo Shopping(JP), Shopee(TW/SG/TH)...
  return null;
}

// eBay Browse API (Trending/Popular: 샘플 엔드포인트 — 토큰은 OAuth 앱에서 발급)
async function ebayTrending(iso2, token) {
  // 제한적 공개 엔드포인트가 없어 카테고리 샘플을 사용. 실서비스는 검색/카테고리 전략 설계 요망.
  const market = marketOf(iso2); // 예: EBAY_US, EBAY_GB, EBAY_AU...
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=trending&limit=20`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': market } });
  if (!res.ok) throw 0;
  const data = await res.json();
  const list = (data.itemSummaries || []).map(x => ({
    sku: x.itemId || '',
    title: x.title || '',
    brand: (x.brand || '') + '',
    price: Number(x.price && x.price.value ? x.price.value : 0),
    currency: (x.price && x.price.currency) || '',
    buy_url: x.itemWebUrl || '',
    image_url: (x.image && x.image.imageUrl) || ''
  })).filter(v => v.title && v.buy_url);
  return list;
}

function marketOf(iso2) {
  const map = {
    US: 'EBAY_US', GB: 'EBAY_GB', AU: 'EBAY_AU', CA: 'EBAY_CA', DE: 'EBAY_DE',
    FR: 'EBAY_FR', IT: 'EBAY_IT', ES: 'EBAY_ES', AT: 'EBAY_AT', BE: 'EBAY_BE',
    NL: 'EBAY_NL', PL: 'EBAY_PL'
  };
  return map[iso2] || 'EBAY_US';
}

// Rakuten Ranking API (일본 인기순)
async function rakutenRanking(appId) {
  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Ranking/20170628?applicationId=${encodeURIComponent(appId)}&period=real`;
  const res = await fetch(url);
  if (!res.ok) throw 0;
  const data = await res.json();
  const list = (data.Items || []).map(w => {
    const x = w.Item || {};
    return {
      sku: x.itemCode || '',
      title: x.itemName || '',
      brand: (x.shopName || '') + '',
      price: Number(x.itemPrice || 0),
      currency: 'JPY',
      buy_url: x.itemUrl || '',
      image_url: (x.mediumImageUrls && x.mediumImageUrls[0] && x.mediumImageUrls[0].imageUrl) || ''
    };
  }).filter(v => v.title && v.buy_url);
  return list;
}