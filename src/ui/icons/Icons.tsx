/**
 * Hand-written icon set (no icon library, SPEC_AMENDMENT_02 Part 2).
 * 24x24 grid, 1.75 stroke, `currentColor`, decorative by default (aria-hidden).
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.9-6.2a.8.8 0 0 0 0-1.4L9.2 5.1A.8.8 0 0 0 8 5.8z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z" />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16v4" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function PulseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2.2-5 3.6 10 2.2-5H21" />
    </Icon>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9.5 2.5h5" />
    </Icon>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13.5l3.5-3.5" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** App mark: an eye whose lower lid is a pulse trace. */
export function LogoMark(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12" />
      <path d="M2.5 12h5l1.8-3 2.4 7 2-4h7.8" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.7" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.7 2.7L16 9.6" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.3 4.2L2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SunLightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v2.5M4.6 6.1l1.8 1.8M19.4 6.1l-1.8 1.8M3 14h2.5M18.5 14H21" />
      <path d="M7.5 18a4.5 4.5 0 0 1 9 0" />
      <path d="M3 21h18" />
    </Icon>
  );
}
