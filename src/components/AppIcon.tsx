import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

export type IconName =
  | 'nav-back' | 'nav-forward' | 'nav-close'
  | 'tab-map' | 'tab-orders' | 'tab-chats' | 'tab-profile' | 'tab-dashboard' | 'tab-create'
  | 'role-worker' | 'role-employer'
  | 'status-done' | 'sys-read' | 'status-incomplete' | 'status-pending' | 'status-active' | 'status-warning' | 'status-offline'
  | 'sys-hammer' | 'sys-help'
  | 'action-edit' | 'action-delete' | 'action-send' | 'action-attach' | 'action-chat' | 'action-filter' | 'action-search'
  | 'action-sort-down' | 'action-sort-up' | 'action-locate'
  | 'sys-calendar' | 'sys-phone' | 'sys-price' | 'sys-compass' | 'sys-verified' | 'sys-shield' | 'sys-premium' | 'sys-rating' | 'sys-locked' | 'sys-logout' | 'sys-friends' | 'sys-document' | 'sys-check' | 'sys-key' | 'sys-info' | 'sys-location' | 'notifications-outline' | 'settings-outline' | 'logo-instagram';

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
  focused?: boolean;
  style?: any;
}

export default function AppIcon({ name, size = 24, color = '#64748B', focused = false, style }: AppIconProps) {
  const p = {
    size,
    color,
    focused,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const getGeometry = () => {
    switch (name) {
      case 'nav-back':
        return (
          <>
            <Path d="M19 12H5" />
            <Path d="M12 19l-7-7 7-7" />
          </>
        );
      case 'nav-forward':
        return (
          <>
            <Path d="M5 12h14" />
            <Path d="M12 5l7 7-7 7" />
          </>
        );
      case 'nav-close':
        return <Path d="M18 6L6 18M6 6l12 12" />;
      case 'action-filter':
        return (
          <>
            <Path d="M4 21v-7M4 14a3 3 0 010-6M4 8V3M12 21v-9M12 12a3 3 0 010-6M12 6V3M20 21v-5M20 16a3 3 0 010-6M20 10V3" />
          </>
        );
      case 'action-search':
        return (
          <>
            <Circle cx="11" cy="11" r="8" />
            <Path d="M21 21l-4.35-4.35" />
          </>
        );
      case 'action-locate':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Line x1="12" y1="2" x2="12" y2="6" />
            <Line x1="12" y1="18" x2="12" y2="22" />
            <Line x1="2" y1="12" x2="6" y2="12" />
            <Line x1="18" y1="12" x2="22" y2="12" />
          </>
        );
      case 'action-sort-down':
        return (
          <>
            <Path d="M12 5v14" />
            <Path d="M19 12l-7 7-7-7" />
          </>
        );
      case 'action-sort-up':
        return (
          <>
            <Path d="M12 19V5" />
            <Path d="M5 12l7-7 7 7" />
          </>
        );
      case 'tab-map':
        return (
          <>
            <Path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
            <Path d="M9 3v15" />
            <Path d="M15 6v15" />
          </>
        );
      case 'tab-orders':
        return (
          <>
            <Path d="M8 6h13M8 12h13M8 18h13" />
            <Path d="M3 6h.01M3 12h.01M3 18h.01" />
          </>
        );
      case 'tab-chats':
        return (
          <>
            <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </>
        );
      case 'tab-profile':
        return (
          <>
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" fill={p.focused ? p.color : 'none'} />
          </>
        );
      case 'tab-dashboard':
        return (
          <>
            <Rect x="3" y="3" width="7" height="7" rx="1.5" />
            <Rect x="14" y="3" width="7" height="7" rx="1.5" />
            <Rect x="14" y="14" width="7" height="7" rx="1.5" />
            <Rect x="3" y="14" width="7" height="7" rx="1.5" />
          </>
        );
      case 'tab-create':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M12 8v8M8 12h8" />
          </>
        );
      case 'role-worker':
        return (
          <>
            {/* High precision Laser Rangefinder */}
            <Rect x="7" y="2" width="10" height="20" rx="2" fill={p.focused ? p.color : 'none'} />
            <Circle cx="12" cy="6" r="1.5" fill={p.color} />
            <Rect x="9" y="10" width="6" height="4" rx="0.5" />
            <Path d="M12 16l1 2h-2z" />
          </>
        );
      case 'role-employer':
        return (
          <>
            {/* Architectural tablet with checkmark and house outline */}
            <Rect x="4" y="4" width="16" height="16" rx="2" fill={p.focused ? p.color : 'none'} />
            <Path d="M9 12l2 2 4-4" />
            <Path d="M12 6l-4 3v5h8v-5z" strokeWidth={1} />
          </>
        );
      case 'status-done':
        return (
          <>
            <Circle cx="12" cy="12" r="10" fill={p.focused ? p.color : 'none'} />
            <Path d="M8 12l2.5 2.5L16 9" />
          </>
        );
      case 'sys-read':
        return <Path d="M7 12l5 5 9-9M2 12l5 5M12 12l5-5" />;
      case 'status-incomplete':
        return <Circle cx="12" cy="12" r="8" strokeDasharray="4 4" />;
      case 'status-pending':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M12 6v6l4 2" />
          </>
        );
      case 'status-active':
        return (
          <>
            <Circle cx="12" cy="12" r="10" fill={p.focused ? p.color : 'none'} />
            <Path d="M10 8l6 4-6 4V8z" />
          </>
        );
      case 'status-warning':
        return (
          <>
            <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <Line x1="12" y1="9" x2="12" y2="13" />
            <Line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        );
      case 'status-offline':
        return (
          <>
            <Path d="M17.5 19a4.5 4.5 0 0 0 2.5-8.25A6 6 0 0 0 8.25 6.75a6.5 6.5 0 0 0-3.75 11.5" />
            <Line x1="1" y1="1" x2="23" y2="23" />
          </>
        );
      case 'sys-hammer':
        return (
          <>
            <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.07.77l-5.66 5.66-4.24-4.24 1.41-1.41 1.42 1.41L13 3.5M6 14.5l-4 4 1.5 1.5 4-4" />
          </>
        );
      case 'sys-help':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <Line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        );
      case 'action-edit':
        return (
          <>
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <Path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </>
        );
      case 'action-delete':
        return (
          <>
            <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <Line x1="10" y1="11" x2="10" y2="17" />
            <Line x1="14" y1="11" x2="14" y2="17" />
          </>
        );
      case 'action-send':
        return (
          <>
            <Line x1="22" y1="2" x2="11" y2="13" />
            <Path d="M22 2L15 22l-4-9-9-4 22-7z" />
          </>
        );
      case 'action-attach':
        return (
          <>
            <Rect x="3" y="3" width="18" height="18" rx="2" />
            <Circle cx="8.5" cy="8.5" r="1.5" />
            <Path d="M21 15l-5-5L5 21" />
          </>
        );
      case 'action-chat':
        return <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />;
      case 'sys-calendar':
        return (
          <>
            <Rect x="3" y="4" width="18" height="18" rx="2" />
            <Line x1="16" y1="2" x2="16" y2="6" />
            <Line x1="8" y1="2" x2="8" y2="6" />
            <Line x1="3" y1="10" x2="21" y2="10" />
          </>
        );
      case 'sys-phone':
        return <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.79 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />;
      case 'sys-price':
        return (
          <>
            <Rect x="2" y="6" width="20" height="12" rx="2" />
            <Circle cx="12" cy="12" r="3" />
            <Line x1="6" y1="12" x2="6.01" y2="12" />
            <Line x1="18" y1="12" x2="18.01" y2="12" />
          </>
        );
      case 'sys-compass':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z" fill={p.focused ? p.color : 'none'} />
          </>
        );
      case 'sys-verified':
        return (
          <>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={p.focused ? p.color : 'none'} />
            <Path d="M9 11l2 2 4-4" />
          </>
        );
      case 'sys-shield':
        return <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
      case 'sys-premium':
        return <Path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />;
      case 'sys-rating':
        return <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={p.focused ? p.color : 'none'} />;
      case 'sys-locked':
        return (
          <>
            <Rect x="3" y="11" width="18" height="11" rx="2" fill={p.focused ? p.color : 'none'} />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        );
      case 'sys-logout':
        return (
          <>
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </>
        );
      case 'sys-friends':
        return (
          <>
            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <Circle cx="9" cy="7" r="4" />
            <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        );
      case 'sys-document':
        return (
          <>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </>
        );
      case 'sys-check':
        return <Path d="M20 6L9 17l-5-5" />;
      case 'sys-key':
        return (
          <>
            <Circle cx="7.5" cy="15.5" r="5.5" />
            <Path d="M21 2l-9.6 9.6M15.5 7.5L20 12M18.5 4.5L21.5 8" />
          </>
        );
      case 'sys-info':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Line x1="12" y1="16" x2="12" y2="12" />
            <Line x1="12" y1="8" x2="12.01" y2="8" />
          </>
        );
      case 'sys-location':
        return (
          <>
            <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill={p.focused ? p.color : 'none'} />
            <Circle cx="12" cy="10" r="3" />
          </>
        );
      case 'notifications-outline':
        return (
          <>
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </>
        );
      case 'settings-outline':
        return (
          <>
            <Circle cx="12" cy="12" r="3" />
            <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </>
        );
      case 'logo-instagram':
        return (
          <>
            <Rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <Line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={p.strokeWidth}
      strokeLinecap={p.strokeLinecap}
      strokeLinejoin={p.strokeLinejoin}
      style={style}
    >
      {getGeometry()}
    </Svg>
  );
}
