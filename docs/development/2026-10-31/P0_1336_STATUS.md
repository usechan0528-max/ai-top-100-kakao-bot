# V-018 / V-019 구현 및 인계

작업일 2026-10-31. 근거 [사용자 원문](../../sources/action-api/P0_1336_TRANSCRIPT.md). 14:15 배포/14:40 제출은 사용자 목표다.

V-018: ACTION_READ_BINDINGS가 없어도 대화 TC가 있으면 조회5종과 쓰기2종을 생성한다. 기존 서버 바인딩은 보조 호환 경로다. TC·토큰은 서버 클로저에 고정하며 모델 인자로 바꿀 수 없다. 고객 진술/회원 정보와 원장 결과를 대조하는 정책으로 귀속 판단을 변경했다. 주소/수령인/카드끝자리 제거는 유지하며 member_id는 귀속 대조에 필요한 범위로 반환한다. 회원검색은 대화에 제공된 member_id를 받는다. 미연결 결제는 대사 필요 상태를 함께 반환한다. TC 변경 시 이전 요약/조회 문맥 제외 유지, reset 도구 없음.

V-019: request-actions.mjs에 request_refund와 request_escalation을 kind=write로 등록한다. 공식 API-29는 order_no/amount(int32)/reason, API-35는 lane/reason. 두 응답 모두 HTTP200·SUBMITTED·접수번호·시각을 검사하고 환불은 주문번호까지 대조한다. policy_basis와 ownership_confirmed는 내부 확인용으로 API 본문에 보내지 않는다.

호출 전 정책: 모델에게 요청·귀속·기한·금액·승인 권한과 예외를 검토하도록 지시하고 policy_basis를 요구한다. 환불은 같은 run에서 주문 선행조회, 양의 정수/주문액 이하, ownership_confirmed=true를 추가 검사한다. 이는 모델의 정책 판단을 독립 검증하는 완전한 규칙 엔진이 아니며 부분환불 산식 불명·권한 초과는 이관하도록 지시한다. 에스컬레이션 레인은 명세에 enum이 없어 임의 enum을 만들지 않았다.

접수 안전성: API 전역 호출 예산·영속 쓰기 저널 유지. 타임아웃/503/잘못된 접수 응답은 불명 처리·재시도 금지·후속 쓰기 잠금. 명시 TC 400 또는 HTTP 전 예약 실패만 미실행 처리. 실제 환불/승인 완료로 안내하지 않도록 성공 쓰기는 Worker에서 '신청이 접수되었습니다' 문구로 교정한다. maxSteps=8, 기존 18초/대기 포함24초 예산 유지.

검증: START_DEV.cmd check 232/232, 문법·오프라인 데모 통과([로그](P0_1336_CHECK.log)). TC 사전등록 없음, 원장조회→환불→콜백 모의통합, 내부 필드 전송제외, 접수/완료 교정, 금액/정책/귀속 검토 누락, 오류·불명·중복 차단 검증. 실제 액션 쓰기는 검증에서 호출하지 않았다.

조율: 사용자 승인에 따라 액션 토큰 채팅 01a19030-36bd-7d83-b835-84c9ffd78ab7에 코드 안정본과 배포 요청 전달. 동시배포를 피하도록 그 채팅이 최종 CLI 배포 담당. 소스 안정본 인계 시점의 배포/카카오 실제 공개 TC 검증은 미완료이며 후속 버전/health 증거를 받아 갱신한다. CUA Escape로 중단된 UI 검증은 이 채팅에서 우회하지 않았다.

## 배포 및 후속 검증
2026-10-31 13:40 KST health 확인: 버전81fe03a9-e3bf-419e-a2f0-1c14515e5500, https://usechan-kakao-bot.ahead-calendar-dldydcks0528.workers.dev. actionLookup=true, actionMode=conversation-tc-read-write, actionBindingsConfigured=false, maxSteps=8, configured=true. V-018/V-019 최초 배포 완료. 실제 환불/에스컬레이션 쓰기는 이 검증에서 실행하지 않았다.
합본 workerd에서 member_session 추가에 따른 UNION 6개 제한 오류 발견, schedule을 테이블별 MIN 조회로 수정하여 저장/기억/중복차단/사용자격리 통과. 로컬 compatibilityDate는 설치 런타임 지원에 맞춰2026-05-22, 운영설정2026-10-23 유지.
독립리뷰 반영: TC-only 결제/배송 결과에 최소 member_id 근거 반환 및 설명 정정. 보조 회원확인5회/h를 동일TC 영속 누적3회로 보완, 주문 재조회 전 환불 선행조회 캐시 무효화. 보완 합본249/249·dry-run·workerd 통과. 신규 API24/32 모듈 독립테스트도 집계에 포함됐으나 해당 모듈은 아직 런타임 import하지 않았다.
배포 후 액션 토큰 채팅이 실제 프로젝트(usechan) 카카오에서 /액션연결확인 성공 문구 수신을 화면 확인했다고 보고했다. 이 채팅의 직접 UI검증은 아니며 일반 TC/환불·이관 실제 성공과 구분한다. 해당 채팅의 별도 사용자 요청 resolve_member 도구 통합을 합친 최종 보완배포는 그 채팅으로 인계. 81fe03a9 이후 보완본 배포 버전은 후속 확인한다.
