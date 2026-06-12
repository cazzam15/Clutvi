// Proxies tool prompts to the Anthropic API. The key never reaches the
// browser; callers must be signed in AND have an active subscription.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const ACTIVE_STATUSES = ['active', 'trialing'];
const MAX_PROMPT_CHARS = 12_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Please sign in.' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single();
    if (!profile || !ACTIVE_STATUSES.includes(profile.subscription_status ?? '')) {
      return json({ error: 'An active ReelRocket Pro subscription is required.' }, 403);
    }

    const { prompt } = await req.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return json({ error: 'Missing prompt.' }, 400);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: 'That input is too long — trim it down and try again.' }, 400);
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('Anthropic API error', resp.status, err);
      return json({ error: 'The AI service is busy — please try again in a moment.' }, 502);
    }

    const data = await resp.json();
    return json({ text: data.content[0].text });
  } catch (e) {
    console.error('claude-proxy error', e);
    return json({ error: 'Something went wrong — please try again.' }, 500);
  }
});
