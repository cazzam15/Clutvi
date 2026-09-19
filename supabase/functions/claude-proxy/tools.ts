// Per-tool definitions for the structured claude-proxy.
//
// Each tool owns its system prompt, its user-prompt builder, and — crucially —
// an output JSON schema. The proxy forces Claude to "call" a tool matching this
// schema (tool_choice), so the response is guaranteed to be structured JSON.
// The frontend renders typed fields instead of parsing free text.

export type ToolSpec = {
  description: string;
  schema: Record<string, unknown>;
  build: (input: string, o: Record<string, string>) => { system: string; userPrompt: string };
};

const s = (description: string) => ({ type: 'string', description });
const list = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

export const TOOLS: Record<string, ToolSpec> = {
  caption: {
    description: 'Return three caption options for the post.',
    schema: {
      type: 'object',
      properties: {
        captions: {
          type: 'array', minItems: 3, maxItems: 3,
          items: {
            type: 'object',
            properties: {
              hook: s('A scroll-stopping first line.'),
              body: s('The caption body — 1–3 short paragraphs.'),
              hashtags: { type: 'array', items: { type: 'string' }, minItems: 10, maxItems: 15, description: 'Relevant hashtags, no leading "#".' },
            },
            required: ['hook', 'body', 'hashtags'],
          },
        },
      },
      required: ['captions'],
    },
    build: (input, o) => ({
      system: `You are a top ${o.platform ?? 'Instagram'} content creator writing in a ${(o.tone ?? 'casual').toLowerCase()} tone.`,
      userPrompt: `Write three captions for a post about: "${input}". Each needs a strong hook, an engaging body, and 10–15 relevant hashtags.`,
    }),
  },

  algo: {
    description: 'Score the content idea and explain how to improve it.',
    schema: {
      type: 'object',
      properties: {
        score: { type: 'integer', minimum: 0, maximum: 100, description: 'Predicted algorithm performance, 0–100.' },
        verdict: s('One or two sentences on why it will or will not perform.'),
        why: { ...list('Exactly 3 short reasons for the score.'), minItems: 3, maxItems: 3 },
        change_this: s('One concrete thing to change before filming.'),
        rewritten_hook: s('One stronger opening line the creator can film.'),
        improvements: { ...list('2–4 concrete, specific improvements.'), minItems: 2, maxItems: 4 },
        best_time: s('Best day/time window to post.'),
        format: s('Recommended format, e.g. "6–8 slide carousel".'),
      },
      required: ['score', 'verdict', 'why', 'change_this', 'rewritten_hook', 'improvements', 'best_time', 'format'],
    },
    build: (input, o) => ({
      system: `You are a ${o.platform ?? 'Instagram'} algorithm expert and a content coach. Be direct and specific. Do not invent platform features.`,
      userPrompt: `Score this content idea out of 100. Give 3 short reasons (why), ONE concrete fix (change_this), and one stronger hook (rewritten_hook). Then say how to make it perform better.\n\nIdea: "${input}"`,
    }),
  },

  history: {
    description: "Analyse the creator's recent posts and engagement.",
    schema: {
      type: 'object',
      properties: {
        works: list('Content types performing best.'),
        patterns: list('Patterns shared by top performers.'),
        do_more: list('What to do more of.'),
        stop: list('What to stop doing.'),
        ideas: { ...list('Three specific new content ideas grounded in the data.'), minItems: 3, maxItems: 3 },
      },
      required: ['works', 'patterns', 'do_more', 'stop', 'ideas'],
    },
    build: (input) => ({
      system: 'You are a social media strategist. Give actionable insights only — no fluff.',
      userPrompt: `Analyse these posts and engagement data:\n${input}`,
    }),
  },

  brain: {
    description: 'Turn the brain dump into a structured content plan.',
    schema: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: s('When to post, e.g. "Mon" or "Day 1".'),
              format: { type: 'string', enum: ['reel', 'carousel', 'static'], description: 'Post format.' },
              hook: s('The opening hook.'),
              outline: s('A short, ready-to-execute outline.'),
            },
            required: ['day', 'format', 'hook', 'outline'],
          },
        },
      },
      required: ['posts'],
    },
    build: (input, o) => ({
      system: `You are a social media content strategist planning for ${o.platform ?? 'Instagram'}.`,
      userPrompt: `Turn this brain dump into a content plan of ${o.plan ?? '5 posts'}:\n${input}`,
    }),
  },

  comment: {
    description: 'Write a reply to each comment.',
    schema: {
      type: 'object',
      properties: {
        replies: {
          type: 'array',
          items: {
            type: 'object',
            properties: { comment: s('The original comment.'), reply: s('A genuine 1–2 sentence reply.') },
            required: ['comment', 'reply'],
          },
        },
      },
      required: ['replies'],
    },
    build: (input, o) => ({
      system: `You are a social media manager replying in a ${(o.tone ?? 'friendly').toLowerCase()} voice. Keep replies genuine and concise.`,
      userPrompt: `Write a reply to each of these comments (one per line):\n${input}`,
    }),
  },

  viral: {
    description: "Remix the viral post for the creator's niche.",
    schema: {
      type: 'object',
      properties: {
        remixes: {
          type: 'array', minItems: 2, maxItems: 2,
          items: {
            type: 'object',
            properties: {
              hook: s('The adapted hook.'),
              body: s('The adapted body.'),
              hashtags: list('Relevant hashtags, no leading "#".'),
            },
            required: ['hook', 'body', 'hashtags'],
          },
        },
      },
      required: ['remixes'],
    },
    build: (input, o) => ({
      system: "You are a viral content strategist. Keep the original's structure and hook style, but fully adapt the content — never copy it.",
      userPrompt: `Remix this viral post for the niche "${o.niche ?? 'general'}". Give two versions.\n\n${input}`,
    }),
  },
};
