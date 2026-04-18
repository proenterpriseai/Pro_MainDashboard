# Pro Enterprise AI 메인 대시보드

## 프로젝트 개요
7대 핵심 AI 시스템의 통합 허브. Firebase Auth 기반 로그인 + PWA 지원.
700명+ 보험설계사 사용 중인 프로덕션 시스템.

## 기술 스택
- **Frontend**: Vanilla JS + Tailwind CSS + Three.js (3D 배경)
- **Auth**: Firebase Auth (Email/Password) + Firestore (사용자 메타데이터)
- **PWA**: manifest.json + sw.js (Service Worker)
- **배포**: GitHub `proenterpriseai/Pro_MainDashboard` → Vercel `pro-dashboards.com`

## 파일 구조
| 파일 | 역할 |
|------|------|
| `index.html` | 메인 UI + Firebase Auth + 시스템 카드 |
| `manifest.json` | PWA 설치 정의 ("Pro Enterprise AI") |
| `sw.js` | Service Worker (캐시 전략) |
| `icon-192.png` / `icon-512.png` | PWA 아이콘 (파란 원 + PRO) |

## 연결된 시스템 (하드코딩 URL)
| 시스템 | URL |
|--------|-----|
| 보장분석 | `https://pro-insuranceanalysis.com` |
| DB영업관리 | `https://pro-salessystem.com` |
| 통합금융계산기 | `https://pro-financecalculator.vercel.app` |
| 건강검진 AI 전문가 | `https://gemini.google.com/gem/1fAoSklWuFuuvrnNkojfuo7t-ltPL00VX?usp=sharing` |
| AI 활용 헬프 데스크 | `https://gemini.google.com/gem/1ujGMGS3M6CdPOxkFOiWdwplpgAduUXOy?usp=sharing` |
| 예상 보험금 산출 전문가 | `https://gemini.google.com/gem/15CfHW2qR7KKsa2KvSoJutvykQ3Rr_RjT?usp=sharing` |
| 민원 분쟁조정 전문가 | `https://gemini.google.com/gem/1jcmQ743PuN10BT_N88nAuPnESu4mWH_D?usp=sharing` |
| 금융 & 보험 코치 | `https://gemini.google.com/gem/1vUjZNt7m7jLAxJ3ICOv5tI4WIqssmX0H?usp=sharing` |

## ⚠️ 도메인 규칙
- 보장분석/DB영업관리: 반드시 `.com` 도메인 사용 (`.vercel.app` 금지)
- 계산기: `vercel.app` (커스텀 도메인 미구매)

## 인증 시스템
- Firebase Auth: Email + Password
- ADMIN_EMAILS: 프론트엔드 하드코딩 (line ~719) — **향후 Firestore 이전 예정**
- 기기 제한: deviceLimitScreen (디바이스 핑거프린팅)
- Firebase 다운 시: 오프라인 대응 없음 (Auth 실패 → 접근 불가)

## Service Worker 캐시 (sw.js)
- `CACHE_NAME = 'pro-ai-v5'` — 수동 버전 관리
- Firebase/Google API: 네트워크 전용 (캐시 안 함)
- 기타: 네트워크 우선 + 캐시 fallback
- **캐시 갱신**: `CACHE_NAME` 버전 올려야 기존 사용자에게 반영

## ⚠️ 전수 검증 결과 (v=20260325)
- Firebase Auth: 1,000명 동시접속 안전 (Google 인프라 자동 스케일링)
- ADMIN_EMAILS 프론트엔드 노출: P2 개선 대상
- Firebase API 키 프론트엔드 노출: Firestore 보안규칙으로 보호 (정상)
- SW 캐시 수동 관리: P2 개선 대상

## ⚠️ AI 활용 헬프 데스크 (v=20260325)
- 상단 관리자/로그아웃 버튼 **아래**에 초록색 버튼
- 클릭 시 Gemini GEMS 헬프데스크 새 탭 열기
- 로그인한 **모든 사용자**에게 표시 (관리자 전용 아님)
- `showLandingButtons()` + `showScreen()` 두 곳에서 display 제어

## 비밀번호 변경/분실 기능 (v=20260416)
- 로그인 화면 하단에 "비밀번호 변경 | 비밀번호 분실" 링크 (`.auth-sublinks`)
- **비밀번호 변경**: employee_lookup/{empNo} → email 조회 → `reauthenticateWithCredential()` → updatePassword → signOut
  - ⚠️ `signInWithEmailAndPassword` 아님! `reauthenticateWithCredential` 패턴 사용 (v=20260416 변경)
- **비밀번호 분실**: employee_lookup/{empNo} + displayName 일치 확인 → sendPasswordResetEmail (링크 1시간 유효)
- **비밀번호 최소 길이**: 6자 (Firebase Auth 기준 통일, v=20260416)
- `employee_lookup` 컬렉션: { uid, email, displayName } — 비로그인 상태 공개 읽기 (PII 최소화)
- 회원가입(doSignup) 시 batch.set으로 users + employee_lookup 동시 생성
- 기존 사용자 백필: `_backfill-employee-lookup.js` (관리자 Console에서 1회 실행 완료)
- **기존 함수 무수정**: doLogin, doSignup, toggleAuthForm, doLogout 등 원본 그대로

## Caps Lock 감지 + 대소문자 경고 (v=20260416)
- 비밀번호 필드 3곳에 Caps Lock 실시간 경고: `#loginPw`, `#pwCurrentInput`, `#pwNewInput`
- `.caps-lock-warning` CSS 클래스, `setupCapsLockDetection()` 유틸 함수
- 로그인 실패 시(`auth/invalid-credential`, `auth/wrong-password`) 노란색 대소문자 힌트 표시
- `e.getModifierState('CapsLock')` 사용 (keydown/keyup 이벤트)

## Feature Flag (v=20260416)
- `FEATURE_TEMP_PASSWORD = false` — 임시비밀번호 시스템 (미활성)
  - `true` 전환 시: `doPwReset()`이 Cloud Function 호출, 로그인 후 `mustChangePassword` 체크
  - **현재 미배포**: Google Cloud 조직 정책이 Cloud Functions 배포/서비스 계정 키 생성 차단
  - `functions/` 디렉토리에 코드 준비 완료, 조직 정책 완화 시 배포 가능

## 관리자 비밀번호 초기화 도구 (v=20260416)
- **`_reset-user-pw.js`**: PowerShell에서 `node _reset-user-pw.js [사원번호]` 실행
- Firebase CLI 인증 토큰을 읽어서 Identity Platform REST API로 직접 비밀번호 변경
- 이메일 링크 불필요, 1시간 만료 문제 없음
- **사전 조건**: `firebase login` 완료 상태여야 함

## ⚠️ Google Cloud 조직 정책 제약 (v=20260416)
- 조직 정책 `iam.disableServiceAccountKeyCreation` 적용 중
- **서비스 계정 키 생성 불가** (Firebase Console, Google Cloud Console 모두)
- **Cloud Functions 배포 불가** (Cloud Build 권한 없음)
- Firebase Blaze(종량제) 플랜 업그레이드 완료 (2026-04-16)
- Firebase 이메일 템플릿 수정 불가 (조직 정책 또는 Spark→Blaze 전환 직후 제한)

## 배포 순서 (반드시 준수)
1. `.com` (pro-dashboards.com) 먼저 → git push → 배포 확인
2. 코드 수정 시 반드시 push/배포까지 완료
- **커밋 시**: Co-Authored-By 태그 필수

## 모바일 최적화 규칙 (v=20260418a/b/c)
- **격리 전략**: 모든 모바일 스타일은 `@media(max-width:640px)` 블록에 격리. 데스크톱 UX 불변 필수
- **터치 영역**: 버튼/링크 최소 `min-height: 36~44px` (Apple HIG / Google Material 가이드)
- **iOS Safari 16px 룰**: 입력창 `font-size:16px` 미만이면 포커스 시 자동 줌 발동 → 모든 input 16px 고정
- **safe-area**: `env(safe-area-inset-*)` 적용 대상 = body, auth-overlay, admin-overlay (PWA standalone 대응)
- **카드폭 공식**: `calc(100vw - 142px)` = hero margin(20) + content padding(32) + wrapper padding(88) + border(2)
- **캐러셀 getCardWidth**: DOM 기반 측정(`getBoundingClientRect().width + 18`) — CSS 폭 변경 시 JS 수정 불필요
- **landscape 전용**: `@media(max-height:500px) and (orientation:landscape)` 별도 블록 — `body{align-items:flex-start}` 필수 (hero 상단 클립 방지)
- **관리자 테이블 → 카드형**: `data-label` 속성 + `td::before{content:attr(data-label)}` 패턴. thead는 `position:absolute;top:-9999px`
- **접근성**: Three.js Aurora는 `prefers-reduced-motion` 존중 — reduce 설정 시 정적 프레임 1회만 렌더
- **SW 캐시 bump**: 모바일 CSS 수정 시 반드시 `CACHE_NAME` 버전업 (현재 `pro-ai-v9`)

## Open Graph 링크 미리보기 (v=20260418)
- `og-image.png` (1200×630, 배경 `#28398C`, `logo.png` 중앙 합성 — Python PIL로 생성)
- **og:title**: "프로사업단총괄 AI 시스템"
- **og:description**: "보장 분석부터 DB 영업관리, 통합 금융 계산기, 전문 비서 챗봇까지"
- 이미지 URL에 `?v=YYYYMMDD` 쿼리 파라미터 붙여서 CDN 캐시 우회
- **OG 수정 후 반드시 캐시 초기화**:
  - 카카오: https://developers.kakao.com/tool/clear/og → URL 입력 → "캐시 초기화"
  - 페이스북: https://developers.facebook.com/tools/debug/ → "Scrape Again"
- 카카오 링크 캐시 수명 약 7일 — 초기화 안 하면 사용자에게 이전 이미지 노출
