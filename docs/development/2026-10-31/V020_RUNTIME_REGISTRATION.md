# V-020 런타임 등록 검증·배포

실제 작업일 2026-10-31 KST. [사용자 원문](../../sources/action-api/P0_1355_TRANSCRIPT.md).

## 구현 상태와 검증

작업 시작 시 action-context.mjs에 세 모듈 import와 catalog → customer → fulfillment 래핑, receiptReads 병합이 이미 존재했다. 이 공유 작업을 보존해 배포했다. 신규 중복 팩터리를 덧붙이지 않았다.

tests/runtime-registry.test.mjs는 Worker가 사용하는 createScopedActions의 실제 반환값에서 다음 10종을 검증한다.

- 읽기: read_product, read_lot, read_lot_investigation, list_lot_claims, read_promotion, read_refund_requests, read_escalation_request.
- 쓰기: request_reship, request_schedule_change, request_coupon_issue.

kind 및 validate/authorize/execute 존재, TC/토큰 없는 경우 비노출 검사. tests/payload-budget-independent.test.mjs에서 팩터리를 따로 합치던 보완을 제거하여 실제 22개 런타임 도구만으로 요청 예산을 검사한다. 기존 receipt-lookup-worker 검사로 /접수조회에서는 6개 읽기만 노출, POST 0, 모델 실패 시에도 검증된 접수번호 보존 확인.

START_DEV.cmd check: 전체336/336 테스트·문법·데모 통과. 로그 artifacts/v020-check.log. 사용자 보고316개와 현재336개는 서로 다른 시점의 결과다. /health에 정적 이름 목록을 추가하는 대신 실제 대화 registry 테스트를 선택했다.

## 배포

2026-10-31 14:00 KST 배포 성공(배포 직후 시계 확인14:00:19). 프로젝트 루트 wrangler.jsonc, Worker usechan-kakao-bot.
버전: 784bfb30-3434-4504-88d5-775b174ac195.
URL: https://usechan-kakao-bot.ahead-calendar-dldydcks0528.workers.dev

V-020의 등록 누락 범위는 로컬 실제 registry 검사와 해당 소스 배포로 해소. 업무 API의 새 쓰기나 실제 모델/Kakao 공개 TC 대화를 이 검사에서 실행하지 않았다. 공개 TC 실제 대화 및 전체 정확도 확인은 사용자 후속 검증이며 완료로 표시하지 않는다.

배포 후 확인: Cloudflare deployments list에서2026-10-31T05:00:19.732Z(14:00:19 KST), 위 버전100% 확인. GET /health status=ok, configured=true, actionTokenConfigured=true, actionLookup=true, actionMode=conversation-tc-read-write, maxSteps=10. 문법 검사53파일 통과.
