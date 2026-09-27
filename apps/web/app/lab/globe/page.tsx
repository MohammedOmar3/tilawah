import type { Metadata } from "next";
import GlobeLab from "./GlobeLab";

export const metadata: Metadata = {
  title: "Globe lab · Tilawah",
  robots: { index: false, follow: false },
};

export default function GlobeLabPage() {
  return <GlobeLab />;
}
