// One place that turns every error into a consistent JSON response:
//
//   success: { "data": ... }
//   failure: { "error": { "message": "Readable text", "details": ... } }

import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { message: 'That API endpoint does not exist.' } });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Input validation failed (zod)
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first.path.join('.');
    const message = first.message === 'Required' && field ? `${field} is required` : first.message;
    res.status(400).json({ error: { message, details: error.flatten().fieldErrors } });
    return;
  }

  // An error we threw on purpose (wrong password, not found, upstream service down ...)
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { message: error.message, details: error.details } });
    return;
  }

  // Database errors we can explain
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: { message: 'That already exists.' } });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { message: 'We could not find that.' } });
      return;
    }
  }

  // Invalid JSON in the request body (thrown by express.json)
  if (typeof error === 'object' && error !== null && (error as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'The request body is not valid JSON.' } });
    return;
  }

  // Anything else is a bug. Log it for us, show a generic message to the user.
  console.error('Unexpected error:', error);
  res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.' } });
}
