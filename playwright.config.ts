import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

const adminCredentials = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};

const stackConfigured = Boolean(process.env.E2E_BASE_URL && adminCredentials.email && adminCredentials.password);

export { adminCredentials, baseURL, stackConfigured };

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
});
