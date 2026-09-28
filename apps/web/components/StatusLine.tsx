import type { Status } from "@/lib/sync";

export interface StatusLineProps {
  status: Status;
  className?: string;
}

const TEXT: Record<Status, string> = {
  idle: "Now reciting",
  connecting: "Connecting…",
  syncing: "Syncing…",
  playing: "In sync",
  reconnecting: "Reconnecting… audio continues",
  error: "Something went wrong",
};

const DOT: Record<Status, string> = {
  idle: "bg-presence motion-safe:animate-breathe",
  connecting: "bg-ink-3",
  syncing: "bg-ink-3",
  playing: "bg-presence",
  reconnecting: "bg-warn motion-safe:animate-blink",
  error: "bg-danger",
};

export default function StatusLine({ status, className = "" }: StatusLineProps) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}>
      <span aria-hidden="true" className={`inline-block size-[7px] shrink-0 rounded-full ${DOT[status]}`} />
      <span role="status" data-status={status}>
        {TEXT[status]}
      </span>
    </span>
  );
}
