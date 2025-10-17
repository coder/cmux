/**
 * Session Manager
 * 
 * Manages user sessions and workspace isolation.
 */

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Cleanup expired sessions every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  public createSession(userId: string): Session {
    const session: Session = {
      id: `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  public getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  public deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        this.sessions.delete(id);
        console.log(`Cleaned up expired session: ${id}`);
      }
    }
  }
}
