
Strict v11.2 (128개국) + Cloudflare Pages Functions OG Resolver
배포 방법
1) 이 폴더를 그대로 Cloudflare Pages에 'Git 연결' 배포(Functions 사용하려면 Direct Upload가 아니라 Git/빌드형을 권장).
2) /functions/api/og.js 가 자동으로 /api/og 라우트가 되어, 브라우저 CORS 없이 og:image를 가져옵니다.
3) config.json 의 ogResolver 기본값은 '/api/og?url={u}' 입니다. 필요 시 다른 엔드포인트로 바꿔 사용하세요.
4) 국가별 Top20은 /data/products_<ISO2>.json 을 실시간으로 갱신하세요. (buy_url 필수, image_url 있으면 더 좋음)
5) 데모 이미지는 없습니다. 이미지/구매 URL이 없으면 카드가 숨겨집니다.
