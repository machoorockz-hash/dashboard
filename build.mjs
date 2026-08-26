import { build } from "esbuild";

await build({
  entryPoints: ["server/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  sourcemap: true,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
}).catch(() => process.exit(1));

console.log("✅ Server bundle built → dist/server.mjs");
