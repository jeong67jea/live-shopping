# LIVE-SHOPPING Quick Patch (2025-09-17)

## 교체/추가 파일
- app.js → robust patch (GitHub Pages 단독 동작 + 자동 이미지 + 셀렉터 정규화 + countries.json 두 스키마 지원)
- config.json → API 사용 안 함(catalogApi:""), 잘못된 셀렉터 제거
- assets/placeholder.png → 플레이스홀더
- countries_fix.js → 현재 countries.json을 평면 128개 활성화로 변환하는 스크립트

## 적용 순서
1) 리포 `live-shopping`에 다음을 업로드/교체
   - `app.js`
   - `config.json`
   - `assets/placeholder.png`
2) (선택) 국가 128개 평면 파일로 전환
   ```bash
   node countries_fix.js ./countries.json > ./countries.json
   git add countries.json && git commit -m "chore: countries 128 flat" && git push
   ```
3) `index.html`의 스크립트에 캐시 버전 쿼리 권장:
   ```html
   <script src="app.js?v=20250917-1"></script>
   ```

## 확인 체크리스트
- /live-shopping/app.js, /live-shopping/config.json, /live-shopping/assets/placeholder.png, /live-shopping/data/products_KR.json 가 200
- 상단 '표시: N개'가 숫자로 갱신
- 이미지가 실제 상품 이미지로 채워짐(일부는 placeholder 가능)
- (선택) countries.json이 128개/활성 128개

