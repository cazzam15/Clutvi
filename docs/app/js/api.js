// All Claude calls go through the claude-proxy Edge Function — the Anthropic
// key lives server-side and the function checks the caller's subscription.
async function callClaude(prompt) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Your session expired — please sign in again.');
  const resp = await fetch(`${RR_CONFIG.SUPABASE_URL}/functions/v1/claude-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ prompt }),
  });
  let data;
  try { data = await resp.json(); }
  catch { throw new Error('Something went wrong — please try again.'); }
  if (resp.status === 403) {
    showPaywall();
    throw new Error('An active subscription is required.');
  }
  if (!resp.ok) throw new Error(data.error || 'Something went wrong — please try again.');
  return data.text;
}

async function callFunction(name) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Your session expired — please sign in again.');
  const resp = await fetch(`${RR_CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
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
