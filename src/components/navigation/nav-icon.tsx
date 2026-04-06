import { iconPaths, type IconName } from "./nav-items";

type Props = {
  icon: IconName;
  className?: string;
};

export function NavIcon({ icon, className = "h-5 w-5" }: Props) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={iconPaths[icon]}
      />
    </svg>
  );
}
