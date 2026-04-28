import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variantClass: Record<Variant, string> = {
  primary: 'nv-btn-primary',
  secondary: 'nv-btn-secondary',
  ghost: 'nv-btn-ghost',
};

type CommonProps = {
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

type LinkProps = CommonProps & {
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

type ButtonProps = CommonProps & {
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export function NvButton(props: LinkProps | ButtonProps) {
  const { variant = 'primary', className, children, ...rest } = props as CommonProps & {
    href?: string;
  } & Record<string, unknown>;
  const classes = cn('nv-btn', variantClass[variant], className);

  if (typeof rest.href === 'string') {
    const { href, ...anchorRest } = rest as { href: string } & Record<string, unknown>;
    return (
      <Link href={href} className={classes} {...(anchorRest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
