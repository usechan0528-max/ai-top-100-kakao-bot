import {resolveMember} from './member-resolution.mjs';
import {reserveActionRead} from './action-budget.mjs';
import {hash} from './conversation-store.mjs';

export function accountBinding(env,scope,now=Date.now()) {
  try {
    const raw=env.ACTION_ACCOUNT_BINDINGS;
    if(typeof raw!=='string'||raw.length>65536||!/^[a-f0-9]{64}$/.test(scope))return null;
    const entries=JSON.parse(raw),item=entries?.[scope];
    if(!item||Object.keys(item).sort().join(',')!=='expiresAt,testCaseId,trustedAccountName'||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(item.testCaseId)||
      typeof item.trustedAccountName!=='string'||!item.trustedAccountName.trim()||item.trustedAccountName!==item.trustedAccountName.trim()||item.trustedAccountName.length>100||
      /[\u0000-\u001f\u007f]/.test(item.trustedAccountName)||typeof item.expiresAt!=='string'||!Number.isFinite(Date.parse(item.expiresAt))||Date.parse(item.expiresAt)<=now)return null;
    return item;
  }catch{return null;}
}
const fingerprint=item=>hash(JSON.stringify([item.testCaseId,item.trustedAccountName,item.expiresAt]));
export async function sessionBinding(env,scope,store,now=Date.now()) {
  const item=accountBinding(env,scope,now),session=store.memberSession();
  if(!item||!session||session.testCaseId!==item.testCaseId||session.accountKey!==await fingerprint(item)||session.expiresAt<=now||store.testCaseId()!==item.testCaseId)return null;
  return {testCaseId:session.testCaseId,memberId:session.memberId,expiresAt:new Date(session.expiresAt).toISOString()};
}
export async function verifyMemberMessage({text,env,scope,store,fetcher=fetch,now=Date.now()}) {
  if(!/^\/회원확인(?:\s|$)/.test(text.trim()))return null;
  store.clearMemberSession();
  const item=accountBinding(env,scope,now);
  if(!item)return '이 대화의 로그인 계정 연결이 아직 확인되지 않았습니다. 운영자에게 계정 연결을 요청해 주세요.';
  if(store.testCaseId() && store.testCaseId()!==item.testCaseId)return '현재 상담 TC와 계정 연결 정보가 다릅니다. 운영자 확인이 필요합니다.';
  if(!store.allowMemberVerification(item.testCaseId))return '이 상담의 회원 확인 시도 한도에 도달했습니다. 추가 추측 확인은 중단하고 공식 본인 확인 경로를 이용해 주세요.';
  await store.storage.sync();
  const phone=text.trim().replace(/^\/회원확인\s*/, '');
  const result=await resolveMember({token:env.ACTION_TOKEN,testCaseId:item.testCaseId,trustedAccountName:item.trustedAccountName,providedPhone:phone,fetcher,
    beforeCall:signal=>reserveActionRead(env,signal)});
  if(result.status!=='matched')return '회원 정보를 확인하지 못했습니다. 본인 계정의 전체 연락처를 확인해 주세요. 등록 정보는 안내할 수 없습니다.';
  const current=accountBinding(env,scope,Date.now());
  if(!current||await fingerprint(current)!==await fingerprint(item))return '계정 연결 정보가 변경되었습니다. 다시 확인해 주세요.';
  store.rememberCase(item.testCaseId);
  store.rememberMemberSession({memberId:result.memberId,testCaseId:item.testCaseId,accountKey:await fingerprint(item),expiresAt:Math.min(now+1800000,Date.parse(item.expiresAt))});
  await store.storage.sync();
  return '회원 확인이 완료됐습니다. 조회할 본인 주문번호와 궁금한 내용을 알려주세요.';
}
