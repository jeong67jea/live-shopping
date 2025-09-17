// tools/activate-128.js
// usage: node tools/activate-128.js countries.json > countries_enabled_128.json
const fs = require('fs');

const extras = [
  // Europe (12)
  ['유럽','AD','안도라'], ['유럽','MC','모나코'], ['유럽','MT','몰타'], ['유럽','SM','산마리노'],
  ['유럽','VA','바티칸'], ['유럽','AL','알바니아'], ['유럽','BA','보스니아 헤르체고비나'],
  ['유럽','ME','몬테네그로'], ['유럽','MK','북마케도니아'], ['유럽','RS','세르비아'],
  ['유럽','UA','우크라이나'], ['유럽','BY','벨라루스'],
  // North America (7)
  ['북아메리카','AG','앤티가 바부다'], ['북아메리카','KN','세인트키츠 네비스'],
  ['북아메리카','LC','세인트루시아'], ['북아메리카','VC','세인트빈센트 그레나딘'],
  ['북아메리카','GD','그레나다'], ['북아메리카','TT','트리니다드 토바고'], ['북아메리카','BZ','벨리즈'],
  // South America (2)
  ['남아메리카','GY','가이아나'], ['남아메리카','SR','수리남'],
];

const file = process.argv[2] || 'countries.json';
const raw = fs.readFileSync(file, 'utf8');
const data = JSON.parse(raw);

// mark all existing as enabled
for (const continent of Object.keys(data.byContinent)) {
  for (const o of data.byContinent[continent]) o.enabled = true;
}

// append extras if missing
const present = new Set();
for (const continent of Object.keys(data.byContinent)) {
  for (const o of data.byContinent[continent]) present.add(o.code);
}
for (const [cont, code, name] of extras) {
  if (!present.has(code)) {
    (data.byContinent[cont] = data.byContinent[cont] || []).push({ code, name, enabled: true });
    present.add(code);
  }
}

// sanity check
let enabled = 0, total = 0;
for (const continent of Object.keys(data.byContinent)) {
  for (const o of data.byContinent[continent]) { total++; if (o.enabled) enabled++; }
}
if (enabled !== 128) {
  console.error(`WARN: enabled=${enabled}, total=${total} (expected 128)`);
}

process.stdout.write(JSON.stringify(data, null, 2));
