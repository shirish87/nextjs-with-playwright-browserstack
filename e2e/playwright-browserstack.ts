import type { AndroidDevice, Browser, Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import { version as pwVersion } from "@playwright/test/package.json";
import { LocalTestingBinary } from "browserstack-client/node";
export * from "playwright/test";

const baseURL = "wss://cdp.browserstack.com/playwright";

export type BrowserStackOptions = {
  browserstack: boolean;

  capabilities: {
    username?: string;
    accessKey?: string;
    local?: boolean;
    localIdentifier?: string;
    playwrightVersion?: string;
    name?: string;
    build?: string;
  } & (
    | {
        browserName: string;
        browserVersion: string;
        os: "Windows" | "OS X";
        osVersion: string;
        isMobile?: false;
      }
    | {
        browserName: string;
        deviceName: string;
        os: "android";
        osVersion: string;
        isMobile: true;
      }
  );
};

export type BrowserStackFixture = {
  page: Page;
  beforeEach: any;
  afterEach: any;
};

const defaultCapabilities = (): BrowserStackOptions["capabilities"] => ({
  username: "",
  accessKey: "",
  local: (process?.env?.BROWSERSTACK_LOCAL ?? "false") === "true",
  browserName: "chrome",
  browserVersion: "latest",
  os: "OS X",
  osVersion: "catalina",
});

const parseCapabilities = (
  capabilities: BrowserStackOptions["capabilities"]
) => {
  let {
    username,
    accessKey,
    local,
    localIdentifier,
    playwrightVersion,
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

  return {
    ...rest,
    username,
    accessKey,
    local,
    localIdentifier,
    playwrightVersion,
    isMobile: capabilities.isMobile === true,
  };
};

export const test = base.extend<BrowserStackOptions & BrowserStackFixture>({
  browserstack: [false, { option: true }],

  capabilities: [defaultCapabilities(), { option: true }],

  page: async (
    { page, playwright, browserstack, capabilities },
    use,
    testInfo
  ) => {
    if (!browserstack) {
      return await use(page);
    }

    if (!capabilities || typeof capabilities !== "object") {
      throw new Error("Missing BrowserStack capabilities");
    }

    const {
      username,
      accessKey,
      local,
      localIdentifier,
      isMobile,
      playwrightVersion,
      ...rest
    } = parseCapabilities(capabilities);

    const finalCapabilities = {
      ...rest,
      name: capabilities.name ?? testInfo.title,
      build: capabilities.build ?? testInfo.project.name,
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
            "client.playwrightVersion": playwrightVersion,
          }
        : undefined),
      ...(isMobile ? { realMobile: "true" } : undefined),
    };

    const connectURL = `${baseURL}?caps=${encodeURIComponent(
      JSON.stringify(finalCapabilities)
    )}`;

    let platform: AndroidDevice | Browser;
    let newPage: Page;

    if (isMobile) {
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

  // https://github.com/browserstack/node-js-playwright-browserstack/blob/826013cd21a10aa4dad5e08f279a48b548c0009d/fixture.js#L125
  beforeEach: [
    async ({ page }, use) => {
      await page
        .context()
        .tracing.start({ screenshots: true, snapshots: true, sources: true });
      await use();
    },
    { auto: true },
  ],

  afterEach: [
    async ({ page, capabilities }, use, testInfo) => {
      await use();

      if (testInfo.status == "failed") {
        if (capabilities) {
          // posttest script won't run if the test is failing
          // so we need to stop the local testing binary here
          // TODO: reconcile this with maxFailures setting
          const {
            accessKey: key,
            local,
            localIdentifier,
          } = parseCapabilities(capabilities);

          if (key && local) {
            const localTestingBinary = new LocalTestingBinary({
              key,
              localIdentifier,
            });
            await localTestingBinary.stop().catch(() => null);
          }
        }

        await page
          .context()
          .tracing.stop({ path: `${testInfo.outputDir}/trace.zip` });
        await page.screenshot({ path: `${testInfo.outputDir}/screenshot.png` });
        await testInfo.attach("screenshot", {
          path: `${testInfo.outputDir}/screenshot.png`,
          contentType: "image/png",
        });
        await testInfo.attach("trace", {
          path: `${testInfo.outputDir}/trace.zip`,
          contentType: "application/zip",
        });
      }
    },
    { auto: true },
  ],
});
