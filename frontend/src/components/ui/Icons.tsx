import React from 'react'
import {
  LuHeartPulse, LuBookPlus, LuKey, LuBrain, LuLayers,
  LuServer, LuZap, LuScroll, LuClipboardList, LuUsers, LuBuilding2,
  LuActivity as LucideActivity,
  LuShieldCheck as LucideShieldCheck, LuInbox as LucideInbox,
  LuBell as LucideBell, LuSettings as LucideSettings,
  LuDatabase as LucideDatabase,
} from 'react-icons/lu'

interface IconProps {
  w?: number;
  style?: React.CSSProperties;
}

const IconRi: React.FC<IconProps & { icon: React.FC }> = ({ w = 16, icon, ...rest }) => (
  <span style={{ width: w, height: w, display: 'inline-block', verticalAlign: 'middle' }}>
    {React.createElement(icon as any, { size: w, ...rest })}
  </span>
)

const Ic: React.FC<{ d?: string; paths?: string[]; w?: number; sw?: number; style?: React.CSSProperties }> = ({ d, paths, w = 16, sw = 1.6, style }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d && <path d={d} />}
    {paths && paths.map((p, i) => <path key={i} d={p} />)}
  </svg>
)

export const Shield: React.FC<IconProps> = (p) => <Ic {...p} d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
export const ShieldCheck: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z","m9 12 2 2 4-4"]} />
export const Activity: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideActivity} />
export const AlertTri: React.FC<IconProps> = (p) => <Ic {...p} paths={["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z","M12 9v4","M12 17h.01"]} />
export const AlertO: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z","M12 8v4","M12 16h.01"]} />
export const Settings: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z","M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.27.62.87 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"]} />
export const Layers: React.FC<IconProps> = (p) => <Ic {...p} paths={["m12 2 10 6-10 6L2 8l10-6Z","m2 16 10 6 10-6","m2 12 10 6 10-6"]} />
export const Cpu: React.FC<IconProps> = (p) => <Ic {...p} paths={["M4 4h16v16H4z","M9 9h6v6H9z","M9 1v3","M15 1v3","M9 20v3","M15 20v3","M20 9h3","M20 15h3","M1 9h3","M1 15h3"]} />
export const Network: React.FC<IconProps> = (p) => <Ic {...p} paths={["M2 12h6","M16 12h6","M12 2v6","M12 16v6","M9 9 6 6","M15 9l3-3","M15 15l3 3","M9 15l-3 3"]} />
export const List: React.FC<IconProps> = (p) => <Ic {...p} paths={["M8 6h13","M8 12h13","M8 18h13","M3 6h.01","M3 12h.01","M3 18h.01"]} />
export const Filter: React.FC<IconProps> = (p) => <Ic {...p} d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" />
export const X: React.FC<IconProps> = (p) => <Ic {...p} paths={["M18 6 6 18","M6 6l12 12"]} />
export const Plus: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 5v14","M5 12h14"]} />
export const ChevronR: React.FC<IconProps> = (p) => <Ic {...p} d="m9 18 6-6-6-6" />
export const ChevronD: React.FC<IconProps> = (p) => <Ic {...p} d="m6 9 6 6 6-6" />
export const ChevronL: React.FC<IconProps> = (p) => <Ic {...p} d="m15 18-6-6 6-6" />
export const ArrowUR: React.FC<IconProps> = (p) => <Ic {...p} paths={["M7 17 17 7","M7 7h10v10"]} />
export const Refresh: React.FC<IconProps> = (p) => <Ic {...p} paths={["M3 12a9 9 0 0 1 15-6.7L21 8","M21 3v5h-5","M21 12a9 9 0 0 1-15 6.7L3 16","M3 21v-5h5"]} />
export const Play: React.FC<IconProps> = (p) => <Ic {...p} d="M5 3 19 12 5 21V3Z" />
export const Pause: React.FC<IconProps> = (p) => <Ic {...p} paths={["M6 4h4v16H6z","M14 4h4v16h-4z"]} />
export const Sun: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z","M12 1v2","M12 21v2","M4.22 4.22l1.42 1.42","M18.36 18.36l1.42 1.42","M1 12h2","M21 12h2","M4.22 19.78l1.42-1.42","M18.36 5.64l1.42-1.42"]} />
export const Moon: React.FC<IconProps> = (p) => <Ic {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
export const Bell: React.FC<IconProps> = (p) => <Ic {...p} paths={["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9","M10.3 21a1.94 1.94 0 0 0 3.4 0"]} />
export const User: React.FC<IconProps> = (p) => <Ic {...p} paths={["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2","M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"]} />
export const Lock: React.FC<IconProps> = (p) => <Ic {...p} paths={["M5 11h14v10H5z","M8 11V7a4 4 0 1 1 8 0v4"]} />
export const Key: React.FC<IconProps>  = (p) => <Ic {...p} paths={["M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"]} />
export const Pencil: React.FC<IconProps> = (p) => <Ic {...p} paths={["M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"]} />
export const Code: React.FC<IconProps> = (p) => <Ic {...p} paths={["m16 18 6-6-6-6","m8 6-6 6 6 6"]} />
export const Eye: React.FC<IconProps> = (p) => <Ic {...p} paths={["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z","M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"]} />
export const EyeOff: React.FC<IconProps> = (p) => <Ic {...p} paths={["M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 4.06-5.94","M9.9 4.24A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a17.9 17.9 0 0 1-2.16 3.19","M9.9 9.9 14.1 14.1","M1 1 23 23"]} />
export const Bolt: React.FC<IconProps> = (p) => <Ic {...p} d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
export const Menu: React.FC<IconProps> = (p) => <Ic {...p} paths={["M3 12h18","M3 6h18","M3 18h18"]} />
export const Dot: React.FC<IconProps> = (p) => <Ic {...p} d="M12 12.01" />
export const Copy: React.FC<IconProps> = (p) => <Ic {...p} paths={["M8 4h10v14","M4 8h10v14H4z"]} />
export const Download: React.FC<IconProps> = (p) => <Ic {...p} paths={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M7 10l5 5 5-5","M12 15V3"]} />
export const Terminal: React.FC<IconProps> = (p) => <Ic {...p} paths={["m4 9 4 3-4 3","M11 15h8"]} />
export const GitBranch: React.FC<IconProps> = (p) => <Ic {...p} paths={["M6 3v12","M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z","M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z","M18 9a9 9 0 0 1-9 9"]} />
export const Inbox: React.FC<IconProps> = (p) => <Ic {...p} paths={["M22 12h-6l-2 3h-4l-2-3H2","M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"]} />
export const Check: React.FC<IconProps> = (p) => <Ic {...p} d="M20 6 9 17l-5-5" />
export const Trash: React.FC<IconProps> = (p) => <Ic {...p} paths={["M3 6h18","M8 6V4h8v2","M5 6v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6","M10 11v6","M14 11v6"]} />
export const Trash2: React.FC<IconProps> = (p) => <Ic {...p} paths={["M3 6h18","M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"]} />
export const ExternalLink: React.FC<IconProps> = (p) => <Ic {...p} paths={["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6","M15 3h6v6","M10 14 21 3"]} />
export const BookOpen: React.FC<IconProps> = (p) => <Ic {...p} paths={["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z","M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"]} />
export const Info: React.FC<IconProps> = (p) => <Ic {...p} paths={["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z","M12 16v-4","M12 8h.01"]} />
export const FileText: React.FC<IconProps> = (p) => <Ic {...p} paths={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M16 2v6h6","M8 13h8","M8 17h6","M10 9h4"]} />

export const RefreshCw: React.FC<IconProps> = (p) => <Refresh {...p} />

// react-icons replacements for duplicate/incorrect hand-drawn icons
export const PulseRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuHeartPulse} />
export const BookPlus: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuBookPlus} />
export const KeyRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuKey} />
export const Brain: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuBrain} />
export const LayersRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuLayers} />
export const Server: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuServer} />
export const Zap: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuZap} />
export const ZapRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuZap} />
export const Scroll: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuScroll} />
export const ClipboardList: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuClipboardList} />
export const Users: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuUsers} />
export const BuildingRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LuBuilding2} />

// renamed lucide aliases for clarity
export const ShieldCheckRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideShieldCheck} />
export const InboxRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideInbox} />
export const BellRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideBell} />
export const SettingsRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideSettings} />
export const DatabaseRi: React.FC<IconProps> = (p) => <IconRi {...p} icon={LucideDatabase} />

export const Icons: Record<string, React.FC<IconProps>> = {
  Shield, ShieldCheck, ShieldCheckRi, Activity, AlertTri, AlertO, Settings, SettingsRi,
  Layers, LayersRi, Cpu, Network, List, Filter, X, Plus, ChevronR, ChevronD, ChevronL,
  ArrowUR, Refresh, RefreshCw, Play, Pause, Sun, Moon, Bell, BellRi, User, Users, Lock, Code,
  DatabaseRi, Eye, EyeOff, Bolt, Menu, Dot, Copy, Download,
  Terminal, GitBranch, Inbox, InboxRi, Key, KeyRi, Trash, Trash2, BookOpen,
  PulseRi, BookPlus, Brain, Server, Zap, ZapRi, Scroll, ClipboardList, Check, Info, Pencil, ExternalLink, FileText, BuildingRi,
}
