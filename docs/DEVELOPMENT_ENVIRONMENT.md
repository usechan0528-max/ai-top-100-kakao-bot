# 개발 환경 사용 안내

설정일: 2026년 10월 24일

## 시작 방법

프로젝트 폴더의 **START_DEV.cmd를 더블클릭**하면 소스 문법 검사, 전체 테스트, 오프라인 데모가 순서대로 실행됩니다. 결과를 읽고 창을 닫으면 됩니다.

PowerShell에서는 다음 명령을 사용할 수 있습니다.

```powershell
.\START_DEV.cmd check
.\START_DEV.cmd test
.\START_DEV.cmd demo
.\START_DEV.cmd watch
```

`watch`는 파일 변경 시 테스트를 다시 실행하며, Ctrl+C로 종료합니다. 위 명령은 실제 모델 API를 호출하거나 서버를 배포하지 않습니다. 현재 데모는 고정 문구를 출력합니다.

직접 node 명령과 package.json의 test·test:watch·demo는 PATH에 Node가 있는 환경에서만 동작합니다. 일반 Windows에서는 START_DEV.cmd를 사용하세요. 배포 도구용 Node·패키지 실행 환경은 실제 배포 단계에서 별도로 확인합니다.

## 실행 도구

- 확인한 Node 버전: **v24.19.0**
- 프로젝트 최소 요구: Node.js 20 이상
- 재현용 버전 기록: `.node-version`
- 외부 패키지: 없음
- npm 설치: 현재 실행·테스트에 필요 없음

시작 스크립트는 PATH에 있는 Node를 먼저 확인하고, 없으면 사용자 계정의 Codex 내장 Node를 찾습니다. 시스템 PATH나 전역 실행 정책은 변경하지 않습니다. 시작 명령의 실행 정책 옵션은 해당 PowerShell 프로세스에만 적용됩니다.

현재 Codex 내장 런타임을 사용하므로, Codex가 없는 다른 PC에는 Node.js 20 이상을 별도로 준비해야 합니다. `.node-version`은 버전 기록이며 Node를 자동 설치하지 않습니다.

## 폴더별 용도

|폴더|용도|
|---|---|
|`src/`|에이전트와 외부 API 클라이언트 코드|
|`tests/`|자동 테스트|
|`examples/`|오프라인 실행 예제|
|`scripts/`|개발 환경 확인과 실행 도우미|
|`docs/`|개발·운영 설명|
|`.vscode/`|편집기 설정과 작업 메뉴|
|`artifacts/`|로컬 실행 결과·임시 산출물. Git 기록에서 제외|

대회 규정·개발 인계·검토 문서는 기존 프로젝트 최상위에 유지했습니다.

## 편집기 사용

VS Code에서 이 폴더를 열면 작업 메뉴에서 ‘개발 환경 전체 확인’, ‘테스트 실행’, ‘변경 시 테스트 자동 실행’, ‘오프라인 데모 실행’을 선택할 수 있습니다. 필수 확장 프로그램은 없습니다. Codex에서는 START_DEV.cmd 또는 scripts/dev.ps1을 실행하면 됩니다.

텍스트는 UTF-8, 들여쓰기는 공백 2칸을 기본으로 합니다. `.editorconfig`와 `.gitattributes`에 저장 형식을 기록했습니다.

## 변경 기록과 비밀정보

로컬 Git 저장소가 초기화되어 있습니다. 이번 보완 시작 시 Git 작성자 설정이 없어 기준 커밋 대신 파일별 SHA-256을 기록했습니다. 전역 사용자 설정·원격 저장소 연결·업로드는 수행하지 않았습니다.

`.env`, `.env.*`, 로그, 로컬 산출물, Cloudflare 로컬 상태는 `.gitignore`에서 제외했습니다. 비밀키를 소스 코드나 문서에 적지 않습니다. Git 제외 설정은 OneDrive 동기화를 막지 않으므로 실제 키의 저장 위치는 별도 연결 단계에서 결정합니다. 이번 설정에는 키 발급·비밀값 저장이 포함되지 않습니다.

Wrangler 비밀 파일인 .dev.vars·.dev.vars.*도 제외했습니다. .git 내부 파일은 OneDrive 동기화 중 충돌할 수 있으므로 제출 전 최종본은 OneDrive 밖에도 비밀값을 제외해 보관할 계획입니다. Codex 환경에서 Node·Git 실행을 확인한 사실과, 검증 담당이 일반 PowerShell에서 두 명령을 찾지 못했다고 보고한 사실을 구분합니다. 시작 스크립트는 Node를 탐색하지만 Git을 설치하거나 PATH에 등록하지 않습니다.

## 다음 작업의 범위

검증 보고 V-001~V-007의 단일 실행부 보완을 구현했고 정식 테스트 93개를 자체 확인했습니다. 독립 재검증은 남아 있습니다. 실제 모델 어댑터·카카오 서버 통합·당일 액션 API·Durable Objects 저장은 다음 단계입니다. 실행 증거는 docs/development/2026-10-24/AGENT_SAFETY_IMPLEMENTATION.md에 기록합니다.

## 문제 발생 시

- Node를 찾지 못함: Codex 환경에서 실행하거나 별도로 설치된 Node의 실행 경로를 확인합니다.
- 테스트 실패: 출력된 테스트 이름과 오류를 보관하고 기능 변경 사항을 확인합니다.
- 스크립트 실패: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task status`로 실행 도구 확인부터 진행합니다.
- 경로에 대괄호가 있음: 시작 스크립트가 해당 경로를 처리하도록 구성되어 있으므로 제공된 시작 명령을 사용합니다.
