# 미검수 링크 원문 확보·내용 검수

사용자 요청 원문: “미검수 자료 확인 진행해” (현재 채팅, 2026-10-31, 1문장). 신규 첨부가 아니라 이전에 받은 링크의 후속 검수다.
시나리오 기준일 2037-06-30. 작업일 2026-10-31. 현재 시각은 가정하지 않았다.

## 범위·방법
links.json에서 당시 “링크만 수신” 상태였던 카카오 CDN 링크 11건을 모두 취득했다. ZIP4개는 추출 전 전체 목록을 기록하고 경로 이탈 검사를 거쳤다. ZIP 안19파일+단독7파일=26파일이다. PDF6개17쪽, PNG12장, DOCX1개, XLSX2개12시트554개 비어 있지 않은 셀, HTML5개40표를 보존했다. ZIP 원본·파일별 SHA256·원래 대화 위치는 [다운로드 목록](../../../artifacts/pending-review-source/inventory.json), [파일별 해시/상태](manifest.json), [구조검사](STRUCTURE_AUDIT.json)에 있다. 원본 경로는 artifacts/pending-review-source/이다.

텍스트 PDF16쪽은 추출 후 전체 시각 대조, 팩스1쪽은 텍스트 층이 없어 직접 전사했다. PNG12장은 모두 개별 확인했으며 같은 이름/비슷한 사진으로 동일성을 가정하지 않았다. DOCX 본문23개 텍스트 run은 PDF에 모두 존재하며 별도 매체/각주/머리말 텍스트는 없다. 24문단(빈 문단 포함)은 독립 전사했다. HTML 전체 문구·표/행/열·컨트롤/입력값을 저장했고5개 모두 img/canvas/iframe0, 구독·증빙 HTML 각10개 SVG는 텍스트 없는 아이콘이다. XLSX12시트 모두 표시 상태이며 숨김행/열·수식·주석·내장그림·차트0을 확인했다. 값이 계산 규칙을 설명해도 실제 셀 수식이 들어 있다는 뜻은 아니다. 병합과 좌표를 전사했다.

## 파일별 처리
|원본 상대경로|전사|범위|검수 상태|
|---|---|---|---|
|5qStcfJN45yTNkUI8SYD0w/로트원장.html|[원문](로트원장.html_TRANSCRIPT.md)|827 단위(쪽/문단/텍스트노드/셀/이미지)|전체 텍스트·표·컨트롤 구조 검수, 브라우저 시각 대조 미수행|
|5qStcfJN45yTNkUI8SYD0w/출고검사성적서_팩스사본_KD-HGL-370624-01.pdf|[원문](출고검사성적서_팩스사본_KD-HGL-370624-01.pdf_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|_uHi0aiIW__PSHbihlOOmQ/농산시즌캘린더.xlsx|[원문](농산시즌캘린더.xlsx_TRANSCRIPT.md)|374 단위(쪽/문단/텍스트노드/셀/이미지)|전체 셀·시트·구조 검수, 원본 XLSX 전체 시각 렌더 미수행; 시즌 사진5장 범위 대조|
|_uHi0aiIW__PSHbihlOOmQ/모니터촬영/C23_01.png|[원문](C23_01.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|_uHi0aiIW__PSHbihlOOmQ/모니터촬영/C23_02.png|[원문](C23_02.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|_uHi0aiIW__PSHbihlOOmQ/모니터촬영/C23_03.png|[원문](C23_03.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|_uHi0aiIW__PSHbihlOOmQ/모니터촬영/C23_04.png|[원문](C23_04.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|_uHi0aiIW__PSHbihlOOmQ/모니터촬영/C23_05.png|[원문](C23_05.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|B-ulVcMRgNHbtfLjVugzvw/프로모션원장.html|[원문](프로모션원장.html_TRANSCRIPT.md)|193 단위(쪽/문단/텍스트노드/셀/이미지)|전체 텍스트·표·컨트롤 구조 검수, 브라우저 시각 대조 미수행|
|B-ulVcMRgNHbtfLjVugzvw/할인중복_보상쿠폰_기준.pdf|[원문](할인중복_보상쿠폰_기준.pdf_TRANSCRIPT.md)|2 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_01_mango-live.png|[원문](D41_01_mango-live.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_02_recruit-post.png|[원문](D41_02_recruit-post.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_03_watermelon-live.png|[원문](D41_03_watermelon-live.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_04_mango-close.png|[원문](D41_04_mango-close.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_05_hwachae-live.png|[원문](D41_05_hwachae-live.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_06_potato-live.png|[원문](D41_06_potato-live.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_07_potato-close.png|[원문](D41_07_potato-close.png_TRANSCRIPT.md)|1 단위(쪽/문단/텍스트노드/셀/이미지)|개별 이미지 직접 판독·전사 완료 (12장 전체)|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_transcript.docx|[원문](D41_transcript.docx_TRANSCRIPT.md)|24 단위(쪽/문단/텍스트노드/셀/이미지)|XML 전체 텍스트 추출·PDF 대조 완료, 독립 DOCX 페이지 렌더 미완료|
|Hf5FZuHm8b-vlFK3j5L2Mw/D41_transcript.pdf|[원문](D41_transcript.pdf_TRANSCRIPT.md)|2 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|Hj1zGIAFSFLkJv-2_0Womg.xlsx|[원문](Hj1zGIAFSFLkJv-2_0Womg.xlsx_TRANSCRIPT.md)|180 단위(쪽/문단/텍스트노드/셀/이미지)|전체 셀·시트·구조 검수, 원본 XLSX 전체 시각 렌더 미수행; 시즌 사진5장 범위 대조|
|Keze5-ihBAYJhBQV_i-aEw.html|[원문](Keze5-ihBAYJhBQV_i-aEw.html_TRANSCRIPT.md)|228 단위(쪽/문단/텍스트노드/셀/이미지)|전체 텍스트·표·컨트롤 구조 검수, 브라우저 시각 대조 미수행|
|l2R00nTdGBHA3FP2QVxKfg.pdf|[원문](l2R00nTdGBHA3FP2QVxKfg.pdf_TRANSCRIPT.md)|3 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|m1SLEboPRfEAY8Y90ZFzMQ.html|[원문](m1SLEboPRfEAY8Y90ZFzMQ.html_TRANSCRIPT.md)|154 단위(쪽/문단/텍스트노드/셀/이미지)|전체 텍스트·표·컨트롤 구조 검수, 브라우저 시각 대조 미수행|
|p3fMCqFSsgGXunwjQpwUJg.pdf|[원문](p3fMCqFSsgGXunwjQpwUJg.pdf_TRANSCRIPT.md)|4 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|VPaqTY6ACayEeUct0aT6aw.pdf|[원문](VPaqTY6ACayEeUct0aT6aw.pdf_TRANSCRIPT.md)|5 단위(쪽/문단/텍스트노드/셀/이미지)|전 페이지 직접 시각 대조 완료 (17쪽 전체)|
|Yku9ZG2eH3PsliWC0108RA.html|[원문](Yku9ZG2eH3PsliWC0108RA.html_TRANSCRIPT.md)|1010 단위(쪽/문단/텍스트노드/셀/이미지)|전체 텍스트·표·컨트롤 구조 검수, 브라우저 시각 대조 미수행|

## 전사·시각 검수 한계
- PDF17쪽과 PNG12장은 직접 시각 대조 완료. 팩스의 잡음은 존재하지만 업무 문구는 판독 가능했다.
- DOCX 독립 페이지 렌더는 LibreOffice 부재로 미완료. PDF2쪽을 DOCX 자체 렌더 완료로 표현하지 않는다.
- HTML5개 브라우저 전체 시각 대조와 XLSX12시트 원본 전체 시각 렌더는 미수행이다. HTML 텍스트/표 구조와 XLSX 실제 저장값은 전수 보존·검수했다. 시즌 모니터사진은 시트4/6/7의 촬영 범위만 대조했으며 전체 시트 렌더로 확대하지 않는다.
- XLSX 개요 PHI B11 및 시즌 B13은 저장된 문자열 자체가 중간에 끝난다. 본문 시트의 완전한 규칙과 연결하며 개요 원문을 보충해 쓰지 않는다.
- 원문의 조문번호 참조 오류·표제 수량 오류·서로 다른 범위의 상태·발언 충돌은 [검토 결과](REVIEW.md)에 보존했다. 추측으로 원문을 교정하지 않는다.

## 조항별 가이드 대조
|자료|처리한 조항·표·부칙|적용 지침|
|---|---|---|
|프로모션 HTML+PDF|HTML 기재항목/6코드/미등록/체험단/발급이력/유효혜택 전6표, PDF 원장성격·중복매트릭스·보상·미적용순서|[PR01](../../prompts/SOURCE_CROSSCHECK_GUIDE.md#pr01-프로모션--html-29-및-할인-pdf-12쪽), PROMOTION_GUIDE·MEMBERSHIP_GUIDE|
|D41|이미지7개 모든 배너·댓글·본문·마감, DOCX24문단·PDF2쪽5회차 발언|PR02, PROMOTION_POSTS_GUIDE|
|SKU|§2~9·16표·34상품행·표시비교·공개범위·상태이력|PR03/05, PRODUCTION_GUIDE·REFUND_GUIDE|
|로트+팩스|§2~8·9표·26검사행/17이력/22주문연결/2조사행, 팩스1쪽 전항목|PR03/06, PRODUCTION_GUIDE|
|PHI|개요+작성/이력/잔여계산/공개 5시트180셀, 본문 단서 전부|PR04, PRODUCTION_GUIDE|
|시즌|개요+상태/작성/월별/업무/실제/예정 7시트374셀, 사진5장 촬영행|PR05, PRODUCTION_GUIDE·FISH_SUPPLY_GUIDE|
|증빙권위|제1~14조·2개 대조표·과잉검증/재검증 조건|PR06, INTERVIEW_EVIDENCE_GUIDE·REFUND_GUIDE|
|위탁계약|제1~17조·공개범위표·당사자표·부칙,5쪽|PR07, FISH_SUPPLY_GUIDE·SHIPPING_GUIDE|
|배송계약|제1~12조·별표1/2 및 각3항·부칙,3쪽|PR08, SHIPPING_GUIDE|
|구독HTML|제1~11조·3표·UI·하단 안내|PR09, SUBSCRIPTION_GUIDE Q01~Q08 및 기존 사례|
|증빙발행HTML|§1~7·6표·예시·UI·하단 안내|PR09, RECEIPT_GUIDE E01~E08 및 기존 사례|

## 완료 수준
원본 확보·전사·내용 대조·문서 지침 반영은 위 범위에서 완료. 독립 시각 렌더 잔여는 위와 같이 명시했다. 실제 고객 조회·발급·환불·승인·연락·코드 수정·런타임 반영·배포는 이 작업에서 수행하지 않았다. 문서 사례20건은 원문과 기대결과의 정적 대조이며 모델/API 실증이 아니다.


## 프로모션 중복·단골가 후속 — 2026-10-31
[후속 발언 원문7문단·URL1회·대조](PROMOTION_STACKING_FOLLOWUP.md). 기존 ZIP 재안내는 추가파일로 집계하지 않는다. 정식단골가 부재로 확대금지·적용순서 질문종료를 REVIEW에 반영. 원래26파일 검수범위와 잔여는 유지한다.


## 로트·방제 연결 후속 — 2026-10-31
[원문4문단·URL1회·대조](LOT_PHI_FOLLOWUP.md). 기존 ZIP 재안내로 원본26파일 수는 유지. PHI연결 질문 종료·미확정을 REVIEW에 반영, 기존 시각검수 잔여 유지.


## 위탁 인도·인수 증빙 후속 — 2026-10-31
[후속 원문3문단+URL1블록·계약대조](CONSIGNMENT_HANDOVER_FOLLOWUP.md). 기존PDF 재안내로 원본 수 유지. 계약4·5조 기록항목과 실제양식/사건증빙 구분, 시각검수 잔여는 기존과 같음.
