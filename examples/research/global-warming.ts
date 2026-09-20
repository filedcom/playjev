import { chromium } from "playwright";
import { playjev, type PlayJevPage } from "../../src/index.js";

interface SourceAssessment {
  phase: string;
  query: string;
  selectedSource: string;
  discovery: "google" | "google-after-human-challenge";
  url: string;
  title: string;
  authoritative: boolean;
  authorityProbability: number;
  evidenceQuality: number;
  evidenceConfidence: number;
  answers: Array<{ question: string; answer: boolean; probability: number }>;
  headings: string[];
  evidenceSnippets: string[];
}

interface ResearchPhase {
  name: string;
  query: string;
  decision: string;
  choices: Record<string, string>;
  clickInstructions: Record<string, string>;
  checks: string[];
  evidenceTerms: string[];
}

const phases: ResearchPhase[] = [
  {
    name: "causes-and-evidence",
    query: "global warming causes evidence human activities scientific consensus NASA IPCC",
    decision:
      "Which search-result source is the strongest primary authority for establishing the causes and physical evidence of global warming?",
    choices: {
      nasa: "An official NASA climate result explaining evidence or causes.",
      ipcc: "An official IPCC report or synthesis explaining attribution and physical evidence.",
      noaa: "An official NOAA result explaining observed warming and its causes.",
      other: "A different result is substantially more authoritative and directly relevant.",
    },
    clickInstructions: {
      nasa: "Click the most relevant official NASA result about evidence or causes of global warming",
      ipcc: "Click the most relevant official IPCC result about the causes and evidence of global warming",
      noaa: "Click the most relevant official NOAA result about the causes and evidence of global warming",
      other:
        "Click the most authoritative primary scientific result explaining the causes and evidence of global warming",
    },
    checks: [
      "Does this page attribute recent global warming primarily to human activities such as greenhouse-gas emissions?",
      "Does this page present observed physical evidence of warming rather than only opinion or advocacy?",
      "Does this page explain the role of carbon dioxide or other greenhouse gases?",
    ],
    evidenceTerms: ["human", "carbon dioxide", "greenhouse", "temperature", "evidence", "warming"],
  },
  {
    name: "impacts-and-risks",
    query: "global warming impacts risks extreme heat sea level ecosystems IPCC report",
    decision:
      "Which result is the strongest primary scientific synthesis of present and future global-warming impacts?",
    choices: {
      ipcc: "An official IPCC assessment or synthesis report covering impacts and risks.",
      nasa: "An official NASA climate result describing effects of climate change.",
      noaa: "An official NOAA result describing observed climate impacts.",
      other: "A different primary scientific or intergovernmental source is more comprehensive.",
    },
    clickInstructions: {
      ipcc: "Click the official IPCC result that most directly covers climate impacts and risks",
      nasa: "Click the official NASA result that most directly covers the effects of climate change",
      noaa: "Click the official NOAA result that most directly covers climate impacts",
      other:
        "Click the most authoritative primary result covering global-warming impacts and risks",
    },
    checks: [
      "Does this page discuss increasing risks from extreme heat or other weather extremes?",
      "Does this page discuss sea-level rise, ice loss, or coastal risk?",
      "Does this page describe risks to ecosystems, people, food, water, health, or infrastructure?",
    ],
    evidenceTerms: ["risk", "extreme", "sea level", "ecosystem", "health", "water", "food"],
  },
  {
    name: "mitigation-and-response",
    query: "IPCC climate mitigation solutions renewable energy efficiency methane emissions report",
    decision:
      "Which result provides the strongest primary synthesis of practical global-warming mitigation options?",
    choices: {
      ipcc: "An official IPCC mitigation report or synthesis.",
      un: "An official United Nations climate page summarizing mitigation actions.",
      iea: "An official International Energy Agency analysis of clean-energy transitions.",
      other: "A different primary institutional source is more directly useful.",
    },
    clickInstructions: {
      ipcc: "Click the official IPCC result most directly about mitigation options and emissions reduction",
      un: "Click the official United Nations result most directly about climate mitigation solutions",
      iea: "Click the official International Energy Agency result most directly about clean-energy climate mitigation",
      other:
        "Click the most authoritative primary result about practical climate mitigation solutions",
    },
    checks: [
      "Does this page describe reducing greenhouse-gas emissions as necessary to limit warming?",
      "Does this page discuss renewable energy, energy efficiency, electrification, methane reduction, or related mitigation measures?",
      "Does this page indicate that multiple sectors or a portfolio of actions must change?",
    ],
    evidenceTerms: [
      "mitigation",
      "emissions",
      "renewable",
      "efficiency",
      "methane",
      "energy",
      "sector",
    ],
  },
];

const cdpUrl = process.env.PLAYJEV_CDP_URL;
const ownsBrowser = !cdpUrl;
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({
      channel: "chrome",
      headless: process.env.HEADED !== "true",
      ...(process.env.HEADED === "true" ? { slowMo: 180 } : {}),
    });
const context =
  browser.contexts()[0] ??
  (await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } }));
await context.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
const page = playjev(await context.newPage());
const assessments: SourceAssessment[] = [];

async function runPhase(phase: ResearchPhase, index: number): Promise<void> {
  console.log(`\n[${index + 1}/${phases.length}] ${phase.name}`);
  console.log(`Google query: ${phase.query}`);

  if (index === 0) {
    await page.goto("https://www.google.com/?hl=en", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await dismissGoogleConsent(page);
    await waitForGoogleSearch(page);
    await page.act("Fill the Google search box with the supplied research query", {
      value: phase.query,
      maxSteps: 1,
      minTargetConfidence: 0.35,
    });
    await page.act("Press Enter in the Google search box to run the research query", {
      key: "Enter",
      maxSteps: 1,
      minTargetConfidence: 0.35,
      minVerificationProbability: 0.35,
    });
    await page.waitForLoadState("domcontentloaded");
  } else {
    await page.goto(`https://www.google.com/search?hl=en&q=${encodeURIComponent(phase.query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await dismissGoogleConsent(page);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  }

  const solvedChallenge = await waitForGoogleChallenge(page);
  const discovery: SourceAssessment["discovery"] = solvedChallenge
    ? "google-after-human-challenge"
    : "google";

  const resultQuality = await page.rate(
    "How well does this Google results page provide authoritative primary sources for the stated research query?",
    [
      "Poor: mostly irrelevant, commercial, or secondary results",
      "Mixed: at least one useful source but weak overall",
      "Good: several relevant authoritative sources",
      "Excellent: direct primary scientific or institutional sources",
    ],
  );
  console.log(
    `SERP quality score: ${resultQuality.answer} (${resultQuality.confidence.toFixed(2)} confidence)`,
  );

  const sourceDecision = await page.choose(phase.decision, phase.choices);
  const selectedSource = sourceDecision.answer;
  console.log(
    `Chosen source family: ${sourceDecision.answer} (${sourceDecision.confidence.toFixed(2)} confidence)`,
  );

  const clickInstruction =
    phase.clickInstructions[sourceDecision.answer] ?? phase.clickInstructions.other!;
  await page.act(clickInstruction, {
    maxSteps: 1,
    minTargetConfidence: 0.3,
    minVerificationProbability: 0.35,
  });
  await page.waitForLoadState("domcontentloaded");

  const authoritative = await page.check(
    "Is this an authoritative primary scientific, governmental, or intergovernmental source rather than a search page, advertisement, or general opinion article?",
  );
  const evidenceQuality = await page.rate(
    `How useful is this source for the research phase '${phase.name}'?`,
    [
      "Not useful",
      "Tangential or unsupported",
      "Relevant overview",
      "Strong primary evidence or synthesis",
      "Definitive and directly applicable primary source",
    ],
  );

  const answers = [];
  for (const question of phase.checks) {
    const answer = await page.check(question);
    answers.push({ question, answer: answer.answer, probability: answer.probability });
    console.log(
      `  ${answer.answer ? "YES" : "NO "} ${answer.probability.toFixed(2)} — ${question}`,
    );
  }

  assessments.push({
    phase: phase.name,
    query: phase.query,
    selectedSource,
    discovery,
    url: page.url(),
    title: await page.title(),
    authoritative: authoritative.answer,
    authorityProbability: authoritative.probability,
    evidenceQuality: evidenceQuality.answer,
    evidenceConfidence: evidenceQuality.confidence,
    answers,
    headings: await visibleHeadings(page),
    evidenceSnippets: await relevantSentences(page, phase.evidenceTerms),
  });
}

async function dismissGoogleConsent(target: PlayJevPage): Promise<void> {
  const candidates = [
    target.getByRole("button", { name: /accept all|godkänn alla/i }),
    target.getByRole("button", { name: /reject all|avvisa alla/i }),
    target.getByRole("button", { name: /i agree/i }),
  ];
  for (const candidate of candidates) {
    if (
      await candidate
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await candidate.first().click();
      return;
    }
  }
}

async function waitForGoogleSearch(target: PlayJevPage): Promise<void> {
  await target
    .locator('textarea[name="q"], input[name="q"]')
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await target.waitForTimeout(300);
}

async function waitForGoogleChallenge(target: PlayJevPage): Promise<boolean> {
  const challenged =
    target.url().includes("/sorry/") ||
    (await target
      .getByText(/why did this happen/i)
      .first()
      .isVisible()
      .catch(() => false));
  if (!challenged) return false;

  console.log(
    "Google challenge is open. Waiting up to 10 minutes for you to solve it in Chrome...",
  );
  await target.waitForFunction(
    () =>
      !window.location.pathname.includes("/sorry/") &&
      !document.body.innerText.toLowerCase().includes("why did this happen"),
    undefined,
    { timeout: 600_000, polling: 1_000 },
  );
  await target.waitForLoadState("domcontentloaded");
  console.log("Challenge cleared; resuming PlayJev research.");
  return true;
}

async function visibleHeadings(target: PlayJevPage): Promise<string[]> {
  const headings = await target
    .locator("h1, h2, h3")
    .allInnerTexts()
    .catch(() => []);
  return [...new Set(headings.map(clean).filter(Boolean))].slice(0, 12);
}

async function relevantSentences(target: PlayJevPage, terms: string[]): Promise<string[]> {
  const text = await target
    .locator("main, article, body")
    .first()
    .innerText()
    .catch(() => "");
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter((sentence) => sentence.length >= 60 && sentence.length <= 420);
  const ranked = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: terms.reduce(
      (total, term) => total + (sentence.toLowerCase().includes(term.toLowerCase()) ? 1 : 0),
      0,
    ),
  }));
  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  return [
    ...new Set(ranked.filter((entry) => entry.score > 0).map((entry) => entry.sentence)),
  ].slice(0, 8);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

try {
  for (let index = 0; index < phases.length; index++) {
    await runPhase(phases[index]!, index);
  }

  const passed =
    assessments.length === phases.length &&
    assessments.every(
      (assessment) =>
        assessment.authoritative &&
        assessment.answers.filter((answer) => answer.answer).length >= 2,
    );

  console.log("\nGLOBAL WARMING RESEARCH REPORT");
  console.log(JSON.stringify({ passed, sources: assessments }, null, 2));
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error("Research run stopped:", error);
  process.exitCode = 1;
  if (process.env.HEADED === "true") {
    console.log("Interactive mode: leaving Chrome open. Press Ctrl+C in the runner to close it.");
    await new Promise<void>((resolve) => process.once("SIGINT", resolve));
  }
} finally {
  if (ownsBrowser) {
    await browser.close();
  } else {
    console.log("Reusable Chrome remains open with its persistent English profile.");
  }
}

// A CDP connection keeps Node's socket alive. Exiting detaches this runner
// without sending Browser.close to the externally managed reusable Chrome.
if (!ownsBrowser) process.exit(process.exitCode ?? 0);
