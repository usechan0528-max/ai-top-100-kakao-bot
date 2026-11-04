import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationStore} from '../src/conversation-store.mjs';
import {createScopedActions} from '../src/action-context.mjs';

const requiredReads=['read_product','read_lot','read_lot_investigation','list_lot_claims','read_promotion','read_refund_requests','read_escalation_request'];
const requiredWrites=['request_reship','request_schedule_change','request_coupon_issue'];
async function withRegistry(env,text,check) {
  const db=new DatabaseSync(':memory:');
  try {
    const store=new ConversationStore({sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},sync:async()=>{}});
    const scoped=await createScopedActions({env,scope:'a'.repeat(64),store,text,
      fetcher:()=>assert.fail('Registry construction must not call the action server')});
    await check(scoped.actions);
  } finally {db.close();}
}
test('V-020: actual conversation registry includes all ten catalog, fulfillment and receipt tools',async()=>{
  await withRegistry({ACTION_TOKEN:'synthetic-token'},'TC: L-11',actions=>{
    for(const name of requiredReads) assert.equal(actions[name]?.kind,'read',name);
    for(const name of requiredWrites) assert.equal(actions[name]?.kind,'write',name);
    for(const name of [...requiredReads,...requiredWrites]) {
      for(const method of ['validate','authorize','execute']) assert.equal(typeof actions[name][method],'function',name+'.'+method);
    }
  });
});
test('V-020: missing token or TC cannot expose private runtime tools',async()=>{
  for(const [env,text] of [[{},'TC: L-11'],[{ACTION_TOKEN:'synthetic-token'},'안녕하세요']]) {
    await withRegistry(env,text,actions=>{
      for(const name of [...requiredReads,...requiredWrites]) assert.equal(actions[name],undefined,name);
    });
  }
});
