# TODO

Things planned for future versions of copper.

## v0.2

- **Comprehensive secret detection.** Replace the small built-in pattern set with a battle-tested ruleset covering several hundred vendor token formats. Candidates: integrate [`secretlint`](https://github.com/secretlint/secretlint) as an optional default, or port the regex set from [TruffleHog](https://github.com/trufflesecurity/trufflehog). The current built-in patterns ship as a minimal fallback.
- **Adapters for non-MCP clients.** Vercel AI SDK and OpenAI Agents SDK are the most-requested.
- **JSON output mode.** A `--json` flag (or `format: "json"` config) for piping into `jq`, log aggregators, or saving to disk.
- **Persistent file logging.** A `--save events.jsonl` flag for capturing a session.

## Maybe, depending on interest

- A small static HTML view generated from a session log (single file, openable in a browser, no server).
- Per-tool-call timing histograms and basic stats from a captured session.

## Not planned

- A hosted service.
- Any backend or database.
- An LLM tracing layer (this isn't that kind of tool, see the README).

If you'd like to influence what lands in v0.2, open an issue describing your use case.
