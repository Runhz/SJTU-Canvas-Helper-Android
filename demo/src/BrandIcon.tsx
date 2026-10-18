export function BrandIcon({ className = '' }: { className?: string }) {
  return <span className={`brand-icon ${className}`} role="img" aria-label="Canvas 随行图标"><img src="/app-icon.svg" alt="" draggable={false}/></span>;
}
