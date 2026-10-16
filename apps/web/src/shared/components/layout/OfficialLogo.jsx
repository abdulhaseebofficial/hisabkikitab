/** The exact supplied mark, resized and cropped for delivery without redrawing. */
export default function OfficialLogo({ className = '' }) {
  return (
    <span className={`inline-block aspect-square shrink-0 overflow-hidden rounded-[31%] ${className}`} aria-hidden="true">
      <img src="/logo-512.png" alt="" width="512" height="512" draggable="false" className="block h-full w-full select-none" />
    </span>
  );
}
