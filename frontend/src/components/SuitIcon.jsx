// SVG emblems for the Spanish deck suits. They use `currentColor`,
// so the existing .suit-* colour classes keep working.
const PATHS = {
  // Oros — moneda / medallón (anillo con punto central)
  oros: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm0 3.3a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4Z"
      />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  // Copes — copa / cáliz (cuenco + pie)
  copes: (
    <>
      <path d="M5.5 3.5h13C18.5 8 16 11.2 12 11.2S5.5 8 5.5 3.5Z" />
      <path d="M11 10.8h2v6.7h2.6a1 1 0 0 1 0 2H8.4a1 1 0 0 1 0-2H11Z" />
    </>
  ),
  // Espases — espada (hoja, guarda, empuñadura y pomo)
  espases: (
    <>
      <path d="M12 2l1.35 4.1-.42 7.9h-1.86l-.42-7.9L12 2Z" />
      <rect x="7" y="13.6" width="10" height="2.1" rx="1.05" />
      <rect x="11" y="15.7" width="2" height="3.5" />
      <circle cx="12" cy="20.4" r="1.75" />
    </>
  ),
  // Bastos — garrote de madera (maza con dos muñones cortados)
  bastons: (
    <>
      <path d="M10.85 21l.5-9.5C8.6 11 8.6 4 12 4s3.4 7 .65 7.5l.5 9.5Z" />
      <path d="M9.1 6.1 6.5 5l1 2.5L9.1 6.1Z" />
      <path d="M15 8.1l2.6-.8-1 2.4L15 8.1Z" />
    </>
  ),
};

export default function SuitIcon({ suit, className = '' }) {
  const paths = PATHS[suit];
  if (!paths) return null;
  return (
    <svg
      className={`suit-svg ${className}`}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}
