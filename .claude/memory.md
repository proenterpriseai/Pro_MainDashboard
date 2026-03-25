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
