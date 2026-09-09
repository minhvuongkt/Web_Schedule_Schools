import type { SVGProps } from "react";

/**
 * Lucide-style inline SVG icons (24x24 grid, 2px stroke, currentColor).
 * Path data follows the Lucide icon set (https://lucide.dev, ISC license —
 * free for commercial use, no attribution required). Embedded as a local
 * component because `npm install` is unavailable on this machine.
 */

type IconPath = { d: string; fill?: boolean }[];

const ICONS: Record<string, IconPath> = {
  home: [
    { d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
    { d: "M9 22V12h6v10" },
  ],
  calendar: [
    { d: "M8 2v4" },
    { d: "M16 2v4" },
    { d: "M3 10h18" },
    { d: "M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" },
  ],
  bell: [
    { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" },
    { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  ],
  user: [
    { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" },
    { d: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  ],
  clock: [
    { d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" },
    { d: "M12 6v6l4 2" },
  ],
  logout: [
    { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" },
    { d: "M16 17l5-5-5-5" },
    { d: "M21 12H9" },
  ],
  login: [
    { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" },
    { d: "M10 17l5-5-5-5" },
    { d: "M15 12H3" },
  ],
  "chevron-left": [{ d: "m15 18-6-6 6-6" }],
  "chevron-right": [{ d: "m9 18 6-6-6-6" }],
  "arrow-left": [
    { d: "M19 12H5" },
    { d: "m12 19-7-7 7-7" },
  ],
  check: [{ d: "M20 6 9 17l-5-5" }],
  x: [
    { d: "M18 6 6 18" },
    { d: "m6 6 12 12" },
  ],
  plus: [
    { d: "M12 5v14" },
    { d: "M5 12h14" },
  ],
  search: [
    { d: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" },
    { d: "m21 21-4.3-4.3" },
  ],
  "file-spreadsheet": [
    { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
    { d: "M14 2v6h6" },
    { d: "M8 13h2" },
    { d: "M14 13h2" },
    { d: "M8 17h2" },
    { d: "M14 17h2" },
  ],
  printer: [
    { d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" },
    { d: "M6 9V2h12v7" },
    { d: "M6 14h12v8H6z" },
  ],
  "history-icon": [
    { d: "M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9z" },
    { d: "M12 7v5l3 2" },
  ],
  "users-2": [
    { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { d: "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
    { d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { d: "M16 3.13a4 4 0 0 1 0 7.75" },
  ],
  "graduation-cap": [
    { d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" },
    { d: "M22 10v6" },
    { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" },
  ],
  "book-open": [
    { d: "M12 7v14" },
    { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" },
  ],
  "chart-column": [
    { d: "M3 3v16a2 2 0 0 0 2 2h16" },
    { d: "M18 17V9" },
    { d: "M13 17V5" },
    { d: "M8 17v-3" },
  ],
  settings: [
    { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" },
    { d: "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
  ],
  "shield-check": [
    { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" },
    { d: "m9 12 2 2 4-4" },
  ],
  "refresh-cw": [
    { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" },
    { d: "M21 3v5h-5" },
    { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" },
    { d: "M8 16H3v5" },
  ],
  qrcode: [
    { d: "M5 3h4v4H5z" },
    { d: "M15 3h4v4h-4z" },
    { d: "M5 17h4v4H5z" },
    { d: "M15 13h2v2h-2z" },
    { d: "M19 13h2v2h-2z" },
    { d: "M15 17h2v2h-2z" },
    { d: "M19 17h2v4h-2z" },
    { d: "M11 3h2v2h-2z" },
    { d: "M11 19h2v2h-2z" },
    { d: "M3 9h2v2H3z" },
    { d: "M3 13h4v2H3z" },
    { d: "M11 9h2v6h-2z" },
  ],
  smartphone: [
    { d: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" },
    { d: "M12 18h.01" },
  ],
  "sparkles": [
    { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" },
  ],
  "arrow-right": [
    { d: "M5 12h14" },
    { d: "m12 5 7 7-7 7" },
  ],
  "external-link": [
    { d: "M15 3h6v6" },
    { d: "M10 14 21 3" },
    { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" },
  ],
  "trash-2": [
    { d: "M3 6h18" },
    { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" },
    { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" },
    { d: "M10 11v6" },
    { d: "M14 11v6" },
  ],
  menu: [
    { d: "M4 6h16" },
    { d: "M4 12h16" },
    { d: "M4 18h16" },
  ],
  "chevron-down": [{ d: "m6 9 6 6 6-6" }],
};

export type IconName = keyof typeof ICONS | (string & {});

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const paths = ICONS[name as string] ?? [];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} />
      ))}
    </svg>
  );
}
