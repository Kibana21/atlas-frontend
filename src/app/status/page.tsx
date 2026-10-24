import type { Metadata } from "next";

import { getEnv } from "@/lib/env";

import { StatusView } from "./StatusView";

export const metadata: Metadata = { title: "System status" };

export default function StatusPage() {
  return <StatusView frontendSha={getEnv().frontendSha} />;
}
