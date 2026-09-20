import { defineConfig } from "vitepress";

export default defineConfig({
  title: "PlayJev",
  description: "Fast, typed browser automation powered by Jev and Playwright.",
  base: "/playjev/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/playjev/playjev-golden-logo.png" }],
    ["meta", { name: "theme-color", content: "#f5a623" }],
    [
      "meta",
      {
        property: "og:title",
        content: "PlayJev — Browser automation with decisions, not generation",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content: "A Playwright extension powered by Jev's bounded decision primitives.",
      },
    ],
  ],
  themeConfig: {
    logo: "/playjev/playjev-golden-logo.png",
    siteTitle: "PlayJev",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/playjev" },
      { text: "Evals", link: "/evals/" },
      { text: "Architecture", link: "/guide/architecture" },
      { text: "GitHub", link: "https://github.com/a7ul/playjev" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Core concepts", link: "/guide/concepts" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Bulk forms", link: "/guide/forms" },
            { text: "Production", link: "/guide/production" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API reference",
          items: [
            { text: "playjev()", link: "/api/playjev" },
            { text: "act()", link: "/api/act" },
            { text: "check()", link: "/api/check" },
            { text: "choose()", link: "/api/choose" },
            { text: "rate()", link: "/api/rate" },
          ],
        },
      ],
      "/evals/": [
        { text: "Evaluation suite", items: [{ text: "Results and methodology", link: "/evals/" }] },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/a7ul/playjev" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/a7ul/playjev/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 PlayJev contributors",
    },
  },
});
