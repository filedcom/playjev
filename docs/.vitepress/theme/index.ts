import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import HomeContent from "./HomeContent.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("HomeContent", HomeContent);
  },
} satisfies Theme;
