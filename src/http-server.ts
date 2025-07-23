import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GONG_API_URL = 'https://api.gong.io/v2';
const GONG_ACCESS_KEY = process.env.GONG_ACCESS_KEY;
const GONG_ACCESS_SECRET = process.env.GONG_ACCESS_SECRET;

if (!GONG_ACCESS_KEY || !GONG_ACCESS_SECRET) {
  console.error("Error: GONG_ACCESS_KEY and GONG_ACCESS_SECRET environment variables are required");
  process.exit(1);
}

// Gong API Client
class GongClient {
  private accessKey: string;
  private accessSecret: string;

  constructor(accessKey: string, accessSecret: string) {
    this.accessKey = accessKey;
    this.accessSecret = accessSecret;
  }

  private async request<T>(method: string, path: string, params?: any, data?: any): Promise<T> {
    const timestamp = new Date().toISOString();
    const url = `${GONG_API_URL}${path}`;
    
    const response = await axios({
      method,
      url,
      params,
      data,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.accessKey}:${this.accessSecret}`).toString('base64')}`
      }
    });

    return response.data as T;
  }

  async listCalls(fromDateTime?: string, toDateTime?: string) {
    const params: any = {};
    if (fromDateTime) params.fromDateTime = fromDateTime;
    if (toDateTime) params.toDateTime = toDateTime;

    return this.request('GET', '/calls', params);
  }

  async retrieveTranscripts(callIds: string[]) {
    return this.request('POST', '/calls/transcript', undefined, {
      filter: {
        callIds
      }
    });
  }
}

const gongClient = new GongClient(GONG_ACCESS_KEY!, GONG_ACCESS_SECRET!);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Gong API HTTP Service',
    endpoints: {
      health: 'GET /',
      listCalls: 'POST /api/list-calls',
      retrieveTranscripts: 'POST /api/retrieve-transcripts'
    }
  });
});

// List calls endpoint
app.post('/api/list-calls', async (req, res) => {
  try {
    const { fromDateTime, toDateTime } = req.body;
    const result = await gongClient.listCalls(fromDateTime, toDateTime);
    res.json(result);
  } catch (error: any) {
    console.error('Error listing calls:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data || error.message 
    });
  }
});

// Retrieve transcripts endpoint
app.post('/api/retrieve-transcripts', async (req, res) => {
  try {
    const { callIds } = req.body;
    if (!callIds || !Array.isArray(callIds)) {
      return res.status(400).json({ error: 'callIds array is required' });
    }
    const result = await gongClient.retrieveTranscripts(callIds);
    res.json(result);
  } catch (error: any) {
    console.error('Error retrieving transcripts:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data || error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Gong HTTP API server running on port ${PORT}`);
});