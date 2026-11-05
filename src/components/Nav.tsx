'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** One entry of the main navigation. */
export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/** Pages of the dashboard. Add an entry when a page is built. */
export const NAV_ITEMS: readonly NavItem[] = [{ href: '/', label: 'Overview' }];

/** Whether `href` is the page being shown. The overview matches only the exact path. */
export function isCurrent(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The list of links, with `aria-current="page"` on the one being shown. */
export function NavList(props: { items: readonly NavItem[]; pathname: string }) {
  return (
    <ul className="nav">
      {props.items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="nav__link"
            aria-current={isCurrent(item.href, props.pathname) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The main navigation landmark. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <NavList items={NAV_ITEMS} pathname={pathname} />
    </nav>
  );
}
