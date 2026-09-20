import { chromium } from "playwright";
import { playjev } from "../../src/index.js";

const browser = await chromium.launch({ headless: true });
try {
  const page = playjev(await browser.newPage());
  await page.goto("https://example.com");

  const relevance = await page.rate("How relevant is this page to explaining example domains?", [
    "Unrelated",
    "Somewhat related",
    "Directly relevant",
  ]);
  console.log(relevance);

  const result = await page.act("Click the link that explains this example domain");
  console.log(result);

  const answer = await page.check("Is the IANA-managed domains page open?");
  console.log(answer);
} finally {
  await browser.close();
}
