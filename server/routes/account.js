// The logged-in person's own account, for coaches and clients alike: profile photo.
import { Router } from 'express';
import multer from 'multer';
import { audit } from '../db/system.js';
import { badRequest } from '../lib/errors.js';
import { AVATAR_MAX_BYTES, saveAvatar, removeAvatar } from '../core/avatars.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 4, fieldSize: 1024 } });

router.post('/photo', upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a photo.');
  const photoUrl = await saveAvatar(req.auth.userId, req.file.buffer);
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'profile_photo_changed', target: req.auth.userId, ip: req.ip });
  res.status(201).json({ ok: true, photoUrl });
});

router.delete('/photo', async (req, res) => {
  await removeAvatar(req.auth.userId);
  audit({ businessId: req.auth.businessId, actorUserId: req.auth.userId, action: 'profile_photo_removed', target: req.auth.userId, ip: req.ip });
  res.json({ ok: true, photoUrl: null });
});
