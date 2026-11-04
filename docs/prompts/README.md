# 분야별 개발 가이드 프롬프트 색인

모든 프롬프트는 개발용 문서다. 시스템에 적용·배포한 것으로 간주하지 않는다. 원문과 적용 근거는 [자료 전사 색인](../sources/README.md), 누적 업무 방향은 [업무 기준](../BUSINESS_CONTEXT.md)에서 확인한다.

개발 착수 후속: 가이드 중 검수된 주요 판단을 `src/business-policy.mjs`로 편집해 로컬 모델 호출 지침에 연결했다. [선택 범위와 한계](../development/2026-10-31/BUSINESS_POLICY_SCOPE.txt), [구현/검증 기록](../development/2026-10-31/IMPLEMENTATION_STATUS.txt) 참조. 가이드 전체·미검수 링크를 자동 적용한 것이 아니며 실제 모델 정확도·액션·배포는 미검증이다.

2026-10-31 재정제: [착수 판단](../development/2026-10-31/DEVELOPMENT_READINESS.txt). 조억만 기존39행 전사를 [개정 R07](REVISION_GUIDE.md)·[인터뷰 가이드](INTERVIEW_EVIDENCE_GUIDE.md)에 연결했다. B09-T25~28 추가로 개정 분야28개 정적 사례이며 실행 통과 수가 아니다. 현재 코드는 이 가이드들을 자동으로 읽지 않는다.

## 적용 순서

1. [공통 응답·평가 규칙](COMPETITION_GUIDE.md)을 항상 적용한다.
2. [업무 맥락·출처 판단](BUSINESS_KNOWLEDGE_GUIDE.md)으로 문의의 대상·근거·분야를 정한다.
3. 필요한 분야 모듈만 선택하고 실제 조회·처리 권한은 도구 및 승인 체계에서 확인한다. 모든 원문·비공개 내부 정보를 고객 답변에 통째로 넣지 않는다.
4. 최신 제공 사실·정정을 반영하고 미확정은 표시한다. 적용 결과는 실제 에이전트 검증 후 별도로 기록한다.

|분야|가이드|작성된 수용 사례|
|---|---|---|
|공통 응답·평가·전송 제약|[COMPETITION_GUIDE](COMPETITION_GUIDE.md)|9개 C-T01~09|
|업무 구조·지식 출처·시나리오 날짜|[BUSINESS_KNOWLEDGE_GUIDE](BUSINESS_KNOWLEDGE_GUIDE.md)|7개 B-T01~07|
|조직·승인·소개·창구·개인정보|[ORGANIZATION_GUIDE](ORGANIZATION_GUIDE.md)|14개 O-T01~14|
|출고·송장·배송·비용·파손·분실|[SHIPPING_GUIDE](SHIPPING_GUIDE.md)|23개 S-T01~23|
|농산·수산·현장·로트·콜드체인|[PRODUCTION_GUIDE](PRODUCTION_GUIDE.md)|9개 P-T01~09|
|홍보·프로모션·외부 계약·체험 행사|[PROMOTION_GUIDE](PROMOTION_GUIDE.md)|8개 R-T01~08|
|회원 가입·쿠폰·적립·추천·단골가·탈퇴|[MEMBERSHIP_GUIDE](MEMBERSHIP_GUIDE.md)|기존18개 M-T01~18|
|기상·예보·결항·집하·간선 재개|[WEATHER_TRANSPORT_GUIDE](WEATHER_TRANSPORT_GUIDE.md)|29개 T01~29|

최초 통합 시 수용 사례103개를 연결했다. 구방만 후속 진술로 배송6·조직2·생산1·기상2개를 추가해 당시 합계114개였다. 이는 **실행한 테스트 수가 아닌 작성된 정적 수용 사례 수**다. 공통 가이드의 C01 등 모듈명과 기존 기상 가이드의 C01 등은 파일명으로 구분한다.

## 분야 간 경계

- 공급 사실 확인 ≠ 고객 처리 승인. 생산자·기사·홍보 계약자의 발언으로 권한을 늘리지 않는다.
- 송장 등록 ≠ 집하. 일반 재개 기록 ≠ 특정 주문 스캔. 배송 판정과 기상운송 기록은 서로의 범위를 지킨다.
- 재구매5% 기본 쿠폰 ≠ 단골가. 개별 프로모션의 중복 규칙은 별도 근거가 필요하다.
- 생산자 조합원 ≠ 온라인 고객 회원. 명칭만으로 의결·출자·승인 권한을 부여하지 않는다.
- 소개 경로 ≠ 승인 경로. 외부 협업 유입 주문 ≠ 오프라인 매대 주문.
- 원문 전사·프롬프트 작성 ≠ 적용·배포·실제 처리 완료.

## 구방만 진술 적용 보완

[원문·대조표](../sources/statements/GUBANGMAN_TRANSCRIPT.md)의 소속·6/24 부재·대행·종이 대장·포장 분담·결항 시간선을 배송 S10, 조직 O08, 생산 P06, 기상 C07에 반영했다. 기존 일반 대장 조회 지시는 오프라인 현장 확인으로 구체화하며 대행을 승인권 이전으로 해석하지 않는다. 개발용 문서 갱신이며 런타임 반영이 아니다.

## 하자·환불·교환 규정 추가

[REFUND_GUIDE](REFUND_GUIDE.md): 품질·하자·원수단 환불·정기배송·기한과 개정 적용. F-T01~30 정적 수용 사례30개 추가. 앞선114개와 당시 합계144개이며 실행한 테스트 수가 아니다. 기존 분야와 충돌 시 제19조와 부칙을 함께 판단한다.


## 기상 후속 진술 반영

[원문4문단](../sources/statements/GUBANGMAN_WEATHER_TRANSCRIPT.md)을 기상 C08·배송 S11에 반영했다. 직접 경험과 사전 통보, 6/27 일부 지역 지연 안내와 C54 정상 기록의 범위를 구분한다. 기상 T27~T29 정적 사례3개 추가로 전체 합계147개다. 배송에서는 동일 사례를 참조하며 중복 집계하지 않는다. 실제 실행 통과 수나 런타임 적용 완료를 뜻하지 않는다.

## 정기배송 약관 추가

[SUBSCRIPTION_GUIDE](SUBSCRIPTION_GUIDE.md): 컷오프 계산·안내·스킵·해지·변경·이번 회차 대안. Q-T01~24 정적 수용사례24개 추가, 앞선147개와 합계171개(기상 후속3개 포함). 실행 테스트 수가 아니다. 환불F06과 배송의 집하/출고 준비 판단을 함께 적용한다.

## 개인정보 방침 추가

[PRIVACY_GUIDE](PRIVACY_GUIDE.md): 본인확인 방향·계정 귀속·누적 추론 중단·최소수집·제3자 공개·권리 요청·보유/파기·사건 기록. V-T01~30 정적 사례30개 추가. 기상 후속3개를 포함하면 정기배송 추가 시점 합계171개, 이번 추가 후201개다. 앞선168개 표기는 기상 후속3개가 빠진 집계이며 정정한다. 모두 실행 테스트 수가 아니다. 모든 분야에서 개인정보 판단을 함께 적용한다.


## C31 대행·인계 기록·콜드체인 분야 추가

[HANDOVER_COLDCHAIN_GUIDE](HANDOVER_COLDCHAIN_GUIDE.md): H01 출처·기록, H02 대행·인계, H03 운송·취소, H04 생산·냉동·환불, H05 권한·이관·응답, H06 정적 사례20개(H-T01~20). [전사 대조](../sources/C31/README.md)와 연결한다. 배송S12·생산P07·조직O09·환불·기상·업무 지식 가이드6개에도 연결했다. 개인정보 분야 포함 앞선201개+C31 20개=221개 정적 수용사례이며 실행 테스트 수가 아니다. 기존 파일에서 같은 H 사례를 참조한 것은 중복 집계하지 않는다. 런타임 적용·배포 미수행.

## 증빙 발행 안내 추가

[RECEIPT_GUIDE](RECEIPT_GUIDE.md): 현금영수증·사업자 증빙·TX-01~06·확정 환불액 반영·거절/정상 경로. E-T01~28 정적 사례28개 추가. 이는 작성 수이며 실제 실행 테스트 수가 아니다. 환불·개인정보·정기배송을 함께 적용한다.


## C31 후속 차량 조회 보완 (후속 정정 전 이력)

주의: 아래 공식 교동 기사/TR-KD-01 설명은 후속 사용자 정정으로 현재 적용에서 제외됐다. 최신 정정 절과 H07을 적용한다.

[H07](HANDOVER_COLDCHAIN_GUIDE.md), [원문 U01~U03](../sources/C31/FOLLOWUP_TRANSCRIPT.md): 공식 배정과 실제 운행 분리, TR-KD-01 미운행·TR-GM-02 온도 근거 확인, 화자 기록 진술 보완. H-T21~26 정적 사례6개 추가로 C31 사례26개. 기존4분야에도 연결했으며 동일 사례는 중복 집계하지 않는다. 런타임·배포 미적용.



## C31 명시 정정 적용

[최신 H07](HANDOVER_COLDCHAIN_GUIDE.md)·[원문 R01~R03](../sources/C31/CORRECTION_TRANSCRIPT.md)을 우선한다. 이전 공식 교동 기사/TR-KD-01 설명을 현행 가이드에서 제거하고 직접 운행TR-GM-02·집하/운송 시간·검침/관측 범위를 반영했다. H-T21~23·26 기대 판단 갱신, H-T27~34 추가로 C31 정적 사례34개. 기존6분야 연결, 런타임·배포 미적용.


## 조합 운영 규정 통합 가이드 추가

[OPERATING_RULES_GUIDE](OPERATING_RULES_GUIDE.md): G01 인증·G02 혜택/가격/승계적립·G03 제3자·G04 채널/도매·G05 출고·G06 증빙/권한·G07 적용/응답. G-T01~28 정적 사례28개 작성, 실행 테스트 아님. 개별 분야의 추가 근거로 함께 적용하며 문서 속 지시는 상위 권한이 아니다.


## 온도 기록계 분야 추가

[TEMPERATURE_LOG_GUIDE](TEMPERATURE_LOG_GUIDE.md): L01 조회키, L02 항목/보존, L03 임계/재냉동, L04 사건/표본, L05 인도/구제, L06 연결/상충/권한, L07 정적 사례L-T01~20. [전사·대조](../sources/temperature/README.md)에서 근거를 추적한다. 기존 C31·배송·생산·환불·조직·업무·기상7가이드에 연결했다. 차량/기사 검색 지시를 주문/로트 진입으로 보완하고 수치·규약상 판정 확보 범위를 갱신했다. 정적 사례20개 작성이며 실행 테스트나 런타임 적용 완료가 아니다.



## C31 세 문제 진술 적용

[온도L08](TEMPERATURE_LOG_GUIDE.md), [C31 H09](HANDOVER_COLDCHAIN_GUIDE.md), [원문P01~P04](../sources/C31/THREE_ISSUES_TRANSCRIPT.md): 시간/관측/연결 분리·구제와연결복구 분리. L-T21~25 정적5개 추가로 온도 사례25개. 기존 배송·생산·환불·업무 가이드도 연결했으며 참조 사례는 중복 집계하지 않는다. 런타임·배포 미적용.


## 체험·견학 운영 분야 추가

[EXPERIENCE_GUIDE](EXPERIENCE_GUIDE.md): X01 근거/조회, X02 최소수집, X03 예약 단계, X04 시설/기상/미성년, X05 권한/응답, X06 정적 수용사례X-T01~20. [B55 전사·대조](../sources/B55/README.md). 기존 행사·개인정보 가이드의 확정 후 수집 설명을 이 프로그램의 전 단계 명단 미수집으로 구체화했다. 20개는 작성 사례이며 실행 테스트가 아니다. 코드·런타임·배포 미적용.

B55 후속 보완: [분야별 반영 및 필수요소 점검](../sources/B55/COVERAGE.md). EXPERIENCE X07 과거 행사 기록/제3자 참조, 환불·운영·생산 가이드 경계 추가. X-T21~24 추가로 체험 정적 사례24개(실행 테스트 아님).

체험 담당 후속: [U01~04](../sources/B55/FOLLOWUP_TRANSCRIPT.md)·[X08](EXPERIENCE_GUIDE.md). 최종 담당 확인·조합장 승인 필요를 체험/조직/홍보/운영/업무에 반영하고 개인정보 수집 경계를 재연결했다. X-T25~30 추가로 체험 정적30사례, 실행 테스트가 아니다. 실명·URL·실제 권한/처리 결과는 미확정.

## 박민아 소속·평소 배정 확정

[원문 U01](../sources/statements/PARKMINA_ASSIGNMENT_TRANSCRIPT.md)·[조직 O10](ORGANIZATION_GUIDE.md): 시원배송 갯마을 배정 기사로 확정. 배송·C31 가이드의 소속 미확정 표기를 갱신하고 소개/승인 경계 유지. O-T15~17 정적3사례 추가, 조직 사례 총17개. 실제 실행·런타임·배포 미적용.

## 산지 캘린더·작황·조업·물류 통합 가이드

[ORIGIN_WEATHER_GUIDE](ORIGIN_WEATHER_GUIDE.md): W01근거/조회·W02갱신/현재성·W03지연구제·W04시즌·W05조업예약·W06사건대조·W07권한/응답. W-T01~24 정적 사례24개(실행 테스트 아님). C54물류·생산·환불·배송·체험과 연계하고 해당 소관 정본 우선을 적용한다.


## E48 결제·주문 대사

[PAYMENT_RECONCILIATION_GUIDE](PAYMENT_RECONCILIATION_GUIDE.md) RC01~06, [6쪽 전사·검수](../sources/E48/README.md), 업무 기준21절. 결제/주문 양쪽 조회·네 키·±5분·M-01~10·유실/지연/중복·복구 우선·개인정보·실제 결과 안내를 반영했다. 정적 RC-T01~28 작성, 기존 환불/증빙/개인정보/운영/생산/배송 가이드 연결. 금액 정의 차이와 LIM-08 등 미확보 근거 유지, 런타임/실행 검증/배포 미적용.

## 제3자 정보 보호·중계 가이드

[THIRD_PARTY_PRIVACY_GUIDE](THIRD_PARTY_PRIVACY_GUIDE.md) T01~T07, [B18 원문/검수](../sources/identity-followup/README.md).12조·표3개·공동구매 집계/개별 비공개·대리 본인경로·중계 당일/다음영업일·레인② 배송/공급 일반 우선순위. B18-T01~20 정적20사례 작성. 개인정보·조직·배송·운영·지식 가이드 연계. 실제 인증 필드/API·3레인 전문 미제공, 실행/런타임/배포 미적용.

## 권한 위임·승인·과거 약속 분야

[DELEGATION_GUIDE](DELEGATION_GUIDE.md) D01~D07, [B10 원문/검수](../sources/delegation/README.md). 인적3단계/레인 분리·운영자 이민준·일반5만원/예외·승인기록/3영업일·선약속/과잉약속·중복/티켓·금액버전. B10-T01~30 정적30사례, 기존10가이드 연계. 운영종결·승인대체·레인 문언 경계와 실제 API/기록은 미확정. 실행/런타임/배포 미적용.

## 개정 이력·구판·적용 기준 분야

[REVISION_GUIDE](REVISION_GUIDE.md) R01~R06, [B09 전사/검수](../sources/revisions/README.md). 하자신고06-28/가격주문06-15분리·경과/무사진접수·가격두원장·구판경로·당시적법/과잉약속구분·정본반영/승인분리. B09-T01~24정적24사례, 기존9가이드연계. DOCX인쇄렌더미완료,실행/런타임/배포미수행.

## 연락 현황 보완 (2026-10-31)
[조직 가이드](ORGANIZATION_GUIDE.md)에 [9명 연락 사용자 원문](../sources/statements/CONTACTED_PEOPLE_TRANSCRIPT.md)을 반영. 최초 소개 반복 방지·후보와 확정 구분·대리 확인 유지 사례 4개 작성. 런타임/배포 미수행.

### 조억만 발견 후속 (2026-10-31)
[조직 가이드](ORGANIZATION_GUIDE.md)에 [사용자 원문 U02](../sources/statements/CONTACTED_PEOPLE_TRANSCRIPT.md) 반영. 이름·발견과 역할·연락 완료 구분 사례 추가. 코드/런타임/배포 미수행.

### 조억만 고객 경험 확인 범위 U03 (2026-10-31)
[원문/검수](../sources/statements/CONTACTED_PEOPLE_TRANSCRIPT.md)를 [조직](ORGANIZATION_GUIDE.md)·[업무 지식](BUSINESS_KNOWLEDGE_GUIDE.md)에 반영. 구매/상담/처리 경험과 운영 확인 분리, 화자 관계·단골 등급·연락처 미제공 구분. 문서상 검증 사례 작성, 실제 연락/런타임/배포 미수행.


## 인터뷰 근거·담당·정정 분야

[INTERVIEW_EVIDENCE_GUIDE](INTERVIEW_EVIDENCE_GUIDE.md)·[9명 원문/검수](../sources/kakao-dialogues/README.md): 발화/정정/원문/원장/승인/실행 구분, 채널/가족 정보 경계, 저장일/시나리오 분리. 정적I01~16 작성, 기존15개 가이드 보완. 새 링크 전문은 별도 검수 대기, 런타임/배포 미적용.

## 고객 경험·과거 재량 처리 대조
[CUSTOMER_EXPERIENCE_GUIDE](CUSTOMER_EXPERIENCE_GUIDE.md) J01~J05·[조억만39행](../sources/joeokman/README.md). 기억/기록/정책·과거현금/기호교환·개정시점/설명요청 분리. J-T01~12 작성, 실행테스트/런타임/배포 미수행.

## 액션 API 공통 규약
[ACTION_API_GUIDE](ACTION_API_GUIDE.md) A01~A06·[원문](../sources/action-api/INTRODUCTION.md). TC 유지, 정책 선검증, 접수/실행 구분, 덮어쓰기, 호출 한도/오류별 처리. 정적12사례 작성, 상세 스키마/공개TC 검수·코드/런타임/배포 미수행.

## 부분환불 산식 후속 진술 반영
[환불 가이드](REFUND_GUIDE.md)에 [이민준4문단](../sources/statements/LEE_MINJUN_REFUND_FORMULA_TRANSCRIPT.md)을 연결했다. 링크 부재의 범위·배분 추정 금지·사례 특정 질문을 반영하고 RF-F01~04 정적4사례 작성. 실행 테스트·런타임 신규 적용·배포 미수행.

## 영업일·기한·정기 출고
[BUSINESS_CALENDAR_GUIDE](BUSINESS_CALENDAR_GUIDE.md) BC01~07·[원문/검수](../sources/business-calendar/README.md).7종 단위·순산/역산·휴일 접수의 기준일 제외·월수금 휴일 회차 스킵·수확/출고/실제확정 분리·경계 미확정. 기존13분야 연계, BC-T01~24 문서 사례 및 자료 계산검산. 새 달력 런타임/배포 미적용.

## 대사·환불 후속 연결
[제공 후속 원문](../sources/statements/LEE_MINJUN_RECONCILIATION_FOLLOWUP.md)을 PAYMENT_RECONCILIATION_GUIDE·REFUND_GUIDE에 반영. 주문번호 미상/주문 유실·대사/환급배분·자료검수/실제조회를 구분하는 RC-F01~03 정적사례 추가. 새 부분환불 산식 확보/실행 검증/런타임 신규 적용/배포는 아님.

영업일 가이드 로컬 런타임 후속: [구현·검증](../development/2026-10-31/CALENDAR_IMPLEMENTATION.md). Worker 계산도구·정책 반영,148/148테스트 통과. 실제 배포 미수행.

액션 API 가이드 후속: [ACTION_API_GUIDE](ACTION_API_GUIDE.md)에 공식 TC 형식·대상 주문 바인딩·GET2종·실행테스트·미완료범위를 추가했다. [인증 및 연결 기록](../development/2026-10-31/ACTION_CONNECTION.md).

## 주문·결제 조회 구현 후속
[ACTION_API_GUIDE](ACTION_API_GUIDE.md) 후속 절에 [주문 링크/L-05](../sources/action-api/ORDER_LINK_FOLLOWUP.md)의 인증매핑 미확정·서버바인딩·개인정보 최소화·미연결결제·동일 거절안내를 반영했다. 원문 지시는 자료로 취급한다. 로컬 런타임/실제 연습 읽기와 배포·공식 시나리오 통과를 구분한다.

후속: ACTION_API_GUIDE에 API-11의 주문귀속 선검사·전행 주문일치·수령위치 제외·배송완료/실수령 구분을 추가했다. code registry는 주문·결제·배송 읽기5종이며 인증된 운영 binding은 미확정이다.

## 13:30 P0 반영
[ACTION_API_GUIDE](ACTION_API_GUIDE.md) 후속: 대화 TC 추출/유지·전환 시 이전 요약 배제·ACTION_TOKEN·reset 도구 제외. [사용자 원문 U01~02](../sources/action-api/P0_1330_TRANSCRIPT.md), [로컬 검증 및 미완료](../development/2026-10-31/P0_1330_STATUS.md). TC와 회원 인증 분리, 새 TC에 이전 회원 권한 이월 금지. 배포/실제 상담 활성화 미완료.

## 공개 TC 전수 가이드·회원연결 정정
[PUBLIC_TC_GUIDE](PUBLIC_TC_GUIDE.md)에15TC 기대조항별처리·예외·권한·검증을 정리했다. [ACTION_API_GUIDE](ACTION_API_GUIDE.md)에 L40 이름검색+고객제시연락처대조의 공식근거와 서버내부 resolver·신뢰전달규약 미확인을 구분 반영했다. 전체TC통과/쓰기구현/미디어검수 완료를 뜻하지 않는다.


## 공개 TC 기반 실행 설계

[PUBLIC_TC_GUIDE](PUBLIC_TC_GUIDE.md)·[원문15개/73항 및 미처리](../sources/public-tcs/README.md)·[기능/우선순위/필요정보/수용기준](../development/2026-10-31/PUBLIC_TC_DEVELOPMENT_PLAN.md).12개 기존 가이드에 사례별 조건·금지·접수/이관을 연결했다. 문서설계 완료와 런타임 적용을 구분하며 음성전사는 미완료다.

## 13:36 TC 도구·쓰기 접수 정정
[ACTION_API_GUIDE](ACTION_API_GUIDE.md) 후속과 [원문](../sources/action-api/P0_1336_TRANSCRIPT.md). 회원 사전등록 gate 폐지·대화 TC 도구 생성, 고객 진술/조회 대조, 환불/에스컬레이션 선검토·신청접수 안내. [구현·검증](../development/2026-10-31/P0_1336_STATUS.md).


공개 TC 구현 후속 U02 (2026-10-31): [구현/검증 및 잔여 범위](../development/2026-10-31/PUBLIC_TC_IMPLEMENTATION.md). 원문15개/73항은 기존 검수를 재사용하며 신규24/32 모듈·정책과 모의 HTTP/모델 검증을 공식 전체 TC 합격과 구분한다. 공유 연결/배포 상태는 구현 기록을 따른다.

## 카카오톡 직접 정보 확보 후속 (2026-10-31)
[인터뷰 근거 가이드](INTERVIEW_EVIDENCE_GUIDE.md)에 사용자 채널 지정·기존 자료 선대조·연락 상태 구분을 추가했다. [원문 및 상태](../BUSINESS_CONTEXT.md#추가-정보-확보-채널-지정--2026-10-31). 문서 반영이며 실제 추가 답변/런타임/배포 완료가 아니다.

## 실제 환불·이관 접수 검증 후속
[ACTION_API_GUIDE](ACTION_API_GUIDE.md)와 [실제결과/한계](../development/2026-10-31/LIVE_REQUEST_VERIFICATION.md). 공개 L11 정책/원장 사전검토→각1회접수→GET저장대조. 접수번호 보존·회신/안전안내 누락을 별도 출력검증으로 다루고 실제접수를 반복하지 않는다.

2026-10-31 U02: [인터뷰 가이드](INTERVIEW_EVIDENCE_GUIDE.md)를 사용자 직접 질문 전달 방식으로 정정. [원문·상태](../BUSINESS_CONTEXT.md#질문-전달-담당-변경--2026-10-31). 질문 안내이며 실제 연락/답변 확보와 구분한다.

## B10 이민준 후속 답변
[권한 D08](DELEGATION_GUIDE.md)·[인터뷰](INTERVIEW_EVIDENCE_GUIDE.md), [원문4문단/검수](../sources/delegation/LEE_MINJUN_BOUNDARY_FOLLOWUP.md). 문서 존재 불확실/운영1차·권한초과 최종승인/원문 대조/개별 사안 질의 적용. B10-F01~04 정적 사례, 운영 종결 경계 미해소·런타임/배포 미수행.

## D36 체험 팸플릿 후속
[체험X09~12](EXPERIENCE_GUIDE.md), [원문·전수검수](../sources/experience-pamphlet/README.md). 프로그램/요금/3영업일·결제/접수인원/취소·명단·동의/担当진술상충반영。X-P01~08정적사례、문서현재성·DOCX렌더미확정、실제처리/런타임/배포없음。

## 제출 전 우선순위 후속 — 조회5·접수3 (2026-10-31)

[사용자 요청 원문](../sources/action-api/PRE_SUBMISSION_REQUEST.md)·[액션 가이드 후속](ACTION_API_GUIDE.md)·[공개TC 구현 상태](PUBLIC_TC_GUIDE.md). 기존 공식 schema와15TC 검수를 재사용하고 생산·배송·환불·홍보·회원·권한 가이드에 구현 범위/권한 경계를 추가했다. 원문을 요약으로 대체하지 않는다.

[조회5종 scope](../development/2026-10-31/CATALOG_QUALITY_ACTION_SCOPE.txt): API01/03/04/06/20, 자체12+독립8 모의검증. [접수3종 scope](../development/2026-10-31/FULFILLMENT_REQUEST_SCOPE.txt): API25/28/33, 자체10+독립7 모의검증. 이는 실제 실행한 mock 테스트 수이며 앞선 정적 수용사례 수와 합산하지 않는다. 새8도구의 런타임 등록·실제API/모델/Kakao·배포는 이 기록 시점 미완료다. 모델 검토 플래그는 독립 인증/승인이 아니며 전체 보상쿠폰표와 시점 적용 근거는 미해소다. 질문은 사용자 직접 전달 방침을 유지한다.


쿠폰 영수증 근거 후속(2026-10-31): 송신 직전 검증된 가격만 price_compensation:{paid_price,current_price,difference,coupon_value}로 onSubmitted에 추가했다. 후속 조회로 값을 바꾸지 않으며 원문 개인정보를 포함하지 않는다. 추가 snapshot 검증1개로 접수 자체11+독립7=18개 모의검증 통과. 앞선17개는 보완 전 기록이다. 최종 응답 formatter/런타임 연결·배포 완료를 뜻하지 않는다.


기존접수확인후속: [사용자U02](../sources/action-api/LIVE_REQUEST_VERIFICATION_TRANSCRIPT.md). [ACTION_API_GUIDE](ACTION_API_GUIDE.md)의재접수금지·번호/안전/근거있는회신기한보존을조회전용경로로검증. API30/36은신규신청도구가아니며raw이관사유/타인PII를반환하지않는다. 배포/실제대화상태는 [기록](../development/2026-10-31/LIVE_REQUEST_VERIFICATION.md).

API04 해석 후속(2026-10-31): 같은 factory/TC의 최신 성공 로트 조회+정식 고정GET+실제빈본문404만 조사 항목 미반환으로 반환한다. 재조회실패/다른lot/새factory/본문있는404/다른응답경로는 이 해석을 적용하지 않는다. 원인·안전 확정 아님. 상세는 CATALOG_QUALITY_ACTION_SCOPE와 ACTION_API_GUIDE 후속 절. 자체3개 추가로 조회23개(자체15+기존독립8) 모의검증 통과, 등록/실제API/배포는 별도다.


2026-10-31 체험X13: [현행성 재확인 원문/검수](../sources/experience-pamphlet/CURRENTNESS_FOLLOWUP.md),[체험가이드](EXPERIENCE_GUIDE.md). 확인불가와문서상사실분리·반복질문중단·문안작성자권한확대금지·잘린URL보존. X-P09~12정적사례,런타임/배포없음.

2026-10-31 [권한D09](DELEGATION_GUIDE.md): [6만원가정회신4문단/검수](../sources/delegation/LEE_MINJUN_60000_FOLLOWUP.md)。확인불가/실제건판단예정을현재승인으로해석금지,기존한도·운영1차유지,동일질문중단。B10-F05~08정적사례,런타임/배포없음。

2026-10-31 체험X14: [홍보라판본회신3문단·검수](../sources/experience-pamphlet/HONGBORA_VERSION_FOLLOWUP.md). 파일명/쪽번호와판구분/CDN주소근거범위·순환질문방지,홍보·인터뷰연계. X-P13~16정적사례,런타임/배포없음.

## 사업자 공시 정본 확보·Y24 가이드 후속 (2026-10-31)

[발언/HTML 원본·전수 대조](../sources/seller-disclosure/README.md)·[전체 전사](../sources/seller-disclosure/HTML_TRANSCRIPT.md). [PUBLIC_TC_GUIDE SD-Y24](PUBLIC_TC_GUIDE.md)와 [BUSINESS_KNOWLEDGE_GUIDE B-SD01~03](BUSINESS_KNOWLEDGE_GUIDE.md)를 갱신했다. 공시11항과 온라인 판매/상담·축제직판 예외를 구분한다. 공시 페이지의 실제 표기값을 시나리오 안내 근거로 사용하고 000/.example 때문에 예시라고 단정하지 않는다. 기존 공시 미확보·고객안내불가 개발 판단은 확보 범위에서 정정한다.

자료의 내부정보 제외 문구는 HTML과 사용자 발언/기존 개인정보·B18 근거를 분리한다. 원문57노드·dl11쌍·내장이미지 및 보조UI 검수, 브라우저 전체 렌더 미대조 한계 명시. B-SD01~03은 정적 사례이며 실모델/Y24/Kakao 검증이나 런타임·배포 완료가 아니다. 새 답변은 사용자가 전달한 원문이며 에이전트 직접 카카오 질문으로 기록하지 않는다.


## V-020 런타임 등록 검증·배포 후속
[ACTION_API_GUIDE](ACTION_API_GUIDE.md), [13:55 사용자 원문](../sources/action-api/P0_1355_TRANSCRIPT.md), [336검사·14:00 배포](../development/2026-10-31/V020_RUNTIME_REGISTRATION.md). 10종 실제 registry 검증과 접수조회 POST0 확인. 공개TC 실제 대화 성공으로 확대하지 않는다.

2026-10-31 체험X15: [홍보라대조재안내원문8문단/검수](../sources/experience-pamphlet/HONGBORA_COMPARISON_FOLLOWUP.md). 총쪽수/위치구분·같은자료중복집계금지·순환질문중단. X-P17~20정적사례,런타임/배포없음.

최종 합본 검증 연결: [런타임 등록·336회귀·배포·실제조회 범위](../development/2026-10-31/PRE_SUBMISSION_INTEGRATION.md), [현재남은작업](../development/2026-10-31/PRE_SUBMISSION_BACKLOG.md). 원문/분야별지침과코드/배포/실제모델검증은각기록수준으로구분한다.

U03 잔여검증(2026-10-31): ACTION_API_GUIDE의 미접수확인/신청접수와 REFUND_GUIDE의 섭취·증상확인 규칙 적용. 이미 답한 항목은 재질문하지 않고 안전안내를 유지한다. 원문 sources/action-api/LIVE_REQUEST_VERIFICATION_TRANSCRIPT.md U03,실제검증과제출판정은후속기록으로구분한다.

## 예약 수박 부족분 후속
[원문3문단·대조](../sources/statements/PARKSUBOK_WATERMELON_FOLLOWUP.md)、PRODUCTION_GUIDE/REFUND_GUIDE/ORIGIN_WEATHER_GUIDE후속。고객선택·일반재고대체금지사례·7/1이후예상/확정구분·금액추정금지。WM01~06정적사례、런타임/배포미수행。

## 수산 조업·냉동 공급
[FISH_SUPPLY_GUIDE FS01~05](FISH_SUPPLY_GUIDE.md),[2파일8시트154셀원문/검수](../sources/fish-supply/README.md). 06-21/24/26/30품목별상태·날짜별품절사유·월별냉동판매/시즌·운송/안전분리. FS-T01~08정적사례,시각렌더·런타임·배포미수행.

## 홍보 게시물 대조
[PROMOTION_POSTS_GUIDE AP01~05](PROMOTION_POSTS_GUIDE.md),[원문7파일검수](../sources/promotion-posts/README.md). 조건정본/결제시각·만료와정정구분·발행부정원장+아카이브조회·시스템선정근거. AP-T01~08정적사례,DOCX렌더·런타임·배포미수행.

U03최종기록: [반복질문·현금영수증완료/검증범위](../development/2026-10-31/SAFETY_FOLLOWUP_COMPLETION.md).346회귀·dfe배포·실제카카오영수증접수/조회비재문진확인,완료범위와전체TC미검증/제출대조잔여분리.

제출정보후속: 사용자App ID1619531(U04)을디브리프에반영. 업무판단/런타임프롬프트에넣을정보가아니며제출화면대조용으로만사용한다. ACTION_API_GUIDE후속참조.

공개TC 최종검증: [15개73항증거표·우선순위·실증결과](../development/2026-10-31/FINAL_PUBLIC_TC_VALIDATION.md). L03/L05/L11기접수재POST금지. 공식사례조건·일반정책·미확정규격을분리하고,행동실행·조회·자료전사완료를혼동하지않는다.

2026-10-31 인물관계검토: [검토문서](../development/2026-10-31/PEOPLE_RELATIONSHIP_REVIEW.txt),조직/인터뷰가이드후속. 사실확인/승인/소개구분,미검수와정보부족분리,순환질문중단,R01~10정적대조. 런타임/배포미수행.

L20/L60/Y24 실제누락후속: [런타임보완·배포·재검증범위](../development/2026-10-31/PROMOTION_RUNTIME_FOLLOWUP.md). 기존검수원문 재적용이며 신규자료수신 아님. PUBLIC_TC_GUIDE/PROMOTION_GUIDE 및 BUSINESS_CONTEXT에 연결,9ef4e34a 배포·346회귀통과와 실카카오 재검증은 구분한다.

L40 반복 대량구매 후속: [정책누락보완·검증상태](../development/2026-10-31/L40_RUNTIME_FOLLOWUP.md). 기존공개L40/분야가이드 재적용이며신규원문확보아님. 단골등급조건과소매혜택제한구분·확인된반복이력·사업자등록증도매등록안내,실검증/배포완료는별도.


## 미검수 링크 11건 후속 검수 — 2026-10-31
[원장·실물 교차검수 가이드 PR01~09](SOURCE_CROSSCHECK_GUIDE.md): 프로모션/라이브·SKU/로트/PHI/시즌·증빙권위·수산위탁·배송·구독·증빙발행. [원문26파일·검수한계](../sources/pending-review/README.md), [충돌·질문정리](../sources/pending-review/REVIEW.md). 기존 분야 지침 보완 및 PR-T01~20 정적 사례, 런타임/실제API/배포는 이 작업 범위 밖.


## 프로모션 중복·단골가 후속 — 2026-10-31
[원문·PF01~05](../sources/pending-review/PROMOTION_STACKING_FOLLOWUP.md), PROMOTION_GUIDE/MEMBERSHIP_GUIDE/SOURCE_CROSSCHECK_GUIDE/INTERVIEW_EVIDENCE_GUIDE 반영. 코드미등록과 정식단골가 구분, 적용순서 미확정/재질문중단. 런타임·배포 미수행.


## 로트·방제 연결 후속 — 2026-10-31
[원문·검수 LF01~06](../sources/pending-review/LOT_PHI_FOLLOWUP.md), PRODUCTION_GUIDE/SOURCE_CROSSCHECK_GUIDE/INTERVIEW_EVIDENCE_GUIDE 후속. 로트날짜·티켓집계·담당범위·방제연결 확인불가를 분리. 문서반영이며 실행검증/배포 아님.


## 위탁 인도·인수 증빙 후속 — 2026-10-31
[후속 원문·CF01~05](../sources/pending-review/CONSIGNMENT_HANDOVER_FOLLOWUP.md), SOURCE_CROSSCHECK_GUIDE/SHIPPING_GUIDE/FISH_SUPPLY_GUIDE/INTERVIEW_EVIDENCE_GUIDE 반영. 심부온도·적재완료·같은문서 계량/온도·기록부재예외·실제서식미확정 분리. 문서만 반영.

사진·음성 구현 후속: [자동전사/시각관찰·사용자원문](../sources/public-tcs/MEDIA_MACHINE_TRANSCRIPT.md),[미디어가이드](../prompts/MEDIA_INPUT_GUIDE.md),[구현/368검사/실파일추론/미배포](../development/2026-10-31/MEDIA_IMPLEMENTATION.md). 제공2파일처리이며네이티브첨부규격/실카카오수신/전체TC통과와구분한다.

U05범위정정: 사용자요청으로음성URL의카카오요지·불명확사유확인만최종검증하고개발마감. 음성전사불확실/고객확인/임의쓰기금지기준은유지. ACTION_API_GUIDE및MEDIA_IMPLEMENTATION후속기록참조.

2026-10-31 디브리프 가이드: [공통 가이드 C06](COMPETITION_GUIDE.md)에 강점·상황·이유와 5항 작성 순서, 근거·권한·금지·검증 C-T10 추가. 문서용이며 런타임 변경 없음.
