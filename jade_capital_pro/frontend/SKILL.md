# Frontend Development Skill - Jade Capital Pro

This skill documents the standards and patterns for frontend development in the Jade Capital Pro application.

## Typography Standards
Consistent typography is key to a premium feel. Use these patterns for all pages:

### Page header (H1)
Use a bold, tracking-tight, and italicized style for main page headings with an accent underline. Use Sentence case (first letter capital, rest lowercase).
```tsx
<div>
  <h1 className="text-4xl font-black tracking-tighter italic decoration-primary underline underline-offset-8 text-foreground">
    {pageTitle}
  </h1>
  <p className="text-muted-foreground mt-4 font-bold tracking-widest text-xs uppercase">
    {pageSubtitle}
  </p>
</div>
```

### Section header (H3)
Used within cards or content sections. Use Sentence case.
```tsx
<h3 className="text-xl font-bold text-foreground mb-6">
  {sectionTitle}
</h3>
```

### Labels and Small Text
For metadata or decorative labels.
```tsx
<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
  {label}
</p>
```

## Alert Patterns
Alerts must clearly communicate the state of a potential trade:

| Type | State | Intent | Color |
|------|-------|--------|-------|
| **NEAR** | CERCA | PREPARAR ORDEN | Orange |
| **CONFIRMED** | CONFIRMADO | ESPERAR GATILLO | Blue |
| **ENTRY** | ENTRAR | ENTRAR AHORA | Jade |

### Alert Component Structure
Use `motion.div` with a subtle background color and a pulsing action text.
```tsx
<div className={`p-4 rounded-2xl border ${statusColor.border} ${statusColor.bg} backdrop-blur-sm shadow-sm`}>
  <div className="flex justify-between items-center mb-2">
    <span className="text-sm font-black text-foreground">{instrument}</span>
    <span className={`text-[8px] font-black border ${statusColor.border} ${statusColor.text} px-1.5 py-0.5 rounded-md`}>{statusLabel}</span>
  </div>
  <div className="flex justify-between items-end">
    <p className="text-lg font-black text-foreground">{price}</p>
    <p className={`text-[9px] font-black uppercase tracking-widest ${statusColor.text} animate-pulse`}>{actionText}</p>
  </div>
</div>
```

## Theme System
The application uses a custom theme system built on CSS variables and Tailwind CSS. Avoid using hardcoded colors (like `bg-zinc-950` or `text-black`).

### Core Variables
Always use semantic variables for styling:

| Variable | Tailwind Class | Description |
|----------|----------------|-------------|
| `--background` | `bg-background` | Main page background |
| `--foreground` | `text-foreground` | Main text color |
| `--card` | `bg-card` | Cards, panels, and modals |
| `--primary` | `bg-primary` / `text-primary` | Jade branding color |
| `--muted` | `bg-muted` | Subtle backgrounds |
| `--muted-foreground` | `text-muted-foreground` | Secondary text |
| `--border` | `border-border` | Subtle borders |

### Theme Persistence
The theme is managed in `src/components/Sidebar.tsx` (or the main layout) and persisted in `localStorage`. 

## Jade Capital Pro: Design System & Frontend Architecture

This document defines the professional visual standards and technical patterns for the **Jade Capital Pro** terminal. All new features and refinements must adhere to these "Neural Core" aesthetic protocols.

## 1. Core Aesthetic Protocol: "Neural Core"
The terminal follows a high-fidelity, institutional trading aesthetic characterized by:
- **Glassmorphism**: Subtle backgrounds (`bg-[#0B0E11]`) with ultra-thin borders (`border-white/5`).
- **Neon Accents**: Selective use of `emerald-500` for success and highlights, with glow effects (`drop-shadow`).
- **Institutional Typography**: Tracking-tight black headers, intermixed with tracking-widest uppercase labels.
- **Micro-Animations**: Purposeful motion using `framer-motion` for transitions and hover states.

## 2. Design Tokens (Tailwind & CSS Variables)

### Palette
- **Deep Space**: `bg-[#0B0E11]` (Main backgrounds)
- **Obsidian**: `bg-[#0E1216]` (Surface layers)
- **Neural White**: `text-white/90` (Primary text)
- **Dim Gray**: `text-white/20` (Secondary/Labels)
- **Jade Emerald**: `text-emerald-500` / `bg-emerald-500` (Success/Action)
- **Neon Rose**: `text-rose-500` / `bg-rose-500` (Risk/Alerts)

### Typography
- **Master Header (H1)**: `text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3`
- **Section Label**: `text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase`
- **Terminal Label**: `text-[9px] font-black uppercase tracking-[.2em] text-white/30`
- **Data Point**: `text-2xl font-black text-white tracking-tighter italic uppercase`

## 3. Component Architecture

### The "Neural Card"
All data containers must use this pattern:
```tsx
<div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
  {/* Hover Glow Effect */}
  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
  
  <div className="relative z-10">
    {/* Content */}
  </div>
</div>
```

### The "Master Header" Component
Found on every primary dashboard view:
```tsx
<div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
    <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
            <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Icon className="text-emerald-500" size={24} />
            </span>
            Neural Protocol Title
        </h1>
        <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
            Sub-Sub-Protocol • Tertiary Description
        </p>
    </div>
    {/* Actions */}
</div>
```

### Ledger Tables
- No default borders between rows; use `divide-y divide-white/5`.
- Header text should be `text-[9px] font-black uppercase tracking-[.2em] text-white/30`.
- Row hover: `hover:bg-white/[0.01]`.

## 4. Interaction Patterns

### Alert Transmission Protocols
- **NEAR**: `bg-white/5 text-white/60` (Information/Standby)
- **CONFIRMED**: `bg-emerald-500/10 text-emerald-500` (Action Ready)
- **ENTRY**: `bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]` (Execution Active)

### Animations
- Use `whileHover={{ y: -4 }}` for cards.
- Use `layout` prop on `motion` elements for smooth grid transitions.
- Use `AnimatePresence` for all modals and dynamic lists.

## 5. Implementation Rules
1. **No Placeholders**: Every visual element must be functional or contextually accurate.
2. **Theme Awareness**: Always use CSS variables (`--background`, etc.) for elements that may toggle between light/dark, but prioritize the Dark Institutional look.
3. **Responsive Intensity**: Ensure padding scales from `p-4` (mobile) to `p-8` (XL).
4. **Clean Code**: Extract complex components but keep "Neural core" styles co-located for rapid design iteration.
