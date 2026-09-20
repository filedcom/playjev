import { describe, expect, it } from "vitest";
import { yamlState } from "../../src/serialization/yaml.js";

describe("yamlState", () => {
  it("renders readable nested state without JSON syntax", () => {
    expect(yamlState({ page: { title: "Example" }, nodes: [{ n: 1, type: "button" }] })).toBe(
      "page:\n  title: Example\nnodes:\n  - n: 1\n    type: button",
    );
  });
});
