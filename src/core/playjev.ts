import type { Locator, Page } from "playwright";
import { JevClient } from "../jev/client.js";
import {
  actionableNodes,
  ancestorContext,
  captureSnapshot,
  resolveXPath,
} from "../browser/snapshot.js";
import type {
  ActOptions,
  ActResult,
  CheckResult,
  ChooseResult,
  RateResult,
  BrowserNode,
  BrowserOperation,
  BrowserSnapshot,
  JevAnswer,
  JevQuestion,
  PlayJevOptions,
} from "../types/index.js";
import { yamlState } from "../serialization/yaml.js";

const NONE = "none";
const MAX_CHOICES = 240;
const MAX_RANK_BATCH = 24;
const TARGET_SHORTLIST_SIZE = 40;
const MAX_PREFILTERED_TARGETS = 96;

export class PlayJev {
  readonly page: Page;
  readonly jev: JevClient;
  readonly minTargetConfidence: number;

  constructor(page: Page, options: PlayJevOptions = {}) {
    const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new Error("Pass apiKey or set TYPESAFE_API_KEY");
    this.page = page;
    this.jev = new JevClient({
      apiKey,
      ...(options.model ? { model: options.model } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs }),
      ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    });
    this.minTargetConfidence = options.minTargetConfidence ?? 0.55;
  }

  private snapshot(): Promise<BrowserSnapshot> {
    return captureSnapshot(this.page);
  }

  async act(instruction: string, options: ActOptions = {}): Promise<ActResult> {
    if (options.fields) return this.actFields(instruction, options);
    let before = await this.snapshot();
    const actions: ActResult["actions"] = [];
    const minVerificationProbability = options.minVerificationProbability ?? 0.5;
    const maxSteps = options.maxSteps ?? 2;
    let verificationProbability = 0;

    for (let step = 0; step < maxSteps; step++) {
      const rankedTargets = await this.rankTargets(before, instruction);
      const bestScore = rankedTargets[0]?.score ?? 0;
      const shortlist = rankedTargets
        .filter((entry) => entry.score >= bestScore - 0.45)
        .slice(0, TARGET_SHORTLIST_SIZE);
      const targetDecision = await this.chooseTarget(
        before,
        instruction,
        shortlist.map((entry) => entry.node),
      );
      debug("target decision", {
        instruction,
        shortlist: shortlist.map((entry) => ({
          node: before.numberById.get(entry.node.id),
          type: entry.node.role,
          text: entry.node.name,
          score: entry.score,
          confidence: entry.confidence,
        })),
        decision: targetDecision,
      });
      const minTargetConfidence = options.minTargetConfidence ?? this.minTargetConfidence;
      if (targetDecision.confidence < minTargetConfidence) {
        throw new Error(
          `Jev target confidence ${targetDecision.confidence.toFixed(3)} is below ${minTargetConfidence}`,
        );
      }
      if (targetDecision.choice === NONE) throw new Error("Jev found no suitable browser target");

      const targetNumber = Number(targetDecision.choice);
      const selectedTarget = before.byNumber.get(targetNumber);
      if (!selectedTarget || (!selectedTarget.backendNodeId && !selectedTarget.selector)) {
        throw new Error(`Selected target is not actionable: ${targetDecision.choice}`);
      }
      let target: BrowserNode = selectedTarget;
      const targetScore =
        rankedTargets.find((entry) => entry.node.id === selectedTarget.id)?.score ?? 0;
      const operationDecision = await this.chooseOperation(before, instruction, target, options);
      const operation = operationDecision.choice as BrowserOperation;
      let selector: string;
      let locator: Locator;
      if (target.selector && target.frameIndex !== undefined) {
        const ownerFrame = this.page.frames().filter((frame) => frame !== this.page.mainFrame())[
          target.frameIndex
        ];
        if (!ownerFrame)
          throw new Error(`Unable to find selected child frame ${target.frameIndex}`);
        selector = `frame(${target.frameUrl}) >> ${target.selector}`;
        locator = ownerFrame.locator(target.selector);
      } else {
        const semantic = accessibleLocator(this.page, target);
        if (semantic && (await semantic.count()) === 1) {
          selector = `role=${target.role}[name=${JSON.stringify(target.name)}]`;
          locator = semantic;
        } else {
          try {
            selector = `xpath=${await resolveXPath(this.page, target.backendNodeId!)}`;
            locator = this.page.locator(selector);
          } catch (error) {
            if (!isStaleBackendNode(error)) throw error;
            const reboundSemantic = accessibleLocator(this.page, target);
            if (reboundSemantic && (await reboundSemantic.count()) === 1) {
              selector = `role=${target.role}[name=${JSON.stringify(target.name)}]`;
              locator = reboundSemantic;
              debug("rebound stale target through unique accessible identity", {
                type: target.role,
                text: target.name,
              });
            } else {
              let fresh: BrowserSnapshot | undefined;
              let matches: BrowserNode[] = [];
              for (let attempt = 0; attempt < 10; attempt++) {
                await this.page.waitForTimeout(200);
                fresh = await this.snapshot();
                matches = actionableNodes(fresh).filter((candidate) =>
                  sameSemanticTarget(candidate, target),
                );
                if (matches.length === 1 && matches[0]!.backendNodeId) break;
              }
              if (!fresh || matches.length !== 1 || !matches[0]!.backendNodeId) {
                throw new Error(
                  `Selected node became stale and could not be uniquely rebound (${matches.length} matches)`,
                  { cause: error },
                );
              }
              before = fresh;
              target = matches[0]!;
              selector = `xpath=${await resolveXPath(this.page, target.backendNodeId!)}`;
              locator = this.page.locator(selector);
              debug("rebound stale target", {
                node: fresh.numberById.get(target.id),
                type: target.role,
                text: target.name,
              });
            }
          }
        }
      }
      await execute(locator, operation, instruction, options);
      await this.page.waitForTimeout(150);

      actions.push({
        target,
        selector,
        operation,
        targetScore,
        targetConfidence: targetDecision.confidence,
        operationConfidence: operationDecision.confidence,
      });

      const after = await this.snapshot();
      verificationProbability = await this.verifyAction(before, after, instruction, actions);
      if (verificationProbability >= minVerificationProbability) {
        return { success: true, actions, verificationProbability };
      }
      before = after;
    }

    return { success: false, actions, verificationProbability };
  }

  private async actFields(instruction: string, options: ActOptions): Promise<ActResult> {
    const fields = Object.entries(options.fields ?? {});
    if (fields.length === 0) throw new Error("act fields must contain at least one field");

    const before = await this.snapshot();
    const allCandidates = actionableNodes(before);
    const candidatesByField = fields.map(([label, value]) =>
      prefilterCandidates(before, `${label} ${String(value)}`, allCandidates, 32),
    );
    const questions: Record<string, JevQuestion> = Object.fromEntries(
      fields.map(([label, value], index) => [
        `field_${index}`,
        targetQuestion(
          before,
          `Set the form field labelled or described as ${JSON.stringify(label)} to the supplied value ${JSON.stringify(value)}`,
          candidatesByField[index]!,
        ),
      ]),
    );
    const response = await this.jev.evaluate(
      yamlState({
        requested_action: instruction,
        fields: Object.fromEntries(fields),
        candidates_by_field: Object.fromEntries(
          fields.map(([label], index) => [
            label,
            candidatesByField[index]!.map((node) => candidateContext(before, node)),
          ]),
        ),
      }),
      questions,
    );

    const minTargetConfidence = options.minTargetConfidence ?? this.minTargetConfidence;
    const selections = fields.map(([label, value], index) => {
      const decision = asChoice(response.answers[`field_${index}`]);
      if (decision.confidence < minTargetConfidence) {
        throw new Error(
          `Jev target confidence for ${label} (${decision.confidence.toFixed(3)}) is below ${minTargetConfidence}`,
        );
      }
      if (decision.choice === NONE)
        throw new Error(`Jev found no suitable target for field: ${label}`);
      const target = before.byNumber.get(Number(decision.choice));
      if (!target || (!target.backendNodeId && !target.selector)) {
        throw new Error(`Selected target for ${label} is not actionable: ${decision.choice}`);
      }
      return { label, value, target, decision };
    });
    const selectedIds = selections.map(({ target }) => target.id);
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error("Jev assigned more than one form field to the same browser control");
    }

    const actions: ActResult["actions"] = [];
    for (const { label, value, target, decision } of selections) {
      const { locator, selector } = await this.locateTarget(target);
      const operation = await setFormControl(locator, target, value);
      actions.push({
        target,
        selector,
        operation,
        targetScore: 0,
        targetConfidence: decision.confidence,
        operationConfidence: 1,
      });
      debug("bulk field completed", {
        field: label,
        target: before.numberById.get(target.id),
        type: target.role,
        operation,
      });
    }

    await this.page.waitForTimeout(150);
    const after = await this.snapshot();
    const verificationProbability = await this.verifyAction(
      before,
      after,
      instruction,
      actions,
      Object.fromEntries(fields),
    );
    const minVerificationProbability = options.minVerificationProbability ?? 0.5;
    return {
      success: verificationProbability >= minVerificationProbability,
      actions,
      verificationProbability,
    };
  }

  private async locateTarget(target: BrowserNode): Promise<{ locator: Locator; selector: string }> {
    if (target.selector && target.frameIndex !== undefined) {
      const ownerFrame = this.page.frames().filter((frame) => frame !== this.page.mainFrame())[
        target.frameIndex
      ];
      if (!ownerFrame) throw new Error(`Unable to find selected child frame ${target.frameIndex}`);
      return {
        selector: `frame(${target.frameUrl}) >> ${target.selector}`,
        locator: ownerFrame.locator(target.selector),
      };
    }
    const semantic = accessibleLocator(this.page, target);
    if (semantic && (await semantic.count()) === 1) {
      return {
        selector: `role=${target.role}[name=${JSON.stringify(target.name)}]`,
        locator: semantic,
      };
    }
    if (!target.backendNodeId)
      throw new Error(`Target ${target.id} has no resolvable browser identity`);
    const selector = `xpath=${await resolveXPath(this.page, target.backendNodeId)}`;
    return { selector, locator: this.page.locator(selector) };
  }

  async check(question: string): Promise<CheckResult> {
    const snapshot = await this.snapshot();
    const response = await this.jev.evaluate(pageState(snapshot, question), {
      result: {
        type: "noul",
        instructions: {
          question: "Answer this yes-or-no question about the current browser state.",
          user_question: question,
        },
        criteria: {
          true: "The accessibility tree contains sufficient evidence for yes.",
          false: "The answer is no or the browser state does not contain sufficient evidence.",
        },
      },
    });
    const probability = asNoul(response.answers.result);
    return { answer: probability >= 0.5, probability };
  }

  async choose(question: string, choices: Record<string, unknown>): Promise<ChooseResult> {
    const snapshot = await this.snapshot();
    const response = await this.jev.evaluate(
      pageState(snapshot, `${question} ${Object.values(choices).join(" ")}`),
      {
        result: { type: "choice", instructions: question, criteria: choices },
      },
    );
    const answer = asChoice(response.answers.result);
    return {
      answer: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    };
  }

  async rate(question: string, scale: unknown[]): Promise<RateResult> {
    const snapshot = await this.snapshot();
    const response = await this.jev.evaluate(
      pageState(snapshot, `${question} ${scale.join(" ")}`),
      {
        result: { type: "score", instructions: question, criteria: scale },
      },
    );
    const answer = response.answers.result;
    if (!answer || answer.type !== "score") throw new Error("Expected a Jev Score answer");
    return {
      answer: answer.score,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    };
  }

  private async chooseTarget(
    snapshot: BrowserSnapshot,
    instruction: string,
    candidates: BrowserNode[],
  ) {
    if (candidates.length === 0)
      throw new Error("The accessibility tree contains no actionable nodes");

    const localWinners: BrowserNode[] = [];
    let finalDecision: ReturnType<typeof asChoice> | undefined;
    for (let offset = 0; offset < candidates.length; offset += MAX_CHOICES) {
      const chunk = candidates.slice(offset, offset + MAX_CHOICES);
      const response = await this.jev.evaluate(
        yamlState({
          ...actionState(snapshot, instruction),
          candidates: chunk.map((node) => candidateContext(snapshot, node)),
        }),
        {
          target: targetQuestion(snapshot, instruction, chunk),
        },
      );
      const decision = asChoice(response.answers.target);
      finalDecision = decision;
      const winner = snapshot.byNumber.get(Number(decision.choice));
      if (winner) localWinners.push(winner);
    }

    if (candidates.length <= MAX_CHOICES) return finalDecision!;
    const response = await this.jev.evaluate(
      yamlState({
        ...actionState(snapshot, instruction),
        candidates: localWinners.map((node) => candidateContext(snapshot, node)),
      }),
      { target: targetQuestion(snapshot, instruction, localWinners) },
    );
    return asChoice(response.answers.target);
  }

  private async rankTargets(
    snapshot: BrowserSnapshot,
    instruction: string,
  ): Promise<Array<{ node: BrowserNode; score: number; confidence: number }>> {
    const candidates = prefilterCandidates(
      snapshot,
      instruction,
      actionableNodes(snapshot),
      MAX_PREFILTERED_TARGETS,
    );
    if (candidates.length === 0)
      throw new Error("The accessibility tree contains no actionable nodes");
    const ranked: Array<{ node: BrowserNode; score: number; confidence: number }> = [];

    for (const chunk of candidateBatches(snapshot, candidates, MAX_RANK_BATCH)) {
      const contexts = chunk.map((node) => candidateContext(snapshot, node));
      const questions: Record<string, JevQuestion> = Object.fromEntries(
        chunk.map((node, index) => [
          `candidate_${index}`,
          {
            type: "score",
            instructions: {
              question:
                "How suitable is this numbered candidate as the target of the requested browser action? Read its ancestors and children from `candidates`. Prefer the actionable descendant when its parent is only context.",
              candidate_node: snapshot.numberById.get(node.id),
            },
            criteria: [
              "Unrelated to the requested action.",
              "Related context, but not an appropriate actionable target.",
              "A plausible actionable target.",
              "The direct and specific target for the requested action.",
            ],
          } satisfies JevQuestion,
        ]),
      );
      const response = await this.jev.evaluate(
        yamlState({
          ...actionState(snapshot, instruction),
          candidates: contexts,
        }),
        questions,
      );
      chunk.forEach((node, index) => {
        const answer = asScore(response.answers[`candidate_${index}`]);
        ranked.push({ node, score: answer.score, confidence: answer.confidence });
      });
    }

    return ranked.sort(
      (left, right) => right.score - left.score || right.confidence - left.confidence,
    );
  }

  private async verifyAction(
    before: BrowserSnapshot,
    after: BrowserSnapshot,
    instruction: string,
    actions: ActResult["actions"],
    expectedFields?: Record<string, string | number | boolean>,
  ): Promise<number> {
    const verification = await this.jev.evaluate(
      yamlState({
        requested_action: expectedFields ? { instruction, fields: expectedFields } : instruction,
        actions: actions.map((action) => ({
          target: {
            node: before.numberById.get(action.target.id) ?? null,
            type: action.target.role,
            text: action.target.name ?? null,
          },
          operation: action.operation,
        })),
        before: {
          url: before.url,
          title: before.title,
          nodes: verificationTree(
            before,
            `${instruction} ${expectedFields ? Object.entries(expectedFields).flat().join(" ") : ""}`,
          ),
        },
        after: {
          url: after.url,
          title: after.title,
          nodes: verificationTree(
            after,
            `${instruction} ${expectedFields ? Object.entries(expectedFields).flat().join(" ") : ""}`,
          ),
        },
      }),
      {
        completed: {
          type: "noul",
          instructions:
            "Did the browser actions produce the requested outcome? A successful low-level interaction is not enough if the requested result did not occur. If the request clearly requires another interaction, answer no.",
          criteria: {
            true: "The requested browser outcome occurred.",
            false:
              "It did not occur, cannot be verified, or another interaction is still required.",
          },
        },
      },
    );
    return asNoul(verification.answers.completed);
  }

  private async chooseOperation(
    snapshot: BrowserSnapshot,
    instruction: string,
    target: BrowserNode,
    options: ActOptions,
  ) {
    const response = await this.jev.evaluate(
      yamlState({
        ...actionState(snapshot, instruction),
        selected_target: candidateContext(snapshot, target),
        available_value: options.value ?? quotedValue(instruction) ?? null,
        available_key: options.key ?? null,
      }),
      { operation: operationQuestion(instruction, target, options) },
    );
    return asChoice(response.answers.operation);
  }
}

function targetQuestion(
  snapshot: BrowserSnapshot,
  instruction: string,
  candidates: BrowserNode[],
): JevQuestion {
  return {
    type: "choice",
    instructions: {
      question:
        "Which specific actionable node should receive the next single browser operation? Use ancestry and descendants as context. Choose the actionable parent only when the operation belongs on the parent itself; otherwise choose the relevant actionable descendant.",
      requested_step: instruction,
    },
    criteria: {
      ...Object.fromEntries(
        candidates.map((node) => {
          const number = snapshot.numberById.get(node.id);
          const label = [node.role, node.name, node.value, node.url].filter(Boolean).join(" · ");
          return [
            String(number),
            `Browser node ${number ?? "unknown"}${label ? ` · ${label}` : ""}. Its hierarchy and state are in the YAML candidates.`,
          ];
        }),
      ),
      [NONE]:
        "Use only when none of the listed numbered nodes can reasonably perform the requested operation.",
    },
  };
}

function operationQuestion(
  instruction: string,
  node: BrowserNode,
  options: ActOptions = {},
): JevQuestion {
  const criteria: Record<string, unknown> = {
    click: "Activate this control with a single click.",
    hover: "Move the pointer over this control without activating it.",
    scrollIntoView: "Scroll until this element is visible.",
  };
  const hasValue = options.value !== undefined || quotedValue(instruction) !== undefined;
  if (hasValue) {
    criteria.fill = "Replace the current editable value with the supplied value.";
    criteria.type = "Type the supplied value without first replacing existing content.";
    criteria.selectOption = "Choose the supplied value from a native select control.";
  }
  if (options.key) criteria.press = "Press the explicitly supplied keyboard key on this element.";
  return {
    type: "choice",
    instructions: {
      question: "Which single deterministic browser operation should be performed on this node?",
      requested_step: instruction,
      target_role: node.role,
      target_name: node.name ?? null,
      supplied_value_exists: hasValue,
      supplied_key_exists: !!options.key,
    },
    criteria,
  };
}

function candidateContext(snapshot: BrowserSnapshot, node: BrowserNode): unknown {
  const number = snapshot.numberById.get(node.id);
  return {
    node: number,
    type: node.role,
    text: node.name ?? null,
    value: node.value ?? null,
    url: node.url ?? null,
    frame: node.frameUrl ?? null,
    context: sparseNeighborhood(snapshot, number),
  };
}

function actionState(snapshot: BrowserSnapshot, instruction: string): Record<string, unknown> {
  return {
    requested_action: instruction,
    page: { url: snapshot.url, title: snapshot.title },
  };
}

function pageState(snapshot: BrowserSnapshot, focus: string): string {
  return yamlState({
    page: { url: snapshot.url, title: snapshot.title },
    nodes: focusedModelTree(snapshot, focus),
  });
}

function focusedModelTree(snapshot: BrowserSnapshot, focus: string): BrowserSnapshot["modelTree"] {
  const maxNodes = 240;
  if (snapshot.modelTree.length <= maxNodes) return snapshot.modelTree;

  const terms = new Set(normalizeWords(focus).filter((term) => term.length > 2));
  const byNumber = new Map(snapshot.modelTree.map((node) => [node.n, node]));
  const scored = snapshot.modelTree.map((node, index) => {
    const words = new Set(normalizeWords(`${node.type} ${node.text ?? ""} ${node.value ?? ""}`));
    const overlap = [...terms].reduce((total, term) => total + (words.has(term) ? 1 : 0), 0);
    return { node, index, score: overlap + (node.actionable ? 0.1 : 0) };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);

  const included = new Set<number>();
  for (const entry of scored.slice(0, maxNodes)) {
    included.add(entry.node.n);
    let current = entry.node;
    while (current.parent !== null) {
      included.add(current.parent);
      const parent = byNumber.get(current.parent);
      if (!parent) break;
      current = parent;
    }
  }
  return snapshot.modelTree.filter((node) => included.has(node.n)).slice(0, maxNodes);
}

function verificationTree(snapshot: BrowserSnapshot, focus: string): BrowserSnapshot["modelTree"] {
  return focusedModelTree(snapshot, focus).slice(0, 120);
}

function candidateBatches(
  snapshot: BrowserSnapshot,
  candidates: BrowserNode[],
  maxCount: number,
): BrowserNode[][] {
  const maxCharacters = 20_000;
  const batches: BrowserNode[][] = [];
  let batch: BrowserNode[] = [];
  let characters = 0;
  for (const candidate of candidates) {
    const size = JSON.stringify(candidateContext(snapshot, candidate)).length;
    if (batch.length > 0 && (batch.length >= maxCount || characters + size > maxCharacters)) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(candidate);
    characters += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function prefilterCandidates(
  snapshot: BrowserSnapshot,
  instruction: string,
  candidates: BrowserNode[],
  limit: number,
): BrowserNode[] {
  if (candidates.length <= limit) return candidates;
  const stopWords = new Set([
    "the",
    "this",
    "that",
    "with",
    "from",
    "into",
    "link",
    "button",
    "click",
    "open",
    "type",
    "press",
    "select",
    "choose",
    "page",
    "article",
  ]);
  const terms = normalizeWords(instruction).filter((term) => !stopWords.has(term));
  const quoted = [...instruction.matchAll(/["']([^"']+)["']/g)].map((match) =>
    match[1]!.toLowerCase(),
  );
  const scored = candidates.map((node, index) => {
    const haystack = candidateSearchText(snapshot, node);
    const words = new Set(normalizeWords(haystack));
    const overlap = terms.reduce((total, term) => total + (words.has(term) ? 1 : 0), 0);
    const phraseBonus = quoted.some((phrase) => haystack.includes(phrase)) ? 100 : 0;
    const roleBonus = node.role.toLowerCase() === "link" ? 0.1 : 0;
    return { node, index, score: phraseBonus + overlap + roleBonus };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, limit).map((entry) => entry.node);
}

function candidateSearchText(snapshot: BrowserSnapshot, node: BrowserNode): string {
  const pieces: string[] = [
    node.name ?? "",
    node.description ?? "",
    node.value ?? "",
    node.url ?? "",
  ];
  for (const ancestor of ancestorContext(snapshot, node)) pieces.push(JSON.stringify(ancestor));
  const stack = [...node.children];
  let remaining = 32;
  while (stack.length && remaining-- > 0) {
    const child = stack.shift()!;
    pieces.push(child.name ?? "", child.description ?? "", child.value ?? "", child.url ?? "");
    stack.push(...child.children);
  }
  return pieces.join(" ").toLowerCase();
}

function normalizeWords(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function debug(label: string, value: unknown): void {
  if (process.env.PLAYJEV_DEBUG !== "true") return;
  console.log(`[playjev] ${label}\n${yamlState(value)}`);
}

function accessibleLocator(page: Page, target: BrowserNode): Locator | undefined {
  if (!target.name || target.frameUrl) return undefined;
  return page.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
    name: target.name,
    exact: true,
  });
}

function isStaleBackendNode(error: unknown): boolean {
  return error instanceof Error && error.message.includes("does not belong to the document");
}

function sameSemanticTarget(candidate: BrowserNode, selected: BrowserNode): boolean {
  if (candidate.name !== selected.name) return false;
  if (selected.url && candidate.url !== selected.url) return false;
  if (candidate.role === selected.role) return true;
  const textControls = new Set(["combobox", "searchbox", "textbox"]);
  return (
    textControls.has(candidate.role.toLowerCase()) && textControls.has(selected.role.toLowerCase())
  );
}

function sparseNeighborhood(snapshot: BrowserSnapshot, number: number | undefined): unknown {
  if (number === undefined) return [];
  const byNumber = new Map(snapshot.modelTree.map((node) => [node.n, node]));
  const included = new Set<number>([number]);
  let current = byNumber.get(number);
  for (
    let depth = 0;
    depth < 4 && current?.parent !== null && current?.parent !== undefined;
    depth++
  ) {
    included.add(current.parent);
    current = byNumber.get(current.parent);
  }
  for (const node of snapshot.modelTree) {
    if (node.parent === number) included.add(node.n);
  }
  return [...included].sort((left, right) => left - right).map((entry) => byNumber.get(entry));
}

async function execute(
  locator: Locator,
  operation: BrowserOperation,
  instruction: string,
  options: ActOptions,
): Promise<void> {
  const value = options.value ?? quotedValue(instruction);
  switch (operation) {
    case "click":
      if (
        await locator
          .evaluate(
            (element) =>
              element instanceof HTMLInputElement &&
              (element.type === "checkbox" || element.type === "radio"),
          )
          .catch(() => false)
      ) {
        // Styled radios and checkboxes often place a visual proxy above the native
        // input. Playwright's check() still performs the correct checked-state and
        // event sequence; force only bypasses the proxy's pointer interception.
        await locator.check({ force: true });
      } else {
        await locator.click();
      }
      return;
    case "fill":
      if (value === undefined) throw new Error("fill requires options.value or a quoted value");
      await locator.fill(value);
      return;
    case "type":
      if (value === undefined) throw new Error("type requires options.value or a quoted value");
      await locator.pressSequentially(value);
      return;
    case "press":
      if (!options.key) throw new Error("press requires options.key");
      await locator.press(options.key);
      return;
    case "selectOption":
      if (value === undefined)
        throw new Error("selectOption requires options.value or a quoted value");
      await locator.selectOption(value);
      return;
    case "hover":
      await locator.hover();
      return;
    case "scrollIntoView":
      await locator.scrollIntoViewIfNeeded();
      return;
  }
}

async function setFormControl(
  locator: Locator,
  target: BrowserNode,
  value: string | number | boolean,
): Promise<BrowserOperation> {
  const role = target.role.toLowerCase();
  if (role === "checkbox" || role === "switch") {
    if (typeof value === "boolean" && !value) await locator.uncheck({ force: true });
    else await locator.check({ force: true });
    return "click";
  }
  if (role === "radio") {
    if (value === false) throw new Error("A radio target cannot be set to false");
    await locator.check({ force: true });
    return "click";
  }
  if (role === "combobox" || role === "listbox") {
    await locator.selectOption({ label: String(value) });
    return "selectOption";
  }
  if (["textbox", "searchbox", "spinbutton"].includes(role)) {
    await locator.fill(String(value));
    return "fill";
  }
  if ((role === "button" || role === "menuitem") && value === true) {
    await locator.click();
    return "click";
  }
  throw new Error(`Bulk form filling does not support a ${target.role} target`);
}

function quotedValue(instruction: string): string | undefined {
  const match = instruction.match(/["']([^"']+)["']/);
  return match?.[1];
}

function asNoul(answer: JevAnswer | undefined): number {
  if (!answer || answer.type !== "noul") throw new Error("Expected a Jev Noul answer");
  return answer.noul;
}

function asChoice(answer: JevAnswer | undefined): {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
} {
  if (!answer || answer.type !== "choice") throw new Error("Expected a Jev Choice answer");
  return answer;
}

function asScore(answer: JevAnswer | undefined): {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
} {
  if (!answer || answer.type !== "score") throw new Error("Expected a Jev Score answer");
  return answer;
}
