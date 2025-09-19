// Usage:
//   node countries_fix.js ./countries.json > ./countries.fixed.json
// - Accepts two shapes: flat array or {order, byContinent:{'아시아':[ {code,name,enabled}, ... ]}}
// - Sets enabled=true for all entries
// - If count < 128, appends missing countries from ADD_LIST with names+continents
// - Output: flat array [{ iso2, name, continent, enabled:true }]

import fs from 'node:fs';

const ADD_LIST = [
  // Europe (12)
  {iso2:'AD', name:'안도라', continent:'EU'},
  {iso2:'MC', name:'모나코', continent:'EU'},
  {iso2:'MT', name:'몰타', continent:'EU'},
  {iso2:'SM', name:'산마리노', continent:'EU'},
  {iso2:'VA', name:'바티칸', continent:'EU'},
  {iso2:'AL', name:'알바니아', continent:'EU'},
  {iso2:'BA', name:'보스니아 헤르체고비나', continent:'EU'},
  {iso2:'ME', name:'몬테네그로', continent:'EU'},
  {iso2:'MK', name:'북마케도니아', continent:'EU'},
  {iso2:'RS', name:'세르비아', continent:'EU'},
  {iso2:'UA', name:'우크라이나', continent:'EU'},
  {iso2:'BY', name:'벨라루스', continent:'EU'},
  // North America (7)
  {iso2:'AG', name:'앤티가 바부다', continent:'NA'},
  {iso2:'KN', name:'세인트키츠 네비스', continent:'NA'},
  {iso2:'LC', name:'세인트루시아', continent:'NA'},
  {iso2:'VC', name:'세인트빈센트 그레나딘', continent:'NA'},
  {iso2:'GD', name:'그레나다', continent:'NA'},
  {iso2:'TT', name:'트리니다드 토바고', continent:'NA'},
  {iso2:'BZ', name:'벨리즈', continent:'NA'},
  // South America (2)
  {iso2:'GY', name:'가이아나', continent:'SA'},
  {iso2:'SR', name:'수리남', continent:'SA'}
];

function readJson(p){
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function flatten(raw){
  if (Array.isArray(raw)) {
    return raw.map(x => ({
      iso2: (x.iso2 || x.code || '').toUpperCase(),
      name: x.name || '',
      continent: (x.continent || x.region || '').toUpperCase(),
      enabled: true
    })).filter(x=>x.iso2);
  }
  const map = { '아시아':'AS','유럽':'EU','북아메리카':'NA','남아메리카':'SA','아프리카':'AF','오세아니아':'OC' };
  const out = [];
  const by = raw.byContinent || {};
  Object.keys(by).forEach(k => {
    const id = map[k] || (k.toUpperCase());
    (by[k] || []).forEach(rec => {
      out.push({
        iso2: (rec.iso2 || rec.code || '').toUpperCase(),
        name: rec.name || '',
        continent: id,
        enabled: true
      });
    });
  });
  return out;
}

function ensure128(list){
  const seen = new Set(list.map(x=>x.iso2));
  for (const add of ADD_LIST) {
    if (list.length >= 128) break;
    if (!seen.has(add.iso2)) {
      list.push({ ...add, enabled:true });
      seen.add(add.iso2);
    }
  }
  return list;
}

function dedupe(list){
  const map = new Map();
  for (const it of list) map.set(it.iso2, it);
  return Array.from(map.values());
}

function main(){
  const inputPath = process.argv[2];
  if(!inputPath){ console.error('Usage: node countries_fix.js ./countries.json > ./countries.fixed.json'); process.exit(1); }
  let list = flatten(readJson(inputPath));
  list = dedupe(list);
  list = ensure128(list);
  // sort by continent then iso2
  const order = {AS:0, EU:1, NA:2, SA:3, AF:4, OC:5};
  list.sort((a,b)=> (order[a.continent]??9)-(order[b.continent]??9) || a.iso2.localeCompare(b.iso2));
  console.log(JSON.stringify(list, null, 2));
}

main();
