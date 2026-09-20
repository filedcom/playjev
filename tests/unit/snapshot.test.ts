import { describe, expect, it } from "vitest";
import { actionableNodes, buildSnapshot } from "../../src/browser/snapshot.js";

describe("accessibility snapshots", () => {
  it("retains descendants beneath actionable parents", () => {
    const snapshot = buildSnapshot("https://example.test", "Checkout", [
      {
        nodeId: "root",
        backendDOMNodeId: 1,
        role: { value: "RootWebArea" },
        name: { value: "Checkout" },
        childIds: ["form"],
      },
      {
        nodeId: "form",
        backendDOMNodeId: 2,
        parentId: "root",
        role: { value: "form" },
        name: { value: "Payment details" },
        childIds: ["button", "label"],
      },
      {
        nodeId: "button",
        backendDOMNodeId: 3,
        parentId: "form",
        role: { value: "button" },
        name: { value: "Pay now" },
        childIds: ["label"],
      },
      {
        nodeId: "label",
        backendDOMNodeId: 4,
        parentId: "button",
        role: { value: "StaticText" },
        name: { value: "Total: $42" },
      },
    ]);

    const button = snapshot.byId.get("dom:3");
    expect(button?.children[0]).toMatchObject({ id: "dom:4", name: "Total: $42" });
    expect(snapshot.formattedTree).toContain("    [dom:3] button: Pay now");
    expect(snapshot.formattedTree).toContain("      [dom:4] StaticText: Total: $42");
    expect(actionableNodes(snapshot).map((node) => node.id)).toEqual(["dom:3"]);
    expect(snapshot.modelTree).toContainEqual({
      n: 3,
      parent: 2,
      type: "button",
      text: "Pay now",
      actionable: true,
    });
    expect(snapshot.byNumber.get(3)?.id).toBe("dom:3");
  });

  it("keeps actionable ancestors and descendants as distinct targets", () => {
    const snapshot = buildSnapshot("https://example.test", "Menu", [
      {
        nodeId: "root",
        backendDOMNodeId: 1,
        role: { value: "RootWebArea" },
        childIds: ["menu"],
      },
      {
        nodeId: "menu",
        backendDOMNodeId: 2,
        parentId: "root",
        role: { value: "button" },
        name: { value: "Account menu" },
        childIds: ["item"],
      },
      {
        nodeId: "item",
        backendDOMNodeId: 3,
        parentId: "menu",
        role: { value: "menuitem" },
        name: { value: "Sign out" },
      },
    ]);

    expect(actionableNodes(snapshot).map((node) => node.id)).toEqual(["dom:2", "dom:3"]);
  });

  it("includes image alternative text as sparse model context", () => {
    const snapshot = buildSnapshot("https://example.test", "Result", [
      {
        nodeId: "root",
        backendDOMNodeId: 1,
        role: { value: "RootWebArea" },
        childIds: ["result"],
      },
      {
        nodeId: "result",
        backendDOMNodeId: 2,
        parentId: "root",
        role: { value: "image" },
        name: { value: "11.2" },
      },
    ]);

    expect(snapshot.modelTree).toContainEqual({
      n: 2,
      parent: 1,
      type: "image",
      text: "11.2",
    });
  });
});
