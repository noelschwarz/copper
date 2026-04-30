# Changelog

All notable changes to copper will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-29

Initial release.

- `watch()` wrapper for MCP clients — intercepts `callTool` and prints each call to the terminal in real time
- Built-in redaction for common API keys (OpenAI, Anthropic, Stripe, AWS, GitHub, Slack), email addresses, phone numbers, credit card numbers, and high-entropy strings
- Heuristic risk scoring with three levels: low, medium, high — flags subprocess execution, destructive SQL, file writes, and network calls
- Terminal renderer with ANSI colors, risk indicators, and TTY-aware formatting
- `npx copper demo` command that runs a fake agent firing a variety of tool calls
- Configurable redactor and risk scorer for advanced use cases

[0.1.0]: https://github.com/noelschwarz/copper/releases/tag/v0.1.0
