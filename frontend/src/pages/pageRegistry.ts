export interface PageConfig {
  id: string
  route: string
  guard: 'all' | 'admin' | 'viewer'
  sidebar: {
    group: string
    label: string
    icon: string
    requiresAdmin?: boolean
    requiresAdminOrViewer?: boolean
    count?: number | string | null
    live?: boolean
    crit?: boolean
  } | null
  page: {
    title: string
    description?: string
  }
}

const PAGES: PageConfig[] = [
  { id: "overview",              route: "/",                        guard: "all",    sidebar: { group: "Monitor",        label: "Overview",             icon: "Activity",     count: null },   page: { title: "Gateway overview" } },
  { id: "traffic",               route: "/traffic",                 guard: "all",    sidebar: { group: "Monitor",        label: "Live Traffic",              icon: "PulseRi",   count: "live", live: true },  page: { title: "Live request stream" } },
  { id: "threats",               route: "/threats",                 guard: "all",    sidebar: { group: "Monitor",        label: "Threats",               icon: "AlertTri", count: null, crit: true }, page: { title: "Threat events" } },
  { id: "incidents",             route: "/incidents",               guard: "all",    sidebar: { group: "Monitor",        label: "Incidents",             icon: "AlertO",   count: null },             page: { title: "Incidents" } },
  { id: "detection-frameworks",  route: "/detection-frameworks",    guard: "all",    sidebar: { group: "Govern",         label: "Detection Frameworks",  icon: "BookOpen" },           page: { title: "Detection frameworks" } },
  { id: "detectors",             route: "/detectors",               guard: "all",    sidebar: { group: "Govern",         label: "Detectors",             icon: "Filter",   count: null },             page: { title: "Detectors" } },
  { id: "threat-knowledge",      route: "/threat-knowledge",        guard: "all",    sidebar: { group: "Govern",         label: "Threat Knowledge",      icon: "BookPlus" },           page: { title: "Threat knowledge" } },
  { id: "tools",                 route: "/tools",                   guard: "all",    sidebar: { group: "Govern",         label: "Tool Guardrails",       icon: "ShieldCheck" },        page: { title: "Tool guardrails" } },
  { id: "t2-agent",              route: "/t2-agent",                guard: "admin",  sidebar: { group: "Govern",         label: "T2 Agent",              icon: "FileText", requiresAdmin: true },  page: { title: "T2 Agent Prompts" } },
  { id: "content-quality-judge", route: "/content-quality-judge",   guard: "admin",  sidebar: { group: "Govern",         label: "Content Quality Agent", icon: "FileText", requiresAdmin: true },  page: { title: "Content Quality Agent" } },
  { id: "apps",                  route: "/apps",                    guard: "all",    sidebar: { group: "Operate",        label: "AI Apps",               icon: "Cpu",      count: null },             page: { title: "Connected AI apps" } },
  { id: "apikeys",               route: "/apikeys",                 guard: "all",    sidebar: { group: "Operate",        label: "API keys",              icon: "KeyRi" },              page: { title: "API keys" } },
  { id: "prompt-testing",        route: "/prompt-testing",          guard: "all",    sidebar: { group: "Operate",        label: "Prompt Testing",        icon: "Terminal" },           page: { title: "Prompt Testing" } },
  { id: "gateway-embedding-test",route: "/gateway-embedding-test",  guard: "all",    sidebar: { group: "Operate",        label: "Embedding Testing",     icon: "LayersRi" },           page: { title: "Gateway Embedding Testing" } },
  { id: "ai-activities",         route: "/ai-activities",           guard: "all",    sidebar: { group: "Platform Logs",  label: "Gateway Activity Log",  icon: "ClipboardList", count: null }, page: { title: "Gateway Activity Log" } },
  { id: "provider-logs",         route: "/provider-logs",           guard: "viewer", sidebar: { group: "Platform Logs",  label: "AI Provider Log",       icon: "DatabaseRi", requiresAdminOrViewer: true }, page: { title: "AI Provider Log" } },
  { id: "content-quality-log",   route: "/content-quality-log",     guard: "viewer", sidebar: { group: "Platform Logs",  label: "Content Quality Log",   icon: "FileText", requiresAdminOrViewer: true }, page: { title: "Content Quality Log" } },
  { id: "embedding-logs",        route: "/embedding-logs",          guard: "viewer", sidebar: { group: "Platform Logs",  label: "Embedding Log",         icon: "DatabaseRi", requiresAdminOrViewer: true }, page: { title: "Embedding Log" } },
  { id: "audit",                 route: "/audit",                   guard: "viewer", sidebar: { group: "Platform Logs",  label: "Audit Log",             icon: "Scroll", requiresAdminOrViewer: true }, page: { title: "Audit Log" } },
  { id: "email-log",             route: "/email-log",               guard: "viewer", sidebar: { group: "Platform Logs",  label: "Email Log",             icon: "InboxRi", requiresAdminOrViewer: true }, page: { title: "Email Log" } },
  { id: "reload-logs",           route: "/reload-logs",             guard: "viewer", sidebar: { group: "Platform Logs",  label: "Reload Log",            icon: "RefreshCw", requiresAdminOrViewer: true }, page: { title: "Reload Log" } },
  { id: "quality-review-log",    route: "/quality-review-log",      guard: "admin",  sidebar: { group: "Platform Logs",  label: "Quality Review Log",    icon: "ClipboardList", requiresAdmin: true }, page: { title: "Quality Review Log" } },
  { id: "ai-providers",          route: "/ai-providers",            guard: "admin",  sidebar: { group: "Providers",      label: "AI Providers",          icon: "Brain", requiresAdmin: true },       page: { title: "AI providers" } },
  { id: "classifiers",           route: "/classifiers",             guard: "admin",  sidebar: { group: "Providers",      label: "Classification Providers", icon: "ShieldCheckRi", requiresAdmin: true }, page: { title: "Classification providers" } },
  { id: "providers",             route: "/providers",               guard: "admin",  sidebar: { group: "Providers",      label: "Upstream Providers",    icon: "Server", requiresAdmin: true },       page: { title: "Upstream providers" } },
  { id: "provider-usage",        route: "/provider-usage",          guard: "admin",  sidebar: { group: "Providers",      label: "AI Provider Usages",    icon: "Activity", requiresAdmin: true },     page: { title: "AI Provider Usages" } },
  { id: "embedding-providers",   route: "/embedding-providers",     guard: "admin",  sidebar: { group: "Providers",      label: "Embedding Providers",   icon: "LayersRi", requiresAdmin: true },    page: { title: "Embedding providers" } },
  { id: "data-review-provider",  route: "/data-review-provider",    guard: "admin",  sidebar: { group: "Providers",      label: "Data Review Provider",  icon: "ShieldCheck", requiresAdmin: true }, page: { title: "Data Review Provider" } },
  { id: "content-quality-provider",route:"/content-quality-provider",guard:"admin",  sidebar: { group: "Providers",      label: "Content Quality Provider", icon: "ShieldCheck", requiresAdmin: true }, page: { title: "Content Quality Provider" } },
  { id: "notifications",         route: "/notifications",           guard: "admin",  sidebar: { group: "Providers",      label: "Notification Providers",icon: "BellRi", requiresAdmin: true },       page: { title: "Notification Providers" } },
  { id: "users",                 route: "/users",                   guard: "admin",  sidebar: { group: "Settings",       label: "Users & groups",        icon: "Users", requiresAdmin: true },        page: { title: "Users & groups" } },
  { id: "password-policy",       route: "/password-policy",         guard: "admin",  sidebar: { group: "Settings",       label: "Password Policy",       icon: "Lock", requiresAdmin: true },         page: { title: "Password Policy" } },
  { id: "response-cache",        route: "/response-cache",          guard: "admin",  sidebar: { group: "Settings",       label: "Response Cache",        icon: "RefreshCw", requiresAdmin: true },    page: { title: "Response Cache" } },
  { id: "embedding-settings",    route: "/embedding-settings",      guard: "admin",  sidebar: { group: "Settings",       label: "Embedding",             icon: "LayersRi", requiresAdmin: true },     page: { title: "Embedding Settings" } },
  { id: "network-acl",           route: "/network-acl",             guard: "admin",  sidebar: { group: "Settings",       label: "Network ACL",           icon: "Network", requiresAdmin: true },      page: { title: "Network ACL Lists" } },
  { id: "gateways",              route: "/gateways",                guard: "admin",  sidebar: { group: "Settings",       label: "Gateway Engines",       icon: "Zap", requiresAdmin: true },          page: { title: "Gateway Instances" } },
  { id: "adminkeys",             route: "/adminkeys",               guard: "admin",  sidebar: { group: "Settings",       label: "Admin API Keys",        icon: "KeyRi", requiresAdmin: true },        page: { title: "Admin API Keys" } },
  { id: "onboarding",            route: "/onboarding",              guard: "admin",  sidebar: { group: "Settings",       label: "Onboarding Checklist",  icon: "List", requiresAdmin: true },         page: { title: "Onboarding Checklist" } },
  { id: "organizations",         route: "/organizations",           guard: "admin",  sidebar: { group: "Settings",       label: "Org Management",        icon: "BuildingRi", requiresAdmin: true },   page: { title: "Org Management" } },
  { id: "access-requests",       route: "/access-requests",         guard: "admin",  sidebar: { group: "Settings",       label: "Access Requests",       icon: "InboxRi", requiresAdmin: true },      page: { title: "Access Requests" } },
  { id: "profile",               route: "/profile",                 guard: "all",    sidebar: null,                                                                                     page: { title: "My profile" } },
]

const PAGE_MAP = new Map(PAGES.map(p => [p.id, p]))

export function getPageConfig(id: string): PageConfig | undefined {
  return PAGE_MAP.get(id)
}

export function getRoute(pathname: string): PageConfig | undefined {
  if (pathname === '/') return PAGE_MAP.get('overview')
  const id = pathname.slice(1)
  return PAGE_MAP.get(id)
}

export function getBreadcrumbs(id: string): string[] {
  const p = PAGE_MAP.get(id)
  if (!p) return []
  if (p.sidebar) return [p.sidebar.group, p.sidebar.label]
  // Pages without sidebar entry (e.g. profile)
  const FALLBACK: Record<string, string[]> = { profile: ["Settings", "My profile"] }
  return FALLBACK[id] ?? []
}

export function getPageTitle(id: string): string | undefined {
  return PAGE_MAP.get(id)?.page.title
}

export interface SidebarGroup {
  group: string
  items: { id: string; label: string; icon: string; count?: number | string | null; live?: boolean; crit?: boolean; requiresAdmin?: boolean; requiresAdminOrViewer?: boolean }[]
  requiresAdmin?: boolean
}

export function getSidebarNav(): SidebarGroup[] {
  const groups = new Map<string, SidebarGroup>()
  for (const p of PAGES) {
    if (!p.sidebar) continue
    if (!groups.has(p.sidebar.group)) {
      groups.set(p.sidebar.group, { group: p.sidebar.group, items: [] })
    }
    const g = groups.get(p.sidebar.group)!
    g.items.push({ id: p.id, label: p.sidebar.label, icon: p.sidebar.icon, count: p.sidebar.count, live: p.sidebar.live, crit: p.sidebar.crit, requiresAdmin: p.sidebar.requiresAdmin, requiresAdminOrViewer: p.sidebar.requiresAdminOrViewer })
  }
  // Preserve sidebar group display order
  const ORDER = ['Monitor', 'Govern', 'Operate', 'Platform Logs', 'Providers', 'Settings']
  return ORDER.map(name => groups.get(name)).filter(Boolean) as SidebarGroup[]
}

export function getRouteMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of PAGES) {
    map[p.id] = p.route
  }
  return map
}

export function allPages(): PageConfig[] {
  return PAGES
}
