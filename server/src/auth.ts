/**
 * Authentication Module
 * 
 * Provides JWT-based authentication for web interface.
 * In production, integrate with your identity provider.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'cmux-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 10;

interface TokenPayload {
  userId: string;
  sessionId: string;
}

interface User {
  id: string;
  username: string;
  passwordHash: string;
}

// In-memory user store (replace with database in production)
const users = new Map<string, User>();

// Create default user for development
if (process.env.NODE_ENV === 'development') {
  const defaultPasswordHash = bcrypt.hashSync('admin', BCRYPT_ROUNDS);
  users.set('admin', {
    id: 'admin',
    username: 'admin',
    passwordHash: defaultPasswordHash,
  });
}

export function generateToken(userId: string): string {
  const payload: TokenPayload = {
    userId,
    sessionId: `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  
  try {
    const payload = verifyToken(token);
    (req as any).userId = payload.userId;
    (req as any).sessionId = payload.sessionId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function createAuthRouter(): Router {
  const router = Router();

  // Register new user
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      if (users.has(username)) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user: User = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        username,
        passwordHash,
      };

      users.set(username, user);

      const token = generateToken(user.id);
      res.json({ token, userId: user.id, username: user.username });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      const user = users.get(username);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = generateToken(user.id);
      res.json({ token, userId: user.id, username: user.username });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Verify token (useful for checking if session is still valid)
  router.get('/verify', authMiddleware, (req: Request, res: Response) => {
    res.json({
      valid: true,
      userId: (req as any).userId,
      sessionId: (req as any).sessionId,
    });
  });

  return router;
}
