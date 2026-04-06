/**
 * Agent configuration — reads from environment variables with sensible defaults.
 * Centralizes all external dependency settings (Ollama, backend API).
 */

export const AGENT_CONFIG = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:latest',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  appName: 'store-admin',
} as const;
