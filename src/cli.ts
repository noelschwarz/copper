#!/usr/bin/env node
import { watch } from "./index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = a[i];
    const aj = a[j];
    if (ai === undefined || aj === undefined) continue;
    a[i] = aj;
    a[j] = ai;
  }
  return a;
}

const demoCalls: { name: string; arguments: Record<string, unknown> }[] = [
  {
    name: "read_file",
    arguments: { path: "./README.md" },
  },
  {
    name: "list_directory",
    arguments: { path: "./src" },
  },
  {
    name: "get_workspace_status",
    arguments: {},
  },
  {
    name: "fetch",
    arguments: { url: "https://example.com/api/health" },
  },
  {
    name: "write_file",
    arguments: {
      path: "/tmp/agent-notes.txt",
      content:
        "Contact ops@example.com — token sk-1234567890abcdefghijklmnopqrst",
    },
  },
  {
    name: "run_sql",
    arguments: { query: "DELETE FROM sessions WHERE expired = true" },
  },
  {
    name: "run_command",
    arguments: {
      command: "git status",
      env: { GITHUB_TOKEN: "ghp_0123456789abcdefghijklmnopqrstuvwxyz12" },
    },
  },
  {
    name: "delete_file",
    arguments: { path: "./scratch.tmp" },
  },
  {
    name: "read_file",
    arguments: {
      path: "/secrets",
      hint: "AKIAIOSFODNN7EXAMPLE",
    },
  },
];

async function runDemo(): Promise<void> {
  const client = {
    async callTool(params: {
      name: string;
      arguments?: Record<string, unknown>;
    }) {
      const jitter = 80 + Math.floor(Math.random() * 380);
      await sleep(jitter);
      if (params.name === "run_command" && params.arguments?.fail === true) {
        throw new Error("command exited with code 1");
      }
      return { content: [{ type: "text", text: "done" }] };
    },
  };

  const wrapped = watch(client);
  const sequence = shuffle(demoCalls);

  for (const call of sequence) {
    try {
      await wrapped.callTool(call);
    } catch {
      /* demo may include a failing call later if we add fail flag */
    }
    await sleep(150 + Math.floor(Math.random() * 450));
  }

  // One deliberate failure for stderr-style visibility
  try {
    await wrapped.callTool({
      name: "run_command",
      arguments: { command: "false", fail: true },
    });
  } catch {
    /* expected */
  }
}

async function main(): Promise<void> {
  const [, , cmd] = process.argv;
  if (cmd !== "demo") {
    process.stderr.write("Usage: copper demo\n");
    process.stderr.write(
      "  Prints a live sample of tool-call logging. No configuration required.\n",
    );
    process.exit(1);
  }
  await runDemo();
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
