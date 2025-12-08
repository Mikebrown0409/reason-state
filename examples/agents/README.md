# Demo-only agents

These agents are examples to show how to wire ReasonState. They are **not shipped** in the npm package and should be treated as references only.

Included examples:
- `simpleAgent`, `dagAgent`: travel/demo flows (use mock booking in examples only).
- `codingAgent`: minimal coding helper using `ReasonState` + `buildContext` and a pluggable planner stub.

How to use:
- Copy/adapt into your app; plug your own tools/planners.
- Replace the stub planner with your LLM/tool call that returns validated patches.

