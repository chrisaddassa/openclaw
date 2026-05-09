import fs from "node:fs";
import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import { contributeGroqResolvedModelCompat, resolveGroqReasoningCompatPatch } from "./api.js";
import plugin from "./index.js";

type GroqManifest = {
  providerAuthChoices?: Array<{
    provider?: string;
    method?: string;
    choiceId?: string;
    optionKey?: string;
    cliFlag?: string;
  }>;
};

function readManifest(): GroqManifest {
  return JSON.parse(
    fs.readFileSync(new URL("./openclaw.plugin.json", import.meta.url), "utf8"),
  ) as GroqManifest;
}

describe("groq provider compat", () => {
  it("maps Groq Qwen 3 reasoning to provider-native none/default values", () => {
    expect(resolveGroqReasoningCompatPatch("qwen/qwen3-32b")).toEqual({
      supportsReasoningEffort: true,
      supportedReasoningEfforts: ["none", "default"],
      reasoningEffortMap: expect.objectContaining({
        off: "none",
        low: "default",
        medium: "default",
        high: "default",
      }),
    });
  });

  it("keeps GPT-OSS reasoning on the Groq low/medium/high contract", () => {
    expect(resolveGroqReasoningCompatPatch("openai/gpt-oss-120b")).toEqual({
      supportsReasoningEffort: true,
      supportedReasoningEfforts: ["low", "medium", "high"],
    });
  });

  it("contributes compat only for Groq OpenAI-compatible chat models", () => {
    expect(
      contributeGroqResolvedModelCompat({
        modelId: "qwen/qwen3-32b",
        model: { api: "openai-completions", provider: "groq" },
      }),
    ).toMatchObject({ supportedReasoningEfforts: ["none", "default"] });
    expect(
      contributeGroqResolvedModelCompat({
        modelId: "qwen/qwen3-32b",
        model: { api: "openai-completions", provider: "openrouter" },
      }),
    ).toBeUndefined();
  });

  it("registers Groq model and media providers", () => {
    const captured = capturePluginRegistration(plugin);
    expect(captured.providers[0]).toMatchObject({
      id: "groq",
      label: "Groq",
      envVars: ["GROQ_API_KEY"],
    });
    expect(captured.providers[0]?.auth.map((method) => method.id)).toEqual(["api-key"]);
    expect(captured.providers[0]?.auth[0]?.wizard).toMatchObject({
      choiceId: "groq-api-key",
      choiceLabel: "Groq API key",
      groupId: "groq",
      groupLabel: "Groq",
    });
    expect(captured.mediaUnderstandingProviders).toHaveLength(1);
    const [mediaProvider] = captured.mediaUnderstandingProviders;
    if (!mediaProvider) {
      throw new Error("Expected Groq media understanding provider");
    }
    expect(mediaProvider.id).toBe("groq");
  });

  it("declares Groq API-key onboarding flags in the manifest", () => {
    expect(readManifest().providerAuthChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "groq",
          method: "api-key",
          choiceId: "groq-api-key",
          optionKey: "groqApiKey",
          cliFlag: "--groq-api-key",
        }),
      ]),
    );
  });
});
