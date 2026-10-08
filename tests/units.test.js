// Pure functions: the retention radar's scoring, tone check, CSV import parsing, dates and slugs.
import { describe, it, expect } from 'vitest';
import { scoreRisk, sentimentOf, plateauWeeks } from '../server/core/risk.js';
import { parseCsv, clientsFromCsv } from '../server/lib/csv.js';
import { trainingWeekdays, weekStart, ymdToDate, localYMD } from '../server/lib/time.js';
import { slugify } from '../server/routes/auth.js';
import { normalizeBlocks, countSets } from '../server/core/training.js';

describe('risk scoring (build plan weights)', () => {
  it('scores a drifting client HIGH and explains every point', () => {
    const r = scoreRisk({ missed14: 5, checkinMiss: 2, msgDrop: 0.6, sentiment: 'negative', quote: 'not sure this is working for me', payFailed: true, adherence: 36 });
    expect(r.level).toBe('HIGH');
    expect(r.score).toBe(96); // capped
    expect(r.reasons[0]).toBe('Missed 5 workouts in the last 14 days');
    expect(r.reasons).toContain('Said “not sure this is working for me”');
    expect(r.reasons).toContain('Latest payment failed');
  });
  it('uses the thresholds: 40 = MEDIUM, 65 = HIGH', () => {
    expect(scoreRisk({ missed14: 3, checkinMiss: 1, adherence: 70 })).toMatchObject({ score: 38, level: 'LOW' }); // 21 + 12 + 5
    expect(scoreRisk({ missed14: 4, checkinMiss: 1 }).score).toBe(40);
    expect(scoreRisk({ missed14: 4, checkinMiss: 1 }).level).toBe('MEDIUM');
    expect(scoreRisk({ missed14: 5, checkinMiss: 2, payFailed: true }).level).toBe('HIGH');
    expect(scoreRisk({}).level).toBe('LOW');
  });
  it('caps each signal so one bad week can’t max the score alone', () => {
    expect(scoreRisk({ missed14: 20 }).score).toBe(35);
    expect(scoreRisk({ checkinMiss: 6 }).score).toBe(24);
  });
  it('reads tone from the client’s own words', () => {
    expect(sentimentOf(['Great session today!']).sentiment).not.toBe('negative');
    const s = sentimentOf(['Missed today, work ran late again. honestly not sure this is working for me']);
    expect(s.sentiment).toBe('negative');
    expect(s.quote).toMatch(/not sure this is working/);
  });
  it('counts plateau weeks within half a pound', () => {
    expect(plateauWeeks([200, 199, 198.6, 198.4, 198.7])).toBe(3);
    expect(plateauWeeks([200, 198])).toBe(0);
  });
});

describe('CSV import', () => {
  it('handles quotes, commas and line breaks inside fields', () => {
    expect(parseCsv('name,goal\n"Lee, Ann","Run a 5K\nthen a 10K"\n')).toEqual([['name', 'goal'], ['Lee, Ann', 'Run a 5K\nthen a 10K']]);
  });
  it('maps common column names from other apps and flags bad rows', () => {
    const r = clientsFromCsv('First Name,Last Name,Email Address,Main Goal,Start Date\nAnn,Lee,ANN@EXAMPLE.COM,Lose 10 lb,2026-01-05\n,,broken-email,,\n');
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: 'Ann Lee', email: 'ann@example.com', goal: 'Lose 10 lb' });
    expect(r.rows[1].issues).toEqual(expect.arrayContaining(['missing name', 'email looks wrong']));
  });
  it('explains a file with no name column', () => {
    expect(clientsFromCsv('foo,bar\n1,2').problems[0]).toMatch(/name/);
  });
});

describe('dates and helpers', () => {
  it('spreads training days across the week', () => {
    expect(trainingWeekdays(3)).toEqual([0, 2, 4]);
    expect(trainingWeekdays(4)).toEqual([0, 1, 3, 4]);
  });
  it('finds Monday for any day', () => {
    expect(weekStart(ymdToDate('2026-10-07')).toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(weekStart(ymdToDate('2026-10-11')).toISOString().slice(0, 10)).toBe('2026-10-05');
  });
  it('uses the coach’s time zone for “today”', () => {
    const late = new Date('2026-10-08T02:30:00Z'); // 10:30 PM Oct 7 in New York
    expect(localYMD('America/New_York', late)).toBe('2026-10-07');
    expect(localYMD('UTC', late)).toBe('2026-10-08');
  });
  it('makes safe booking-page slugs', () => {
    expect(slugify('Reyes Strength & Co.')).toMatch(/^[a-z0-9-]+$/);
    expect(slugify('Ñandú Fitness')).toMatch(/^[a-z0-9-]+$/);
  });
  it('normalizes workout blocks and drops empty ones', () => {
    const b = normalizeBlocks([{ kind: 'superset', items: [{ exerciseId: 'e1', sets: [{ reps: 10, load: 50 }] }] }, { kind: 'single', items: [] }]);
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('single');
    expect(b[0].items[0].sets[0]).toEqual({ reps: '10', load: '50', rpe: '', rest: '' });
    expect(countSets(b)).toBe(1);
  });
});
