import type { Page } from "playwright";
import { PlayJev } from "../core/playjev.js";
import type {
  ActOptions,
  ActResult,
  CheckResult,
  ChooseResult,
  PlayJevOptions,
  RateResult,
} from "../types/index.js";

export interface PlayJevPageMethods {
  act(instruction: string, options?: ActOptions): Promise<ActResult>;
  check(question: string): Promise<CheckResult>;
  choose(question: string, choices: Record<string, unknown>): Promise<ChooseResult>;
  rate(question: string, scale: unknown[]): Promise<RateResult>;
}

export type PlayJevPage = Omit<Page, keyof PlayJevPageMethods> & PlayJevPageMethods;

/**
 * Add Jev-native control methods to an existing Playwright Page while keeping
 * Playwright's Page API on the same object. The legacy page.check(selector)
 * shorthand is intentionally replaced; locator.check() remains available.
 */
export function playjev(page: Page, options: PlayJevOptions = {}): PlayJevPage {
  const engine = new PlayJev(page, options);
  const methods: PlayJevPageMethods = {
    act: engine.act.bind(engine),
    check: engine.check.bind(engine),
    choose: engine.choose.bind(engine),
    rate: engine.rate.bind(engine),
  };

  return new Proxy(page as unknown as PlayJevPage, {
    get(target, property, receiver) {
      if (property in methods) {
        return Reflect.get(methods, property, methods);
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
