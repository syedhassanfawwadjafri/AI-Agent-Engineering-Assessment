/**
 * Express route handler for the agent chat endpoint.
 * POST /api/agent/chat — accepts { message, sessionId? } and returns agent response.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { processMessage } from './runner';

const router = Router();

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message is required and must be a non-empty string.',
        },
      });
      return;
    }

    const activeSessionId = sessionId || uuidv4();
    const response = await processMessage(activeSessionId, message.trim());

    res.json({
      success: true,
      data: { response, sessionId: activeSessionId },
    });
  } catch (error: any) {
    console.error('Agent chat error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: 'Failed to process your request. Please try again.',
      },
    });
  }
});

export default router;
