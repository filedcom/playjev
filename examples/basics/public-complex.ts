import { chromium } from "playwright";
import { playjev } from "../../src/index.js";

const browser = await chromium.launch({ headless: true });

async function run(name: string, scenario: () => Promise<void>): Promise<void> {
  console.log(`\n=== ${name} ===`);
  try {
    await scenario();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

try {
  await run("Wikipedia: conceptual navigation", async () => {
    const page = playjev(await browser.newPage());
    await page.goto("https://en.wikipedia.org/wiki/William_Stanley_Jevons", {
      waitUntil: "domcontentloaded",
    });

    const emphasis = await page.rate(
      "How strongly does this page present Jevons as important to the development of modern economics?",
      [
        "Barely or not at all",
        "A secondary part of his biography",
        "One of several major themes",
        "The dominant historical significance presented by the page",
      ],
    );
    console.log("rate", emphasis);

    const contribution = await page.choose(
      "Which contribution is presented as most central to Jevons's historical reputation?",
      {
        marginal_utility: "The marginal utility theory of value and the marginal revolution",
        resource_paradox: "The observation that efficiency can increase resource consumption",
        logic_machines: "Mechanical logic devices and symbolic logic",
        weather_science: "Meteorology and weather forecasting",
      },
    );
    console.log("choose", contribution);

    const action = await page.act(
      "Open the link to the named paradox about efficiency improvements causing greater total resource consumption",
    );
    console.log("act", action);

    const arrived = await page.check(
      "Is the current page specifically about Jevons paradox and the relationship between efficiency and resource consumption?",
    );
    console.log("check", arrived);
    console.log("url", await page.url());
    await page.close();
  });

  await run("Hacker News: semantic story selection", async () => {
    const page = playjev(await browser.newPage());
    await page.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" });

    const technicalDensity = await page.rate(
      "How strongly are the visible top stories focused on concrete software, computing systems, programming tools, or technical research rather than politics or general-interest news?",
      ["Mostly non-technical", "A minority are technical", "A balanced mix", "Mostly technical"],
    );
    console.log("rate", technicalDensity);

    const dominantKind = await page.choose(
      "Which kind of content best characterizes the visible front-page stories as a group?",
      {
        project_releases:
          "Concrete software projects, releases, tools, and implementation write-ups",
        research: "Scientific or technical research and explanatory articles",
        business: "Companies, markets, funding, and product strategy",
        general_news: "Politics, culture, and broad general-interest news",
        mixed: "No single category clearly dominates",
      },
    );
    console.log("choose", dominantKind);

    const action = await page.act(
      "Open the highest-ranked visible story whose title most clearly describes a concrete software project, developer tool, programming system, or technical implementation rather than an opinion piece",
    );
    console.log("act", action);

    const leftFrontPage = await page.check(
      "Has the browser left the Hacker News front page and opened the selected story or its project page?",
    );
    console.log("check", leftFrontPage);
    console.log("url", await page.url());
    await page.close();
  });
} finally {
  await browser.close();
}
