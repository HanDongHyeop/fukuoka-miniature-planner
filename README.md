# 후쿠오카·기타큐슈 미니어처 플래너 — 앱

브라우저에서 `index.html`을 열면 됩니다(설치·빌드 불필요). 폰에서 쓰려면 이 `app/` 폴더를 통째로 정적 호스팅(GitHub Pages·Netlify 등)하거나, PC에서 `python -m http.server`로 띄우고 같은 Wi-Fi의 폰으로 접속하세요.

## 구조
- `index.html` — 앱 전체(UI·지도 조작·애니메이션). 외부 라이브러리 없음.
- `data.js` — 장소·일정·장면 좌표·스프라이트 경로. **직접 고치지 말고** `../tools/build_data.py`를 실행해 다시 생성.
  - 장소 정보 원천: `../data/places.json`
  - 일정 순서·체류시간·핀 위치(이미지 % 좌표)·경유점: `build_data.py`의 `DAY1`/`DAY2`
  - 사람·차량·열차가 다니는 경로: `build_data.py`의 `SCENES[*].roads/walks/rails`
- `assets/scenes/*.jpg` — 힉스필드(Nano Banana Pro 2K) 장면을 1800px JPEG로 변환한 지도 바탕.
- `assets/sprites/**` — 시트를 `../tools/split_sheet.py`로 분리한 투명 PNG.

## 화면 규칙
- 여정에 있는 건물: 지도 전체를 살짝 어둡게 하고 해당 건물만 **스포트라이트 + 흰 점선 링**으로 밝힘.
- 내 캐릭터: 발밑 **청록 링** + 머리 위 **"나" 깃발**. 선택한 일정 → 다음 일정 구간을 반복해서 걸음.
- 핀 색: 흰(검증) · 노란 점선(당일 확인) · 회색(미확정, 메모 참고) · 청록(방문 완료) · 빨강(선택).
- 설정에서 Day별 시작 시각을 바꾸면 전체 일정이 밀리고, 개점 시각이 있는 곳은 "대기"로 표시.
- `prefers-reduced-motion`이면 장식 애니메이션 정지, 저사양(코어 ≤4 또는 메모리 ≤4GB)이면 스프라이트 절반.

## 데이터 갱신
```
python tools/build_data.py     # data.js 재생성
```
장소를 추가하려면 `data/places.json`에 항목을 넣고 `build_data.py`의 DAY 리스트에 `st(...)`를 추가하면 됩니다. 핀 좌표는 장면 이미지의 가로·세로 퍼센트입니다(`tmp_split/grid/*.jpg` 격자 참고용 이미지는 `tools/`의 격자 스크립트로 다시 만들 수 있음).
