import type { CDPSession, Page } from "playwright";
import type { BrowserModelNode, BrowserNode, BrowserSnapshot } from "../types/index.js";

interface AXValue<T = unknown> {
  value?: T;
}

interface AXProperty {
  name: string;
  value?: AXValue;
}

interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  parentId?: string;
  childIds?: string[];
  ignored?: boolean;
  role?: AXValue<string>;
  name?: AXValue<string>;
  description?: AXValue<string>;
  value?: AXValue<string | number>;
  properties?: AXProperty[];
}

const ACTIONABLE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "scrollbar",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

export async function captureSnapshot(page: Page): Promise<BrowserSnapshot> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Accessibility.enable");
    const response = (await session.send("Accessibility.getFullAXTree")) as {
      nodes: AXNode[];
    };
    const snapshot = buildSnapshot(await page.url(), await page.title(), response.nodes);
    await appendChildFrameControls(page, snapshot);
    return snapshot;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

export function buildSnapshot(url: string, title: string, rawNodes: AXNode[]): BrowserSnapshot {
  const rawByAxId = new Map(rawNodes.map((node) => [node.nodeId, node]));
  const byId = new Map<string, BrowserNode>();

  for (const raw of rawNodes) {
    if (raw.ignored) continue;
    const role = String(raw.role?.value ?? "unknown");
    const id =
      raw.backendDOMNodeId === undefined ? `ax:${raw.nodeId}` : `dom:${raw.backendDOMNodeId}`;
    const name = text(raw.name?.value);
    const description = text(raw.description?.value);
    const urlValue = text(propertyValue(raw.properties, "url"));
    const node: BrowserNode = {
      id,
      axId: raw.nodeId,
      ...(raw.backendDOMNodeId === undefined ? {} : { backendNodeId: raw.backendDOMNodeId }),
      role,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(raw.value?.value === undefined ? {} : { value: String(raw.value.value) }),
      ...(urlValue ? { url: urlValue } : {}),
      ...(raw.parentId ? { parentId: raw.parentId } : {}),
      ...readStates(raw.properties),
      children: [],
    };
    byId.set(id, node);
  }

  const byAxId = new Map([...byId.values()].map((node) => [node.axId, node]));
  for (const node of byId.values()) {
    const raw = rawByAxId.get(node.axId);
    for (const childAxId of raw?.childIds ?? []) {
      const child = byAxId.get(childAxId);
      if (child) node.children.push(child);
    }
  }

  const tree = [...byId.values()].filter((node) => {
    const raw = rawByAxId.get(node.axId);
    return !raw?.parentId || !byAxId.has(raw.parentId);
  });

  const { modelTree, byNumber, numberById } = buildModelTree(tree, byId);
  return {
    url,
    title,
    tree,
    formattedTree: formatForest(tree),
    byId,
    modelTree,
    byNumber,
    numberById,
  };
}

export function actionableNodes(snapshot: BrowserSnapshot): BrowserNode[] {
  return findActionableNodes([...snapshot.byId.values()]);
}

function findActionableNodes(nodes: BrowserNode[]): BrowserNode[] {
  const eligible = nodes.filter(
    (node) => (node.backendNodeId !== undefined || !!node.selector) && !node.disabled,
  );
  const semantic = eligible.filter((node) => isSemanticActionable(node));
  if (semantic.length > 0) return semantic;
  return eligible.filter(
    (node) => node.role.toLowerCase() === "generic" && (node.children.length > 0 || !!node.name),
  );
}

function buildModelTree(
  tree: BrowserNode[],
  byId: Map<string, BrowserNode>,
): {
  modelTree: BrowserModelNode[];
  byNumber: Map<number, BrowserNode>;
  numberById: Map<string, number>;
} {
  const actionableIds = new Set(findActionableNodes([...byId.values()]).map((node) => node.id));
  const modelTree: BrowserModelNode[] = [];
  const byNumber = new Map<number, BrowserNode>();
  const numberById = new Map<string, number>();
  let nextNumber = 1;

  const visit = (node: BrowserNode, parent: number | null): void => {
    const actionable = actionableIds.has(node.id);
    const keep = actionable || isContextRole(node.role);
    let nextParent = parent;

    if (keep) {
      const n = nextNumber++;
      const text = compactNodeText(node);
      const state = compactState(node);
      modelTree.push({
        n,
        parent,
        type: normalizeRole(node.role),
        ...(text ? { text } : {}),
        ...(node.value ? { value: truncate(node.value, 240) } : {}),
        ...(node.url ? { url: truncate(node.url, 500) } : {}),
        ...(node.frameUrl ? { frame: truncate(node.frameUrl, 300) } : {}),
        ...(state.length ? { state } : {}),
        ...(actionable ? { actionable: true } : {}),
      });
      numberById.set(node.id, n);
      if (actionable) byNumber.set(n, node);
      nextParent = n;
    }

    for (const child of node.children) visit(child, nextParent);
  };

  for (const root of tree) visit(root, null);
  return { modelTree, byNumber, numberById };
}

function isContextRole(role: string): boolean {
  const normalized = normalizeRole(role);
  return new Set([
    "page",
    "heading",
    "paragraph",
    "listitem",
    "row",
    "cell",
    "form",
    "navigation",
    "main",
    "article",
    "region",
    "table",
    "dialog",
    "iframe",
    "alert",
    "status",
  ]).has(normalized);
}

interface FrameControl {
  selector: string;
  role: string;
  name?: string;
  value?: string;
  url?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
}

async function appendChildFrameControls(page: Page, snapshot: BrowserSnapshot): Promise<void> {
  const childFrames = page.frames().filter((frame) => frame !== page.mainFrame());
  for (let frameIndex = 0; frameIndex < childFrames.length; frameIndex++) {
    const frame = childFrames[frameIndex]!;
    const controls = await frame
      .evaluate((): FrameControl[] => {
        const elements = [
          ...document.querySelectorAll(
            'a[href], button, input, textarea, select, [role], [tabindex]:not([tabindex="-1"])',
          ),
        ];
        return elements
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .slice(0, 250)
          .map((element) => {
            const form = element as HTMLInputElement;
            const anchor = element as HTMLAnchorElement;
            const tag = element.tagName.toLowerCase();
            const inputType = (element.getAttribute("type") ?? "text").toLowerCase();
            const explicitRole = element.getAttribute("role");
            let role = explicitRole ?? "generic";
            if (!explicitRole) {
              if (tag === "a") role = "link";
              else if (tag === "button") role = "button";
              else if (tag === "textarea") role = "textbox";
              else if (tag === "select") role = "combobox";
              else if (tag === "input") {
                if (inputType === "checkbox") role = "checkbox";
                else if (inputType === "radio") role = "radio";
                else if (inputType === "range") role = "slider";
                else if (inputType === "number") role = "spinbutton";
                else if (["button", "submit", "reset"].includes(inputType)) role = "button";
                else role = inputType === "search" ? "searchbox" : "textbox";
              }
            }
            const label = form.labels?.[0]?.innerText;
            const rawName =
              element.getAttribute("aria-label") ??
              label ??
              element.getAttribute("placeholder") ??
              element.getAttribute("title") ??
              (element as HTMLElement).innerText ??
              element.getAttribute("name") ??
              undefined;
            const name = rawName?.replace(/\s+/g, " ").trim() || undefined;
            const parts: string[] = [];
            let current: Element | null = element;
            if (current.id) {
              parts.push(`#${CSS.escape(current.id)}`);
            } else {
              while (current) {
                const currentTag = current.tagName.toLowerCase();
                const parent: Element | null = current.parentElement;
                if (!parent) {
                  parts.unshift(currentTag);
                  break;
                }
                const siblings = [...parent.children].filter(
                  (sibling) => sibling.tagName === current!.tagName,
                );
                parts.unshift(`${currentTag}:nth-of-type(${siblings.indexOf(current) + 1})`);
                current = parent;
              }
            }
            return {
              selector: parts.join(" > "),
              role,
              ...(name ? { name } : {}),
              ...(typeof form.value === "string" && form.value ? { value: form.value } : {}),
              ...(anchor.href ? { url: anchor.href } : {}),
              ...(form.disabled ? { disabled: true } : {}),
              ...(typeof form.checked === "boolean" ? { checked: form.checked } : {}),
              ...(element.hasAttribute("aria-expanded")
                ? { expanded: element.getAttribute("aria-expanded") === "true" }
                : {}),
            };
          });
      })
      .catch((error) => {
        if (process.env.PLAYJEV_DEBUG === "true") {
          console.error(
            `[playjev] unable to normalize child frame ${frame.url() || "about:blank"}`,
            error,
          );
        }
        return [] as FrameControl[];
      });

    if (controls.length === 0) continue;
    const frameUrl = frame.url();
    const rootAxId = `frame-root:${frameIndex}`;
    const root: BrowserNode = {
      id: rootAxId,
      axId: rootAxId,
      role: "iframe",
      name: frameUrl,
      frameUrl,
      frameIndex,
      children: [],
    };
    snapshot.tree.push(root);
    snapshot.byId.set(root.id, root);

    controls.forEach((control, controlIndex) => {
      const axId = `frame:${frameIndex}:${controlIndex}`;
      const node: BrowserNode = {
        id: axId,
        axId,
        parentId: rootAxId,
        role: control.role,
        ...(control.name ? { name: control.name } : {}),
        ...(control.value ? { value: control.value } : {}),
        ...(control.url ? { url: control.url } : {}),
        ...(control.disabled ? { disabled: true } : {}),
        ...(control.checked === undefined ? {} : { checked: control.checked }),
        ...(control.selected === undefined ? {} : { selected: control.selected }),
        ...(control.expanded === undefined ? {} : { expanded: control.expanded }),
        selector: control.selector,
        frameUrl,
        frameIndex,
        children: [],
      };
      root.children.push(node);
      snapshot.byId.set(node.id, node);
    });
  }

  if (childFrames.length > 0) {
    const rebuilt = buildModelTree(snapshot.tree, snapshot.byId);
    snapshot.modelTree = rebuilt.modelTree;
    snapshot.byNumber = rebuilt.byNumber;
    snapshot.numberById = rebuilt.numberById;
    snapshot.formattedTree = formatForest(snapshot.tree);
  }
}

function normalizeRole(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized === "rootwebarea" || normalized === "webarea") return "page";
  if (normalized === "statictext" || normalized === "inlinetextbox") return "text";
  if (normalized.startsWith("scrollable")) return "scrollable";
  return normalized || "unknown";
}

function compactNodeText(node: BrowserNode): string | undefined {
  if (node.name) return truncate(node.name, 300);
  const pieces: string[] = [];
  const queue = [...node.children];
  let remaining = 12;
  while (queue.length && remaining-- > 0) {
    const child = queue.shift()!;
    if (child.name) pieces.push(child.name);
    if (!isContextRole(child.role) && !isSemanticActionable(child)) queue.push(...child.children);
  }
  const combined = [...new Set(pieces)].join(" ").replace(/\s+/g, " ").trim();
  return combined ? truncate(combined, 300) : undefined;
}

function compactState(node: BrowserNode): string[] {
  return [
    node.disabled ? "disabled" : "",
    node.checked === undefined ? "" : `checked:${node.checked}`,
    node.selected === undefined ? "" : `selected:${node.selected}`,
    node.expanded === undefined ? "" : `expanded:${node.expanded}`,
  ].filter(Boolean);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function ancestorContext(snapshot: BrowserSnapshot, node: BrowserNode): unknown[] {
  const byAxId = new Map([...snapshot.byId.values()].map((entry) => [entry.axId, entry]));
  const path: unknown[] = [];
  let parentAxId = node.parentId;
  while (parentAxId) {
    const parent = byAxId.get(parentAxId);
    if (!parent) break;
    path.unshift({ id: parent.id, role: parent.role, name: parent.name });
    parentAxId = parent.parentId;
  }
  return path;
}

export async function resolveXPath(page: Page, backendNodeId: number): Promise<string> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("DOM.enable");
    await session.send("Runtime.enable");
    const resolved = (await session.send("DOM.resolveNode", { backendNodeId })) as {
      object: { objectId?: string };
    };
    const objectId = resolved.object.objectId;
    if (!objectId) throw new Error(`Unable to resolve backend node ${backendNodeId}`);
    const result = (await session.send("Runtime.callFunctionOn", {
      objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        const parts = [];
        let node = this;
        while (node && node.nodeType === Node.ELEMENT_NODE) {
          let index = 1;
          let sibling = node.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === node.tagName) index++;
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
          node = node.parentElement;
        }
        return '/' + parts.join('/');
      }`,
    })) as { result: { value?: unknown } };
    if (typeof result.result.value !== "string") {
      throw new Error(`Unable to compute XPath for backend node ${backendNodeId}`);
    }
    return result.result.value;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

function isSemanticActionable(node: BrowserNode): boolean {
  if (ACTIONABLE_ROLES.has(node.role.toLowerCase())) return true;
  return node.role.toLowerCase().startsWith("scrollable");
}

function formatForest(nodes: BrowserNode[]): string {
  const lines: string[] = [];
  const visit = (node: BrowserNode, depth: number): void => {
    const states = [
      node.disabled ? "disabled" : "",
      node.checked === undefined ? "" : `checked=${node.checked}`,
      node.selected === undefined ? "" : `selected=${node.selected}`,
      node.expanded === undefined ? "" : `expanded=${node.expanded}`,
    ].filter(Boolean);
    lines.push(
      `${"  ".repeat(depth)}[${node.id}] ${node.role}${node.name ? `: ${node.name}` : ""}${states.length ? ` [${states.join(", ")}]` : ""}`,
    );
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const node of nodes) visit(node, 0);
  return lines.join("\n");
}

function readStates(properties: AXProperty[] | undefined): {
  disabled?: boolean;
  expanded?: boolean;
  checked?: boolean | "mixed";
  selected?: boolean;
} {
  const disabled = propertyValue(properties, "disabled");
  const expanded = propertyValue(properties, "expanded");
  const checked = propertyValue(properties, "checked");
  const selected = propertyValue(properties, "selected");
  return {
    ...(typeof disabled === "boolean" ? { disabled } : {}),
    ...(typeof expanded === "boolean" ? { expanded } : {}),
    ...(typeof checked === "boolean" || checked === "mixed" ? { checked } : {}),
    ...(typeof selected === "boolean" ? { selected } : {}),
  };
}

function propertyValue(properties: AXProperty[] | undefined, name: string): unknown {
  return properties?.find((entry) => entry.name === name)?.value?.value;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}
