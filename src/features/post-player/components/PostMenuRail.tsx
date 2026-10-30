/**
 * Top-right action menu rail (create, export, navigation links).
 *
 * Exports: PostMenuRail
 * Depends on: framer-motion, lucide-react, tanstack Link
 */

import { motion } from "framer-motion";
import { Bell, Download, Home, Info, Plus, Search, Settings, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { useCanExport } from "@/features/admin/hooks/useCanExport";

export type PostMenuRailProps = {
  onExport: () => void;
  isExporting: boolean;
};

/**
 * Dropdown rail of navigation and export actions.
 * @param props - PostMenuRailProps fields
 * @returns Rendered UI
 */
export function PostMenuRail({ onExport, isExporting }: PostMenuRailProps): ReactElement {
  // Video export is a local admin tool; hide the action for everyone else. This rail
  // mounts only while the overflow menu is open, so the admin check runs at most once
  // per open rather than per card in the feed.
  const canExport = useCanExport();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-30 flex origin-top-right flex-col items-end gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <RailMenuLink to="/create" label="create" icon={<Plus className="size-5" />} emphasized />
      {canExport && (
        <RailMenuButton
          label={isExporting ? "exporting" : "export"}
          icon={<Download className="size-4" />}
          onClick={onExport}
          disabled={isExporting}
        />
      )}
      <RailMenuLink to="/feed" label="feed" icon={<Home className="size-4" />} />
      <RailMenuLink to="/discover" label="discover" icon={<Search className="size-4" />} />
      <RailMenuLink to="/notifications" label="activity" icon={<Bell className="size-4" />} />
      <RailMenuLink to="/me" label="profile" icon={<User className="size-4" />} />
      <RailMenuLink to="/settings" label="settings" icon={<Settings className="size-4" />} />
      <RailMenuLink to="/about" label="about" icon={<Info className="size-4" />} />
    </motion.div>
  );
}

function RailMenuButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.93, x: -2 }}
      transition={{ type: "spring", stiffness: 560, damping: 24 }}
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-10 items-center gap-2 text-white outline-none disabled:opacity-55"
      aria-label={label}
    >
      <span className="pr-1 text-right font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/75 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] transition group-hover:text-white group-active:translate-x-0.5 group-active:text-white">
        {label}
      </span>
      <span className="grid size-10 place-items-center rounded-full bg-black/45 text-white shadow-[0_12px_30px_rgba(0,0,0,0.3)] ring-1 ring-white/15 backdrop-blur transition duration-150 group-active:scale-90 group-active:bg-white group-active:text-black group-active:ring-2 group-active:ring-white/80">
        {icon}
      </span>
    </motion.button>
  );
}

function RailMenuLink({
  to,
  label,
  icon,
  emphasized,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  emphasized?: boolean;
}): ReactElement {
  return (
    <motion.div
      whileTap={{ scale: 0.93, x: -2 }}
      transition={{ type: "spring", stiffness: 560, damping: 24 }}
    >
      <Link
        to={to}
        className="group flex min-h-10 items-center gap-2 text-white outline-none"
        aria-label={label}
      >
        <span className="pr-1 text-right font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/75 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] transition group-hover:text-white group-active:translate-x-0.5 group-active:text-white">
          {label}
        </span>
        <span
          className={`grid size-10 place-items-center rounded-full shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition duration-150 group-active:scale-90 group-active:ring-2 group-active:ring-white/80 ${
            emphasized
              ? "bg-white text-black group-active:bg-white/85"
              : "bg-black/45 text-white ring-1 ring-white/15 backdrop-blur group-active:bg-white group-active:text-black"
          }`}
        >
          {icon}
        </span>
      </Link>
    </motion.div>
  );
}
