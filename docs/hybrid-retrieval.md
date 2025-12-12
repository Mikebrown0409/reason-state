## Hybrid retrieval (optional)

By default, `reason-state` uses a deterministic, rule-based context selection strategy.
If you have a vector store and want semantic “boosting,” you can pass a `vectorStore` to bias selection.
### Example
```ts
import { ReasonState, InMemoryVectorStore } from "reason-state";

const vs = new InMemoryVectorStore();
vs.upsert([{ id: "fact1", text: "Beach resort has good weather" }]);

const rs = new ReasonState({ vectorStore: vs, vectorTopK: 5 });
await rs.add("Beach resort has good weather", { key: "fact:weather:beach_resort", type: "fact" });

const goal = "Where to host the offsite?";
const context = await rs.retrieveContext(goal);
```


