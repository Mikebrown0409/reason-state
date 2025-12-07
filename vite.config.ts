import { defineConfig, loadEnv } from "vite";

// React JSX is handled via the built-in esbuild transform to stay within the
// allowed dependency list (no extra plugins). Add the React plugin later only
// if explicitly approved.
export default defineConfig(({ mode }) => {
  // Ensure .env/.env.local are loaded for Vite-prefixed vars.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      __VITE_X_BEARER_TOKEN__: JSON.stringify(env.VITE_X_BEARER_TOKEN ?? ""),
      __VITE_GROK_API_KEY__: JSON.stringify(env.VITE_GROK_API_KEY ?? "")
    },
    server: {
      proxy: {
        "/x-api": {
          target: "https://api.twitter.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/x-api/, "")
        }
      }
    },
    esbuild: {
      jsx: "automatic"
    }
  };
});

