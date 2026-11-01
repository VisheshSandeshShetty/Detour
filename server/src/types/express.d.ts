// Tells TypeScript that our auth middleware adds `userId` to the Express request.

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export {};
