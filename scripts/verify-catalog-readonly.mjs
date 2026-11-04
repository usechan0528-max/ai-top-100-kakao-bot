// Public-case read verification only. No mutation/reset routes are available.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCatalogQualityActions} from '../src/catalog-quality-actions.mjs';
const token=(await readFile('C:/Users/dldyd/.codex/secrets/aitop100-action-token.txt','utf8')).trim();
const calls=[];
const fetcher=async(url,init)=>{
  if(init.method!=='GET'||new URL(url).origin!=='https://gyodong-mall-action.aitop100.org')throw Error('READ_ONLY');
  const response=await fetch(url,init);calls.push({tc:init.headers['X-Aitop100-Test-Case-Id'],path:new URL(url).pathname,httpStatus:response.status});return response;
};
const action=tc=>createCatalogQualityActions({token,testCaseId:tc,fetcher});
const l11=action('L-11'),l47=action('L-47'),l60=action('L-60');
const cases=[['read_lot',l11,{lot_id:'KD-WTM-370624-03'}],['read_lot_investigation',l11,{lot_id:'KD-WTM-370624-03'}],
  ['list_lot_claims',l11,{lot_id:'KD-WTM-370624-03'}],['read_product',l47,{sku:'WTM-STD-8'}],['read_promotion',l60,{code:'SUBAK15'}]];
const checks=[];
for(const [name,registry,args] of cases){
  const result=await registry[name].execute(args,{signal:AbortSignal.timeout(10000)});
  checks.push({tool:name,status:result.status,...(result.claims?{ticketCount:result.claims.ticketCount,distinctReporterCount:result.claims.distinctReporterCount}:{}),
    ...(result.product?{price:result.product.price}:{}),...(result.promotion?{benefitType:result.promotion.benefit_type,benefitValue:result.promotion.benefit_value}:{})});
}
const report={observedAt:new Date().toISOString(),mode:'public-case-read-only',realGetCalls:calls.length,realPostCalls:0,calls,checks};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/catalog-live-read-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(checks.some(c=>!['ok','empty'].includes(c.status)))process.exitCode=1;
