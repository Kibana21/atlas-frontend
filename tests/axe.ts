import axe from "axe-core";

/**
 * Run axe-core on rendered markup. jsdom cannot compute colour contrast, so that rule is off here; contrast
 * is enforced on the tokens themselves (atlas-specs tools/check_tokens.py: every pair >= its WCAG threshold).
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return result.violations.map((v) => `${v.id} (${v.impact ?? "n/a"}): ${v.help}`);
}
