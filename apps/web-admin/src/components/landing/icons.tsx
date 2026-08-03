import type { ComponentType, SVGProps } from "react";

function createIcon(path: string) {
  return function IconComponent(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d={path} />
      </svg>
    );
  };
}

export type IconComponentType = ComponentType<SVGProps<SVGSVGElement>>;

export const IconMenu = createIcon("M4 6h16M4 12h16M4 18h16");
export const IconClose = createIcon("M6 6l12 12M18 6 6 18");
export const IconChevronDown = createIcon("m6 9 6 6 6-6");
export const IconCheck = createIcon("M9 12.5 11.2 15 15.5 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z");
export const IconArrowRight = createIcon("M5 12h14M13 6l6 6-6 6");
export const IconChat = createIcon("M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z");
export const IconQr = createIcon("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 15h1.5v1.5H15zM18.5 15H20v1.5h-1.5zM15 18.5h1.5V20H15zM18.5 18.5H20V20h-1.5z");
export const IconMapPin = createIcon("M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z");
export const IconFlow = createIcon("M6 4h4v4H6zM14 16h4v4h-4zM8 8v4a2 2 0 0 0 2 2h4M14 8v-.5");
export const IconBell = createIcon("M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0");
export const IconChart = createIcon("M4 20V10M11 20V4M18 20v-7M3 20h18");
export const IconShield = createIcon("M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z M9.3 12.2l1.8 1.8 3.4-3.8");
export const IconUsers = createIcon("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 20c0-2.2-.9-4.2-2.3-5.6M15 5.2a3 3 0 1 1 2 5.6");
export const IconSend = createIcon("m3 12 18-8-8 18-2-8-8-2Z");
export const IconClock = createIcon("M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z");
export const IconHome = createIcon("M4 11.5 12 4l8 7.5M6 9.5V20h12V9.5");
export const IconLock = createIcon("M6 11V8a6 6 0 1 1 12 0v3M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z");
export const IconTag = createIcon("M11 3h5.5L21 7.5V13l-8.5 8.5a1.5 1.5 0 0 1-2.1 0L3 14.1a1.5 1.5 0 0 1 0-2.1L11 3Z M16.2 8.2h.01");
