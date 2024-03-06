import type { AndroidDevice, Browser, Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import { version as pwVersion } from "@playwright/test/package.json";
import { join } from "node:path";
export * from "playwright/test";

const browserstackEndpoint = "wss://cdp.browserstack.com/playwright";

export type BrowserPlatform =
  | {
      browserName: string;
      browserVersion: string;
      os: "Windows" | "OS X";
      osVersion: string;
      realMobile?: false;
    }
  | {
      browserName: string;
      deviceName: string;
      os: "android";
      osVersion: string;
      realMobile?: true;
    };

export type ConfiguredCapabilities = {
  username?: string;
  accessKey?: string;
  local?: boolean;
  localIdentifier?: string;
  playwrightVersion?: string;
  name?: string;
  build?: string;
} & BrowserPlatform;

export type Capabilities = BrowserPlatform & {
  name?: string;
  build?: string;
  realMobile?: string;
  "browserstack.username": string;
  "browserstack.accessKey": string;
  "browserstack.local"?: string;
  "browserstack.localIdentifier"?: string;
  "browserstack.playwrightVersion"?: string;
} & Record<string, unknown>;

export type BrowserStackOptions = {
  browserstack?: ConfiguredCapabilities;
};

export type BrowserStackFixtures = {
  isBrowserstack: boolean;
};

export const test = base.extend<BrowserStackOptions & BrowserStackFixtures>({
  browserstack: [undefined, { option: true }],

  page: async ({ page, playwright, browserstack }, use, testInfo) => {
    if (!browserstack) {
      return await use(page);
    }

    const {
      configuredCapabilities: { realMobile, os },
      desiredCapabilities,
    } = parseCapabilities(browserstack);

    const connectURL = `${browserstackEndpoint}?caps=${encodeURIComponent(
      JSON.stringify(desiredCapabilities)
    )}`;

    let platform: AndroidDevice | Browser;
    let newPage: Page;

    if (realMobile) {
      if (os !== "android") {
        throw new Error("Only Android is supported at the moment");
      }

      if (typeof playwright?._android?.connect !== "function") {
        throw new Error(
          "Android is not supported by the current Playwright version"
        );
      }

      platform = await playwright._android.connect(connectURL);
      await platform.shell("am force-stop com.android.chrome");
      const browserContext = await platform.launchBrowser(testInfo.project.use);
      newPage = await browserContext.newPage();
    } else {
      if (typeof playwright?.chromium?.connect !== "function") {
        throw new Error(
          "Chromium is not supported by the current Playwright version"
        );
      }

      // probably need to catch and manage "Target page, context or browser has been closed"
      platform = await playwright.chromium.connect(connectURL);
      const browserContext = await platform.newContext(testInfo.project.use);
      newPage = await browserContext.newPage();
    }

    await use(newPage);

    await newPage.close();
    await platform.close();
  },

  isBrowserstack: [
    async ({ browserstack, page, context }, use, testInfo) => {
      if (browserstack) {
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
        });
      }

      await use(Boolean(browserstack));

      if (browserstack) {
        // https://www.browserstack.com/docs/automate/selenium/view-test-results/mark-tests-as-pass-fail
        const testResult = {
          action: "setSessionStatus",
          arguments: {
            status: testInfo.status === "passed" ? "passed" : "failed",
            reason: JSON.stringify(testInfo?.error ?? testInfo.status),
          },
        };

        await page.evaluate(() => {},
        `browserstack_executor: ${JSON.stringify(testResult)}`);

        if (testInfo.status !== testInfo.expectedStatus) {
          const screenshotPath = join(testInfo.outputDir, "screenshot.png");

          await page.screenshot({ path: screenshotPath });

          await testInfo.attach("screenshot", {
            path: screenshotPath,
            contentType: "image/png",
          });

          const tracePath = join(testInfo.outputDir, "trace.zip");

          await context.tracing.stop({ path: tracePath });

          await testInfo.attach("trace", {
            path: tracePath,
            contentType: "application/zip",
          });
        }
      }
    },
    { scope: "test", auto: true },
  ],
});

function parseCapabilities(capabilities: ConfiguredCapabilities) {
  let {
    username,
    accessKey,
    local,
    localIdentifier,
    playwrightVersion,
    realMobile,
    ...rest
  } = capabilities;

  username ??= process?.env?.BROWSERSTACK_USERNAME?.trim?.();
  accessKey ??= (
    process?.env?.BROWSERSTACK_KEY ?? process?.env?.BROWSERSTACK_ACCESS_KEY
  )?.trim?.();
  local ??= (process?.env?.BROWSERSTACK_LOCAL?.trim?.() ?? "false") === "true";
  localIdentifier ??= local
    ? capabilities.localIdentifier ?? process?.env?.npm_package_name?.trim?.()
    : undefined;
  playwrightVersion ??= process?.env?.PLAYWRIGHT_VERSION?.trim?.() ?? pwVersion;

  if (!username?.length || !accessKey?.length) {
    throw new Error("Missing BrowserStack credentials");
  }

  if (!playwrightVersion?.length) {
    throw new Error("Missing Playwright version");
  }

  const configured = {
    ...rest,
    username,
    accessKey,
    local,
    localIdentifier,
    playwrightVersion,
    realMobile:
      typeof realMobile === "boolean"
        ? realMobile
        : ["android", "ios"].includes(rest?.os?.toLowerCase?.()),
  };

  return {
    configuredCapabilities: configured,
    desiredCapabilities: {
      ...rest,
      "browserstack.username": username,
      "browserstack.accessKey": accessKey,
      ...(local
        ? {
            "browserstack.local": "true",
            "browserstack.localIdentifier": localIdentifier,
          }
        : undefined),
      ...(playwrightVersion
        ? {
            "browserstack.playwrightVersion": playwrightVersion,
          }
        : undefined),
      ...(realMobile ? { realMobile: "true" } : undefined),
    },
  };
}
