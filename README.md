# copper

`tail -f` for AI agent tool calls.

Wrap your MCP client with one line and watch every tool call your agent makes scroll past your terminal in real time. Secrets get redacted. Risky calls get flagged. No server, no database, no dashboard — just a small CLI that does one thing well.

![Copper demo output](./docs/demo-screenshot.png)

## Why

Building agents means watching them do things you didn't expect. Most of the time you find out by reading the result of a 12-step run after it's already finished. Copper prints each tool call as it happens, so you can see what's going on while it's going on.

## Install

```bash
npm install copper
```

Or try it without installing:

```bash
npx copper demo
```

The demo runs a fake agent that fires off a handful of tool calls so you can see what the output looks like before wiring up your own.

## Use

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { watch } from "copper"

const client = watch(new Client(/* ... */))

// use the client normally — every tool call gets logged
await client.callTool({ name: "read_file", arguments: { path: "./README.md" } })
```

That's the whole API. `watch()` wraps your existing client and returns one with the same interface. Your code doesn't change. The output appears on stdout.

## What you'll see

Each tool call prints as a small block:

```
  ▸ write_file  ⚠ medium  127ms
    args: { path: "/tmp/notes.txt", content: "Meeting notes from <REDACTED:email>..." }
    → ok
```

The arguments are redacted before anything renders. Risk indicators appear next to high- and medium-risk calls. Errors print in red. If stdout isn't a TTY (you're piping to a file), colors and icons drop out so the output stays clean.

## Configuration

```ts
watch(client, {
  stream: process.stderr,        // default: process.stdout
  redact: customRedactor,        // default: built-in patterns
  risk: customRiskScorer,        // default: built-in heuristics
})
```

Most people won't need to touch any of this. The defaults are designed to work for the common case — MCP clients calling typical filesystem, shell, network, and database tools.

## What gets redacted

Out of the box, copper scrubs:

- API keys (`sk-...`, `sk_live_...`, AWS keys, GitHub tokens, Slack tokens, etc.)
- Email addresses
- Phone numbers
- Credit card numbers (Luhn-validated)
- High-entropy strings that look like secrets

Redaction runs recursively through the arguments object before anything is rendered. Bring your own redactor if the defaults aren't enough.

## What gets flagged as risky

A small heuristic scorer assigns each call a risk level based on the tool name and arguments:

- **High** — subprocess execution, destructive SQL (`DROP`, `DELETE`, `TRUNCATE`)
- **Medium** — file writes, network calls to non-allowlisted domains
- **Low** — reads, lookups, get-style calls

The scoring is intentionally simple. You can replace it entirely with `{ risk: yourFn }`.

## What this isn't

- Not an LLM tracing platform — copper doesn't see prompts or completions.
- Not a hosted service — there's no backend, nothing phones home.
- Not a security tool — it observes, it doesn't enforce. If a call is risky, copper flags it; it does not block it.

## Roadmap

- **v0.1** (current) — MCP client wrapper, redaction, risk flags, terminal output
- **v0.2** — adapters for other tool-calling SDKs, JSON output mode, file output
- **Later** — maybe a small static HTML view if there's interest

## Contributing

Issues and PRs welcome. The codebase is small enough to read in an afternoon. If you find a redaction pattern that should be built in but isn't, or a tool name that should score higher than it does, those are great first contributions.

## License

MIT. See [LICENSE](./LICENSE).
