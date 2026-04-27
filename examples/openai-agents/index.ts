/**
 * Aloy + OpenAI Agents demo.
 *
 * The OpenAI Agents SDK API surface is still evolving; this example uses
 * the stable shape `openaiAgentsAdapter` targets — a tool object with an
 * `invoke(args)` (or `execute(args)`) method. Drop your real
 * `@openai/agents` tools into the same array and the wrap stays the same.
 *
 * The wrapper redacts, scores, and ships every invocation. Argument shapes
 * carrying e.g. an AWS access key or an email are scrubbed in-process
 * before any event leaves the user's machine.
 */

import { AloyClient, type OpenAiAgentTool, watchOpenAiAgents } from "aloy";

async function main(): Promise<void> {
  const aloy = new AloyClient({
    apiUrl: process.env.ALOY_API_URL ?? "http://localhost:3000",
    project: "openai-agents-example",
    agentId: "demo",
  });

  const baseTools: OpenAiAgentTool[] = [
    {
      name: "lookup_user",
      description: "Look up a user by id.",
      parameters: { type: "object", properties: { id: { type: "string" } } },
      invoke: async (args) => {
        const { id } = args as { id: string };
        // In a real example, this would hit your DB or user service.
        return { id, name: "Ada Lovelace", email: "ada@example.com" };
      },
    },
  ];

  const tools = watchOpenAiAgents(baseTools, aloy);

  // Demonstration: invoke directly. In a real OpenAI Agents app the agent
  // runner would call `tools[i].invoke(args)` under the hood — same wrap,
  // same observation.
  const lookup = tools[0];
  if (!lookup?.invoke) throw new Error("expected lookup_user tool");
  const result = await lookup.invoke({ id: "u_42" });
  console.log("[lookup_user] result:", result);

  await aloy.flush();
  await aloy.close();
  console.log(
    "\nDone. Query the events:\n  curl 'http://localhost:3000/v1/events?project=openai-agents-example'",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
