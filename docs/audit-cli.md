## Audit CLI (`reason-state audit`)

### Why it exists
If you have **any agent log** (messages/tool calls), the audit CLI lets you:
- print ROI lines (context vs raw, saved %, governance counts)
- emit a **Studio-importable JSON** so you can visualize the timeline immediately

### Run it
```bash
npx reason-state audit path/to/trace.json
```

By default it writes:
- `path/to/trace.reason-state.json`

You can override:
```bash
npx reason-state audit path/to/trace.json --out out.reason-state.json
```

### Supported inputs (v1)
- `[{ role, content, tool_calls? }, ...]`
- `{ "messages": [ ... ] }`

### Studio import
Open Studio and paste the generated JSON into **Import pasted JSON**.

