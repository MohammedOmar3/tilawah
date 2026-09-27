import type { Status } from "@/lib/sync";

export interface StatusLineProps {
  status: Status;
  approximate: boolean;
}

const TEXT: Record<Status, string> = {
  idle: "Live",
  connecting: "Connecting…",
  syncing: "Syncing…",
  playing: "Listening",
  reconnecting: "Reconnecting… audio continues",
  error: "Something went wrong",
};

const DOT: Record<Status, string> = {
  idle: "bg-gold",
  connecting: "bg-muted",
  syncing: "bg-muted",
  playing: "bg-gold-bright",
  reconnecting: "bg-muted",
  error: "bg-red-400",
};

export default function StatusLine({ status, approximate }: StatusLineProps) {
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted">
      <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${DOT[status]}`} />
      <span role="status" data-status={status}>
        {TEXT[status]}
        {approximate ? " (approximate until you join)" : ""}
      </span>
    </p>
  );
}
