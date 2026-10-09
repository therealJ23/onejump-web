// Export and delete everything that belongs to one client (privacy requests).
import { StorageService } from '../storage/StorageService.js';

const CLIENT_TABLES = ['workoutAssignment', 'workoutSession', 'checkIn', 'measurement', 'note', 'invite', 'payment', 'subscription', 'clientEvent', 'aIInsight',
  'nutritionPlan', 'habit', 'habitCheck', 'foodEntryItem', 'foodEntry', 'foodFavorite', 'nutritionFlag'];

export async function exportClientData(db, clientId) {
  const client = await db.client.findFirst({ where: { id: clientId } });
  if (!client) return null;
  const out = { exportedAt: new Date().toISOString(), client };
  for (const t of CLIENT_TABLES) out[t] = await db[t].findMany({ where: { clientId } });
  out.messages = (await db.message.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } })).map(({ audioKey, ...m }) => ({ ...m, voiceNote: !!audioKey }));
  out.foodEntry = out.foodEntry.map(({ photoKey, ...e }) => ({ ...e, photo: !!photoKey }));
  out.progressPhotos = (await db.progressPhoto.findMany({ where: { clientId } })).map(p => ({ id: p.id, pose: p.pose, takenAt: p.takenAt }));
  delete out.invite; // tokens are secrets
  return out;
}

export async function deleteClientData(db, clientId) {
  const photos = await db.progressPhoto.findMany({ where: { clientId }, select: { storageKey: true } });
  for (const p of photos) await StorageService.remove(p.storageKey).catch(() => null);
  const files = [
    ...(await db.foodEntry.findMany({ where: { clientId, photoKey: { not: null } }, select: { photoKey: true } })).map(e => e.photoKey),
    ...(await db.message.findMany({ where: { clientId, audioKey: { not: null } }, select: { audioKey: true } })).map(m => m.audioKey),
    ...(await db.aIInsight.findMany({ where: { clientId, kind: 'meal_photo' }, select: { draft: true } })).map(i => i.draft?.photoKey).filter(Boolean),
  ];
  for (const k of new Set(files)) await StorageService.remove(k).catch(() => null);
  await db.progressPhoto.deleteMany({ where: { clientId } });
  await db.message.deleteMany({ where: { clientId } });
  await db.thread.deleteMany({ where: { clientId } });
  for (const t of CLIENT_TABLES) await db[t].deleteMany({ where: { clientId } });
  await db.workout.deleteMany({ where: { clientId } });
  await db.automationRun.deleteMany({ where: { clientId } });
  await db.client.delete({ where: { id: clientId } });
  return true;
}
