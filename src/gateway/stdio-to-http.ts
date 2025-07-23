import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { ChildProcess } from 'child_process';
import { SessionManager } from '../utils/session-manager.js';
import { GatewayOptions, MCPMessage, Logger } from '../types/index.js';
import { defaultLogger } from '../utils/logger.js';

export class StdioToHttpGateway {
  private app: Express;
  private sessionManager: SessionManager;
  private options: GatewayOptions;
  private logger: Logger;

  constructor(options: GatewayOptions) {
    this.options = options;
    this.logger = options.logger || defaultLogger;
    this.app = express();
    this.sessionManager = new SessionManager(this.logger);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    if (this.options.cors) {
      this.app.use(cors());
    }
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get(this.options.healthEndpoint || '/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'Gong MCP Gateway',
        sessions: this.sessionManager.getAllSessions().length,
        timestamp: new Date().toISOString()
      });
    });

    // Create session endpoint
    this.app.post('/session', (req: Request, res: Response) => {
      const clientId = req.body.clientId || 'anonymous';
      const session = this.sessionManager.createSession(clientId);
      
      // Start MCP process for this session
      const childProcess = this.sessionManager.startMCPProcess(
        session.id,
        this.options.command,
        this.options.args
      );

      if (!childProcess) {
        return res.status(500).json({ error: 'Failed to start MCP process' });
      }

      res.json({
        sessionId: session.id,
        status: 'created'
      });
    });

    // Send message to MCP server
    this.app.post('/session/:sessionId/message', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const message: MCPMessage = req.body;

      const session = this.sessionManager.getSession(sessionId);
      if (!session || !session.childProcess) {
        return res.status(404).json({ error: 'Session not found or inactive' });
      }

      try {
        const response = await this.sendMessageToMCP(session.childProcess, message);
        this.sessionManager.updateActivity(sessionId);
        res.json(response);
      } catch (error) {
        this.logger.error(`Error sending message to MCP for session ${sessionId}:`, error);
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // List calls endpoint (convenience wrapper)
    this.app.post('/api/list-calls', async (req: Request, res: Response) => {
      try {
        const { fromDateTime, toDateTime } = req.body;
        const response = await this.callMCPTool('list_calls', { fromDateTime, toDateTime });
        res.json(response);
      } catch (error) {
        this.logger.error('Error listing calls:', error);
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Retrieve transcripts endpoint (convenience wrapper)
    this.app.post('/api/retrieve-transcripts', async (req: Request, res: Response) => {
      try {
        const { callIds } = req.body;
        if (!callIds || !Array.isArray(callIds)) {
          return res.status(400).json({ error: 'callIds array is required' });
        }
        const response = await this.callMCPTool('retrieve_transcripts', { callIds });
        res.json(response);
      } catch (error) {
        this.logger.error('Error retrieving transcripts:', error);
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Destroy session endpoint
    this.app.delete('/session/:sessionId', (req: Request, res: Response) => {
      const { sessionId } = req.params;
      this.sessionManager.destroySession(sessionId);
      res.json({ status: 'destroyed' });
    });

    // List sessions endpoint
    this.app.get('/sessions', (req: Request, res: Response) => {
      const sessions = this.sessionManager.getAllSessions().map(session => ({
        id: session.id,
        clientId: session.clientId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isActive: session.isActive
      }));
      res.json({ sessions });
    });
  }

  private sendMessageToMCP(childProcess: ChildProcess, message: MCPMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let response = '';
      let hasResolved = false;

      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          reject(new Error('MCP request timeout'));
        }
      }, 30000);

      const onData = (data: Buffer) => {
        response += data.toString();
        
        // Try to parse JSON response
        const lines = response.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === message.id || (parsed.result && !hasResolved)) {
              hasResolved = true;
              clearTimeout(timeout);
              childProcess.stdout?.off('data', onData);
              resolve(parsed);
              return;
            }
          } catch (e) {
            // Continue parsing
          }
        }
      };

      childProcess.stdout?.on('data', onData);

      // Send message
      try {
        childProcess.stdin?.write(JSON.stringify(message) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    // Create a temporary session for the API call
    const session = this.sessionManager.createSession('api-call');
    const childProcess = this.sessionManager.startMCPProcess(
      session.id,
      this.options.command,
      this.options.args
    );

    if (!childProcess) {
      throw new Error('Failed to start MCP process');
    }

    try {
      // Initialize MCP connection
      const initMessage: MCPMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "gong-gateway", version: "0.1.0" }
        },
        id: 1
      };

      await this.sendMessageToMCP(childProcess, initMessage);

      // Call the tool
      const toolCallMessage: MCPMessage = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        },
        id: 2
      };

      const result = await this.sendMessageToMCP(childProcess, toolCallMessage);
      return result;
    } finally {
      // Clean up the temporary session
      this.sessionManager.destroySession(session.id);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.options.port, () => {
        this.logger.info(`Gong MCP Gateway running on port ${this.options.port}`);
        resolve();
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        this.logger.info('SIGTERM received, shutting down gracefully');
        this.sessionManager.cleanup();
        server.close(() => {
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        this.logger.info('SIGINT received, shutting down gracefully');
        this.sessionManager.cleanup();
        server.close(() => {
          process.exit(0);
        });
      });
    });
  }
}