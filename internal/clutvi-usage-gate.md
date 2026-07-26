# Clutvi — Usage Gate Implementation

Protects you from trial users burning API budget. One Supabase table, one shared
function, dropped into every Edge Function in the same way.

---

## Step 1 — Database migration

Create this file: `supabase/migrations/[timestamp]_usage_gate.sql`

Replace `[timestamp]` with the current datetime e.g. `20260627120000`.

```sql
-- Usage tracking table
CREATE TABLE IF NOT EXISTS public.usage (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  count       integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS usage_user_date_idx ON public.usage(user_id, date);

-- RLS: users can only see their own usage
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.usage FOR SELECT
  USING (auth.uid() = user_id);

-- Only Edge Functions (service role) can insert/update
-- Frontend reads via select policy above
```

Run it:
```bash
supabase db push
```

---

## Step 2 — Shared usage gate function

Create this file: `supabase/functions/_shared/usage-gate.ts`

The underscore prefix tells Supabase not to deploy this as a standalone function.
It's imported by every tool function.

```typescript
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Limits per plan
const LIMITS = {
  trial: {
    daily: 10,
    total: 50,   // across the whole trial period
  },
  pro: {
    daily: 100,
    total: Infinity,
  },
  free: {
    daily: 0,    // no free tier, must be trial or pro
    total: 0,
  },
};

export type Plan = "trial" | "pro" | "free";

export interface GateResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  plan: Plan;
}

/**
 * Check whether a user is allowed to make a generation request.
 * If allowed, increments their usage count atomically.
 * 
 * @param supabase  Service-role Supabase client
 * @param userId    The authenticated user's ID
 * @param plan      Their current plan: "trial" | "pro" | "free"
 */
export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
): Promise<GateResult> {

  const limits = LIMITS[plan];

  // Pro users: just increment, no daily cap check needed
  if (plan === "pro") {
    await incrementUsage(supabase, userId);
    return { allowed: true, plan, remaining: limits.daily };
  }

  // Free users: never allowed
  if (plan === "free") {
    return {
      allowed: false,
      reason: "Start your free trial to use Clutvi tools.",
      plan,
    };
  }

  // Trial users: check daily limit
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: todayUsage } = await supabase
    .from("usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const todayCount = todayUsage?.count ?? 0;

  if (todayCount >= limits.daily) {
    return {
      allowed: false,
      reason: `You've used all ${limits.daily} of your daily trial generations. Come back tomorrow or upgrade to Clutvi Pro for 100/day.`,
      remaining: 0,
      plan,
    };
  }

  // Check total trial usage across all days
  const { data: totalData } = await supabase
    .from("usage")
    .select("count")
    .eq("user_id", userId);

  const totalCount = (totalData ?? []).reduce((sum, row) => sum + row.count, 0);

  if (totalCount >= limits.total) {
    return {
      allowed: false,
      reason: `You've used all ${limits.total} trial generations. Upgrade to Clutvi Pro to keep going.`,
      remaining: 0,
      plan,
    };
  }

  // All checks passed — increment and allow
  await incrementUsage(supabase, userId);

  const remaining = Math.min(
    limits.daily - (todayCount + 1),
    limits.total - (totalCount + 1),
  );

  return { allowed: true, plan, remaining };
}

/**
 * Upsert today's usage row, incrementing count by 1.
 * Uses ON CONFLICT to handle the unique(user_id, date) constraint atomically.
 */
async function incrementUsage(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_date: today,
  });
}
```

---

## Step 3 — SQL function for atomic increment

Add this to the same migration file from Step 1, or create a new one:

```sql
-- Atomic upsert: insert today's row or increment if it exists
CREATE OR REPLACE FUNCTION increment_usage(p_user_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.usage (user_id, date, count)
  VALUES (p_user_id, p_date, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    count = public.usage.count + 1,
    updated_at = now();
END;
$$;
```

Run `supabase db push` again after adding this.

---

## Step 4 — How to get the user's plan

You need to know whether the user is on trial or pro before calling the gate.
The cleanest way is a helper that reads from Stripe via your existing subscription
check, or from a `profiles` table if you cache it there.

Add this to `_shared/usage-gate.ts`:

```typescript
/**
 * Resolve a user's current plan from Supabase.
 * Assumes you have a profiles or subscriptions table with a status field.
 * Adjust the table/field names to match your actual schema.
 */
export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<Plan> {
  // Option A: if you store subscription status in a profiles table
  const { data } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", userId)
    .single();

  if (!data) return "free";

  const status = data.subscription_status;

  // Stripe trial status
  if (status === "trialing") return "trial";

  // Active paid subscription
  if (status === "active") return "pro";

  // Cancelled, past_due, etc.
  return "free";
}
```

If your schema is different, adjust the table and field names. The key is:
Stripe webhook → updates `profiles.subscription_status` → gate reads it here.

---

## Step 5 — Drop it into an existing Edge Function

Here's how to add the gate to your existing `claude-proxy` function (or any tool):

```typescript
// supabase/functions/claude-proxy/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  checkAndIncrementUsage,
  getUserPlan,
} from "../_shared/usage-gate.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

Deno.serve(async (req) => {
  try {
    // 1. Auth check — get the user from the JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401 },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the user's JWT and get their ID
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401 },
      );
    }

    // 2. Usage gate — check plan and limits
    const plan = await getUserPlan(supabase, user.id);
    const gate = await checkAndIncrementUsage(supabase, user.id, plan);

    if (!gate.allowed) {
      return new Response(
        JSON.stringify({
          error: gate.reason,
          upgrade: true,         // frontend uses this to show upgrade prompt
          remaining: 0,
        }),
        { status: 429 },
      );
    }

    // 3. Parse the actual request
    const body = await req.json();

    // 4. Call Anthropic API (your existing logic here)
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: body.messages,
      }),
    });

    const data = await res.json();

    // 5. Return result with remaining count so UI can show it
    return new Response(
      JSON.stringify({
        ...data,
        remaining: gate.remaining,
        plan: gate.plan,
      }),
      { headers: { "content-type": "application/json" } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 },
    );
  }
});
```

---

## Step 6 — Frontend: show the limit to the user

In your React app, handle the `429` response and the `remaining` count:

```typescript
// In your tool component, wherever you call the Edge Function
const callTool = async (payload: object) => {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (res.status === 429) {
    const err = await res.json();
    // Show upgrade prompt
    setLimitError(err.error);
    setShowUpgradePrompt(true);
    return;
  }

  const result = await res.json();

  // Show remaining count in the UI
  setRemaining(result.remaining);

  // Handle the actual result
  setOutput(result);
};
```

A small "X generations remaining today" line in the UI is worth adding — it nudges
trial users toward upgrading without being aggressive about it.

---

## Prompt for Claude Code

Once you've read through this, paste this into Claude Code to build it:

```
Read docs/clutvi-usage-gate.md in full.

Build the usage gate exactly as specced:

1. Create the SQL migration file at supabase/migrations/20260627120000_usage_gate.sql
   with the usage table, RLS policies, index, and increment_usage function.

2. Create supabase/functions/_shared/usage-gate.ts with the checkAndIncrementUsage,
   getUserPlan, and incrementUsage functions exactly as written in the spec.

3. Update the existing claude-proxy Edge Function to import from _shared/usage-gate.ts
   and add the auth check + gate check before the Anthropic API call, as shown in
   Step 5 of the spec. Show me the diff before applying.

4. Check what subscription_status field exists in my profiles or subscriptions table
   and adjust getUserPlan() to match my actual schema. If you can't find it, tell me
   what you find instead.

Show me every file you plan to create or change before applying anything.
```

---

## Limits to adjust later

Start conservative. You can loosen limits once you know your real per-generation cost.

| What to watch | Where to check |
|---|---|
| Cost per generation | Anthropic Console → Usage |
| Average generations per trial user | Supabase → Table Editor → usage |
| Conversion rate trial → paid | Stripe Dashboard |

If your average trial user uses 8 generations and converts, a 50-total limit is fine.
If they're hammering 40 a day, tighten the daily cap to 5.
