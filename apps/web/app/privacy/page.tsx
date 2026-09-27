import { Programme } from "@tilawah/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import programmeJson from "@/public/data/programme.json";

export const metadata: Metadata = {
  title: "Privacy · Tilawah",
  description: "What Tilawah does and does not collect.",
};

// Read at build time: the page credits whoever the live programme features.
const programme = Programme.parse(programmeJson);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-gold-bright">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-10 leading-relaxed text-fg">
      <header className="flex flex-col gap-2">
        <Link href="/" className="self-start text-sm text-muted underline decoration-line underline-offset-4 hover:text-fg">
          ← Back to listening
        </Link>
        <h1 className="text-2xl font-medium">Privacy</h1>
        <p className="text-muted">
          Tilawah is built to know as little about you as possible. This page says exactly what happens when you
          visit.
        </p>
      </header>

      <Section title="What we never collect">
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>No accounts, names, email addresses or profiles.</li>
          <li>No cookies.</li>
          <li>No analytics, advertising or tracking scripts of any kind.</li>
          <li>We never ask your device for its GPS location.</li>
        </ul>
      </Section>

      <Section title="When you join">
        <p className="text-muted">
          Pressing <strong className="text-fg">Join global listening</strong> opens a connection to our server so your
          player can stay in time with everyone else. At that moment, and only then, your IP address is used to
          estimate a rough region about 300 km across. The estimate comes from our network provider, Cloudflare. We
          keep only that region (a square on a map grid, not your position), and the IP address itself is discarded:
          it is never stored or written to logs.
        </p>
        <p className="text-muted">
          To stop one person opening thousands of connections, the server also counts connections per address using a
          scrambled (salted and hashed) form of it. That count lives only in memory, and the scrambling key is replaced
          every day.
        </p>
      </Section>

      <Section title="Listening anonymously">
        <p className="text-muted">
          If you switch on <strong className="text-fg">Listen anonymously</strong>, the region step is skipped
          entirely. You are still counted in the total number of listeners, but you are never placed on the globe.
        </p>
      </Section>

      <Section title="What the globe shows">
        <p className="text-muted">
          The globe shows areas, never people. An area appears only when at least 5 people are listening there. Smaller
          groups are merged into their country, and if a country has fewer than 5 listeners it is not shown at all
          (those listeners are still in the total).
        </p>
      </Section>

      <Section title="Sync quality measurements">
        <p className="text-muted">
          While you listen, your player reports three anonymous numbers about once a minute: how long a message takes to
          reach the server and back, the difference between your clock and the server&apos;s, and how far your audio is
          from the shared position. They carry nothing that identifies you, are kept in the server&apos;s memory for 10
          minutes to check that everyone is hearing the same moment, and are then gone.
        </p>
      </Section>

      <Section title="Settings on your device">
        <p className="text-muted">
          If you turn on ayah announcements for screen readers, that one choice is remembered in your browser&apos;s
          local storage under <code className="text-fg">tilawah.settings</code>. It never leaves your device.
        </p>
      </Section>

      <Section title="Credits">
        <p className="text-muted">
          Recitation: {programme.reciter.name} (riwayah {programme.reciter.riwayah}).
        </p>
        <p className="text-muted">
          Quran text: Tanzil Quran Text (Uthmani, Version 1.1), copyright © 2007–2026 Tanzil Project, licensed under
          Creative Commons Attribution 3.0. The text is reproduced verbatim, as the licence requires; changing it is not
          allowed. Source and updates:{" "}
          <a href="https://tanzil.net" className="text-fg underline decoration-line underline-offset-4">
            tanzil.net
          </a>
          .
        </p>
        <p className="text-muted">Map shapes: Natural Earth (public domain).</p>
      </Section>

      <Section title="Contact">
        <p className="text-muted">
          Questions about privacy: <span className="text-fg">privacy@&lt;domain&gt;</span>
        </p>
      </Section>
    </main>
  );
}
