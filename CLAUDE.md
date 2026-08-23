# Claude Code entry point

Before modifying code:

1. read [AGENTS.md](AGENTS.md);
2. read every file in [docs/handoff](docs/handoff/);
3. run the Git preflight required by `AGENTS.md`;
4. verify relevant schema, migrations, implementation, and tests;
5. respect the current phase and operational gates.

Do not invent business decisions, modify staging, or perform persistent writes
without explicit authorization. Never expose secrets or private data.
`AGENTS.md` and `docs/handoff/*` are the primary continuity references, subject
to the authority order defined in `AGENTS.md`.
