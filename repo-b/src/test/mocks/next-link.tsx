import React from "react";

// Minimal mock for next/link in the vitest test environment.
// Renders as a plain <a href> element (preserving role="link" semantics)
// but calls preventDefault on click to stop jsdom from navigating, which
// would otherwise unmount the React tree and break state-dependent tests.
const Link = ({
  href,
  children,
  onClick,
  ...props
}: {
  href: string | object;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  [key: string]: unknown;
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (onClick) onClick(e);
  };

  return (
    <a
      href={typeof href === "string" ? href : JSON.stringify(href)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
};

export default Link;
