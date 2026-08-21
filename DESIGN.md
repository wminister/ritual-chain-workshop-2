# Design System

## Intent

A builder checks a live contract from a laptop during a bright workshop session. The interface is compact, steady, and easy to scan while transactions are moving.

## Color

The palette is restrained: pure white working surfaces, neutral ink, warm coral for primary actions and YES, and dark teal for NO and secondary state.

```css
--background: oklch(0.985 0 0);
--surface: oklch(1 0 0);
--surface-muted: oklch(0.955 0.006 210);
--ink: oklch(0.18 0.012 45);
--muted: oklch(0.46 0.018 45);
--line: oklch(0.87 0.008 210);
--primary: oklch(0.64 0.19 45);
--primary-strong: oklch(0.53 0.18 42);
--accent: oklch(0.45 0.11 190);
--success: oklch(0.48 0.13 150);
--danger: oklch(0.55 0.2 28);
```

## Typography

Use the system sans-serif stack throughout. Headings are compact and semibold. Tabular numbers are used for blocks, balances, and pool amounts.

## Layout

The app uses a fixed top bar, a compact summary strip, and a two-column market/action layout on wide screens. It collapses to one column below 900px. Content width is capped at 1240px.

## Components

Controls use an 8px maximum radius, 40px minimum height, clear focus rings, and Lucide icons for familiar actions. Market cards are the only repeated framed objects. Status is always written as text as well as color.

## Motion

Transitions stay between 150ms and 200ms and only communicate hover, focus, or state changes. Reduced-motion mode removes transforms and smooth scrolling.
