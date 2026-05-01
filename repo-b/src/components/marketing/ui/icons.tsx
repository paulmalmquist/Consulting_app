/**
 * Central icon convention for Novendor marketing surfaces.
 *
 * Per the icon spec (skills/novendor-icons-system/SKILL.md):
 *   - Marketing chrome + pages → Remix Icon (@remixicon/react)
 *   - App / lab / operator chrome → Iconoir (iconoir-react)
 *   - State / status → Unicode marks (◉ ◌ ▲ ▼ ⚠ ! → ⌘K)
 *
 * Always render through this module so the size + stroke convention
 * stays consistent. Never import directly from @remixicon/react in a
 * page file — re-export here first.
 */

import type { ComponentType } from 'react';
import {
  RiHomeLine,
  RiCompassLine,
  RiFlowChart,
  RiArrowLeftRightLine,
  RiBarChartLine,
  RiStackLine,
  RiBuilding2Line,
  RiClipboardLine,
  RiUserLine,
  RiMailLine,
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiMenuLine,
  RiSearchLine,
  RiAccountCircleLine,
  RiBuildingLine,
  RiScales3Line,
  RiStethoscopeLine,
  RiWallet3Line,
} from '@remixicon/react';

export const ICON_SIZE = 17;
export const ICON_STROKE = 1.55;

/**
 * Marketing icon — applies the size/stroke convention. Use this
 * wrapper instead of rendering the Remix component directly.
 *
 * Type widened to `ComponentType<Record<string, unknown>>` so it
 * accepts both Remix's class component and Iconoir's function
 * component without fighting their differing prop generics.
 */
type IconComponent = ComponentType<Record<string, unknown>>;

export type NvIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
};

function makeIcon(Component: IconComponent, displayName: string) {
  function NvIcon({ className, size = ICON_SIZE, strokeWidth = ICON_STROKE, style, ...rest }: NvIconProps) {
    return (
      <Component
        className={className}
        width={size}
        height={size}
        strokeWidth={strokeWidth}
        style={style}
        {...rest}
      />
    );
  }
  NvIcon.displayName = displayName;
  return NvIcon;
}

// Nav icons
export const IconHome = makeIcon(RiHomeLine, 'IconHome');
export const IconCompass = makeIcon(RiCompassLine, 'IconCompass');
export const IconWorkflow = makeIcon(RiFlowChart, 'IconWorkflow');
export const IconShift = makeIcon(RiArrowLeftRightLine, 'IconShift');
export const IconBarChart = makeIcon(RiBarChartLine, 'IconBarChart');
export const IconStack = makeIcon(RiStackLine, 'IconStack');
export const IconIndustries = makeIcon(RiBuilding2Line, 'IconIndustries');
export const IconClipboard = makeIcon(RiClipboardLine, 'IconClipboard');
export const IconUser = makeIcon(RiUserLine, 'IconUser');
export const IconMail = makeIcon(RiMailLine, 'IconMail');

// Chrome / control icons
export const IconChevronDown = makeIcon(RiArrowDownSLine, 'IconChevronDown');
export const IconChevronLeft = makeIcon(RiArrowLeftSLine, 'IconChevronLeft');
export const IconChevronRight = makeIcon(RiArrowRightSLine, 'IconChevronRight');
export const IconClose = makeIcon(RiCloseLine, 'IconClose');
export const IconMenu = makeIcon(RiMenuLine, 'IconMenu');
export const IconSearch = makeIcon(RiSearchLine, 'IconSearch');
export const IconUserCircle = makeIcon(RiAccountCircleLine, 'IconUserCircle');

// Industry-specific badges (used inline next to industry labels)
export const IconBuilding = makeIcon(RiBuildingLine, 'IconBuilding');
export const IconScales = makeIcon(RiScales3Line, 'IconScales');
export const IconStethoscope = makeIcon(RiStethoscopeLine, 'IconStethoscope');
export const IconWallet = makeIcon(RiWallet3Line, 'IconWallet');
