// /api/auth/*  : register, login, logout, who am I

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { clearAuthCookie, currentUserId, requireAuth, setAuthCookie } from '../middleware/auth';

const router = Router();

// Slows down password guessing: max 20 register/login attempts per 15 minutes per IP address
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  // bcrypt only uses the first 72 bytes of a password, so we cap it there
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Only send back fields that are safe to show. NEVER send passwordHash.
function publicUser(user: { id: number; name: string; email: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists. Try logging in.');

  // The 12 is the "cost": higher is slower to crack, but also slower to log in
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });

  setAuthCookie(res, user.id);
  res.status(201).json({ data: { user: publicUser(user) } });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for "no such email" and "wrong password", so attackers cannot tell which emails exist
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordMatches) throw new AppError(401, 'Incorrect email or password.');

  setAuthCookie(res, user.id);
  res.json({ data: { user: publicUser(user) } });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ data: { message: 'Logged out.' } });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (!user) {
    clearAuthCookie(res);
    throw new AppError(401, 'Your account no longer exists. Please register again.');
  }
  res.json({ data: { user: publicUser(user) } });
});

export default router;
