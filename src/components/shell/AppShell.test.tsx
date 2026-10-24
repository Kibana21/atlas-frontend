import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { axeViolations } from "../../../tests/axe";

import { AppShell } from "./AppShell";

describe("AppShell (FR-54)", () => {
  it("provides banner and main landmarks and a skip link that is the first tab stop", async () => {
    render(
      <AppShell>
        <h1>Page</h1>
        <button type="button">Action</button>
      </AppShell>,
    );
    expect(screen.getByRole("banner")).toHaveTextContent("Atlas");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("tabindex", "-1");
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Action" })).toHaveFocus(); // the banner has no tab stops
  });

  it("marks the entity spectrum as decorative", () => {
    const { container } = render(<AppShell>x</AppShell>);
    const spectrum = container.querySelector("header [aria-hidden='true']");
    expect(spectrum?.children).toHaveLength(7);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <AppShell>
        <h1>Page</h1>
      </AppShell>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
