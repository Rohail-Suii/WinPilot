export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface AIProvider {
  name: string;
  generateText(messages: AIMessage[], options?: AIGenerateOptions): Promise<string>;
  generateJSON<T>(messages: AIMessage[], options?: AIGenerateOptions): Promise<T>;
  validateKey(): Promise<boolean>;
}

export type AIProviderName = "gemini" | "openai" | "anthropic" | "groq" | "openrouter";
