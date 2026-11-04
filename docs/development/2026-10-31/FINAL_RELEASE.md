# 최종 버전 배포 확인 및 저장

작업일: 2026-10-31 KST. 사용자 요청: “최종 버전을 배포 및 저장 해주세요”.

최종 운영 버전: 889606c9-5bb7-4141-927f-906a0baa72b1.
운영 주소: https://usechan-kakao-bot.ahead-calendar-dldydcks0528.workers.dev
Cloudflare deployments list에서 해당 버전 트래픽100% 확인. 기존 배포시각2026-10-31 14:39:35 KST.
현재 src27개 파일의 SHA256이 기존 배포 manifest와 모두 일치하고 wrangler.jsonc도 배포 스냅샷과 완전히 일치한다. 이미 배포된 동일 최종본을 유지했으며 이번 요청에서 새 버전을 생성하지 않았다.

이번 재검증: START_DEV.cmd check 성공, 문법58파일·테스트371/371·실패0·skip0·오프라인 데모 통과.
GET /health HTTP200, status=ok, configured=true, actionTokenConfigured=true, actionLookup=true, maxSteps=10, model=gpt-6-luna 확인.
증거: artifacts/final-release-check.log, final-release-deployments.txt, final-release-health.json.

최종 저장: artifacts/final-release-889606c9.zip. 소스·설정·테스트·스크립트·업무문서·프롬프트·디브리프 및 이번 검증 기록을 포함한다. env·Secret·인증 캐시·node_modules·기존 artifacts 전체는 포함하지 않는다. 파일별 SHA256은 artifacts/final-release-manifest.json, ZIP 해시는 artifacts/final-release-889606c9.sha256.txt에 저장한다.

한계: 공개 음성URL 첫상담의 실카카오 검증은 기존 기록을 따른다. 네이티브 첨부 지원, 사진/L40 후속 실카카오 검증, 전체15TC/73항·p95 검증은 완료로 바꾸지 않는다. 이번 확인에서 신규 업무 접수·카카오 전송·공식 대회 제출을 수행하지 않았다. App ID와 디브리프의 공식 제출 완료 여부는 별도다. 제출 후 변경금지 방침은 유지한다.