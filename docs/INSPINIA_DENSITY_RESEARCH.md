# Density Pass — Shell Changes

Reference for the shell-level density pass on `experiment/density-customers-page`. All changes are global (every page in the app inherits them). No per-page edits.

**Premise:** Catalyst UI is sized and spaced for marketing pages. Dispatch-ui is an internal tool for trained CSRs working on big monitors all day — they want more data per screen, not breathing room. Inspinia (https://webapplayers.com/inspinia/tailwind/) was the reference for the target density.

## Files changed

- `src/components/catalyst/sidebar-layout.tsx`
- `src/components/catalyst/sidebar.tsx`
- `src/components/AppLayout.tsx`
- `src/index.css` (no-op; commented A/B knob retained)

## Change-by-change

### 1. Content padding `lg:p-10` → `p-4` (sidebar-layout.tsx)

Catalyst's content card had 40px padding on every side. Dropped to 16px.

```diff
- <div className="grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
+ <div className="h-full rounded-r-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
```

### 2. Killed `mx-auto max-w-screen-2xl` content cap (sidebar-layout.tsx)

Content used to be capped at 1536px and centered, leaving large gutters on wide monitors. Removed so dense tables can use the full screen on 1920+ displays. Aligns with CLAUDE.md's "use the screen real estate" doctrine.

**Trade-off:** text-heavy areas (long notes, descriptions) get long line lengths on 4K/ultrawide monitors. If anyone reports "the notes are hard to read on my monitor," this is the suspect.

### 3. Asymmetric floating card (sidebar-layout.tsx)

Final structure: card butts directly against the sidebar on the left and slides under the topbar on top (no gaps), but floats with an 8px gap on the right and bottom. Left corners are squared (`rounded-r-lg`) since they have no gap to round into.

```jsx
<div className="grow bg-zinc-50 pr-2 pb-2 dark:bg-zinc-950">
  <div className="h-full rounded-r-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
    {children}
  </div>
</div>
```

The wrapper bg matches the topbar (`zinc-50` / `dark:zinc-950`) so the topbar and the gap area read as one continuous chrome layer.

### 4. Real desktop topbar (sidebar-layout.tsx)

Catalyst's `navbar` prop was only rendered on mobile — desktop had no top chrome at all. Now a 48px sticky bar with a stronger bottom border (`border-zinc-950/10` instead of the typical `/5`). Bg is one shade darker than the content card so chrome reads as chrome.

```jsx
<header className="sticky top-0 z-10 hidden h-12 items-center border-b border-zinc-950/10 bg-zinc-50 px-4 lg:flex dark:border-white/10 dark:bg-zinc-950">
  {navbar}
</header>
```

### 5. Sidebar section gap `mt-8` → `mt-4` (sidebar.tsx)

```diff
- 'flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-8'
+ 'flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-4'
```

Group labels now visually cluster with their items instead of floating in 32px voids.

### 6. Sidebar item padding `sm:py-2` → `sm:py-1.5` (sidebar.tsx)

```diff
- 'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 ... sm:py-2 sm:text-sm/5',
+ 'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 ... sm:py-1.5 sm:text-sm/5',
```

Combined with #5, the entire sidebar nav now fits on a 1080p monitor without scrolling (Settings used to be cut off the bottom).

### 7. Removed AppLayout `<div className="p-2">` wrapper (AppLayout.tsx)

Redundant — SidebarLayout now provides its own padding scheme. Was stacking 8px on top of the layout's own padding.

```diff
- <div className="p-2">
-   {children}
- </div>
+ {children}
```

### 8. Theme toggle in the topbar (AppLayout.tsx)

Cosmetic, not density. The new topbar needed actual chrome content so the avatar didn't float alone. Added a single icon-button that cycles `dark → light → system`.

```jsx
<button
  onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
  className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
  aria-label="Toggle theme"
  title={`Theme: ${theme}`}
>
  {theme === 'dark' ? <MoonIcon className="h-5 w-5" /> : theme === 'light' ? <SunIcon className="h-5 w-5" /> : <ComputerDesktopIcon className="h-5 w-5" />}
</button>
```

**Note:** the original 3-button theme picker is still in the SidebarFooter dropdown — not removed. Two theme controls now exist. Pick one before merge.

### 9. Global font-size override scaffold (index.css)

A commented-out A/B knob. Browser default 16px is in effect. Set to 14px or 15px to retest a tighter type scale system-wide.

```css
/* html {
  font-size: 15px;
} */
```

## Open decisions before merging anywhere real

1. **Full-width content** (#2) — fine for tables, risky for long-text reading on ultrawides.
2. **Two theme controls** (#8 + leftover dropdown picker) — pick one source of truth.
3. **Forking Catalyst components in place** — all changes edit `src/components/catalyst/*.tsx` directly. For a real merge, decide whether to keep the in-place fork, extract a `DenseSidebarLayout` wrapper, or push fixes upstream as a Tailwind config layer.
4. **No tests added** — none of the changes affected behavior. If this becomes the new standard, the visual diffs should be locked in via screenshot tests.
