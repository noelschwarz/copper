/**
 * Aloy + Vercel AI SDK demo.
 *
 * Wraps a Vercel-AI-SDK toolset with `aloy.watch(...)` + `vercelAiAdapter()`
 * so every tool execution is captured, redacted, scored, and shipped. The
 * model picks tools normally; the wrap is invisible.
 */

import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { AloyClient, watchVercelAi } from "aloy";
import { z } from "zod";

async function main(): Promise<void> {
  const aloy = new AloyClient({
    apiUrl: process.env.ALOY_API_URL ?? "http://localhost:3000",
    project: "vercel-ai-example",
    agentId: "demo",
  });

  const tools = watchVercelAi(
    {
      get_weather: tool({
        description: "Get the current weather for a city.",
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          // Replace with a real weather API in your app.
          return { city, temperature: 72, condition: "sunny" };
        },
      }),
    },
    aloy,
  );

  const { text, toolCalls } = await generateText({
    model: openai("gpt-4o-mini"),
    tools,
    prompt: "What's the weather in San Francisco?",
    maxSteps: 3,
  });

  console.log("text:", text);
  console.log("toolCalls:", toolCalls);

  await aloy.flush();
  await aloy.close();
  console.log(
    "\nDone. Query the events:\n  curl 'http://localhost:3000/v1/events?project=vercel-ai-example'",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
