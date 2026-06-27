# Clutvi — Conversion Layer Build Spec

The three tools the whole market skips: turning a post into actual money. None of your competitors walk the creator from "viral hook" to "sale." This is your wedge.

Build order: **Tool 1 first** (bolts onto your existing Script/Caption output, simplest). Then **Tool 3** (your real differentiator). Then **Tool 2**.

Stack assumptions: React frontend, one Supabase Edge Function per tool calling the Anthropic Messages API, output as JSON rendered into result cards, gated behind your existing Stripe trial/auth check.

---

## Shared foundation: the Offer Profile

Build this once before the three tools. It's a small Supabase table holding what the creator sells, so all three tools share context instead of asking every time. It also makes the suite feel connected and gets stickier the more they fill in.

**Table: `offer_profiles`** (one row per user)

| field | type | notes |
|---|---|---|
| user_id | uuid | FK to auth.users |
| what_they_sell | text | "£40 candle-making starter kits" |
| price | text | free-form, handles "£9.99/mo", "DM for quote" |
| who_its_for | text | "UK hobbyists, 30-50, want a side income" |
| audience_pain | text | optional |
| brand_voice | text | optional, 1-2 lines of how they sound |
| platforms | text[] | tiktok / reels / shorts |

Every tool reads this profile and injects it into the prompt. The creator fills it once; the tools get smarter for free.

---

## Tool 1 — CTA & Offer Builder

Turns any post or script into one that drives a specific action. Works standalone or bolts onto the output of your existing Script Generator.

### Inputs (UI fields)

- **What are you promoting?** — text, prefilled from Offer Profile, editable. Allow "just building audience / newsletter / freebie."
- **Goal of this post** — select: `DMs` · `link clicks` · `comments` · `saves & shares` · `follows` · `direct sale`
- **Offer type** — select: `paid product` · `freebie / lead magnet` · `waitlist` · `booking or call` · `affiliate`
- **Sell intensity** — select: `soft` · `medium` · `hard`
- **Your post or script** — textarea, optional. If blank, generate the CTA section from scratch off the Offer Profile.
- **Platform** — select: `TikTok` · `Reels` · `Shorts`

### Outputs (result cards)

- **3 CTA lines** at soft / medium / hard intensity, tuned to the chosen goal
- **Comment-to-DM mechanic**: a trigger word plus the auto-DM copy that delivers when someone comments it
- **On-screen caption CTA** (the text overlay / caption line)
- **Spoken CTA** with placement (where in the script to say it, e.g. "after the payoff, ~0:38")
- **Pinned-comment suggestion**

### System prompt

```
You are a UK short-form conversion strategist for Clutvi. You turn creator
content into posts that drive one specific action, written for TikTok, Reels and
Shorts.

CREATOR OFFER PROFILE:
{offer_profile_json}

THIS REQUEST:
- Promoting: {what_promoting}
- Goal: {goal}
- Offer type: {offer_type}
- Sell intensity: {intensity}
- Platform: {platform}
- Their post/script (may be empty): {script}

Your job: produce the conversion layer for this post. If a script is provided,
write CTAs that fit its content and tone. If not, generate from the Offer Profile.

Match the sell intensity exactly:
- soft: invite, no pressure, curiosity-led
- medium: clear ask with a reason to act now
- hard: direct, specific, time or scarcity framing

WRITING RULES (follow strictly):
- Write like a real UK creator talking to camera, not a marketer.
- Active voice. Cut adverbs and filler.
- No em dashes. No "not X, it's Y" constructions. No hype words (unleash,
  supercharge, game-changer, elevate, dive in).
- Vary sentence length. Short lines hit harder on short-form.
- UK spelling and references. Prices in GBP.
- A CTA is one clear action. Never stack two asks in one line.

Return ONLY valid JSON, no preamble, no markdown fences:
{
  "ctas": {
    "soft": "string",
    "medium": "string",
    "hard": "string"
  },
  "comment_to_dm": {
    "trigger_word": "string (one word, all caps)",
    "auto_dm": "string (the DM they receive)"
  },
  "caption_cta": "string",
  "spoken_cta": {
    "line": "string",
    "placement": "string"
  },
  "pinned_comment": "string"
}
```

---

## Tool 2 — Lead-Magnet Generator

Micro-creators grow lists and sales with freebies. This builds the freebie, the post that promotes it, and the DMs that deliver it and pitch the paid thing. End to end.

### Inputs

- **Your niche / what you're known for** — text, prefilled from Offer Profile
- **What you sell (or want to)** — text, prefilled. This is what the freebie must bridge to.
- **Audience pain point** — text, optional. If blank, the tool infers it.
- **Freebie format** — select: `checklist` · `template` · `mini-guide` · `swipe file` · `cheat sheet` · `Notion doc`
- **Delivery method** — select: `DM keyword` · `link in bio` · `email opt-in`

### Outputs

- **3 lead-magnet concepts**: title, one-line promise, and why each bridges to the paid offer
- **Full freebie content** for the chosen concept (outline or full text, so they can actually produce it)
- **Promo post**: hook, short script, CTA using the Tool 1 DM mechanic
- **Delivery DM**: hands over the freebie, then a soft pitch to the paid offer
- **Follow-up DM**: 24-48h later, nudges the paid offer

### System prompt

```
You are a UK lead-generation strategist for Clutvi. You design free resources
that grow a creator's list and lead naturally to their paid offer.

CREATOR OFFER PROFILE:
{offer_profile_json}

THIS REQUEST:
- Niche: {niche}
- Paid offer to bridge to: {paid_offer}
- Audience pain (may be empty, infer if so): {pain}
- Freebie format: {format}
- Delivery method: {delivery}

Every freebie must solve a real, narrow problem AND make the paid offer the
obvious next step. The freebie gives a quick win; the paid offer gives the full
result. State that bridge explicitly in each concept.

If delivery is "DM keyword", include a one-word all-caps trigger and write the
promo post CTA around commenting it.

WRITING RULES (follow strictly):
- Write like a real UK creator, not a marketer.
- Active voice. Cut adverbs and filler.
- No em dashes. No "not X, it's Y" constructions. No hype words.
- Vary sentence length. UK spelling. Prices in GBP.
- The freebie content must be genuinely useful on its own. No thin bait.

Return ONLY valid JSON, no preamble, no markdown fences:
{
  "concepts": [
    { "title": "string", "promise": "string", "bridge_to_paid": "string" }
  ],
  "chosen_freebie": {
    "title": "string",
    "content": "string (the actual outline or full text of the freebie)"
  },
  "promo_post": {
    "hook": "string",
    "script": "string",
    "cta": "string"
  },
  "delivery_dm": "string",
  "followup_dm": "string"
}
```

Note: return 3 concepts, then build out only the first as `chosen_freebie`. In the
UI, let the creator pick a different concept and re-run to build that one out.

---

## Tool 3 — Offer-to-Content (the differentiator)

The inverse of every "what should I post" tool. The creator tells you what they sell; you reverse-engineer the content that leads to the sale. This is the one nobody else does. Make it the feature you demo.

### Inputs

- **What do you sell?** — text + price + who it's for, prefilled from Offer Profile
- **Journey stage to focus on** — select: `cover the whole funnel` · `awareness` · `consideration` · `decision`
- **How many posts / over what window** — select: `5 posts / 1 week` · `8 / 2 weeks` · `12 / month` · custom
- **Platform(s)** — multi-select

### Outputs

- **A content ladder**: every post mapped to a buyer-journey stage (awareness → trust → proof → offer)
- **Per post**: the angle, hook, format, the specific job it does in the funnel, and its CTA
- **A through-line** so the series builds instead of feeling random
- **The money post** (the direct-offer one) written in full
- **Suggested order and cadence**

### System prompt

```
You are a UK content-funnel strategist for Clutvi. You work backwards from
what a creator sells to the exact series of short-form posts that leads someone
from "never heard of you" to "bought it."

CREATOR OFFER PROFILE:
{offer_profile_json}

THIS REQUEST:
- What they sell: {offer}
- Focus stage: {stage}
- Series size: {count} posts over {window}
- Platforms: {platforms}

Map every post to a buyer-journey stage:
- AWARENESS: get the right stranger to stop scrolling. No selling.
- TRUST: show you understand their problem. Teach one thing.
- PROOF: results, before/after, a testimonial angle, or your own story.
- OFFER: the direct ask. Only earn this after the others.

The series must have a through-line so each post sets up the next. Vary the
formats so the feed does not feel repetitive. Only ONE post is a hard offer;
write that one in full.

WRITING RULES (follow strictly):
- Write like a real UK creator talking to camera.
- Active voice. Cut adverbs and filler.
- No em dashes. No "not X, it's Y" constructions. No hype words.
- Vary sentence length. UK spelling. Prices in GBP.

Return ONLY valid JSON, no preamble, no markdown fences:
{
  "through_line": "string (the narrative thread across the series)",
  "posts": [
    {
      "order": 1,
      "stage": "awareness | trust | proof | offer",
      "angle": "string",
      "hook": "string",
      "format": "string",
      "funnel_job": "string (what this post does for the sale)",
      "cta": "string"
    }
  ],
  "money_post": {
    "hook": "string",
    "script": "string",
    "cta": "string"
  },
  "cadence": "string (suggested order and posting rhythm)"
}
```

---

## Reference Edge Function (Tool 1)

The other two follow the same shape: read profile, build prompt, call the API, parse JSON, return. Build this one, then Claude Code can clone the pattern.

```ts
// supabase/functions/cta-builder/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

Deno.serve(async (req) => {
  try {
    const { userId, whatPromoting, goal, offerType, intensity, platform, script } =
      await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Gate: confirm active trial or subscription (reuse your existing check)
    // if (!(await hasAccess(supabase, userId))) return new Response("Upgrade required", { status: 402 });

    // 2. Load the shared Offer Profile
    const { data: profile } = await supabase
      .from("offer_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // 3. Build the system prompt (store the template as a constant; inject values)
    const systemPrompt = CTA_SYSTEM_PROMPT
      .replace("{offer_profile_json}", JSON.stringify(profile ?? {}))
      .replace("{what_promoting}", whatPromoting ?? "")
      .replace("{goal}", goal)
      .replace("{offer_type}", offerType)
      .replace("{intensity}", intensity)
      .replace("{platform}", platform)
      .replace("{script}", script ?? "");

    // 4. Call the Messages API
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate the conversion layer now." }],
      }),
    });

    const data = await res.json();
    const text = data.content.find((b: any) => b.type === "text")?.text ?? "{}";

    // 5. Parse JSON safely (strip fences if the model adds them)
    const clean = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
```

### Model choice

- **`claude-sonnet-4-6`**: best quality for copy, fine for this volume. Start here.
- **`claude-haiku-4-5-20251001`**: cheaper and faster if these tools get heavy use. The prompts are tight enough that Haiku handles them well. Easy to swap the `model` string per tool, so you could run Tool 1 on Haiku and Tool 3 (the showcase) on Sonnet.

Always `max_tokens` generous enough for the full JSON. Tool 3 returns the most, so give it ~3000.

---

## Why this is the standout, in one line

Every other tool stops at "here's a viral hook." These three take the creator from a post to a paying customer, in your voice, UK-native, on the stack you already run. That's the gap nobody else fills.
