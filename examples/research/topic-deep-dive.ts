import { chromium, type Page } from "playwright";
import { playjev, type PlayJevPage } from "../../src/index.js";

interface LinkCandidate {
  key: string;
  text: string;
  href: string;
  path: string;
}

interface TrailEntry {
  depth: number;
  title: string;
  url: string;
  relevance: number;
  relevanceConfidence: number;
  onTopic: boolean;
  onTopicProbability: number;
  chosenLink?: { text: string; href: string; confidence: number };
}

const topic =
  "Scientific mechanisms, evidence, impacts, and mitigation of human-caused global climate change";
const searchQuery =
  "Wikipedia climate change global warming greenhouse effect carbon cycle impacts mitigation";
const maxDepth = Number(process.env.DEEP_CRAWL_DEPTH ?? 30);
const cdpUrl = process.env.PLAYJEV_CDP_URL ?? "http://127.0.0.1:9222";

const browser = await chromium.connectOverCDP(cdpUrl);
const defaultContext = browser.contexts()[0];
if (!defaultContext) throw new Error("Reusable Chrome has no default browser context");
const context = defaultContext;
await context.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
let rawPage: Page = await context.newPage();
let page = playjev(rawPage);
const visited = new Set<string>();
const rejected = new Set<string>();
const trail: TrailEntry[] = [];
let stopReason = `Reached requested depth ${maxDepth}`;
let acceptedAssessment:
  | {
      relevance: { answer: number; confidence: number };
      onTopic: { answer: boolean; probability: number };
    }
  | undefined;

try {
  console.log(`Topic: ${topic}`);
  console.log(`Google query: ${searchQuery}`);
  await page.goto(`https://www.google.com/search?hl=en&q=${encodeURIComponent(searchQuery)}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await waitForChallenge(page);

  const source = await page.choose(
    "Which result family is the best authoritative starting point for this scientific deep dive?",
    {
      wikipedia:
        "The English Wikipedia Climate change article, which provides a dense linked knowledge graph for a deep navigation test.",
      nasa: "An official NASA Science climate overview.",
      ipcc: "An official IPCC assessment synthesizing climate science.",
      other: "Another comprehensive climate-science overview with many substantive internal links.",
    },
  );
  console.log(`Starting source decision: ${source.answer} (${source.confidence.toFixed(2)})`);

  const sourceInstruction: Record<string, string> = {
    wikipedia: "Click the English Wikipedia result for Climate change",
    nasa: "Click the most relevant official NASA Science climate overview",
    ipcc: "Click the most relevant official IPCC climate assessment",
    other: "Click the most comprehensive climate-science overview with substantive internal links",
  };
  await page.act(sourceInstruction[source.answer] ?? sourceInstruction.other!, {
    maxSteps: 1,
    minTargetConfidence: 0.3,
    minVerificationProbability: 0.35,
  });
  await adoptNewestPage();
  await page.waitForLoadState("domcontentloaded");

  const researchHost = new URL(page.url()).hostname;
  console.log(`Research host: ${researchHost}`);

  crawl: for (let depth = 0; depth <= maxDepth; depth++) {
    const assessment = await assessCurrentPage(depth);
    trail.push(assessment);
    visited.add(canonical(page.url()));

    console.log(
      `[depth ${depth}] relevance=${assessment.relevance.toFixed(2)} ` +
        `onTopic=${assessment.onTopicProbability.toFixed(2)} ${assessment.title}`,
    );
    console.log(`          ${assessment.url}`);
    if (depth === maxDepth) break;

    let advanced = false;
    for (let attempt = 0; attempt < 8 && !advanced; attempt++) {
      const candidates = await internalLinkCandidates(page, researchHost, visited, rejected);
      if (candidates.length === 0) {
        stopReason = `No unvisited internal links remained at depth ${depth}`;
        break crawl;
      }

      const decision = await page.choose(
        `Choose the one unvisited internal link that most directly deepens this topic: ${topic}. ` +
          "Prefer substantive evidence, measurements, mechanisms, impacts, or scientific explanations. " +
          "Avoid navigation chrome, organizational pages, news indexes, unrelated missions, and broad home pages.",
        Object.fromEntries(
          candidates.map((candidate) => [
            candidate.key,
            `Visible internal link '${candidate.text}' leading to ${candidate.path}`,
          ]),
        ),
      );
      const selected = candidates.find((candidate) => candidate.key === decision.answer);
      if (!selected) throw new Error(`Jev selected an unknown link choice: ${decision.answer}`);

      assessment.chosenLink = {
        text: selected.text,
        href: selected.href,
        confidence: decision.confidence,
      };
      console.log(
        `          follow: ${selected.text} -> ${selected.path} (${decision.confidence.toFixed(2)})`,
      );

      const previousUrl = page.url();
      await page.act(
        `Click the visible internal link named ${selected.text} that leads to ${selected.path}`,
        { maxSteps: 1, minTargetConfidence: 0.25, minVerificationProbability: 0.3 },
      );
      await adoptNewestPage();
      await page.waitForLoadState("domcontentloaded");

      if (visited.has(canonical(page.url()))) {
        console.log(`          backtrack: destination resolved to an already visited page`);
        rejected.add(canonical(selected.href));
        await restorePage(previousUrl);
        continue;
      }

      const guard = await page.check(
        `Does this page remain substantively focused on this research topic: ${topic}?`,
      );
      const score = await page.rate(
        `How directly does this page advance the research topic: ${topic}?`,
        [
          "Unrelated",
          "Weakly adjacent",
          "Relevant background",
          "Directly relevant scientific detail",
          "Highly specific primary evidence or synthesis",
        ],
      );

      if (guard.probability >= 0.5 && score.answer >= 2) {
        acceptedAssessment = { relevance: score, onTopic: guard };
        advanced = true;
      } else {
        console.log(
          `          backtrack: topical guard=${guard.probability.toFixed(2)}, relevance=${score.answer.toFixed(2)}`,
        );
        rejected.add(canonical(selected.href));
        await restorePage(previousUrl);
      }
    }

    if (!advanced) {
      stopReason = `No candidate passed the topical guard beyond depth ${depth}`;
      break;
    }
  }

  const completedDepth = Math.max(0, trail.length - 1);
  const passed = completedDepth === maxDepth && trail.every((entry) => entry.onTopic);
  console.log("\nTOPIC-GUARDED DEEP-CRAWL REPORT");
  console.log(
    JSON.stringify(
      { passed, topic, requestedDepth: maxDepth, completedDepth, stopReason, trail },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error("Deep crawl stopped:", error);
  process.exitCode = 1;
  console.log("Reusable Chrome remains open for inspection.");
} finally {
  console.log("Detached from reusable Chrome; browser and cookies remain open.");
}

async function assessCurrentPage(depth: number): Promise<TrailEntry> {
  const cached = acceptedAssessment;
  acceptedAssessment = undefined;
  const relevance =
    cached?.relevance ??
    (await page.rate(`How directly does this page advance the research topic: ${topic}?`, [
      "Unrelated",
      "Weakly adjacent",
      "Relevant background",
      "Directly relevant scientific detail",
      "Highly specific primary evidence or synthesis",
    ]));
  const onTopic =
    cached?.onTopic ??
    (await page.check(`Is the main content substantively about this research topic: ${topic}?`));
  return {
    depth,
    title: await page.title(),
    url: page.url(),
    relevance: relevance.answer,
    relevanceConfidence: relevance.confidence,
    onTopic: onTopic.answer,
    onTopicProbability: onTopic.probability,
  };
}

async function internalLinkCandidates(
  target: PlayJevPage,
  host: string,
  seen: Set<string>,
  excluded: Set<string>,
): Promise<LinkCandidate[]> {
  const raw = await target.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const element = anchor as HTMLAnchorElement;
      const rect = element.getBoundingClientRect();
      return {
        text: (element.innerText || element.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim(),
        href: element.href,
        visible: rect.width > 0 && rect.height > 0,
      };
    }),
  );

  const unique = new Map<string, Omit<LinkCandidate, "key">>();
  for (const link of raw) {
    if (!link.visible || link.text.length < 4 || link.text.length > 180) continue;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== host) continue;
    if (host.endsWith("wikipedia.org") && !url.pathname.startsWith("/wiki/")) continue;
    if (/\/(Category|File|Help|Special|Talk|Portal|Template):/i.test(url.pathname)) continue;
    if (/\.(pdf|jpg|jpeg|png|zip)$/i.test(url.pathname)) continue;
    const normalized = canonical(url.href);
    if (seen.has(normalized) || excluded.has(normalized)) continue;
    if (/privacy|terms|contact|about|subscribe|login|search/i.test(url.pathname)) continue;
    if (!unique.has(normalized)) {
      unique.set(normalized, {
        text: link.text,
        href: url.href,
        path: `${url.pathname}${url.search}`,
      });
    }
  }

  const topicTerms = [
    "climate",
    "warming",
    "emission",
    "mitigation",
    "adaptation",
    "fossil",
    "energy",
    "radiative",
    "atmosphere",
    "weather",
    "environment",
    "ocean",
    "sea",
    "level",
    "ice",
    "glacier",
    "coast",
    "temperature",
    "greenhouse",
    "carbon",
    "water",
    "evidence",
    "satellite",
    "earth",
  ];
  const ranked = [...unique.values()].map((link, index) => {
    const haystack = `${link.text} ${link.path}`.toLowerCase();
    const score = topicTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { link, index, score };
  });
  ranked.sort((left, right) => right.score - left.score || left.index - right.index);

  return ranked.slice(0, 40).map(({ link }, index) => ({
    key: `link_${index + 1}`,
    ...link,
  }));
}

async function adoptNewestPage(): Promise<void> {
  await page.waitForTimeout(500);
  const pages = context.pages();
  const newest = pages.at(-1);
  if (newest && newest !== rawPage && !newest.isClosed()) {
    rawPage = newest;
    page = playjev(rawPage);
  }
}

async function waitForChallenge(target: PlayJevPage): Promise<void> {
  const challenged =
    target.url().includes("/sorry/") ||
    (await target
      .getByText(/why did this happen/i)
      .first()
      .isVisible()
      .catch(() => false));
  if (!challenged) return;
  console.log("Google challenge detected; waiting for manual completion in reusable Chrome...");
  await target.waitForFunction(
    () =>
      !window.location.pathname.includes("/sorry/") &&
      !document.body.innerText.toLowerCase().includes("why did this happen"),
    undefined,
    { timeout: 600_000, polling: 1_000 },
  );
}

async function restorePage(previousUrl: string): Promise<void> {
  if (canonical(page.url()) === canonical(previousUrl)) return;
  await page.goBack({ waitUntil: "commit", timeout: 15_000 }).catch(() => undefined);
  if (canonical(page.url()) !== canonical(previousUrl)) {
    await page.goto(previousUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
}

function canonical(value: string): string {
  const url = new URL(value);
  url.hash = "";
  if (url.hostname.endsWith("wikipedia.org")) url.search = "";
  url.pathname = decodeURIComponent(url.pathname);
  return url.toString().replace(/\/$/, "");
}

process.exit(process.exitCode ?? 0);
