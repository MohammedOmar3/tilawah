import type { Metadata } from "next";
import SyncDiagnostics from "@/components/SyncDiagnostics";

export const metadata: Metadata = {
  title: "Audio lab · Quran Global",
  robots: { index: false, follow: false },
};

export default function AudioLabPage() {
  return <SyncDiagnostics />;
}
