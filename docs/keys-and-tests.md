## Keys and tests

### Keyless by default
- `reason-state` is designed so you can start in **retrieve-only** mode without any API keys.

### Key-gated suites
- Some suites require external APIs (Grok/X) and should be treated as **key-gated**.

### Useful commands
| Command/test                    | Needs keys?                   | Behavior without keys                    |
|---------------------------------|-------------------------------|------------------------------------------|
| `npm run demo`                  | No (planner skipped)          | Retrieve-only context + canned tips      |
| `npm run test`                  | No                            | Passes                                   |
| `npm run test:pkg`              | No                            | Passes (build + consumer check)          |
| `vitest run tests/live*`        | Yes (`GROK_API_KEY`/X)        | Skipped with message                     |
| `npm run bench:longmemeval*`    | Yes (`GROK_API_KEY` + model)  | Fail loud / skip if no keys              |

