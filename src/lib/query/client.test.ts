import { createQueryClient } from "./client";

it("does not retry, poll or refetch on focus (status shows what happened; no live dashboard)", () => {
  const options = createQueryClient().getDefaultOptions().queries;
  expect(options).toMatchObject({ retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  expect(options?.refetchInterval).toBeUndefined();
});
