import React from "react";

export type ToolIconName =
  | "memory"
  | "code"
  | "registers"
  | "display"
  | "keyboard"
  | "pipeline"
  | "tools";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  title?: string;
}

function BaseIcon({ children, title, ...rest }: IconProps): React.JSX.Element {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MemoryIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={6} y={6} width={20} height={6} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <rect x={6} y={13} width={20} height={6} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <rect x={6} y={20} width={20} height={6} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <circle cx={10} cy={9} r={1} fill="currentColor" />
    <circle cx={10} cy={16} r={1} fill="currentColor" />
    <circle cx={10} cy={23} r={1} fill="currentColor" />
  </BaseIcon>
);

export const CodeIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={4} y={6} width={24} height={20} rx={2} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path d="M12 11 8 16l4 5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    <path d="m20 11 4 5-4 5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    <path d="m14 23 4-14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </BaseIcon>
);

export const RegistersIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={6} y={6} width={20} height={20} rx={2} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path d="M10 10h12M10 16h12M10 22h12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <circle cx={10} cy={10} r={1.4} fill="currentColor" />
    <circle cx={10} cy={16} r={1.4} fill="currentColor" />
    <circle cx={10} cy={22} r={1.4} fill="currentColor" />
  </BaseIcon>
);

export const DisplayIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={5} y={7} width={22} height={14} rx={2} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <rect x={10} y={22} width={12} height={3} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path d="M10 12h12M10 15h7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </BaseIcon>
);

export const KeyboardIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={4} y={9} width={24} height={14} rx={2} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path
      d="M8 13h2m2 0h2m2 0h2m2 0h2M8 17h2m2 0h2m2 0h2m2 0h2M8 21h16"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </BaseIcon>
);

export const PipelineIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={5} y={9} width={8} height={14} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <rect x={19} y={9} width={8} height={14} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path d="M13 16h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <circle cx={16} cy={12} r={1.6} fill="currentColor" />
    <circle cx={16} cy={20} r={1.6} fill="currentColor" />
  </BaseIcon>
);

export const ToolboxIcon = (props: IconProps): React.JSX.Element => (
  <BaseIcon {...props}>
    <rect x={5} y={11} width={22} height={12} rx={2} stroke="currentColor" strokeWidth={1.5} fill="none" />
    <path d="M12 11v-2.5A1.5 1.5 0 0 1 13.5 7h5A1.5 1.5 0 0 1 20 8.5V11" stroke="currentColor" strokeWidth={1.5} />
    <path d="M10 17h4m4 0h4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </BaseIcon>
);

const ICON_MAP: Record<ToolIconName, React.FC<IconProps>> = {
  memory: MemoryIcon,
  code: CodeIcon,
  registers: RegistersIcon,
  display: DisplayIcon,
  keyboard: KeyboardIcon,
  pipeline: PipelineIcon,
  tools: ToolboxIcon,
};

export function renderToolIcon(icon?: string, title?: string): React.ReactNode {
  const Icon = icon && icon in ICON_MAP ? ICON_MAP[icon as ToolIconName] : ToolboxIcon;
  return <Icon aria-hidden={title ? undefined : true} aria-label={title} />;
}
