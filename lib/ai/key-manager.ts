import type { AIProvider, AIProviderName } from "./provider";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenRouterProvider } from "./providers/openrouter";
import { encrypt, decrypt } from "@/lib/utils/encryption";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";

interface CreateAIProviderOptions {
  openRouterModel?: string;
}

export function createAIProvider(
  provider: AIProviderName,
  apiKey: string,
  options?: CreateAIProviderOptions
): AIProvider | null {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(apiKey);
    case "groq":
      return new GroqProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
    case "anthropic":
      return new AnthropicProvider(apiKey);
    case "openrouter":
      return new OpenRouterProvider(apiKey, options?.openRouterModel);
    default:
      return null;
  }
}

export async function saveApiKey(userId: string, provider: AIProviderName, apiKey: string) {
  await connectDB();
  const encryptedKey = encrypt(apiKey);
  const ai = createAIProvider(provider, apiKey);

  if (!ai) {
    return { isValid: false, error: `${provider} provider is not yet supported` };
  }

  const isValid = await ai.validateKey();

  await User.updateOne(
    { _id: userId },
    {
      $pull: { aiApiKeys: { provider } },
    }
  );

  await User.updateOne(
    { _id: userId },
    {
      $push: { aiApiKeys: { provider, encryptedKey, isValid } },
    }
  );

  return { isValid };
}

export async function removeApiKey(userId: string, provider: AIProviderName) {
  await connectDB();
  await User.updateOne({ _id: userId }, { $pull: { aiApiKeys: { provider } } });
}

export async function revalidateApiKey(userId: string, provider: AIProviderName) {
  await connectDB();
  const user = await User.findById(userId).lean();
  const keyEntry = user?.aiApiKeys?.find((k) => k.provider === provider);
  if (!keyEntry) return { error: "Key not found" };

  const apiKey = decrypt(keyEntry.encryptedKey);
  const ai = createAIProvider(provider, apiKey);
  if (!ai) return { error: "Provider not supported" };

  const isValid = await ai.validateKey();
  await User.updateOne(
    { _id: userId, "aiApiKeys.provider": provider },
    { $set: { "aiApiKeys.$.isValid": isValid } }
  );
  return { isValid };
}

export async function getUserAIProvider(userId: string): Promise<AIProvider | null> {
  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user?.aiApiKeys?.length) return null;

  // Respect user's preferred provider if set
  const preferred = (user as unknown as { preferredAIProvider?: string }).preferredAIProvider;
  const preferredOpenRouterModel = (user as unknown as { preferredOpenRouterModel?: string })
    .preferredOpenRouterModel;
  let keyEntry = preferred
    ? user.aiApiKeys.find((k) => k.provider === preferred && k.isValid)
    : null;

  // Fallback to any valid key
  if (!keyEntry) {
    keyEntry = user.aiApiKeys.find((k) => k.isValid) ?? null;
  }
  if (!keyEntry) return null;

  const decryptedKey = decrypt(keyEntry.encryptedKey);
  const provider = createAIProvider(keyEntry.provider as AIProviderName, decryptedKey, {
    openRouterModel: preferredOpenRouterModel,
  });
  return provider;
}

export async function getUserApiKeys(userId: string) {
  await connectDB();
  const user = await User.findById(userId).lean();
  return (user?.aiApiKeys ?? []).map((k) => {
    const decrypted = decrypt(k.encryptedKey);
    return {
      provider: k.provider,
      isValid: k.isValid,
      maskedKey: decrypted.slice(0, 6) + "••••" + decrypted.slice(-4),
    };
  });
}
