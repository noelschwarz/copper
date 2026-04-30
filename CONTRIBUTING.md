# Contributing to copper

Thanks for considering a contribution. The codebase is small enough to understand in an afternoon, and most contributions are welcome.

## Getting started

Clone the repo and install dependencies:

```bash
git clone https://github.com/noelschwarz/copper.git
cd copper
npm install
```

Build:

```bash
npm run build
```

Run the tests:

```bash
npm test
```

Try the demo to see things working end-to-end:

```bash
node dist/cli.js demo
```

## Project structure

The `src/` folder has six files, none of them long:

- `index.ts` — public API (`watch`, types)
- `cli.ts` — the `copper demo` command
- `watcher.ts` — the Proxy-based MCP wrapper
- `redact.ts` — secret and PII scrubbing
- `risk.ts` — heuristic risk scoring
- `render.ts` — terminal output formatting

Tests live in `tests/`, organized one file per source file.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change. Add or update tests if behavior changed.
3. Run `npm test` and make sure everything passes.
4. Run `npm run build` and confirm it builds cleanly.
5. Open a pull request with a clear description of what changed and why.

For larger changes, open an issue first to discuss. It saves you from building something I'd want to redesign.

## What kinds of contributions are most welcome

- **Redaction patterns** for vendor token formats not currently caught (Anthropic, Google Cloud, Azure, JWTs, private keys, etc.)
- **Risk-scoring rules** for tool names or argument shapes that should score differently than they do
- **Adapters** for non-MCP tool-calling clients (Vercel AI SDK, OpenAI Agents SDK, LangChain.js)
- **Bug fixes**, especially with a failing test that demonstrates the bug
- **README and docs improvements**, including typos

## What's out of scope

- Backends, dashboards, hosted services. Copper stays a small, in-process CLI.
- Major restructures or new architectural layers. Open an issue first.
- Dependencies for things copper can do without. Smaller install is better.

## Code style

The repo uses Biome for formatting and linting. Run:

```bash
npm run lint
npm run format
```

before pushing. Most editors can run these on save.

## Code of Conduct

By participating in this project, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind. Assume good faith.

## Questions

If you're not sure whether something is a good contribution or have a question about the code, open an issue and ask. No PR is too small.
