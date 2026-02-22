import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["app/lib/**/*.test.ts", "app/lib/**/*.property.test.ts"],
  },
});
