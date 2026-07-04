// All Claude calls go through the claude-proxy Edge Function — the Anthropic
// key lives server-side and the function checks the caller's plan and usage.
// Request shape: { tool, input, options }. The proxy forces structured JSON
// output (see supabase/functions/claude-proxy/tools.ts) and returns
// { tool, data, remaining, plan } — `remaining` drives the usage indicator.
async function callClaude(tool, input, options = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Your session expired — please sign in again.');
  const resp = await fetch(`${CLUTVI_CONFIG.SUPABASE_URL}/functions/v1/claude-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ tool, input, options }),
  });
  let data;
  try { data = await resp.json(); }
  catch { throw new Error('Something went wrong — please try again.'); }
  if (resp.status === 403) {
    showPaywall();
    throw new Error('An active subscription is required.');
  }
  if (resp.status === 429) {
    // Out of generations — the modal handles the message, so the thrown
    // error is marked handled to stop the caller toasting it again.
    showLimitModal(data);
    const err = new Error(data.error || "You've hit your generation limit.");
    err.handled = true;
    throw err;
  }
  if (!resp.ok) throw new Error(data.error || 'Something went wrong — please try again.');
  updateUsageIndicator(data.remaining, data.plan);
  return data.data;
}

async function callFunction(name) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Your session expired — please sign in again.');
  const resp = await fetch(`${CLUTVI_CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Something went wrong — please try again.');
  return data;
}
