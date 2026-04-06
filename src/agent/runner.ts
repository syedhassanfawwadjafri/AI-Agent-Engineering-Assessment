/**
 * Agent runner — manages session lifecycle and message processing.
 * Wraps the ADK InMemoryRunner with a simple session map keyed by
 * client-provided session IDs.
 */

import { createAgent } from './index';
import { AGENT_CONFIG } from './config';
import { importModule } from './shared/helpers';

let runner: any = null;
const sessions = new Map<string, string>();

async function getRunner() {
  if (runner) return runner;

  const { InMemoryRunner } = await importModule('@google/adk');
  const agent = await createAgent();

  runner = new InMemoryRunner({ agent, appName: AGENT_CONFIG.appName });
  return runner;
}

export async function processMessage(
  sessionId: string,
  message: string
): Promise<string> {
  const activeRunner = await getRunner();

  let adkSessionId = sessions.get(sessionId);
  if (!adkSessionId) {
    const session = await activeRunner.sessionService.createSession({
      appName: AGENT_CONFIG.appName,
      userId: 'admin',
    });
    adkSessionId = session.id as string;
    sessions.set(sessionId, adkSessionId);
  }

  const events = activeRunner.runAsync({
    userId: 'admin',
    sessionId: adkSessionId!,
    newMessage: { role: 'user', parts: [{ text: message }] },
  });

  let responseText = '';
  for await (const event of events) {
    const parts = event?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.text) {
        responseText += part.text;
      }
    }
  }

  return responseText || 'I was unable to process your request. Please try again.';
}
