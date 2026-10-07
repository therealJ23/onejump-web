// Loads the prototype's sample business (Reyes Strength, 18 clients) into a workspace as
// real, time-relative history: programs, scheduled and logged workouts, check-ins, weights,
// messages, payments and leads. Used by `npm run db:seed` and by "Load sample clients"
// during onboarding. Everything goes through the tenant-scoped client it is given.
//
// The risk picture (who's drifting and why) is NOT hard-coded: it's produced by the real
// radar from the generated data, the same way it will be for real clients.
import { randomUUID } from 'node:crypto';
import { todayKey, addDays, weekStart, trainingWeekdays, DAY } from '../lib/time.js';
import { pickWorkout } from '../core/training.js';
import { ensureAutomations } from '../core/automationTemplates.js';

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const bid = () => `b_${randomUUID().slice(0, 8)}`, iid = () => `i_${randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------- programs
// item: [exercise, sets, reps, load, rpe, rest, notes, tempo]
const I = (ex, sets, reps, load = '', rpe = '7', rest = '75', notes = '', tempo = '') => ({ ex, sets, reps, load, rpe, rest, notes, tempo });
const S = (...items) => ({ kind: 'superset', items });
const C = (...items) => ({ kind: 'circuit', items });

const PROGRAMS = [
  { key: 'p1', name: 'Fat Loss Foundations', weeks: 8, days: 4, level: 'Beginner–Intermediate', source: 'manual', workouts: [
    ['Lower Body A', 50, [
      { kind: 'single', items: [{ ex: 'Goblet squat', sets: 3, reps: '10', load: '55 lb', rpeList: ['7', '7', '8'], rest: '90', notes: 'Pause 1 s at the bottom', tempo: '3-1-1' }] },
      I('Romanian deadlift', 3, '8', '95 lb', '7', '90', 'Soft knees, push hips back', '3-0-1'),
      S(I('Split squat', 3, '10', '25 lb', '7', '0', 'Each side'), I('Leg curl', 3, '12', '70 lb', '8', '75')),
      C(I('Dead bug', 2, '8', 'BW', '', '0', 'Each side, slow'), I('Farmer carry', 2, '1', '50 lb', '', '0', '40 m'), I('Calf raise', 2, '15', '30 lb', '', '60', '', '2-1-2')),
    ]],
    ['Upper Body A', 45, [I('Dumbbell bench press', 3, '10', '45 lb', '7', '90'), I('One-arm dumbbell row', 3, '10', '40 lb', '7', '75', 'Each side'), I('Seated dumbbell press', 2, '10', '25 lb', '7', '75'), S(I('Dumbbell curl', 2, '12', '20 lb', '8', '0'), I('Rope pushdown', 2, '12', '40 lb', '8', '60'))]],
    ['Lower Body B', 50, [I('Trap bar deadlift', 3, '6', '185 lb', '7', '120'), I('Step-up', 3, '10', '25 lb', '7', '75', 'Each side'), I('Hip thrust', 3, '12', '135 lb', '7', '90'), I('Farmer carry', 3, '1', '50 lb', '', '60', '40 m')]],
    ['Upper Body B', 45, [I('Incline dumbbell press', 3, '10', '35 lb', '7', '90'), I('Chest-supported row', 3, '12', '30 lb', '7', '75'), I('Push-up', 2, 'AMRAP', 'BW', '8', '60'), I('Band pull-apart', 2, '15', 'Band', '', '45')]],
  ] },
  { key: 'p2', name: 'Strength Base', weeks: 12, days: 4, level: 'Intermediate', source: 'manual', workouts: [
    ['Squat day', 60, [I('Back squat', 4, '5', '255 lb', '8', '180', '', '2-0-1'), I('Romanian deadlift', 3, '8', '135 lb', '7', '120'), I('Split squat', 3, '8', '35 lb', '7', '90', 'Each side'), I('Plank', 3, '45 s', 'BW', '', '45')]],
    ['Bench day', 60, [I('Bench press', 4, '5', '185 lb', '8', '180'), I('Barbell row', 4, '8', '135 lb', '7', '120'), I('Overhead press', 3, '6', '95 lb', '7', '120'), I('Face pull', 3, '15', '30 lb', '', '60')]],
    ['Deadlift day', 55, [I('Deadlift', 4, '3', '180 lb', '8', '180'), I('Box squat', 3, '5', '185 lb', '7', '150'), I('Hanging knee raise', 3, '10', 'BW', '', '60')]],
    ['Volume day', 50, [I('Bench press', 3, '8', '165 lb', '7', '120'), I('Pull-up', 3, '6', 'BW', '8', '120'), I('Seated dumbbell press', 3, '10', '40 lb', '7', '90'), I('Hammer curl', 3, '12', '30 lb', '8', '60')]],
  ] },
  { key: 'p3', name: 'Start From Zero', weeks: 8, days: 3, level: 'Beginner', source: 'assist', workouts: [
    ['Full Body A', 40, [I('Goblet squat', 3, '10', '25 lb', '6', '90'), I('Dumbbell bench press', 3, '10', '25 lb', '6', '90'), I('One-arm dumbbell row', 3, '10', '25 lb', '6', '75', 'Each side'), I('Dead bug', 2, '8', 'BW', '', '45', 'Each side')]],
    ['Full Body B', 40, [I('Romanian deadlift', 3, '10', '65 lb', '6', '90'), I('Seated dumbbell press', 3, '10', '15 lb', '6', '75'), I('Split squat', 2, '8', 'BW', '6', '75', 'Each side'), I('Farmer carry', 3, '1', '35 lb', '', '60', '40 m')]],
    ['Full Body C', 40, [I('Box squat', 3, '8', '45 lb', '6', '90'), I('Push-up', 3, 'AMRAP', 'BW', '7', '75'), I('Chest-supported row', 3, '12', '20 lb', '6', '75'), I('Plank', 3, '30 s', 'BW', '', '45')]],
  ] },
  { key: 'p4', name: 'Hybrid Athlete', weeks: 12, days: 4, level: 'Intermediate', source: 'manual', workouts: [
    ['Lower strength', 50, [I('Back squat', 4, '5', '135 lb', '8', '150'), I('Romanian deadlift', 3, '8', '105 lb', '7', '120'), I('Walking lunge', 2, '10', '20 lb', '7', '75', 'Each side'), I('Calf raise', 3, '15', '30 lb', '', '45')]],
    ['Intervals', 40, [I('Rower intervals', 1, '6 × 30 s', '', '8', '0'), I('Tempo run', 1, '20 min', '', '7', '0'), I('Dead bug', 2, '8', 'BW', '', '45', 'Each side')]],
    ['Upper strength', 45, [I('Dumbbell bench press', 3, '8', '35 lb', '8', '120'), I('Pull-up', 3, '5', 'BW', '8', '120'), I('Seated dumbbell press', 3, '10', '20 lb', '7', '90'), I('Face pull', 3, '15', '25 lb', '', '60')]],
    ['Long run + core', 60, [I('Easy run', 1, '45 min', '', '6', '0'), I('Side plank', 3, '30 s', 'BW', '', '30', 'Each side'), I('Pallof press', 3, '10', 'Band', '', '45', 'Each side')]],
  ] },
  { key: 'p5', name: 'Upper/Lower Builder', weeks: 10, days: 4, level: 'Intermediate', source: 'manual', workouts: [
    ['Upper A', 50, [I('Lat pulldown', 3, '10', '80 lb', '8', '90'), I('Incline dumbbell press', 3, '10', '30 lb', '8', '90'), I('Seated cable row', 3, '12', '70 lb', '8', '75'), S(I('Face pull', 3, '15', '25 lb', '', '0'), I('Lateral raise', 3, '15', '10 lb', '8', '60'))]],
    ['Lower A', 50, [I('Goblet squat', 3, '10', '45 lb', '8', '90'), I('Hip thrust', 3, '10', '135 lb', '8', '90'), I('Leg curl', 3, '12', '50 lb', '8', '75'), I('Plank', 3, '40 s', 'BW', '', '45')]],
    ['Upper B', 50, [I('Chest-supported row', 3, '10', '30 lb', '8', '90'), I('Landmine press', 3, '10', '35 lb', '8', '90'), I('Lat pulldown', 3, '12', '70 lb', '8', '75'), I('Band pull-apart', 3, '15', 'Band', '', '45')]],
    ['Lower B', 50, [I('Romanian deadlift', 3, '10', '85 lb', '8', '90'), I('Step-up', 3, '10', '20 lb', '8', '75', 'Each side'), I('Glute bridge', 3, '15', 'BW', '', '60'), I('Pallof press', 3, '10', 'Band', '', '45', 'Each side')]],
  ] },
  { key: 'p6', name: 'Athletic Base', weeks: 8, days: 3, level: 'Intermediate', source: 'assist', workouts: [
    ['Power + strength A', 55, [I('Broad jump', 3, '5', 'BW', '7', '90'), I('Trap bar deadlift', 4, '5', '225 lb', '8', '150'), I('Split squat', 3, '6', '40 lb', '7', '90', 'Each side'), I('Pallof press', 3, '10', 'Band', '', '45', 'Each side')]],
    ['Speed + upper', 50, [I('Sprint intervals', 1, '6 × 30 s', '', '9', '0'), I('Box jump', 3, '5', 'Box', '7', '90'), I('Push-up', 3, '12', 'BW', '7', '60'), I('Chin-up', 3, '6', 'BW', '8', '90')]],
    ['Power + strength B', 55, [I('Countermovement jump', 3, '5', 'BW', '7', '90'), I('Goblet squat', 3, '8', '60 lb', '7', '90'), I('One-arm dumbbell row', 3, '10', '50 lb', '7', '75', 'Each side'), I('Farmer carry', 3, '1', '60 lb', '', '60', '40 m')]],
  ] },
  { key: 'p7', name: 'Vertical Jump Program', weeks: 8, days: 3, level: 'Intermediate', source: 'manual', workouts: [
    ['Jump A', 50, [I('Countermovement jump', 4, '3', 'BW', '8', '120'), I('Trap bar deadlift', 4, '4', '205 lb', '8', '150'), I('Pogo hops', 3, '20', 'BW', '', '60'), I('Calf raise', 3, '12', '40 lb', '', '60')]],
    ['Jump B', 50, [I('Box jump', 4, '3', 'Box', '8', '120'), I('Bulgarian split squat', 3, '6', '30 lb', '8', '90', 'Each side'), I('Single-leg RDL', 3, '8', '30 lb', '7', '75', 'Each side'), I('Plank', 3, '40 s', 'BW', '', '45')]],
    ['Jump C', 45, [I('Broad jump', 3, '4', 'BW', '8', '120'), I('Goblet squat', 3, '6', '60 lb', '7', '90'), I('Hip thrust', 3, '8', '185 lb', '8', '90'), I('Dead bug', 2, '8', 'BW', '', '45', 'Each side')]],
  ] },
];

const PACKAGES = [
  ['k1', 'Coached Online', 15000, 'month', 'Program, weekly check-in, messaging'],
  ['k2', 'Coached Plus', 18000, 'month', 'Adds a monthly video call'],
  ['k3', 'Private 1:1', 22900, 'month', 'Weekly rewrite, unlimited form review'],
  ['k4', 'In-person 8-pack', 32000, 'month', '8 studio sessions per month'],
  ['k5', 'Hybrid 2×/week', 26000, 'month', '2 studio sessions/week + app'],
  ['k6', '14-day trial', 0, 'once', 'Converts to Coached Online'],
  ['k7', 'Single session', 7500, 'once', 'Drop-in, studio or video'],
];

// ---------------------------------------------------------------- clients (from the prototype)
const S0 = { missed14: 0, checkinMiss: 0, msgDrop: 0 };
export const SAMPLE_CLIENTS = [
  { key: 'c1', week: 6, name: 'Mike Torres', email: 'mike.t@example.com', birthYear: 1988, goal: 'Lose 15 lb and keep his strength', goalType: 'Fat loss', targetWeight: 199, program: 'p1', mode: 'Online', plan: 'k2', pay: 'paid', status: 'ACTIVE', startDays: 84, completed: 34, adherence: 75, lastActive: 0,
    sig: { missed14: 1, checkinMiss: 0, msgDrop: 0.1 }, weight: [214.0, 212.6, 211.8, 210.4, 209.9, 208.2, 206.8, 205.4], lift: ['Goblet squat', [35, 40, 40, 45, 50, 50, 55, 55]], waist: [39.5, 37.8], tags: ['Early mornings', 'Desk job'], why: 'Keep up with my kids and stop feeling stiff at my desk.' },
  { key: 'c2', week: 4, name: 'Sarah Kim', email: 'sarah.kim@example.com', birthYear: 1995, goal: 'Deadlift 1.5× bodyweight (210 lb)', goalType: 'Strength', program: 'p2', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 61, completed: 14, adherence: 52, lastActive: 6,
    sig: { missed14: 3, checkinMiss: 1, msgDrop: 0.6 }, weight: [141, 141.4, 140.8, 141.2, 141.6, 141.1, 141.5, 141.3], lift: ['Deadlift', [155, 165, 170, 175, 180, 180, 180, 180]], waist: [28.5, 28.5], tags: ['Nurse · rotating shifts'] },
  { key: 'c3', week: 3, name: 'Marcus Johnson', email: 'marcus.j@example.com', birthYear: 1992, goal: 'Drop 25 lb before his wedding in June', goalType: 'Fat loss', targetWeight: 211, program: 'p1', mode: 'Hybrid', plan: 'k3', pay: 'failed', status: 'ACTIVE', startDays: 24, completed: 6, adherence: 38, lastActive: 11,
    sig: { missed14: 5, checkinMiss: 2, msgDrop: 0.7 }, weight: [236, 235.2, 234.8, 235.6, 235.9, 235.4, 236.1, 236.0], lift: ['Trap bar deadlift', [185, 195, 205, 205, 205, 205, 205, 205]], waist: [42, 41.8], tags: ['Wedding: June 2027'], why: 'I want to feel good in the photos and have energy for the honeymoon.' },
  { key: 'c4', week: 10, name: 'Elena García', email: 'elena.g@example.com', birthYear: 1997, goal: 'Run a sub-25 5K and get stronger', goalType: 'Hybrid', program: 'p4', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 196, completed: 50, adherence: 96, lastActive: 0,
    sig: S0, weight: [138, 137.6, 137.2, 137.4, 136.8, 136.9, 136.4, 136.2], lift: ['Back squat', [125, 130, 135, 140, 140, 145, 150, 155]], waist: [27.5, 26.8], tags: ['Referred 2 clients'] },
  { key: 'c5', week: 1, name: 'Priya Patel', email: 'priya.p@example.com', birthYear: 1999, goal: 'Learn to lift with confidence', goalType: 'Beginner', program: 'p3', mode: 'Online', plan: 'k1', pay: 'paid', status: 'NEW', startDays: 6, completed: 2, adherence: 100, lastActive: 0,
    sig: null, weight: [152, 151.8], lift: ['Goblet squat', [20, 25]], waist: [31, 31], tags: ['Week 1'] },
  { key: 'c6', week: 9, name: 'Tom Becker', email: 'tom.b@example.com', birthYear: 1981, goal: 'Lose 20 lb', goalType: 'Fat loss', targetWeight: 189, program: 'p1', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 112, completed: 31, adherence: 70, lastActive: 1,
    sig: { missed14: 2, checkinMiss: 0, msgDrop: 0.2 }, weight: [209, 206.4, 203.8, 201.9, 201.4, 201.2, 201.6, 201.2], lift: ['Dumbbell bench press', [45, 50, 50, 55, 55, 55, 60, 60]], waist: [41, 39.6], tags: ['Travels for work'] },
  { key: 'c7', week: 5, name: 'Aisha Bello', email: 'aisha.b@example.com', birthYear: 1990, goal: 'Build muscle and fix her posture', goalType: 'Muscle', program: 'p5', mode: 'In person', plan: 'k4', pay: 'paid', status: 'ACTIVE', startDays: 70, completed: 21, adherence: 92, lastActive: 0,
    sig: S0, weight: [148, 148.3, 148.6, 149, 149.2, 149.5, 149.9, 150.1], lift: ['Lat pulldown', [70, 75, 80, 80, 85, 90, 90, 95]], waist: [30, 29.6], tags: ['Tue/Thu 5:30 PM'] },
  { key: 'c8', week: 7, name: 'Chris Nguyen', email: 'chris.n@example.com', birthYear: 1993, goal: 'Squat 315 lb', goalType: 'Strength', program: 'p2', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 98, completed: 30, adherence: 88, lastActive: 0,
    sig: S0, weight: [182, 182.4, 183, 183.2, 183.8, 184, 184.1, 184.5], lift: ['Back squat', [255, 260, 265, 270, 275, 280, 285, 285]], waist: [33, 33.2], tags: ['Powerlifting meet in March'] },
  { key: 'c9', week: 5, name: 'Lauren Mitchell', email: 'lauren.m@example.com', birthYear: 1985, goal: 'Stay consistent while traveling', goalType: 'General fitness', program: 'p3', mode: 'Online', plan: 'k1', pay: 'paused', status: 'PAUSED', startDays: 150, completed: 37, adherence: 0, lastActive: 5,
    sig: null, pausedFor: 8, weight: [162, 161, 160.4, 160.2, 159.8, 160, 160.2, 160.4], lift: ['Romanian deadlift', [65, 75, 80, 85, 85, 95, 95, 95]], waist: [32, 31], tags: ['Paused until Oct 20'] },
  { key: 'c10', week: 2, name: 'Diego Alvarez', email: 'diego.a@example.com', birthYear: 2002, goal: 'Be fast and fit for soccer season', goalType: 'Athletic', program: 'p6', mode: 'Hybrid', plan: 'k5', pay: 'paid', status: 'ACTIVE', startDays: 15, completed: 6, adherence: 90, lastActive: 1,
    sig: S0, weight: [171, 170.6], lift: ['Trap bar deadlift', [225, 245]], waist: [31, 31], tags: ['Mon/Wed 6:30 AM'] },
  { key: 'c11', week: 5, name: 'Hannah Lee', email: 'hannah.l@example.com', birthYear: 1994, goal: 'Lose 10 lb and feel stronger', goalType: 'Fat loss', targetWeight: 148, program: 'p1', mode: 'Online', plan: 'k1', pay: 'due', status: 'ACTIVE', startDays: 42, completed: 17, adherence: 83, lastActive: 1,
    sig: { missed14: 1, checkinMiss: 0, msgDrop: 0.1 }, weight: [158, 157.4, 156.8, 156.2, 155.6, 155.4, 154.8, 154.4], lift: ['Hip thrust', [95, 105, 115, 125, 135, 135, 145, 155]], waist: [30.5, 29.4], tags: [] },
  { key: 'c12', week: 1, name: 'Ben Carter', email: 'ben.c@example.com', birthYear: 1998, goal: 'Build muscle', goalType: 'Muscle', program: 'p3', mode: 'Online', plan: 'k6', pay: 'trial', status: 'NEW', startDays: 5, completed: 3, adherence: 100, lastActive: 1,
    sig: null, weight: [168, 168.4], lift: ['Dumbbell bench press', [40, 45]], waist: [32, 32], tags: ['Trial ends in 9 days', 'From Instagram'] },
  { key: 'c13', week: 6, name: 'Olivia Brooks', email: 'olivia.b@example.com', birthYear: 1991, goal: 'Half marathon and a stronger core', goalType: 'Hybrid', program: 'p4', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 91, completed: 27, adherence: 81, lastActive: 2,
    sig: { missed14: 1, checkinMiss: 1, msgDrop: 0.2 }, weight: [146, 145.8, 145.6, 145.9, 145.2, 145, 145.1, 144.8], lift: ['Romanian deadlift', [85, 95, 95, 105, 105, 115, 115, 120]], waist: [29, 28.6], tags: ['Race: Nov 15'] },
  { key: 'c14', week: 11, name: 'Sam Rivera', email: 'sam.r@example.com', birthYear: 2000, goal: 'Bench press 225 lb', goalType: 'Strength', program: 'p2', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 80, completed: 40, adherence: 89, lastActive: 1,
    sig: S0, weight: [176, 176.8, 177.2, 177.9, 178.4, 178.6, 179.2, 179.5], lift: ['Bench press', [185, 190, 195, 200, 200, 205, 210, 215]], waist: [32, 32.2], tags: ['Program ends soon'] },
  { key: 'c15', week: 6, name: 'Grace Owens', email: 'grace.o@example.com', birthYear: 1972, goal: 'Move without stiffness and lose 15 lb', goalType: 'General fitness', targetWeight: 156, program: 'p3', mode: 'Online', plan: 'k2', pay: 'paid', status: 'ACTIVE', startDays: 44, completed: 13, adherence: 63, lastActive: 4,
    sig: { missed14: 2, checkinMiss: 1, msgDrop: 0.5 }, weight: [171, 170.2, 169.8, 169.6, 169.4, 169.6, 169.3, 169.4], lift: ['Box squat', [0, 10, 15, 20, 20, 25, 25, 25]], waist: [36, 35.5], tags: ['Prefers Sunday check-ins'] },
  { key: 'c16', week: 4, name: 'Jamal Wright', email: 'jamal.w@example.com', birthYear: 2004, goal: 'Dunk a basketball (+6 in vertical)', goalType: 'Athletic', program: 'p7', mode: 'Online', plan: 'k1', pay: 'paid', status: 'ACTIVE', startDays: 27, completed: 11, adherence: 94, lastActive: 0,
    sig: S0, weight: [184, 183.6, 183.4, 183.2], lift: ['Trap bar deadlift', [185, 195, 200, 205]], waist: [31, 31], tags: ['Vertical: 24 → 26 in'] },
  { key: 'c17', week: 8, name: 'Nora Fitzgerald', email: 'nora.f@example.com', birthYear: 1987, goal: 'Lose 12 lb', goalType: 'Fat loss', program: 'p1', mode: 'Online', plan: 'k1', pay: 'cancelled', status: 'INACTIVE', startDays: 201, completed: 42, adherence: 0, lastActive: 28,
    sig: null, stoppedFor: 31, weight: [168, 166, 164.2, 162.8, 161.4, 160.8, 160.2, 160], lift: ['Goblet squat', [30, 35, 40, 45, 45, 50, 50, 50]], waist: [33, 31], tags: ['Cancelled: moving'] },
  { key: 'c18', week: 2, name: 'Kevin Shah', email: 'kevin.s@example.com', birthYear: 1984, goal: 'Lose 30 lb', goalType: 'Fat loss', targetWeight: 218, program: 'p1', mode: 'Online', plan: 'k1', pay: 'failed', status: 'ACTIVE', startDays: 14, completed: 4, adherence: 67, lastActive: 3,
    sig: { missed14: 2, checkinMiss: 1, msgDrop: 0.3 }, weight: [248, 246.4], lift: ['Goblet squat', [25, 30]], waist: [45, 44.6], tags: ['Referred by Mike'] },
];

// This week's check-ins (prototype). submitted = days ago.
const CHECKINS = {
  c1: { submitted: 0, status: 'submitted', weight: 205.4, sleep: 6.4, energy: 6, stress: 6, soreness: 8, workouts: [3, 4], nutrition: 7, mood: 6, text: 'Good week overall. Legs were really sore after Thursday and stayed sore through the weekend. Work was crazy so sleep wasn’t great. Down another 1.4 lb though!', prev: { sleep: 7.1, soreness: 8, energy: 7 } },
  c8: { submitted: 0, status: 'submitted', weight: 184.5, sleep: 7.5, energy: 7, stress: 4, soreness: 5, workouts: [4, 4], nutrition: 8, mood: 7, text: 'Hit 285 for a clean triple. Left knee has been hurting on the way down in squats since Thursday, sharp-ish pain on the inside. Didn’t want to skip so I pushed through.', prev: { sleep: 7.4, soreness: 5, energy: 7 } },
  c6: { submitted: 2, status: 'submitted', weight: 201.2, sleep: 6.9, energy: 6, stress: 7, soreness: 4, workouts: [3, 4], nutrition: 5, mood: 5, text: 'Scale hasn’t moved in a month and it’s frustrating. Was on the road Tue–Thu, ate out a lot. Still did 3 workouts in hotel gyms.', prev: { sleep: 7, soreness: 4, energy: 6 } },
  c4: { submitted: 1, status: 'reviewed', weight: 136.2, sleep: 8.1, energy: 9, stress: 3, soreness: 4, workouts: [4, 4], nutrition: 9, mood: 9, text: '5K time trial in 25:41! So close.', prev: { sleep: 8, soreness: 4, energy: 8 } },
  c11: { submitted: 1, status: 'reviewed', weight: 154.4, sleep: 7.2, energy: 8, stress: 4, soreness: 5, workouts: [4, 4], nutrition: 7, mood: 8, text: 'Hip thrust PR and jeans fit better.', prev: { sleep: 7, soreness: 5, energy: 7 } },
  c7: { submitted: 2, status: 'reviewed', weight: 150.1, sleep: 7.6, energy: 8, stress: 5, soreness: 4, workouts: [2, 2], nutrition: 8, mood: 8, text: 'Shoulders feel more open.', prev: { sleep: 7.4, soreness: 4, energy: 8 } },
  c10: { submitted: 2, status: 'reviewed', weight: 170.6, sleep: 8, energy: 8, stress: 3, soreness: 6, workouts: [3, 3], nutrition: 7, mood: 8, text: 'Sprints felt quick.', prev: { sleep: 8, soreness: 5, energy: 8 } },
  c14: { submitted: 2, status: 'reviewed', weight: 179.5, sleep: 7.8, energy: 8, stress: 3, soreness: 5, workouts: [4, 4], nutrition: 8, mood: 9, text: '215 moved fast. Ready for 225.', prev: { sleep: 7.7, soreness: 5, energy: 8 } },
  c16: { submitted: 2, status: 'reviewed', weight: 183.2, sleep: 8.2, energy: 9, stress: 2, soreness: 5, workouts: [3, 3], nutrition: 7, mood: 9, text: 'Touched rim twice!!', prev: { sleep: 8, soreness: 5, energy: 8 } },
};
const LAST_CHECKIN = { c2: 12, c3: 16, c13: 9, c15: 9, c18: 8, c9: 9, c17: 33 };

// Message threads: [from, daysAgo, "H:MM", text]
const THREADS = {
  c1: [['them', 6, '6:12', 'Morning! Quick one: can I swap Thursday’s session to Friday this week? Big deadline.'], ['me', 6, '7:40', 'Of course. Just keep a rest day between Friday and Sunday’s session.'], ['them', 0, '7:02', 'Sent my check-in. Legs are still wrecked from Thursday, is that normal?']],
  c8: [['them', 4, '20:30', '285 for 3!! Video in the app.'], ['me', 4, '20:51', 'That was clean. Depth looked great.'], ['them', 0, '6:48', 'Also my left knee has been bugging me on squats, mentioned it in my check-in.']],
  c5: [['me', 6, '10:00', 'Welcome, Priya! Your first week is in the app. Film one set of goblet squats on Day 1 and I’ll send notes.'], ['them', 5, '19:15', 'Done! Uploaded the video. Felt awkward but fun.'], ['me', 5, '20:02', 'Great first set. Two things: sit back a little more and keep your chest proud. Same weight on Day 2.'], ['them', 0, '8:20', 'Day 2 felt WAY better. Is it ok that my glutes are sore?']],
  c2: [['me', 14, '9:00', 'How did the 180 triples feel?'], ['them', 12, '23:41', 'Good! Night shifts this week though.'], ['me', 7, '9:10', 'How are you holding up with the shift change?']],
  c3: [['me', 15, '17:30', 'Nice work today. Same plan Thursday.'], ['them', 12, '21:12', 'Missed today, work ran late again. honestly not sure this is working for me'], ['me', 11, '8:00', 'I hear you. Let’s find a version of this that fits your week. Call Saturday?']],
  c4: [['them', 2, '9:30', '25:41!! 42 seconds off my best.'], ['me', 2, '10:05', 'Huge. Sub-25 is coming this block.']],
  c6: [['them', 2, '18:20', 'Scale still stuck. Starting to get annoyed honestly.']],
  c15: [['me', 10, '10:00', 'How are the hips feeling on the box squats?'], ['them', 9, '16:40', 'Better. Busy week with the grandkids.']],
};
const UNREAD = new Set(['c1', 'c8', 'c5']);
const FILLER = ['Done!', 'Thanks!', 'Felt good today.', 'Logged it.', 'Got it, thanks coach.', 'That one was tough but done.', 'Will do.', 'Sounds good.', 'Finished the session.', 'Quick question answered, thanks!'];

// Payments this month (prototype). daysAgo; negative = due in the future.
const PAYMENTS = [
  ['c3', 22900, 3, 'failed', 'Card declined: insufficient funds', 2], ['c18', 15000, 1, 'failed', 'Card expired', 1], ['c11', 15000, -2, 'upcoming'],
  ['c1', 18000, 6, 'paid'], ['c4', 15000, 6, 'paid'], ['c7', 32000, 6, 'paid'], ['c8', 15000, 5, 'paid'], ['c14', 15000, 5, 'paid'], ['c10', 26000, 5, 'paid'],
  ['c2', 15000, 3, 'paid'], ['c13', 15000, 3, 'paid'], ['c16', 15000, 2, 'paid'], ['c15', 18000, 2, 'paid'], ['c6', 15000, 1, 'paid'], ['c5', 15000, 7, 'paid'],
];

const LEADS = [
  ['Rachel Dunn', 'consult', 'booking_page', 'Lose 20 lb after second baby', 2, 18000], ['Jake Morris', 'new', 'instagram_dm', 'Get stronger for climbing', 0, 15000, 'Hey! How much is your online coaching? I want to get stronger for climbing.'],
  ['Maria Lopez', 'new', 'booking_page', 'First 5K + strength', 1, 15000], ['Tanya Brooks', 'contacted', 'referral', 'Tone up for a trip', 4, 15000], ['Will Chen', 'contacted', 'google', 'Back pain-free lifting', 6, 18000],
  ['Ava Simmons', 'consult', 'instagram_dm', 'Bridesmaid in May', 3, 15000], ['Owen Park', 'trial', 'referral', 'Lose 15 lb', 9, 15000],
];

const NOTIFS = [
  ['checkin', 'Chris Nguyen sent a check-in', 'Mentions knee pain · review first', 0.05, 'c8'], ['message', 'Priya Patel: “Day 2 felt WAY better…”', 'New message', 0.04, 'c5'],
  ['checkin', 'Mike Torres sent a check-in', 'Soreness 8/10 · sleep down', 0.1, 'c1'], ['lead', 'New lead: Maria Lopez', 'Booked via your booking page', 1, null],
  ['client', 'Ben Carter started a 14-day trial', 'From Instagram', 5, 'c12'],
];

// ---------------------------------------------------------------- loader
let TODAY_KEY = null;
/** Current block started (week - 1) weeks before this week's Monday (never before the client started). */
function programStart(s) {
  const start = addDays(weekStart(TODAY_KEY), -7 * ((s.week || 1) - 1));
  const joined = addDays(TODAY_KEY, -s.startDays);
  return start < joined ? weekStart(joined) : start;
}
function parseLoad(load) { const n = parseFloat(String(load)); return isNaN(n) ? 0 : n; }
function at(now, daysAgo, hhmm = '9:00') {
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(now.getTime() - daysAgo * DAY);
  d.setUTCHours(h + 4, m || 0, 0, 0); // stored UTC; the sample coach is on US Eastern time
  return d > now ? new Date(now.getTime() - 60e3 * (5 + daysAgo)) : d;
}

/**
 * @param {*} db tenant-scoped client (dbForBusiness)
 * @param {{ now?: Date, tz?: string, coachUserId?: string, clientUsers?: Record<string,string>, sampleTag?: string|null, withLeads?: boolean }} opts
 */
export async function loadSampleWorkspace(db, { now = new Date(), tz = 'America/New_York', coachUserId = null, clientUsers = {}, sampleTag = null, withLeads = true } = {}) {
  const r = rng(20261006);
  const today = todayKey(tz, now);
  TODAY_KEY = today;
  const exercises = await db.exercise.findMany({ select: { id: true, name: true, pattern: true } });
  const exId = new Map(exercises.map(e => [e.name, e.id]));
  const exPattern = new Map(exercises.map(e => [e.id, e.pattern]));
  const need = n => { const id = exId.get(n); if (!id) throw new Error(`Seed exercise missing: ${n}`); return id; };

  await ensureAutomations(db);

  // packages
  const pkg = {};
  for (const [key, name, priceCents, interval, description] of PACKAGES) {
    pkg[key] = await db.clientPlan.create({ data: { name, priceCents, interval, description, stripePriceId: priceCents ? `price_mock_${key}` : null } });
  }

  // programs + workouts
  const prog = {};
  for (const p of PROGRAMS) {
    const program = await db.program.create({ data: { name: p.name, weeks: p.weeks, daysPerWeek: p.days, level: p.level, source: p.source, description: `${p.weeks}-week ${p.level.toLowerCase()} program, ${p.days} days a week.` } });
    const workouts = [];
    for (let d = 0; d < p.workouts.length; d++) {
      const [name, est, blocks] = p.workouts[d];
      const norm = blocks.map(b => {
        const items = (b.items || [b]).map(it => ({
          id: iid(), exerciseId: need(it.ex), tempo: it.tempo || '', notes: it.notes || '',
          sets: Array.from({ length: it.sets }, (_, i) => ({ reps: it.reps, load: it.load || '', rpe: it.rpeList ? it.rpeList[i] : (it.rpe || ''), rest: it.rest || '75' })),
        }));
        return { id: bid(), kind: items.length > 1 ? (b.kind || 'superset') : 'single', items };
      });
      workouts.push(await db.workout.create({ data: { programId: program.id, name, week: null, day: d + 1, estMinutes: est, blocks: norm } }));
    }
    prog[p.key] = { ...program, workouts };
  }

  // clients
  const cl = {};
  for (const s of SAMPLE_CLIENTS) {
    const startedAt = addDays(today, -s.startDays);
    const tags = sampleTag ? [...s.tags, sampleTag] : s.tags;
    cl[s.key] = await db.client.create({ data: {
      name: s.name, email: sampleTag ? null : s.email, userId: clientUsers[s.key] || null, coachUserId, goal: s.goal, goalType: s.goalType, why: s.why || null, targetWeight: s.targetWeight || null,
      birthYear: s.birthYear, mode: s.mode, status: s.status, clientPlanId: pkg[s.plan].id, payStatus: s.pay, tags, startedAt,
      lastActiveAt: at(now, s.lastActive, '7:30'), programId: prog[s.program].id, programStartedAt: programStart(s),
      pausedUntil: s.status === 'PAUSED' ? addDays(today, 13) : null,
    } });
  }

  // schedule + logged workouts
  const sessionRows = [], assignRows = [];
  for (const s of SAMPLE_CLIENTS) {
    const c = cl[s.key], p = prog[s.program];
    const joined = addDays(today, -s.startDays);
    const startKey = weekStart(joined);
    const blockEnd = addDays(programStart(s), p.weeks * 7);
    const days = trainingWeekdays(p.daysPerWeek);
    const all = [];
    const stopAt = s.stoppedFor != null ? addDays(today, -s.stoppedFor) : s.pausedFor != null ? addDays(today, -s.pausedFor) : null;
    for (let w = 1; addDays(startKey, (w - 1) * 7) < blockEnd; w++) {
      days.forEach((wd, i) => {
        const date = addDays(startKey, (w - 1) * 7 + wd);
        if (date < joined || date >= blockEnd) return;
        if (stopAt && date > stopAt) return;
        all.push({ date, workout: pickWorkout(p.workouts, w, i + 1), week: w });
      });
    }
    const past = all.filter(a => a.date < today);
    const in14 = past.filter(a => a.date >= addDays(today, -14));
    const in28 = past.filter(a => a.date >= addDays(today, -28) && a.date < addDays(today, -14));
    const older = past.filter(a => a.date < addDays(today, -28));
    const done = new Set();
    if (s.sig) {
      const missed = Math.min(s.sig.missed14, in14.length);
      in14.slice(0, in14.length - missed).forEach(a => done.add(a));
      const target28 = Math.round((s.adherence / 100) * (in14.length + in28.length));
      const need28 = Math.max(0, Math.min(in28.length, target28 - (in14.length - missed)));
      in28.slice(0, need28).forEach(a => done.add(a));
    } else {
      past.slice(-s.completed).forEach(a => done.add(a));
    }
    const remaining = Math.max(0, s.completed - done.size);
    older.slice(-remaining).forEach(a => done.add(a));
    // today: completed already for a few early birds
    const todays = all.filter(a => +a.date === +today);

    let doneCount = 0;
    const liftId = exId.get(s.lift[0]);
    const doneList = [...done].sort((a, b) => a.date - b.date);
    for (const a of all) {
      const isDone = done.has(a) || (todays.includes(a) && s.lastActive === 0 && ['c4', 'c7'].includes(s.key));
      const id = randomUUID();
      assignRows.push({ id, clientId: c.id, workoutId: a.workout.id, scheduledFor: a.date, status: isDone ? 'completed' : (a.date < today ? 'scheduled' : 'scheduled') });
      if (!isDone) continue;
      doneCount++;
      const idx = doneList.indexOf(a);
      const progress = doneList.length > 1 ? idx / (doneList.length - 1) : 1;
      const liftVal = s.lift[1][Math.min(s.lift[1].length - 1, Math.round(progress * (s.lift[1].length - 1)))];
      const sets = [];
      for (const b of a.workout.blocks) for (const it of b.items) {
        const base = parseLoad(it.sets[0]?.load);
        const w = it.exerciseId === liftId && liftVal ? liftVal : base ? Math.round(base * (0.85 + 0.15 * progress) / 5) * 5 : 0;
        sets.push({ exerciseId: it.exerciseId, sets: it.sets.map(st => ({ weight: w || '', reps: parseInt(st.reps) || '', done: true })) });
      }
      const volume = sets.reduce((n, e) => n + e.sets.reduce((m, x) => m + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
      const sore = s.key === 'c1' && a.date >= addDays(today, -14) ? 8 : Math.round(3 + r() * 3);
      const completedAt = new Date(a.date.getTime() + (11 + Math.floor(r() * 10)) * 3600e3);
      sessionRows.push({ clientId: c.id, workoutId: a.workout.id, assignmentId: id, startedAt: new Date(completedAt.getTime() - 50 * 60e3), completedAt: completedAt > now ? new Date(now.getTime() - 3600e3) : completedAt, sets, volume, rpe: Math.round(6 + r() * 2), soreness: sore, note: null });
    }
  }
  for (let i = 0; i < assignRows.length; i += 400) await db.workoutAssignment.createMany({ data: assignRows.slice(i, i + 400) });
  for (let i = 0; i < sessionRows.length; i += 200) await db.workoutSession.createMany({ data: sessionRows.slice(i, i + 200) });

  // check-ins + weights + measurements
  for (const s of SAMPLE_CLIENTS) {
    const c = cl[s.key];
    const cur = CHECKINS[s.key];
    const latestAgo = cur ? cur.submitted : LAST_CHECKIN[s.key] ?? (s.startDays >= 7 ? 2 : null);
    const ciRows = [], mRows = [];
    if (latestAgo != null) {
      const n = Math.min(s.weight.length, Math.floor((s.startDays - latestAgo) / 7) + 1);
      for (let i = 0; i < n; i++) {
        const ago = latestAgo + i * 7;
        const wt = s.weight[s.weight.length - 1 - i];
        const isCur = i === 0 && cur;
        const prevVals = i === 1 && cur ? cur.prev : null;
        const sub = at(now, ago, '18:30');
        const text = isCur ? cur.text : (i === 1 && cur ? 'Solid week, nothing major to report.' : ['Good week.', 'Felt strong.', 'Busy but got it done.', 'Steady week.', 'Sleep was better this week.'][Math.floor(r() * 5)]);
        ciRows.push({
          clientId: c.id, weekOf: weekStart(todayKey(tz, sub)), weight: wt ?? null,
          sleepHours: isCur ? cur.sleep : prevVals ? prevVals.sleep : Math.round((6.4 + r() * 1.6) * 10) / 10,
          energy: isCur ? cur.energy : prevVals ? prevVals.energy : Math.round(5 + r() * 4),
          stress: isCur ? cur.stress : Math.round(3 + r() * 4), soreness: isCur ? cur.soreness : prevVals ? prevVals.soreness : Math.round(3 + r() * 4),
          nutrition: isCur ? cur.nutrition : Math.round(6 + r() * 3), mood: isCur ? cur.mood : Math.round(6 + r() * 3),
          workoutsDone: isCur ? cur.workouts[0] : Math.round(prog[s.program].daysPerWeek * (0.7 + r() * 0.3)), workoutsPlanned: isCur ? cur.workouts[1] : prog[s.program].daysPerWeek,
          text, status: isCur ? cur.status : 'reviewed', flagged: isCur ? /pain|hurt/i.test(cur.text) : false, submittedAt: sub, reviewedAt: isCur && cur.status === 'submitted' ? null : sub,
        });
      }
    }
    // weight series (weekly), anchored to the latest check-in (or today)
    const anchor = latestAgo ?? 0;
    s.weight.forEach((wt, i) => {
      const ago = anchor + (s.weight.length - 1 - i) * 7;
      if (ago > s.startDays + 3) return;
      mRows.push({ clientId: c.id, takenAt: at(now, ago, '7:00'), weight: wt, waist: i === 0 ? s.waist[0] : i === s.weight.length - 1 ? s.waist[1] : null, hips: i === 0 ? s.waist[0] + 3.5 : i === s.weight.length - 1 ? Math.round((s.waist[1] + 2.9) * 10) / 10 : null, source: 'client' });
    });
    if (ciRows.length) await db.checkIn.createMany({ data: ciRows });
    if (mRows.length) await db.measurement.createMany({ data: mRows });
  }

  // messages
  for (const s of SAMPLE_CLIENTS) {
    const c = cl[s.key];
    const thread = await db.thread.create({ data: { clientId: c.id } });
    const rows = [];
    const proto = THREADS[s.key] || [];
    if (s.status === 'ACTIVE' || s.status === 'NEW' || s.status === 'PAUSED') {
      // baseline: about 4 client messages per two weeks, 2–8 weeks ago
      const weeks = Math.min(8, Math.floor(s.startDays / 7));
      for (let wk = 2; wk < weeks; wk++) for (let j = 0; j < 2; j++) rows.push({ senderRole: 'CLIENT', body: FILLER[Math.floor(r() * FILLER.length)], createdAt: at(now, wk * 7 + 1 + j * 3, '19:10') });
      // recent: fewer if the prototype says messaging dropped
      if (s.sig && s.startDays >= 21) {
        const recentProto = proto.filter(m => m[0] === 'them' && m[1] < 14).length;
        const target = Math.round(4 * (1 - (s.sig.msgDrop || 0)));
        for (let j = recentProto; j < target; j++) rows.push({ senderRole: 'CLIENT', body: FILLER[Math.floor(r() * FILLER.length)], createdAt: at(now, 3 + j * 3, '19:40') });
      }
    }
    for (const [from, ago, hhmm, text] of proto) rows.push({ senderRole: from === 'them' ? 'CLIENT' : 'COACH', senderUserId: from === 'me' ? coachUserId : (clientUsers[s.key] || null), body: text, createdAt: at(now, ago, hhmm) });
    rows.sort((a, b) => a.createdAt - b.createdAt);
    if (rows.length) {
      await db.message.createMany({ data: rows.map(m => ({ threadId: thread.id, clientId: c.id, senderUserId: m.senderUserId || (m.senderRole === 'COACH' ? coachUserId : clientUsers[s.key] || null), senderRole: m.senderRole, body: m.body, createdAt: m.createdAt, readAt: UNREAD.has(s.key) && m === rows.at(-1) ? null : m.createdAt })) });
      await db.thread.update({ where: { id: thread.id }, data: { lastMessageAt: rows.at(-1).createdAt, coachUnread: UNREAD.has(s.key) ? 1 : 0 } });
    }
  }

  // subscriptions + payments
  for (const s of SAMPLE_CLIENTS) {
    const c = cl[s.key], plan = pkg[s.plan];
    if (!plan.priceCents && s.pay !== 'trial') continue;
    const status = s.pay === 'failed' ? 'past_due' : s.pay === 'trial' ? 'trialing' : s.pay === 'cancelled' ? 'canceled' : s.pay === 'paused' ? 'paused' : 'active';
    await db.subscription.create({ data: { clientId: c.id, clientPlanId: plan.id, status, stripeSubscriptionId: sampleTag ? null : `sub_mock_${s.key}_${Date.now().toString(36)}`, currentPeriodEnd: addDays(today, 24) } });
    // earlier months, paid
    for (let m = 1; m <= Math.min(2, Math.floor(s.startDays / 30)); m++) {
      if (!plan.priceCents) continue;
      await db.payment.create({ data: { clientId: c.id, clientPlanId: plan.id, amountCents: plan.priceCents, status: 'paid', paidAt: at(now, 6 + 30 * m, '10:00'), createdAt: at(now, 6 + 30 * m, '10:00') } });
    }
  }
  for (const [key, amount, ago, status, reason, attempts] of PAYMENTS) {
    const c = cl[key];
    await db.payment.create({ data: { clientId: c.id, clientPlanId: c.clientPlanId, amountCents: amount, status, failureReason: reason || null, attempts: attempts || 1, paidAt: status === 'paid' ? at(now, ago, '10:00') : null, dueAt: status === 'upcoming' ? addDays(today, -ago) : null, createdAt: ago >= 0 ? at(now, ago, '10:00') : now, remindedAt: key === 'c18' ? at(now, ago, '10:05') : null } });
  }

  // leads (Pro feature)
  if (withLeads) {
    for (const [name, stage, source, goal, ago, valueCents, firstMessage] of LEADS) {
      await db.lead.create({ data: { name, stage, source, goal, valueCents, firstMessage: firstMessage || null, createdAt: at(now, ago, '12:00'), lastContactAt: stage === 'contacted' ? at(now, ago, '13:00') : null, nextFollowUpAt: stage === 'contacted' ? at(now, ago - 3, '13:00') : null } });
    }
  }

  // notes for Mike
  if (coachUserId) {
    await db.note.createMany({ data: [
      { clientId: cl.c1.id, authorUserId: coachUserId, body: 'Prefers 6 AM sessions. Kids’ soccer on Saturdays, so Sunday sessions only if needed.', createdAt: at(now, 25) },
      { clientId: cl.c1.id, authorUserId: coachUserId, body: 'Onboarding call: no injuries reported. Has a home rack and dumbbells to 50 lb.', createdAt: at(now, 84) },
    ] });
  }

  // notifications
  for (const [kind, title, body, ago, key] of NOTIFS) {
    await db.notification.create({ data: { kind, title, body, link: key ? `/app/clients/${cl[key].id}` : '/app/leads', createdAt: at(now, ago, '8:00'), readAt: ago >= 1 ? at(now, ago, '9:00') : null } });
  }

  // Assist history for Mike (shown on his "Assist insights" tab)
  const hist = [
    ['message_draft', 'edited', 6, 'Reply about moving Thursday’s session. You shortened it.', 4],
    ['adjustment', 'approved', 14, 'Goblet squat 50 → 55 lb after two sessions at RPE ≤ 7.', 12],
    ['risk', 'expired', 21, 'Score 22 (low). No outreach needed.', 0],
    ['message_draft', 'dismissed', 27, 'Motivational note. You wrote your own instead.', 0],
  ];
  for (const [kind, status, ago, summary, mins] of hist) {
    await db.aIInsight.create({ data: { clientId: cl.c1.id, kind, source: 'history', summary, draft: { text: summary }, status, minutesSaved: mins, model: 'mock-assist-1', promptVersion: 'v1.0', createdAt: at(now, ago), decidedAt: status === 'expired' ? null : at(now, ago, '10:00'), decidedBy: coachUserId } });
  }

  // a few past automation runs ("Recent runs")
  const autos = Object.fromEntries((await db.automation.findMany()).map(a => [a.key, a]));
  const bizId = autos.missed_workouts.businessId;
  const runs = [
    ['missing_checkin', 2, 'sent', 'Check-in reminder sent to 5 clients'],
    ['failed_payment', 1, 'sent', 'Payment failed: notified you, reminder sent to Kevin'],
    ['inactive_7d', 4, 'notified', 'Nora hasn’t opened the app for 7 days: notified you'],
  ];
  for (const [key, ago, outcome, summary] of runs) {
    await db.automationRun.create({ data: { automationId: autos[key].id, dedupeKey: `${bizId}:seed:${key}:${randomUUID().slice(0, 8)}`, outcome, summary, createdAt: at(now, ago, '9:00') } });
  }
  // Kevin's failed payment was already reminded by the automation
  const kevinPay = await db.payment.findFirst({ where: { clientId: cl.c18.id, status: 'failed' } });
  if (kevinPay) await db.automationRun.create({ data: { automationId: autos.failed_payment.id, clientId: cl.c18.id, dedupeKey: `${bizId}:payment:${kevinPay.id}`, outcome: 'sent', summary: 'Card-update reminder sent to Kevin', createdAt: at(now, 1, '10:05') } });

  return { clients: cl, programs: prog, packages: pkg };
}

/** Removes sample clients (tagged) and everything that belongs to them. */
export async function removeSampleClients(db, tag = 'Sample') {
  const all = await db.client.findMany({ select: { id: true, tags: true } });
  const ids = all.filter(c => Array.isArray(c.tags) && c.tags.includes(tag)).map(c => c.id);
  if (!ids.length) return 0;
  const { deleteClientData } = await import('../core/clientData.js');
  for (const id of ids) await deleteClientData(db, id);
  return ids.length;
}
