import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type NvCardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  liftOnHover?: boolean;
  children: ReactNode;
};

export function NvCard({ padded = true, liftOnHover = false, className, children, ...rest }: NvCardProps) {
  return (
    <div
      className={cn(
        'nv-card',
        padded && 'nv-card-pad',
        liftOnHover && 'nv-card-hover-lift',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
