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
| Gemini GEMS | `https://gemini.google.com/gem/*` |
| AI 활용 헬프 데스크 | `https://gemini.google.com/gem/938bb95ddc70` |

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

## 배포 순서 (반드시 준수)
1. `.com` (pro-dashboards.com) 먼저 → git push → 배포 확인
2. 코드 수정 시 반드시 push/배포까지 완료
