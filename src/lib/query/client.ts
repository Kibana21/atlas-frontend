import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query defaults for Atlas server state. Status is fetched on demand: no automatic retries (a
 * failure is shown as it happened, with its correlation ID), no refetch on focus, no polling (live health
 * dashboards are out of scope; the user refreshes explicitly).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
      },
    },
  });
}
