import Link from "next/link";

export interface FooterProps {
  reciter?: string;
}

export default function Footer({ reciter }: FooterProps) {
  return (
    <footer className="flex flex-col items-center gap-1 pb-6 text-center text-xs text-muted">
      <nav aria-label="Site">
        <Link href="/privacy" className="underline decoration-line underline-offset-4 hover:text-fg">
          Privacy
        </Link>
      </nav>
      {reciter && <p>Recitation: {reciter}</p>}
      <p>
        Quran text: Tanzil Project (
        <a href="https://tanzil.net" className="underline decoration-line underline-offset-4 hover:text-fg">
          tanzil.net
        </a>
        )
      </p>
    </footer>
  );
}
