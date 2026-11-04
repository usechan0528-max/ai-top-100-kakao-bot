// Every production action HTTP request reserves from the same token-wide DO.
export async function reserveActionRead(env, signal) {
  signal?.throwIfAborted();
  const limiter=env.USAGE.get(env.USAGE.idFromName('action-usage'));
  const timeout=AbortSignal.timeout(1500);
  const response=await limiter.fetch('https://internal/action',{
    method:'POST',signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
  });
  if(!response.ok) throw new Error('ACTION_RATE_LIMIT');
  signal?.throwIfAborted();
}
