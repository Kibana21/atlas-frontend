import { render, screen, within } from "@testing-library/react";

import { axeViolations } from "../../tests/axe";

import HomePage from "./page";

describe("/ placeholder (FR-55)", () => {
  it("has the wordmark, one sentence and exactly one interactive element: a link to /status", async () => {
    const { container } = render(<HomePage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Atlas");
    const interactive = container.querySelectorAll("a, button, input, select, textarea, [tabindex]");
    expect(interactive).toHaveLength(1);
    expect(screen.getByRole("link", { name: "View system status" })).toHaveAttribute("href", "/status");
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("has no icons, images or navigation", () => {
    const { container } = render(<HomePage />);
    expect(container.querySelectorAll("svg, img, nav")).toHaveLength(0);
    expect(within(container).queryByRole("navigation")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<HomePage />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
