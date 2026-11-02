import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPlus = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const IconFetch = () => (
  <Icon>
    <path d="M12 4 4.5 11.5M4.5 6.5v5h5" />
  </Icon>
);
export const IconPull = () => (
  <Icon>
    <path d="M8 2.5v9M4.5 8 8 11.5 11.5 8M3 13.5h10" />
  </Icon>
);
export const IconPush = () => (
  <Icon>
    <path d="M8 13.5v-9M4.5 8 8 4.5 11.5 8M3 2.5h10" />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
  </Icon>
);
export const IconCompare = () => (
  <Icon>
    <path d="M3 5.5h8.5M9.5 3.5l2 2-2 2M13 10.5H4.5M6.5 8.5l-2 2 2 2" />
  </Icon>
);
export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);
export const IconTarget = () => (
  <Icon>
    <circle cx="8" cy="8" r="5" />
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
  </Icon>
);
export const IconRefresh = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
  </Icon>
);
export const IconFolder = () => (
  <Icon size={14}>
    <path d="M1.5 4.5v8h13v-7H7.5L6 4H2z" />
  </Icon>
);
export const IconBranch = () => (
  <Icon size={14}>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5.5" r="1.5" />
    <path d="M4.5 5v6M11.5 7c0 3-7 2-7 4" />
  </Icon>
);
export const IconTag = () => (
  <Icon size={14}>
    <path d="M2 2.5v5l6.5 6.5 5-5L7 2.5z" />
    <circle cx="5" cy="5.5" r="0.8" />
  </Icon>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    aria-hidden="true"
    style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }}
  >
    <path d="M4.5 3 7.5 6l-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
export const IconSearch = () => (
  <Icon size={14}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Icon>
);
export const IconOpen = () => (
  <Icon size={14}>
    <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" />
  </Icon>
);
