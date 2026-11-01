// Login protection.
//
// How login works in Detour:
//   1. On register/login the server creates a JWT (a signed token containing the user's id)
//   2. It puts the token in an httpOnly cookie. JavaScript in the browser cannot read such a
//      cookie, which protects it from script-injection (XSS) attacks.
//   3. The browser sends the cookie automatically with every request.
//   4. requireAuth (below) checks the signature. If valid, it stores the user id on the request.
//
// The user id ALWAYS comes from the verified token, never from the request body or URL,
// so a user cannot pretend to be someone else.

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../lib/errors';

export const COOKIE_NAME = 'detour_token';
const WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

export function setAuthCookie(res: Response, userId: number): void {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: WEEK_IN_SECONDS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: WEEK_IN_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) throw new AppError(401, 'Please log in to continue.');

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) throw new Error('bad subject');
    req.userId = userId;
  } catch {
    throw new AppError(401, 'Your session has expired. Please log in again.');
  }
  next();
}

// Use inside routes that sit behind requireAuth.
export function currentUserId(req: Request): number {
  if (req.userId === undefined) throw new AppError(401, 'Please log in to continue.');
  return req.userId;
}
