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
