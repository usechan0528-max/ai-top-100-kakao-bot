import {resolveMember,normalizeFullPhone} from './member-resolution.mjs';

// Evaluation conversation matching, not independent login authentication.
export function createMemberActions({token,testCaseId,text,store,fetcher=fetch,beforeCall}) {
  const valid=args=>args && typeof args==='object' && !Array.isArray(args) &&
    Object.keys(args).sort().join(',')==='account_name,phone' &&
    typeof args.account_name==='string' && args.account_name.trim()===args.account_name &&
    args.account_name.length>0 && args.account_name.length<=100 && !!normalizeFullPhone(args.phone);
  return {member_lookup_status:{kind:'read',
    description:'현재 TC에서 앞서 성공한 회원정보 대조 결과를 확인한다. 후속 주문 조회에서는 먼저 이 도구를 사용하고 matched이면 연락처를 다시 묻지 않고 member_id로 조회한다. 독립 로그인 인증은 아니다.',
    parameters:{type:'object',properties:{},required:[],additionalProperties:false},
    validate:args=>args && typeof args==='object' && !Array.isArray(args) && Object.keys(args).length===0,
    authorize:()=>true,execute:async()=>{
      const state=store.lookup();
      return state.testCaseId===testCaseId && state.resolvedMemberId ? {status:'matched',member_id:state.resolvedMemberId,independentLoginAuthentication:false} : {status:'unresolved'};
    },
  },resolve_member:{kind:'read',
    description:'현재 고객 메시지에 제시된 계정 이름과 전체 연락처를 API13 회원정보와 대조한다. 둘 다 같은 메시지에 없거나 연락처가 가려져 있으면 함께 질문한다. 후보 개인정보는 반환하지 않는다. matched의 member_id로 list_my_orders를 조회하고 각 주문 귀속을 대조한다. 이 결과는 별도 로그인 인증이 아니다.',
    parameters:{type:'object',properties:{account_name:{type:'string',minLength:1,maxLength:100},phone:{type:'string',minLength:8,maxLength:40}},required:['account_name','phone'],additionalProperties:false},
    validate:valid,authorize:()=>true,
    execute:async(args,{signal}={})=>{
      if(!valid(args))return {status:'invalid_request'};
      const phones=(text.match(/\+?\d[\d ()-]{6,38}\d/g)??[]).map(normalizeFullPhone);
      if(!text.includes(args.account_name)||!phones.includes(normalizeFullPhone(args.phone)))return {status:'needs_customer_input'};
      store.rememberLookup({});
      if(!store.allowMemberVerification(testCaseId))return {status:'verification_limit',next:'담당자 확인 필요'};
      await store.storage.sync();
      const result=await resolveMember({token,testCaseId,trustedAccountName:args.account_name,providedPhone:args.phone,fetcher,beforeCall,signal});
      if(result.status!=='matched')return {status:result.status};
      store.rememberLookup({resolvedMemberId:result.memberId,testCaseId});
      await store.storage.sync();
      return {status:'matched',member_id:result.memberId,basis:'customer_name_and_full_phone_match',independentLoginAuthentication:false};
    },
  }};
}
