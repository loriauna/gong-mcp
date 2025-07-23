import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { Session, Logger } from '../types/index.js';
import { defaultLogger } from './logger.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.logger = logger;
  }

  createSession(clientId: string): Session {
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      clientId,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    this.sessions.set(sessionId, session);
    this.logger.info(`Created session ${sessionId} for client ${clientId}`);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.childProcess) {
        try {
          session.childProcess.kill();
        } catch (error) {
          this.logger.error(`Error killing child process for session ${sessionId}:`, error);
        }
      }
      session.isActive = false;
      this.sessions.delete(sessionId);
      this.logger.info(`Destroyed session ${sessionId}`);
    }
  }

  startMCPProcess(sessionId: string, command: string, args: string[] = []): ChildProcess | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error(`Session ${sessionId} not found`);
      return null;
    }

    try {
      const childProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });

      session.childProcess = childProcess;
      this.logger.info(`Started MCP process for session ${sessionId}`);
      return childProcess;
    } catch (error) {
      this.logger.error(`Failed to start MCP process for session ${sessionId}:`, error);
      return null;
    }
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  cleanup(): void {
    for (const [sessionId] of this.sessions) {
      this.destroySession(sessionId);
    }
    this.logger.info('All sessions cleaned up');
  }
}