import { chromium } from "playwright";
import { playjev } from "../../src/index.js";

const browser = await chromium.launch({ headless: true });

try {
  const page = playjev(await browser.newPage());
  await page.goto("https://browserbase.github.io/stagehand-eval-sites/sites/iframe-form-filling/", {
    waitUntil: "domcontentloaded",
  });

  const result = await page.act("Complete the contact form", {
    fields: {
      "First Name": "Nunya",
      "Last Name": "Business",
      Email: "test@example.com",
      "Preferred Contact Method": "Phone",
      Message: "Hello from PlayJev",
    },
  });

  console.log({
    success: result.success,
    verificationProbability: result.verificationProbability,
    operations: result.actions.map(({ operation, target }) => ({
      operation,
      role: target.role,
      name: target.name,
    })),
  });
} finally {
  await browser.close();
}
