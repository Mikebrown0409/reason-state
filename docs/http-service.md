## HTTP service (optional)

If you want `reason-state` behind an HTTP API (e.g. for browser clients), use the server app under `apps/server/`.

### Run locally
```bash
npm run dev:server
```

### Build + run
```bash
npm run build:all
npm run start:server
```

### Docker
```bash
docker build -t reason-state -f apps/server/docker/Dockerfile .
docker run -p 3000:3000 reason-state
```

### Endpoints
- `GET /health` → `{ status: \"ok\" }`
- `POST /add` → `{ text | node, type?, summary?, id?, confidence? }` → `{ state }`
- `POST /update` → `{ id, summary?, retracted?, reason? }` → `{ state }`
- `POST /query` → `{ goal, mode?: \"plan\"|\"retrieve\" }` → `{ patches, state, context }`


