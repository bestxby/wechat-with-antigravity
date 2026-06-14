# Control Console UI/UX Redesign Specification (impeccable & ui-ux-pro-max)

This document describes the design specification for upgrading the WeChat Bridge Control Console UI to meet premium, modern, and theme-adaptive VS Code standards. It applies the core guidelines from the `impeccable` and `ui-ux-pro-max` design systems.

---

## 1. Visual Style & Color Strategy

### 1.1 Dark/Light Theme Integration
- The console runs inside a VS Code webview panel. To look native, it must exclusively inherit VS Code's system color tokens:
  - Background: `var(--vscode-sideBar-background)` (sidebar container background).
  - Cards & Widgets: `var(--vscode-editorWidget-background)` (widget background).
  - Borders: `var(--vscode-widget-border)`.
  - Foreground: `var(--vscode-editor-foreground)`.
  - Muted/Secondary Text: `var(--vscode-descriptionForeground)`.
  - Buttons: `var(--vscode-button-background)`, `var(--vscode-button-foreground)`.

### 1.2 Accent Theme Colors
- Primary Accent: WeChat Green (`#07C160`).
- Glow Overlay: `rgba(7, 193, 96, 0.15)` (WeChat Green soft shadow).
- Warning: Amber (`#f59e0b`).
- Error/Destructive: Red (`#f43f5e`).

### 1.3 Card Layout & Bento Design
- Transition the visualizer panel from basic container boxes to clean, rounded bento-style cards with a subtle inset shadow and soft borders.
- Cards will use a 1px border with `var(--vscode-widget-border)` and a background gradient transitioning from `rgba(var(--vscode-editorWidget-background-rgb), 0.7)` to `rgba(var(--vscode-editorWidget-background-rgb), 0.9)` to create an elegant semi-transparent glassmorphic look.

---

## 2. Structural Vector Icons (No Emojis)

To satisfy the `impeccable` "No emoji as structural icons" absolute ban, all emojis inside headers, list items, and guides are replaced with crisp, theme-adaptive inline SVGs.

### 2.1 Mappings
- **🖥️ 活跃工作区 (Active Workspaces Heading)** → Inline SVG monitor icon.
- **📂 Folder Icon (Workspace Items)** → Inline SVG folder icon.
- **🚀 极速上手 (Getting Started Heading)** → Inline SVG rocket icon.
- **⚡ 便捷指令集 (Slash Commands Heading)** → Inline SVG lightning bolt icon.
- **🔧 排障手册 (Troubleshooting Heading)** → Inline SVG wrench/tools icon.
- **📷 Camera Icon (QR Code Help)** → Inline SVG camera icon.
- **💬 Chat Icon (Avatar Fallback)** → Inline SVG chat bubble icon.
- **! Warning Icon (Activation Help)** → Inline SVG circular warning icon.
- **🔒 Lock Icon (Lock Conflict Help)** → Inline SVG lock icon.

---

## 3. Layout, Spacing Rhythm, & Typography

- Spacing will adhere to a strict **4px/8px incremental grid**.
- Padding tokens:
  - Container padding: `12px` (reduced to `8px` on small viewports).
  - Gaps between sections: `16px` (reduced to `10px` on small viewports).
  - Button paddings: `6px 12px`.
- Line lengths will be bounded to a readable width, and heading font sizes will be balanced to prevent overflow in narrow sidebar viewports:
  - Header Title: `15px` with a letter-spacing of `0.2px`.
  - Section Titles: `11px` with a bold weight (`600`) and wide tracking (`0.5px`).

---

## 4. Micro-Interactions & Transitions

### 4.1 Hover States & Elevations
- Interactive buttons and workspace list items will transition smoothly over `0.15s` using a custom cubic bezier curve (`cubic-bezier(0.4, 0, 0.2, 1)`).
- On hover, cards and buttons will have a subtle vertical lift of `-1px` and a shadow expansion, giving responsive physical depth.

### 4.2 Pulsing Halo Animations
- The active status dot on the profile card and the daemon indicator will have a double-ring pulsing halo.
- The outer ring will scale up to `2x` and fade to `0` opacity every `2s` in a smooth ease-in-out loop.
