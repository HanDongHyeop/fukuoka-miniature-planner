# 후쿠오카·기타큐슈 미니어처 플래너 — 앱

브라우저에서 `index.html`을 열면 됩니다(설치·빌드 불필요). 폰에서 쓰려면 이 `app/` 폴더를 통째로 정적 호스팅(GitHub Pages·Netlify 등)하거나, PC에서 `python -m http.server`로 띄우고 같은 Wi-Fi의 폰으로 접속하세요.

## v2 — 진짜 3D 지도 (2026-09-24)
그림 배경 방식은 폐기했습니다. `tools/fetch_osm.py`가 OpenStreetMap(Overpass)에서 네 구역의 건물·도로·철도·수면·공원을 받아 `app/data/osm_<구역>.json`(미터 좌표)으로 저장하고, `app/world.js`(three.js ESM)가 그 데이터로 브릭 스타일 3D 도시를 세웁니다.
- 건물: 실제 footprint를 층수/높이(OSM 태그, 없으면 용도별 기본값)로 압출. 여정 건물은 카테고리 색 + 흰 링 + 빛기둥.
- 도로·인도·철도·모노레일·수로·공원·가로수를 실제 위치에 배치. 지하·실내 통로(layer<0, tunnel, indoor)는 제외.
- 사람·택시·버스·열차는 절차적 브릭 모델(몸통·다리·팔 관절 애니메이션)이고 도로망 그래프를 따라 걷고 달림. 배경에 그려진 사람은 없음.
- 일정 경로는 도로망 위 최단경로(Dijkstra)로 계산 → 실제 도로 거리로 '도보 km' 표시.
- 카메라: 직교 45° 아이소메트릭, 한 손가락 이동 / 두 손가락 확대·회전 / 휠 확대 / ⟲⟳ 버튼.
- 광역 이동 화면은 3개 도시 클러스터와 철도의 3D 도식.
- `python -m http.server`로 열어야 함(`fetch`로 JSON을 읽으므로 file://에서는 안 열림).
- 힉스필드 Tripo image-to-3D로 랜드마크 메시 테스트 1건(`assets/08_landmarks_3d/mitsui_test.glb`, 9크레딧, 1.5MB/17k tri) — 아직 앱에 넣지 않음.

## 구조 (v1 — 그림 배경 방식, 참고용)
- `index.html` — 앱 전체(UI·지도 조작·애니메이션). 외부 라이브러리 없음.
- `data.js` — 장소·일정·장면 좌표·스프라이트 경로. **직접 고치지 말고** `../tools/build_data.py`를 실행해 다시 생성.
  - 장소 정보 원천: `../data/places.json`
  - 일정 순서·체류시간·핀 위치(이미지 % 좌표)·경유점: `build_data.py`의 `DAY1`/`DAY2`
  - 사람·차량·열차가 다니는 경로: `build_data.py`의 `SCENES[*].roads/walks/rails`
- `assets/scenes/*.jpg` — 힉스필드(Nano Banana Pro 2K) 장면을 1800px JPEG로 변환한 지도 바탕.
- `assets/sprites/**` — 시트를 `../tools/split_sheet.py`로 분리한 투명 PNG.

## 화면 규칙
- 여정에 있는 건물: 지도 전체를 살짝 어둡게 하고 해당 건물만 **스포트라이트 + 흰 점선 링**으로 밝힘.
- 걷기 모션: 사람 스프라이트를 몸통·왼다리·오른다리 3겹(clip-path)으로 나눠 엉덩이(57%) 관절에서 ±17° 번갈아 흔들고 몸통을 살짝 들썩임. 차량은 서스펜션 흔들림. 힉스필드 AutoSprite는 이 MCP에서 미지원.
- 내 캐릭터: 발밑 **청록 링** + 머리 위 **"나" 깃발**. 선택한 일정 → 다음 일정 구간을 반복해서 걸음.
- 핀 색: 흰(검증) · 노란 점선(당일 확인) · 회색(미확정, 메모 참고) · 청록(방문 완료) · 빨강(선택).
- 설정에서 Day별 시작 시각을 바꾸면 전체 일정이 밀리고, 개점 시각이 있는 곳은 "대기"로 표시.
- `prefers-reduced-motion`이면 장식 애니메이션 정지, 저사양(코어 ≤4 또는 메모리 ≤4GB)이면 스프라이트 절반.

## 데이터 갱신
```
python tools/build_data.py     # data.js 재생성
```
장소를 추가하려면 `data/places.json`에 항목을 넣고 `build_data.py`의 DAY 리스트에 `st(...)`를 추가하면 됩니다. 핀 좌표는 장면 이미지의 가로·세로 퍼센트입니다(`tmp_split/grid/*.jpg` 격자 참고용 이미지는 `tools/`의 격자 스크립트로 다시 만들 수 있음).

## 공개 배포 (지인 공유용)
- GitHub Pages: https://handonghyeop.github.io/fukuoka-miniature-planner/ (저장소 `HanDongHyeop/fukuoka-miniature-planner`, public)
- 갱신: `tools/build_data.py` 실행 후 `app/`의 index.html·data.js·assets를 저장소 루트에 복사해 push하면 1~2분 뒤 반영. push는 `git -c credential.helper='!gh auth git-credential' push`(gh 토큰 사용, 비밀번호 프롬프트 회피).
- 비공개로 돌리려면: 저장소 삭제(`gh repo delete HanDongHyeop/fukuoka-miniature-planner`)로 링크가 바로 닫힘.
