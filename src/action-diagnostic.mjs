import { createCompetitionClient } from './competition-actions.mjs';
// Official example only. Never returns or persists customer/order payloads.
export async function checkActionConnection(token, fetcher=fetch, beforeRead=async()=>{}) {
  const client=createCompetitionClient({token,testCaseId:'L-03',fetcher:async(url,options)=>{await beforeRead(options.signal);return fetcher(url,options);}});
  const signal=AbortSignal.timeout(8000);
  await client.getOrder('100100003',{signal});
  await client.getShipments('100100003',{signal});
  return {authenticated:true,orderRead:true,shipmentRead:true,readOnly:true};
}
