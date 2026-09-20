import { chromium, type BrowserContext, type Page } from "playwright";
import { playjev, type PlayJevPage } from "../../src/index.js";

interface EvalResult {
  name: string;
  source: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  durationMs: number;
  error?: string;
}

const cdpUrl = process.env.PLAYJEV_CDP_URL ?? "http://127.0.0.1:9222";
const ownsBrowser = !process.env.PLAYJEV_CDP_URL;
const browserChannel = process.env.PLAYJEV_BROWSER_CHANNEL;
const browser = ownsBrowser
  ? await chromium.launch({
      ...(browserChannel ? { channel: browserChannel as "chrome" } : {}),
      headless: process.env.HEADED !== "true",
      ...(process.env.HEADED === "true" ? { slowMo: 120 } : {}),
    })
  : await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0] ?? (await browser.newContext({ locale: "en-US" }));
if (!context) throw new Error("Reusable Chrome has no browser context");
const results: EvalResult[] = [];

async function evaluate(
  name: string,
  source: string,
  task: (
    page: PlayJevPage,
    context: BrowserContext,
  ) => Promise<{
    passed: boolean;
    expected: unknown;
    actual: unknown;
  }>,
): Promise<void> {
  const filter = process.env.EVAL_FILTER;
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
  const started = Date.now();
  const existingPages = new Set(context.pages());
  const page = playjev(await context.newPage());
  process.stdout.write(`Running ${name}... `);
  try {
    const outcome = await task(page, context);
    results.push({ name, source, durationMs: Date.now() - started, ...outcome });
    console.log(outcome.passed ? "PASS" : "FAIL");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      source,
      passed: false,
      expected: "task completes",
      actual: null,
      durationMs: Date.now() - started,
      error: message,
    });
    console.log(`ERROR: ${message}`);
  } finally {
    for (const candidate of context.pages()) {
      if (!existingPages.has(candidate)) await candidate.close().catch(() => undefined);
    }
  }
}

await evaluate(
  "stagehand/checkboxes",
  "packages/evals/tasks/bench/act/checkboxes.ts",
  async (page) => {
    await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/checkboxes/", {
      waitUntil: "domcontentloaded",
    });
    await page.act("Click the baseball option", { maxSteps: 1, minTargetConfidence: 0.3 });
    await page.act("Click the netball option", { maxSteps: 1, minTargetConfidence: 0.3 });
    const actual = {
      baseball: await page.locator('input[name="sports"][value="baseball"]').isChecked(),
      netball: await page.locator('input[name="sports"][value="netball"]').isChecked(),
    };
    return {
      passed: actual.baseball && actual.netball,
      expected: { baseball: true, netball: true },
      actual,
    };
  },
);

await evaluate(
  "stagehand/radio_btn",
  "packages/evals/tasks/bench/act/radio_btn.ts",
  async (page) => {
    await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/paneer-pizza/", {
      waitUntil: "domcontentloaded",
    });
    await page.act("Click the Medium pizza-size option", { maxSteps: 1, minTargetConfidence: 0.3 });
    const actual = await page.locator('input[name="Pizza"][value="Medium"]').isChecked();
    return { passed: actual, expected: true, actual };
  },
);

await evaluate(
  "stagehand/dropdown_hidden_input",
  "packages/evals/tasks/bench/act/dropdown.ts",
  async (page) => {
    await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/dropdown/", {
      waitUntil: "domcontentloaded",
    });
    await page.locator("xpath=/html/body/div/div/button").click();
    await page.act("Type the supplied text into the input field", {
      value: "test fill",
      maxSteps: 1,
      minTargetConfidence: 0.3,
    });
    const actual = await page.locator("xpath=/html/body/div/input").inputValue();
    return { passed: actual === "test fill", expected: "test fill", actual };
  },
);

await evaluate(
  "stagehand/custom_dropdown",
  "packages/evals/tasks/bench/act/custom_dropdown.ts",
  async (page) => {
    await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/expand-dropdown/", {
      waitUntil: "domcontentloaded",
    });
    await page.act("Choose Canada from the Select a Country dropdown", {
      value: "Canada",
      maxSteps: 2,
      minTargetConfidence: 0.25,
      minVerificationProbability: 0.35,
    });
    const actual = await page.locator("#chosenValue").innerText();
    return { passed: actual.includes("Canada"), expected: "Canada", actual };
  },
);

await evaluate(
  "stagehand/shadow_dom",
  "packages/evals/tasks/bench/act/shadow_dom.ts",
  async (page) => {
    await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/shadow-dom/", {
      waitUntil: "domcontentloaded",
    });
    await page.act("Click the button inside the shadow DOM", {
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });
    const actual = await page
      .getByText(/button successfully clicked/i)
      .isVisible()
      .catch(() => false);
    return { passed: actual, expected: true, actual };
  },
);

await evaluate(
  "stagehand/iframe_form_filling",
  "packages/evals/tasks/bench/act/iframe_form_filling.ts",
  async (page) => {
    await page.goto(
      "https://browserbase.github.io/stagehand-eval-sites/sites/iframe-form-filling/",
      { waitUntil: "domcontentloaded" },
    );
    await page.act("Type the supplied value into the First Name field", {
      value: "nunya",
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });
    await page.act("Type the supplied value into the Last Name field", {
      value: "business",
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });
    await page.act("Type the supplied value into the Email field", {
      value: "test@email.com",
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });
    await page.act("Click Phone as the preferred contact method", {
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });
    await page.act("Type the supplied value into the Message field", {
      value: "yooooooooooooooo",
      maxSteps: 1,
      minTargetConfidence: 0.25,
    });

    const frame = page.frameLocator("iframe");
    const actual = {
      firstName: await frame.locator('input[placeholder="Jane"]').inputValue(),
      lastName: await frame.locator('input[placeholder="Doe"]').inputValue(),
      email: await frame.locator('input[placeholder="jane@example.com"]').inputValue(),
      phone: await frame.locator('input[type="radio"][value="phone"]').isChecked(),
      message: await frame.locator('textarea[placeholder="Say hello…"]').inputValue(),
    };
    const expected = {
      firstName: "nunya",
      lastName: "business",
      email: "test@email.com",
      phone: true,
      message: "yooooooooooooooo",
    };
    return { passed: JSON.stringify(actual) === JSON.stringify(expected), expected, actual };
  },
);

await evaluate(
  "playjev/bulk_iframe_form_filling",
  "PlayJev bulk form extension over the Stagehand iframe form fixture",
  async (page) => {
    await page.goto(
      "https://browserbase.github.io/stagehand-eval-sites/sites/iframe-form-filling/",
      { waitUntil: "domcontentloaded" },
    );
    const result = await page.act("Complete the contact form", {
      fields: {
        "First Name": "nunya",
        "Last Name": "business",
        Email: "test@email.com",
        "Preferred Contact Method": "Phone",
        Message: "yooooooooooooooo",
      },
      minTargetConfidence: 0.25,
      minVerificationProbability: 0.35,
    });

    const frame = page.frameLocator("iframe");
    const actual = {
      firstName: await frame.locator('input[placeholder="Jane"]').inputValue(),
      lastName: await frame.locator('input[placeholder="Doe"]').inputValue(),
      email: await frame.locator('input[placeholder="jane@example.com"]').inputValue(),
      phone: await frame.locator('input[type="radio"][value="phone"]').isChecked(),
      message: await frame.locator('textarea[placeholder="Say hello…"]').inputValue(),
      actions: result.actions.length,
      verified: result.success,
    };
    const expected = {
      firstName: "nunya",
      lastName: "business",
      email: "test@email.com",
      phone: true,
      message: "yooooooooooooooo",
      actions: 5,
      verified: true,
    };
    return { passed: JSON.stringify(actual) === JSON.stringify(expected), expected, actual };
  },
);

await evaluate(
  "stagehand/multi_tab",
  "packages/evals/tasks/bench/act/multi_tab.ts",
  async (initialPage, activeContext) => {
    let activePage = initialPage;
    await activePage.goto("https://browserbase.github.io/stagehand-eval-sites/sites/five-tab/", {
      waitUntil: "domcontentloaded",
    });
    for (let step = 0; step < 4; step++) {
      activePage = await clickAndAdoptPopup(activePage, activeContext);
    }
    const page5 = activePage.url();
    const page2 = await clickAndAdoptPopup(initialPage, activeContext);
    const actual = { page5, page2: page2.url(), text: await page2.locator("body").innerText() };
    const expected = {
      page5: "https://browserbase.github.io/stagehand-eval-sites/sites/five-tab/page5.html",
      page2: "https://browserbase.github.io/stagehand-eval-sites/sites/five-tab/page2.html",
    };
    return {
      passed:
        actual.page5 === expected.page5 &&
        actual.page2 === expected.page2 &&
        actual.text.includes("You've made it to page 2"),
      expected,
      actual,
    };
  },
);

console.log("\nPLAYJEV × PUBLIC STAGEHAND FIXTURE EVALS");
console.table(
  results.map(({ name, passed, durationMs, error }) => ({
    name,
    passed,
    durationMs,
    error: error?.slice(0, 120) ?? "",
  })),
);
const passed = results.filter((result) => result.passed).length;
console.log(`${passed}/${results.length} passed`);
console.log(JSON.stringify({ passed, total: results.length, results }, null, 2));
process.exitCode = passed === results.length ? 0 : 1;
if (ownsBrowser) await browser.close();
process.exit(process.exitCode);

async function clickAndAdoptPopup(
  current: PlayJevPage,
  activeContext: BrowserContext,
): Promise<PlayJevPage> {
  const before = new Set(activeContext.pages());
  await current.act("Click the button to open the other page", {
    maxSteps: 1,
    minTargetConfidence: 0.25,
    minVerificationProbability: 0.25,
  });
  await current.waitForTimeout(400);
  const popup = activeContext.pages().find((candidate: Page) => !before.has(candidate));
  if (!popup) throw new Error("Expected the action to open a new tab");
  await popup.waitForLoadState("domcontentloaded");
  return playjev(popup);
}
