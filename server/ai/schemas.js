// Structured output for every Assist job: a JSON schema (sent to the model as a tool
// definition) and a zod validator (run on whatever comes back). Nothing unvalidated is saved.
import { z } from 'zod';

const str = (max = 2000) => z.string().trim().min(1).max(max);

export const SCHEMAS = {
  checkin: {
    description: 'Summarize a client’s weekly check-in for their coach and draft the coach’s reply.',
    zod: z.object({
      summary: str(1200),
      flags: z.array(z.object({ level: z.enum(['warn', 'crit']), text: str(160) })).max(6),
      wins: z.array(str(160)).max(6),
      actions: z.array(z.object({
        kind: z.enum(['adjust', 'habit', 'note', 'reply', 'call']),
        label: str(160),
        detail: z.string().max(400).optional().nullable(),
        minutes: z.number().int().min(0).max(60),
        op: z.object({ type: z.enum(['reduce_volume', 'pause_exercise', 'add_note', 'add_tag', 'none']), area: z.enum(['lower', 'upper', 'all']).optional().nullable(), pattern: z.string().max(40).optional().nullable(), text: z.string().max(300).optional().nullable() }).optional().nullable(),
      })).max(5),
      reply: str(1500),
    }),
  },
  message: {
    description: 'Draft one message from a coach to their client.',
    zod: z.object({ text: str(1500) }),
  },
  risk: {
    description: 'Explain in plain words why a client may cancel, suggest one action, and draft the outreach message.',
    zod: z.object({ explanation: str(800), action: str(300), draft: str(1200) }),
  },
  workout: {
    description: 'Draft one workout from a coach’s brief using only exercises from the provided library.',
    zod: z.object({
      name: str(80),
      estMinutes: z.number().int().min(10).max(150),
      rationale: str(600),
      notes: z.array(str(400)).max(4),
      blocks: z.array(z.object({
        kind: z.enum(['single', 'superset', 'circuit']),
        items: z.array(z.object({
          exerciseId: z.string().min(1).max(64),
          tempo: z.string().max(20).optional().nullable(),
          notes: z.string().max(200).optional().nullable(),
          sets: z.array(z.object({ reps: z.string().max(20), load: z.string().max(20).optional().nullable(), rpe: z.string().max(10).optional().nullable(), rest: z.string().max(10).optional().nullable() })).min(1).max(8),
        })).min(1).max(4),
      })).min(1).max(10),
    }),
  },
  adjust: {
    description: 'Suggest program adjustments from logged effort, soreness, completion and check-ins.',
    zod: z.object({
      items: z.array(z.object({
        text: str(400), change: str(200), why: str(200),
        op: z.object({ type: z.enum(['reduce_volume', 'increase_load', 'pause_exercise', 'fewer_days', 'none']), area: z.enum(['lower', 'upper', 'all']).optional().nullable(), exerciseId: z.string().max(64).optional().nullable(), amount: z.number().optional().nullable() }).optional().nullable(),
      })).min(1).max(4),
    }),
  },
  progress: {
    description: 'Describe a client’s progress trends for their coach. Describe trends only; no medical or body-composition claims.',
    zod: z.object({ items: z.array(z.object({ tone: z.enum(['good', 'warn', 'crit', 'info']), title: str(120), text: str(300) })).min(1).max(5), note: str(300) }),
  },
  lead: {
    description: 'Read a message from a prospective client and draft the coach’s reply.',
    zod: z.object({ name: z.string().max(80), goal: z.string().max(160), reply: str(800) }),
  },
  meal_photo: {
    description: 'Identify the foods in a meal photo and estimate the grams of each. Do not judge the food.',
    zod: z.object({
      is_food: z.boolean(),
      title: z.string().trim().max(80).default(''),
      items: z.array(z.object({
        name: str(80), grams: z.number().min(0).max(3000), portion_text: z.string().trim().max(60).default(''),
        confidence: z.enum(['high', 'medium', 'low']),
        estimate: z.object({ calories: z.number().min(0).max(5000), protein_g: z.number().min(0).max(500), carbs_g: z.number().min(0).max(800), fat_g: z.number().min(0).max(500) }).optional().nullable(),
      })).max(12),
      note: z.string().trim().max(200).default('Portions are estimated from the photo.'),
    }),
  },
  food_text: {
    description: 'Turn what a client said they ate into separate foods with a quantity each.',
    zod: z.object({ items: z.array(z.object({ name: str(80), qty: z.number().min(0).max(100), unit: z.string().max(20).optional().nullable(), grams: z.number().min(0).max(3000).optional().nullable() })).max(12) }),
  },
  set_text: {
    description: 'Read reps and weight from what a client said while logging one set.',
    zod: z.object({ reps: z.number().int().min(0).max(100).nullable(), weight: z.number().min(0).max(2000).nullable(), bodyweight: z.boolean().default(false) }),
  },
  nutrition_summary: {
    description: 'Summarize a client’s week of food logging for their coach, in neutral words.',
    zod: z.object({ summary: str(600), wins: z.array(str(160)).max(3), focus: z.array(str(160)).max(3) }),
  },
  nutrition_nudge: {
    description: 'Draft a short, friendly, number-free nutrition nudge from a coach to their client.',
    zod: z.object({ text: str(800) }),
  },
  voice_summary: {
    description: 'Summarize a client’s voice note for their coach in one short line.',
    zod: z.object({ summary: str(160) }),
  },
  briefing: {
    description: 'Word a coach’s morning briefing from the facts given. Only use those facts.',
    zod: z.object({ lines: z.array(str(240)).min(2).max(8) }),
  },
};

/** Minimal JSON Schema generation from the zod validators (for provider tool definitions). */
export function jsonSchemaFor(task) {
  return z.toJSONSchema(SCHEMAS[task].zod, { target: 'draft-7' });
}
