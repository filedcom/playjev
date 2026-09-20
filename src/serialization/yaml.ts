import { stringify } from "yaml";

/** Render the complete model-facing browser state as compact, readable YAML. */
export function yamlState(value: unknown): string {
  return stringify(value, {
    indent: 2,
    lineWidth: 0,
    nullStr: "null",
  }).trimEnd();
}
