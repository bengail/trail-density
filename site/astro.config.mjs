import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://trail-density.pages.dev",
  trailingSlash: "ignore",
  build: { format: "directory" },
});
