import { BookOpen } from 'lucide-react';
export function BrandIcon({ className = '' }: { className?: string }) {
  return <span className={`brand-icon ${className}`} role="img" aria-label="Canvas 随行图标"><BookOpen size={26} strokeWidth={1.8}/><i/></span>;
}