import { siInstagram } from "simple-icons";

type InstagramIconProps = {
  className?: string;
};

export function InstagramIcon({ className = "h-5 w-5" }: InstagramIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d={siInstagram.path} />
    </svg>
  );
}
