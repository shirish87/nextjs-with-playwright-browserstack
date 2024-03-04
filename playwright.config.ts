import { defineConfig, devices } from "@playwright/test";
import path from "path";
import type { BrowserStackOptions } from "./e2e/playwright-browserstack";

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT || 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require("dotenv").config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<BrowserStackOptions>({
  testDir: path.join(__dirname, "e2e"),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? "dot" : "list",

  // Run your local dev server before starting the tests:
  // https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests
  webServer: {
    command: "npm run dev",
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto("/")`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    // trace: "on-first-retry",
    trace: "retry-with-trace",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chrome desktop",
      use: {
        browserstack: true,
        capabilities: {
          build: `${process.env.npm_package_name} - chrome osx`,
          local: true,
          localIdentifier: process.env.npm_package_name,
          browser: "chrome",
          browser_version: "latest",
          os: "osx",
          os_version: "catalina",
        },
      },
    },
    {
      name: "chrome android",
      use: {
        browserstack: true,
        capabilities: {
          build: `${process.env.npm_package_name} - Google Pixel 6`,
          local: true,
          localIdentifier: process.env.npm_package_name,
          isMobile: true,
          browser: "chrome",
          deviceName: "Google Pixel 6",
          os: "android",
          osVersion: "12.0",
        },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
