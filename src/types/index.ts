import type { Page } from "playwright";

export type JevQuestion =
  | {
      type: "noul";
      instructions: unknown;
      criteria?: { true: unknown; false: unknown };
    }
  | {
      type: "choice";
      instructions: unknown;
      criteria: Record<string, unknown>;
    }
  | {
      type: "score";
      instructions: unknown;
      criteria: unknown[];
    };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | {
      type: "score";
      score: number;
      probabilities: Record<string, number>;
      confidence: number;
      legend: Record<string, string>;
    };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface BrowserNode {
  id: string;
  axId: string;
  backendNodeId?: number;
  role: string;
  name?: string;
  description?: string;
  value?: string;
  url?: string;
  /** Internal Playwright selector for controls captured from a child frame. */
  selector?: string;
  /** Internal URL identifying the child frame that owns selector. */
  frameUrl?: string;
  /** Internal stable ordinal for resolving the child frame after model latency. */
  frameIndex?: number;
  disabled?: boolean;
  expanded?: boolean;
  checked?: boolean | "mixed";
  selected?: boolean;
  parentId?: string;
  children: BrowserNode[];
}

export interface BrowserModelNode {
  n: number;
  parent: number | null;
  type: string;
  text?: string;
  value?: string;
  url?: string;
  frame?: string;
  state?: string[];
  actionable?: true;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  tree: BrowserNode[];
  formattedTree: string;
  byId: Map<string, BrowserNode>;
  modelTree: BrowserModelNode[];
  byNumber: Map<number, BrowserNode>;
  numberById: Map<string, number>;
}

export type BrowserOperation =
  "click" | "fill" | "type" | "press" | "selectOption" | "hover" | "scrollIntoView";

export interface ActOptions {
  value?: string;
  /** Fill several labelled form controls in one batched Jev decision. */
  fields?: Record<string, string | number | boolean>;
  key?: string;
  maxSteps?: number;
  minTargetConfidence?: number;
  minVerificationProbability?: number;
}

export interface ActStep {
  target: BrowserNode;
  selector: string;
  operation: BrowserOperation;
  targetScore: number;
  targetConfidence: number;
  operationConfidence: number;
}

export interface ActResult {
  success: boolean;
  actions: ActStep[];
  verificationProbability: number;
}

export interface CheckResult {
  answer: boolean;
  probability: number;
}

export interface ChooseResult {
  answer: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface RateResult {
  answer: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface PlayJevOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Timeout for each Jev HTTP attempt. Defaults to 30 seconds. */
  requestTimeoutMs?: number;
  /** Retries for transient network, 429, and 5xx responses. Defaults to 2. */
  maxRetries?: number;
  /** Maximum Chromium accessibility-tree depth captured per snapshot. Defaults to 24. */
  snapshotMaxDepth?: number;
  minTargetConfidence?: number;
}

export interface PageBinding {
  page: Page;
}
