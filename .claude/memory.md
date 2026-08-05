# 메인 대시보드 — 상세 규칙 (.claude/memory.md)

## 기기 핑거프린트 시스템 (건드리면 로그인 전체 깨짐)
- generateDeviceFingerprint(): userAgent + 해상도 + 색심도 + 언어 + 플랫폼 + 시간대 → SHA 해시
- localStorage 'pro_device_fp'에 저장
- MAX_DEVICES = 2 (1인당 최대 기기 수)
- 초과 시 deviceLimitScreen 표시 → 사용자가 기기 '교체' 버튼으로 직접 해제
- getDeviceLabel(): Chrome/Safari/Edge + Windows/Mac/iOS 분류
- getDeviceType(): mobile/pc 분류

## Three.js Aurora 배경 (절대 건드리지 마)
- WebGL 셰이더 기반 무한 반복 오로라 애니메이션 (~line 961-1055)
- auroraCanvas에 렌더링
- frame 폭주 시 성능 문제 가능 → requestAnimationFrame 기반
- 마우스 추적 글로우: mouse-glow 요소 (~line 1060-1090)
- 카드 보더 각도 추적: conic-gradient + mask-image (proximity 80px)

## 무한 캐러셀
- 원본 7개 카드 + 클론으로 무한 슬라이드
- currentSlide 포지션 관리 필수
- carouselPrev/carouselNext: 화살표 네비게이션
- 터치 드래그 지원 (모바일)
- 카드 스태거 애니메이션: 0.03초 간격 순차 등장

## 화면 전환 로직
```
showScreen(screenId):
  - 'loginScreen' → 로그인/회원가입 폼
  - 'pendingScreen' → 승인 대기
  - 'rejectedScreen' → 거부됨
  - 'deviceLimitScreen' → 기기 제한
  - 'heroFrame' → 메인 대시보드 (7대 시스템 카드)

showLandingButtons(show, isAdmin):
  - logoutBtn: show 시 표시
  - helpdeskBtn: show 시 표시 (모든 사용자)
  - adminOpenBtn: show && isAdmin 시에만 표시
```

## Firebase 에러 한글화
- getAuthErrorMsg(code): auth/ 코드별 한글 메시지 매핑
- auth/user-not-found → "등록되지 않은 사용자입니다"
- auth/wrong-password → "비밀번호가 올바르지 않습니다" 등

## Firestore 데이터 구조
```
users/{uid}:
  empNo, name, email, phone, status, role
  devices: [{fp, label, type, registeredAt}]
  createdAt, lastLoginAt (serverTimestamp)
  approvedAt, rejectedAt, withdrawnAt
```

## 관리자 대시보드 (admin-overlay)
- adminOpenBtn → openAdmin() → adminDashboard 표시
- loadAdminUsers(): Firestore users 전체 조회
- 필터: 전체/대기중/승인됨/거부됨/탈퇴
- 액션: 승인(adminApprove), 거부(adminReject), 기기초기화(adminResetDevices), 탈퇴(adminWithdraw)
- 검색: adminSearchInput (이름/이메일)

## CDN 의존성 버전
| 라이브러리 | 버전 |
|-----------|------|
| Pretendard | v1.3.9 |
| FontAwesome | 6.5.1 |
| Three.js | r128 |
| Firebase | v9 compat |

## CSS 핵심 (건드리면 UI 깨짐)
| 클래스 | 역할 |
|--------|------|
| .glow-border | 카드 hover 시 conic-gradient 보더 |
| .glow-target / .tool-card | 마우스 추적 글로우 의존 |
| .logo-actions | 세로 배치 (flex-direction:column) |
| .logo-actions-row | 관리자+로그아웃 가로 배치 |
| .helpdesk-btn | 초록색 헬프데스크 버튼 (#22c55e) |
| .admin-btn | 파란색 관리자 버튼 (#6090ff) |
| .splash-screen | 로딩 스플래시 (hideSplash로 제거) |

## 핵심 함수 (삭제/이름변경 금지)
| 함수 | 역할 |
|------|------|
| generateDeviceFingerprint() | 기기 식별 해시 생성 |
| showScreen(screenId) | 화면 전환 |
| showLandingButtons(show, isAdmin) | 상단 버튼 표시/숨김 |
| openAdmin() / closeAdmin() | 관리자 패널 열기/닫기 |
| doLogin() / doSignup() / doLogout() | 인증 |
| renderDeviceLimitScreen() | 기기 제한 화면 |
| hideSplash() | 스플래시 제거 |

## 모바일 최적화 이력 (2026-04-18, v=20260418a/b/c)

### 3차에 걸친 패치 (모두 @media(max-width:640px) 격리)
| 차수 | 커밋 | 주요 작업 |
|------|------|----------|
| 1차 (a) | `e56ca32` | 12개 이슈 일괄 — 카드폭 calc(100vw-142px), hero-badge↔helpdesk 겹침, carousel-btn 44px, auth-input 16px, safe-area, footer 여백 |
| 2차 (b) | `939d987` | 서브화면/모달/landscape — auth-card/pw-modal/logout-modal 12px 여백, admin-search 줄바꿈, admin-stats 2열, `@media(max-height:500) landscape` 전용 블록 |
| 3차 (c) | `3609c47` | 관리자 테이블 카드형 + deviceLimit + reduce-motion — data-label 패턴, device-replace-btn 40px, Three.js prefers-reduced-motion 정적 프레임 |

### 모바일 CSS 구조 (index.html style 블록)
- `@media(max-width:1000px)` — 태블릿 (카드 2열)
- `@media(max-width:640px)` — 모바일 1차/2차/3차 패치 통합
- `@media(max-height:500px) and (orientation:landscape)` — 가로모드 전용

### 관리자 테이블 카드형 전환 (3차 핵심)
- `renderAdminTable()`에서 `<td>`에 `data-label="사원번호"` 등 속성 부여 (9개 컬럼 전부)
- CSS: `.admin-table td::before{content:attr(data-label)}` — 모바일에서만 라벨 표시
- 데스크톱: `display:table-row/table-cell` 유지, `::before` 안 보임
- 관리 action 셀만 `flex-wrap:wrap` + 상단 border로 구분

### Three.js Aurora reduce-motion 패턴
```js
var _reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(_reduceMotion){
  mat.uniforms.u_time.value = 1.2;  // 고정 시점 프레임
  renderer.render(scene, camera);
} else {
  (function animate(ts){ ... })(0);
}
```
Aurora 셰이더 자체는 건드리지 않고 animate 호출만 분기 — 기존 시스템 보호 원칙 준수

### 실기기 검증 (2026-04-18 완료)
- ✅ iOS Safari 16px 자동확대 방지
- ✅ iOS 노치/홈바 safe-area
- ✅ 안드로이드 Chrome 터치 영역
- ✅ landscape 가로모드 logoBar 노출
- ✅ prefers-reduced-motion 동작
- ✅ 카카오톡 링크 미리보기 (OG 적용)

## Open Graph 링크 미리보기 (2026-04-18, 커밋 `1c0fc4f`)

### 파일 구조
- `og-image.png` — 1200×630, 배경 `#28398C`, logo.png 중앙 합성 (target_w=700)
- index.html head에 OG 메타 9종 + Twitter Card 4종 + SEO description 추가

### OG 이미지 재생성 스크립트 (Python PIL)
```python
from PIL import Image
W, H = 1200, 630
canvas = Image.new('RGB', (W, H), (40, 57, 140))  # #28398C
logo = Image.open('logo.png').convert('RGBA')
target_w = 700
ratio = target_w / logo.width
logo_resized = logo.resize((target_w, int(logo.height * ratio)), Image.LANCZOS)
canvas.paste(logo_resized, ((W-target_w)//2, (H-logo_resized.height)//2), logo_resized)
canvas.save('og-image.png', 'PNG', optimize=True)
```

### 문구
- **og:title**: "프로사업단총괄 AI 시스템"
- **og:description**: "보장 분석부터 DB 영업관리, 통합 금융 계산기, 전문 비서 챗봇까지"
- 이미지 URL 쿼리: `?v=20260418` (CDN 캐시 우회)

### OG 수정 시 워크플로우 (반드시 준수)
1. og-image.png 재생성 + index.html 메타 수정
2. git push → Vercel 배포 완료 대기 (~30초)
3. `curl -s https://pro-dashboards.com | grep "og:title"` 로 배포 검증
4. **카카오 캐시 초기화**: https://developers.kakao.com/tool/clear/og → URL 입력 → "캐시 초기화" 버튼
5. 본인 카톡에 URL 재전송해서 미리보기 확인
6. (선택) 페이스북도 사용 중이면: https://developers.facebook.com/tools/debug/

### 카카오 캐시 특성
- 수명 약 7일, 초기화 안 하면 사용자에게 이전 이미지 계속 노출
- "1개의 스크랩 정보가 삭제되었습니다" 메시지 뜨면 초기화 성공
- 디버그 버튼은 선택사항 (공유 전에 미리 확인하고 싶을 때만)

---

## 모바일 히어로·카드 타이포그래피 (2026-08-05, v=20260805a/b/c)

### 간격을 잴 때는 margin이 아니라 "글자 잉크" 기준으로
- **박스 간격 ≠ 눈에 보이는 간격.** 32px Pretendard는 글자 위에 약 5px, 13px는 약 4.5px의 폰트 여백이 붙는다.
  → `margin-bottom:16px`이 시각적으로는 21px로 보였음. **margin 숫자만 보고 "맞았다" 판단 금지.**
- 잉크 위치 측정법 (브라우저 콘솔):
  ```js
  const cv=document.createElement('canvas').getContext('2d');
  const cs=getComputedStyle(el); cv.font=cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  const m=cv.measureText('측정할 문자열');
  // 라인박스 top + (lineHeight-(fontAsc+fontDesc))/2 + (fontAsc-inkAsc) = 잉크 상단
  ```
- ⚠️ **여러 줄 요소는 줄 수를 먼저 구할 것**(`height/lineHeight`). 2줄로 가정한 공식이 320px에서 3줄이 되며 55.6px 같은 헛값을 냈음.
- ⚠️ **`fade-up` 애니메이션(delay 0.5s/0.7s) 정착 전에 재면 값이 흔들린다.** 측정 전
  `[...document.getAnimations()].filter(a=>a.playState==='running')`로 `fadeUp` 잔존 확인 필수.

### 새 모바일 규칙은 `@media(max-width:640px)` 블록에
- 파일 뒤쪽 `@media(max-height:500px) and (orientation:landscape)` 블록에 넣으면 **세로 모드에서 전혀 적용되지 않음.**
  2026-08-05에 실제로 이 실수를 했고, 실측(`word-break: normal`·`br: none`)으로만 발견됐다. 두 블록 모두
  `.card-desc`/`.hero-*`를 다루므로 diff만 보면 구분이 안 된다 — **삽입 위치의 블록 헤더를 눈으로 확인.**

### 모바일 전용 줄바꿈 패턴
```html
<div class="card-desc card-desc-keep">앞줄,<br class="card-desc-br"> 뒷줄.</div>
```
- 기본 CSS에 `.card-desc-br{display:none}`(데스크톱 1줄 유지), 640 블록에서 `display:inline`.
- ⚠️ **`<br>` 뒤에 공백 1칸.** 앞에 두면 데스크톱에서 br이 사라질 때 "앞줄,뒷줄"로 붙는다.
  (줄 시작 공백은 CSS가 제거하므로 가운데 정렬에 영향 없음)
- `word-break:keep-all`은 **대상 요소에만** 클래스로. `.card-desc` 전체에 걸면 손대지 말라고 지시받은 카드까지 바뀐다.
- 카드 설명은 `.card-body{text-align:center}`로 **이미 가운데 정렬** — 정렬 요청이 와도 CSS 추가 불필요.
- 캐러셀 클론(원본 7 + 클론 7 = DOM 14개)은 원본 DOM을 복제하므로 HTML 수정이 자동 반영. 검증 시 14개 전부 확인.

### SW 즉시 교체 (v=20260805c)
- `install`에 `skipWaiting()`, `activate`에 `clients.claim()` 추가. 없으면 새 SW가 **탭·PWA 창을 전부 닫을 때까지 waiting** → 앱을 계속 띄워두는 사용자만 구버전.
- Vercel 기본 헤더 실측: `index.html`·`sw.js` 모두 `Cache-Control: public, max-age=0, must-revalidate`(`vercel.json` 없음) → **HTML은 캐시 병목이 아님.**
- `CACHE_NAME`은 `urlsToCache`의 정적 파일이 바뀔 때 bump. `sw.js` 수정만으로도 SW 업데이트는 트리거된다.
