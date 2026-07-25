// Usage gate: caps generations per plan so trial users can't burn the API
// budget. claude-proxy calls checkAndIncrementUsage() before every Anthropic
// request.
//
// Counting is increment-first via the increment_usage RPC (an atomic upsert
// that returns the new count), so two parallel requests can't both sneak under
// the cap. A denied request still bumps the stored count, but only once the
// user is already over the line — the number of *allowed* generations stays
// exact.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Plan = 'trial' | 'pro' | 'free';

export const LIMITS: Record<Plan, { daily: number; total: number }> = {
  // The trial total has to be under daily x trial length or it never fires:
  // 3 days x 10 = 30, so 25 is what actually ends the trial early.
  trial: { daily: 10, total: 25 },
  pro: { daily: 40, total: Infinity }, // fair-use cap — still protects the budget
  free: { daily: 0, total: 0 },        // no free tier: trial or pro only
};

export interface GateResult {
  allowed: boolean;
  reason?: string;
  remaining: number;
  plan: Plan;
}

// Stripe webhook keeps profiles.subscription_status in sync; map it to a plan.
export function planFromStatus(status: string | null | undefined): Plan {
  if (status === 'trialing') return 'trial';
  if (status === 'active') return 'pro';
  return 'free';
}

export async function checkAndIncrementUsage(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
): Promise<GateResult> {
  const limits = LIMITS[plan];

  if (limits.daily === 0) {
    return {
      allowed: false,
      reason: 'Start your free trial to use the Clutvi tools.',
      remaining: 0,
      plan,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayCount, error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_date: today,
  });
  if (error) throw new Error(`increment_usage failed: ${error.message}`);

  if (todayCount > limits.daily) {
    return {
      allowed: false,
      reason: plan === 'trial'
        ? `You've used all ${limits.daily} of today's trial generations — they reset tomorrow. Pro includes ${LIMITS.pro.daily} a day.`
        : `You've hit today's fair-use limit of ${limits.daily} generations — it resets tomorrow.`,
      remaining: 0,
      plan,
    };
  }

  let remaining = limits.daily - todayCount;

  // Trial users also have a whole-trial cap across all days.
  if (Number.isFinite(limits.total)) {
    const { data: rows, error: totalError } = await supabase
      .from('usage')
      .select('count')
      .eq('user_id', userId);
    if (totalError) throw new Error(`usage total lookup failed: ${totalError.message}`);

    const total = (rows ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0);
    if (total > limits.total) {
      return {
        allowed: false,
        reason: `You've used all ${limits.total} trial generations. Upgrade to Clutvi Pro to keep creating.`,
        remaining: 0,
        plan,
      };
    }
    remaining = Math.min(remaining, limits.total - total);
  }

  return { allowed: true, remaining, plan };
}
