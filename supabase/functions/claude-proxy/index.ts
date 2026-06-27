// Proxies tool requests to the Anthropic API and returns STRUCTURED output.
//
// The key never reaches the browser; callers must be signed in AND subscribed.
// Instead of relaying a free-text prompt, callers send { tool, input, options }.
// The proxy builds the prompt + an output schema (see tools.ts) and forces
// Claude to emit JSON matching that schema via tool_choice — so the frontend
// never parses free text. Response shape: { tool, data: <schema-shaped object> }.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { TOOLS } from './tools.ts';

const ACTIVE_STATUSES = ['active', 'trialing'];
const MAX_INPUT_CHARS = 12_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- auth + subscription gate (unchanged) ---
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Please sign in.' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single();
    if (!profile || !ACTIVE_STATUSES.includes(profile.subscription_status ?? '')) {
      return json({ error: 'An active Clutvi Pro subscription is required.' }, 403);
    }

    // --- validate request ---
    const { tool, input, options } = await req.json();
    const spec = TOOLS[tool];
    if (!spec) return json({ error: 'Unknown tool.' }, 400);
    if (typeof input !== 'string' || !input.trim()) return json({ error: 'Missing input.' }, 400);
    if (input.length > MAX_INPUT_CHARS) {
      return json({ error: 'That input is too long — trim it down and try again.' }, 400);
    }

    const { system, userPrompt } = spec.build(input, options ?? {});

    // --- forced structured output ---
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
        system,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [{ name: 'format_output', description: spec.description, input_schema: spec.schema }],
        tool_choice: { type: 'tool', name: 'format_output' }, // hard guarantee, not a nudge
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('Anthropic API error', resp.status, err);
      return json({ error: 'The AI service is busy — please try again in a moment.' }, 502);
    }

    const data = await resp.json();
    const block = data.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (!block?.input) {
      console.error('No tool_use block in response', JSON.stringify(data).slice(0, 500));
      return json({ error: 'The AI returned an unexpected response — please try again.' }, 502);
    }

    return json({ tool, data: block.input });
  } catch (e) {
    console.error('claude-proxy error', e);
    return json({ error: 'Something went wrong — please try again.' }, 500);
  }
});
