# AGENTS.md

## Role guidance

이 프로젝트에서 구현 에이전트는 사용자의 핵심 목표를 우선해야 한다.

핵심 목표:

> iPhone PWA에서 실제 푸시 알림으로 할 일을 상기시키는 개인용 체크리스트 앱.

## Product constraints

- 사용자는 로컬 저장을 우선 원한다.
- 하지만 실제 푸시 알림이 반드시 중요하다.
- 로컬 저장만으로 실제 잠금화면 알림이 불가능하다면, 최소 백엔드/푸시 서버를 제안하고 그 이유를 명확히 문서화한다.
- 알림음/노래 설정은 가능하면 제공하되, iOS PWA 제약상 불가능하면 MVP에서 제외한다.
- 저녁 리마인드는 18:00이 아니라 **기본 23:00**이다.
- 아침/저녁 알림 시간은 모두 설정 가능해야 한다.
- 반복은 MVP에 포함한다: 매일/매주/매월.

## Do not build

- 로그인/회원가입
- 협업 기능
- 서버 동기화 전체 제품
- 네이티브 iOS 앱
- 캘린더/Notion/Google 연동
- 고급 프로젝트 관리 기능

## Planner handoff expectations

Planner는 먼저 알림 기술 가능성을 검증하는 spike를 계획에 포함해야 한다. 이 프로젝트의 실패 리스크는 UI가 아니라 **iPhone에서 원하는 방식으로 알림이 오느냐**이다.

## Suggested skills for future agents

- `plan`: 구현 계획을 문서화할 때
- `spike`: iOS PWA/Web Push 가능성 검증 실험을 설계할 때
- `test-driven-development`: 구현 단계에서 기능별 테스트를 먼저 잡을 때
- `systematic-debugging`: 알림/서비스워커 문제가 발생했을 때
