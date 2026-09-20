import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { playjev, type PlayJevPage } from "../../src/index.js";

interface GoldenTask {
  id: string;
  site: string;
  instruction: string;
  reference: string;
  run(page: PlayJevPage): Promise<{ answer: string; verified: boolean; probability: number }>;
}

interface TaskResult {
  id: string;
  site: string;
  instruction: string;
  reference: string;
  answer?: string;
  passed: boolean;
  probability?: number;
  durationMs: number;
  screenshot?: string;
  error?: string;
}

const outputDirectory = path.resolve(
  process.env.WEBVOYAGER_OUTPUT_DIR ?? "eval-results/webvoyager",
);
const filter = process.env.EVAL_FILTER?.toLowerCase();
const headed = process.env.HEADED === "true";
const browser = await chromium.launch({
  headless: !headed,
  ...(headed ? { slowMo: 100 } : {}),
});
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1280, height: 720 },
});
await mkdir(outputDirectory, { recursive: true });

const tasks: GoldenTask[] = [
  {
    id: "Cambridge Dictionary--0",
    site: "Cambridge Dictionary",
    instruction:
      'Look up the pronunciation and definition of the word "sustainability" on the Cambridge Dictionary.',
    reference:
      "UK: /səˌsteɪ.nəˈbɪl.ə.ti/, US: /səˌsteɪ.nəˈbɪl.ə.t̬i/; the quality of being able to continue over a period of time",
    async run(page) {
      await page.goto("https://dictionary.cambridge.org/", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await requireAction(page, "Fill the main dictionary search box with the supplied word", {
        value: "sustainability",
      });
      await requireAction(page, "Press Enter in the dictionary search box to search", {
        key: "Enter",
      });
      await page.waitForLoadState("domcontentloaded");
      const body = await page.locator("body").innerText();
      const uk = body.match(/UK\s+\/(səˌsteɪ\.nəˈbɪl\.ə\.ti)\//u)?.[1];
      const us = body.match(/US\s+\/(səˌsteɪ\.nəˈbɪl\.ə\.t̬i)\//u)?.[1];
      const definition = body.match(
        /the quality of being able to continue over a period of time/iu,
      )?.[0];
      if (!uk || !us || !definition)
        throw new Error("Expected pronunciation or definition is absent");
      const check = await page.check(
        "Does this page show the UK and US pronunciation and a definition for sustainability?",
      );
      return {
        answer: `UK: /${uk}/, US: /${us}/; ${definition}`,
        verified: check.answer,
        probability: check.probability,
      };
    },
  },
  {
    id: "ArXiv--10",
    site: "ArXiv",
    instruction:
      "Visit ArXiv Help on how to withdraw an article if the submission is not yet announced.",
    reference:
      "If your submission has not yet become publicly available you may delete or delay it. Go to your user page and select Delete or Unsubmit.",
    async run(page) {
      await page.goto("https://arxiv.org/", { waitUntil: "domcontentloaded", timeout: 45_000 });
      await requireAction(page, "Click the Help link");
      await page.waitForLoadState("domcontentloaded");
      await requireAction(page, "Click the Withdraw an Article help link");
      await page.waitForLoadState("domcontentloaded");
      const body = await page.locator("body").innerText();
      const answer = body.match(
        /If your submission has not yet become publicly available you may delete or delay it\.[\s\S]*?Unsubmit[^.]*\./i,
      )?.[0];
      if (!answer) throw new Error("Expected unannounced-submission instructions are absent");
      const check = await page.check(
        "Does this page explain that an unannounced submission can be deleted or delayed from the user page using Delete or Unsubmit?",
      );
      return { answer: compact(answer), verified: check.answer, probability: check.probability };
    },
  },
  {
    id: "GitHub--3",
    site: "GitHub",
    instruction:
      "Find out how much more package storage the Enterprise version has over Team in GitHub Pricing.",
    reference: "48GB",
    async run(page) {
      await page.goto("https://github.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
      await requireAction(page, "Click the Pricing link in the GitHub navigation");
      await page.waitForLoadState("domcontentloaded");
      const body = await page.locator("body").innerText();
      const storage = [...body.matchAll(/(\d+)GB of Packages storage/g)].map((match) =>
        Number(match[1]),
      );
      if (!storage.includes(2) || !storage.includes(50)) {
        throw new Error(`Expected Team and Enterprise storage values are absent: ${storage}`);
      }
      const answer = `${Math.max(...storage) - Math.min(...storage)}GB`;
      const check = await page.check(
        "Does this page show Team with 2GB and Enterprise with 50GB of Packages storage, a difference of 48GB?",
      );
      return { answer, verified: check.answer, probability: check.probability };
    },
  },
  {
    id: "Wolfram Alpha--0",
    site: "Wolfram Alpha",
    instruction: "derivative of x^2 when x=5.6",
    reference: "11.2",
    async run(page) {
      await page.goto("https://www.wolframalpha.com/", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await requireAction(page, "Fill the main Wolfram Alpha calculation input", {
        value: "derivative of x^2 when x=5.6",
      });
      await requireAction(page, "Press Enter in the main calculation input to compute the result", {
        key: "Enter",
      });
      await page.waitForURL(/\/input\?/i, { timeout: 15_000 });
      await page.waitForTimeout(3_000);
      const answerVisible = await page
        .locator('img[alt="11.2"]')
        .isVisible()
        .catch(() => false);
      if (!answerVisible) throw new Error("Expected Wolfram Alpha result image with alt text 11.2");
      const check = await page.check(
        "Does this page show that the derivative of x squared at x equals 5.6 is 11.2?",
      );
      return { answer: "11.2", verified: check.answer, probability: check.probability };
    },
  },
];

const selectedTasks = tasks.filter((task) => !filter || task.id.toLowerCase().includes(filter));
if (selectedTasks.length === 0) throw new Error(`No golden task matches EVAL_FILTER=${filter}`);

const results: TaskResult[] = [];
try {
  for (const task of selectedTasks) results.push(await evaluateTask(context, task));
} finally {
  await browser.close();
}

const report = {
  benchmark: "WebVoyager official golden smoke",
  upstream: {
    repository: "https://github.com/MinorJerry/WebVoyager",
    commit: "5a7896738c10bfb8b9edccce6bb0e0411f8ae569",
    license: "Apache-2.0",
  },
  generatedAt: new Date().toISOString(),
  passed: results.filter(({ passed }) => passed).length,
  total: results.length,
  results,
};
await writeFile(path.join(outputDirectory, "results.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log("\nPLAYJEV × WEBVOYAGER OFFICIAL GOLDEN SMOKE");
console.table(
  results.map(({ id, passed, probability, durationMs, error }) => ({
    id,
    passed,
    probability: probability?.toFixed(2) ?? "",
    durationMs,
    error: error ?? "",
  })),
);
console.log(`${report.passed}/${report.total} passed`);
console.log(`Artifacts: ${outputDirectory}`);
process.exitCode = report.passed === report.total ? 0 : 1;

async function evaluateTask(context: BrowserContext, task: GoldenTask): Promise<TaskResult> {
  const started = Date.now();
  const rawPage = await context.newPage();
  const page = playjev(rawPage, { requestTimeoutMs: 20_000, maxRetries: 1 });
  process.stdout.write(`Running ${task.id}... `);
  try {
    const outcome = await task.run(page);
    const screenshot = path.join(outputDirectory, `${safeName(task.id)}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    const passed = outcome.verified && equivalent(outcome.answer, task.reference);
    console.log(passed ? "PASS" : "FAIL");
    return {
      id: task.id,
      site: task.site,
      instruction: task.instruction,
      reference: task.reference,
      answer: outcome.answer,
      passed,
      probability: outcome.probability,
      durationMs: Date.now() - started,
      screenshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`ERROR: ${message}`);
    return {
      id: task.id,
      site: task.site,
      instruction: task.instruction,
      reference: task.reference,
      passed: false,
      durationMs: Date.now() - started,
      error: message,
    };
  } finally {
    await rawPage.close().catch(() => undefined);
  }
}

async function requireAction(
  page: PlayJevPage,
  instruction: string,
  input: { value?: string; key?: string } = {},
): Promise<void> {
  const result = await page.act(instruction, {
    ...input,
    maxSteps: 1,
    minTargetConfidence: 0.2,
    minVerificationProbability: 0.25,
  });
  if (result.actions.length !== 1) throw new Error(`No action executed: ${instruction}`);
}

function equivalent(answer: string, reference: string): boolean {
  const normalizedAnswer = compact(answer).toLowerCase();
  const normalizedReference = compact(reference).toLowerCase();
  if (normalizedAnswer === normalizedReference) return true;
  if (
    normalizedAnswer.includes(normalizedReference) ||
    normalizedReference.includes(normalizedAnswer)
  ) {
    return true;
  }
  const referenceTerms = normalizedReference.match(/[\p{L}\p{N}]+/gu) ?? [];
  return referenceTerms
    .filter((term) => term.length > 2)
    .every((term) => normalizedAnswer.includes(term));
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
