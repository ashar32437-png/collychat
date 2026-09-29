export type ToolKey = "links" | "calculator" | "timer" | "notes" | "ai" | "admin";

export const TOOL_ORDER: ToolKey[] = ["links", "calculator", "timer", "notes", "ai"];

export const ADMIN_TOOL: ToolKey = "admin";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const TOOL_META: Record<ToolKey, { label: string; icon: React.ReactNode }> = {
  links: {
    label: "Hub",
    icon: <span className="text-[22px] leading-none">🔗</span>,
  },
  calculator: {
    label: "Calculator",
    icon: (
      <svg {...iconProps} className="h-6 w-6">
        <rect x="4" y="2.5" width="16" height="19" rx="3" />
        <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01" />
      </svg>
    ),
  },
  timer: {
    label: "Timer & stopwatch",
    icon: (
      <svg {...iconProps} className="h-6 w-6">
        <circle cx="12" cy="13.5" r="7.5" />
        <path d="M12 10v3.8l2.4 1.9M9.5 2.5h5" />
      </svg>
    ),
  },
  notes: {
    label: "Sticky notes",
    icon: (
      <svg {...iconProps} className="h-6 w-6">
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    ),
  },
  ai: {
    label: "AI",
    icon: (
      <svg {...iconProps} className="h-6 w-6">
        <path d="M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16l-1.7-4.5L4.7 9.8l4.6-1.7L11 3.5Z" />
        <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      </svg>
    ),
  },
  admin: {
    label: "Admin",
    icon: (
      <svg {...iconProps} className="h-6 w-6">
        <path d="M12 3.2l7 2.6v5.7c0 4.2-2.8 7.6-7 9.3-4.2-1.7-7-5.1-7-9.3V5.8l7-2.6Z" />
        <path d="M9.5 12.2l1.8 1.8 3.4-3.6" />
      </svg>
    ),
  },
};
