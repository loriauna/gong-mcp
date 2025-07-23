export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface Session {
  id: string;
  clientId: string;
  createdAt: Date;
  lastActivity: Date;
  childProcess?: any;
  isActive: boolean;
}

export interface GatewayOptions {
  port: number;
  cors?: boolean;
  healthEndpoint?: string;
  command: string;
  args?: string[];
  logger?: Logger;
}

export interface MCPMessage {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}