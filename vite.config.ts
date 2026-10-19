import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: 3000 },
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), ...(process.env.VERCEL ? [nitro({ preset: "vercel" })] : []), viteReact()],
});
