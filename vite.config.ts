import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // For Render deployment, override nitro preset to node-server
  nitro: {
    preset: process.env.RENDER ? "node-server" : undefined,
  },
});