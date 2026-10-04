import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Google Gen AI with server-side API Key
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Gemini Chat Endpoint for the Agent Playground
app.post('/api/gemini/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { systemPrompt, message, history = [], tone, agentRole, variables = {} } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Mensagem é obrigatória.' });
      return;
    }

    // Replace variables in system prompt
    let formattedPrompt = systemPrompt || 'Você é uma assistente virtual prestativa de CRM.';
    Object.entries(variables).forEach(([key, val]) => {
      formattedPrompt = formattedPrompt.replaceAll(`{{${key}}}`, String(val));
    });

    const fullInstruction = `
${formattedPrompt}

[CONFIGURAÇÕES DE ATENDIMENTO]
- Função: ${agentRole || 'Vendedor'}
- Tom de Voz: ${tone || 'Consultivo e Amigável'}
- Idioma: Português do Brasil (pt-BR)
- Diretriz: Seja conciso, humano e focado em qualificar o lead ou agendar demonstração/visita comercial. Nunca invente dados que contradigam as instruções.
`.trim();

    if (!ai) {
      // If no API key is provided, return a realistic contextual fallback response
      res.json({
        reply: `Olá! Recebi sua mensagem: "${message}". [Modo Sandbox: ConectaCRM configurado com o tom ${tone || 'consultivo'} e função ${agentRole || 'Vendedora'}. O lead foi acolhido com sucesso!]`,
        isFallback: true,
        tokensUsed: 42,
        latencyMs: 180,
      });
      return;
    }

    const startTime = Date.now();

    // Map history to format expected by generateContent
    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const turn of history) {
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === 'agent' ? 'model' : 'user',
            parts: [{ text: turn.text }],
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: fullInstruction,
        temperature: 0.7,
      },
    });

    const latencyMs = Date.now() - startTime;
    const replyText = response.text || 'Desculpe, não consegui processar a resposta neste momento.';

    res.json({
      reply: replyText,
      tokensUsed: response.usageMetadata?.totalTokenCount || 65,
      latencyMs,
      isFallback: false,
    });
  } catch (error: any) {
    console.error('Erro na API Gemini:', error);
    res.status(500).json({
      error: 'Falha ao processar com a IA da Gemini.',
      details: error?.message || 'Erro desconhecido',
      reply: 'Olá! No momento estou operando no modo de contingência local. Como posso ajudar com seu agendamento?',
      isFallback: true,
    });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ConectaCRM Server API', timestamp: new Date().toISOString() });
});

// Setup Vite in Dev or Serve Static in Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ConectaCRM Server rodando na porta ${PORT}`);
  });
}

startServer();
