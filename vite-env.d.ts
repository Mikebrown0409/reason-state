/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_X_BEARER_TOKEN: string;
  readonly VITE_GROK_API_KEY: string;
  readonly VITE_GROK_BASE_URL?: string;
  readonly VITE_X_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

