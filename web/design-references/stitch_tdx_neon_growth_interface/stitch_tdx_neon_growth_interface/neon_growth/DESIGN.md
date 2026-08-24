---
name: Neon Growth
colors:
  surface: '#16130a'
  surface-dim: '#16130a'
  surface-bright: '#3d392e'
  surface-container-lowest: '#110e06'
  surface-container-low: '#1e1b12'
  surface-container: '#231f16'
  surface-container-high: '#2d2a1f'
  surface-container-highest: '#38352a'
  on-surface: '#e9e2d2'
  on-surface-variant: '#c2cab0'
  inverse-surface: '#e9e2d2'
  inverse-on-surface: '#343026'
  outline: '#8c947c'
  outline-variant: '#424936'
  surface-tint: '#9cd927'
  primary: '#d0ff82'
  on-primary: '#233600'
  primary-container: '#a8e636'
  on-primary-container: '#446400'
  inverse-primary: '#476800'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#d2f9e1'
  on-tertiary: '#153727'
  tertiary-container: '#b6dcc5'
  on-tertiary-container: '#406250'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b7f646'
  primary-fixed-dim: '#9cd927'
  on-primary-fixed: '#131f00'
  on-primary-fixed-variant: '#344e00'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#c5ebd4'
  tertiary-fixed-dim: '#aacfb9'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#2c4d3d'
  background: '#16130a'
  on-background: '#e9e2d2'
  surface-variant: '#38352a'
typography:
  headline-xl:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  title-md:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-padding: 20px
  gutter: 16px
---

## Brand & Style
The design system for this product centers on an immersive "Neon Growth" aesthetic, merging the high-stakes world of finance with the dopamine-driven engagement of premium gaming. The UI is designed to feel high-value, technical, and rewarding.

The style is a hybrid of **Glassmorphism** and **Tactile Modernism**. It utilizes deep, atmospheric backgrounds to create a sense of infinite space, while interactive elements leverage physical metaphors—glossy surfaces, inner light sources, and outer glows—to make "earning" feel tangible. The interface should feel like a high-end gaming console's financial dashboard: dark, responsive, and vibrating with potential energy.

## Colors
The palette is built on a "Dark Forest" foundation to signify stability and growth, punctuated by "Electric Lime" for action and "Metallic Gold" for reward.

- **Primary Background**: Use `#0B2E1F` for the base canvas.
- **Surface (Glass)**: Containers use the `glass-surface` gradient with a `20px` backdrop-blur and a `1px` stroke at `20%` white opacity to define edges.
- **Accent (Lime)**: Reserved for primary actions, growth indicators, and success states. Apply an outer glow (`box-shadow`) using `#A8E636` at `40%` opacity for active elements.
- **Reward (Gold)**: Reserved exclusively for profit, premium milestones, and high-tier rewards.
- **Contrast Text**: Primary text is `#FFFFFF`. Secondary text should use `#F7EFDF` at `70%` opacity to maintain hierarchy without sacrificing readability.

## Typography
This design system utilizes **Outfit** for its geometric yet friendly characteristics, which bridges the gap between a tech-focused SaaS and an approachable gaming app.

- **Headlines**: Use heavy weights (700) with slight negative letter-spacing for a compact, high-impact look.
- **Numbers**: Financial figures should always use the `Outfit` font to maintain the rounded, premium feel. For profit displays, use `title-md` or larger with the Gold Shine gradient applied as a text-fill.
- **Labels**: Small labels use a semi-bold weight and increased letter-spacing to ensure legibility against dark, blurred backgrounds.

## Layout & Spacing
The layout follows a **Fluid Grid** model with an emphasis on safe margins to prevent "crowding" the neon elements.

- **Mobile**: 4-column grid with `20px` side margins.
- **Desktop**: 12-column grid with a max-width of `1200px` to maintain focus.
- **Rhythm**: Use an 8px-based scale for spacing between elements. Interactive components (like buttons) should have a minimum height of `56px` to feel "chunky" and tactile, consistent with the gaming influence.
- **Safe Areas**: Ensure glowing elements have at least `12px` of clearance to prevent glow-clipping at container boundaries.

## Elevation & Depth
Depth is created through a combination of **Glassmorphism layers** and **Luminous Shadows**.

1.  **Level 0 (Base)**: `#0B2E1F` solid background.
2.  **Level 1 (Cards)**: Glass gradient with `20px` blur. 1px solid border at top-left, fading to 0.5px at bottom-right to simulate a top-down light source.
3.  **Level 2 (Popovers/Modals)**: Increased backdrop blur (`40px`) and a subtle `#000000` outer shadow with 20% opacity to lift the element.
4.  **Interactive Depth**: Buttons use an `inner shadow` (light color) on the top edge to create a 3D "extruded" look, and a `drop shadow` (accent color) when active to simulate light being emitted onto the surface below.

## Shapes
The shape language is generous and friendly. 
- **Standard Cards**: Use `16px` (`rounded-lg`) to `24px` (`rounded-xl`) corner radii.
- **Buttons & Inputs**: Use `12px` or full pill-shape for badges to maintain the premium gaming feel.
- **Gauges**: Circular elements must use perfect 1:1 aspect ratios with rounded stroke caps for progress indicators.

## Components

### Buttons
- **Primary (Glossy 3D)**: Uses the `Lime Glow` gradient. Features a `1px` white inner stroke at the top (opacity 30%) and a `2px` dark inner shadow at the bottom to create a 3D effect.
- **State Changes**: On hover, increase the outer glow spread by 4px. On click (active), scale the button to `0.97` with a bouncy transition.

### Cards
- **Container**: Glassmorphic style as defined in Elevation. 
- **Header**: Use a `1px` horizontal separator with a gradient alpha (0% -> 20% -> 0%) to subtly divide content.

### Badges & Chips
- **Pill Style**: Full rounded corners. Backgrounds use 15% opacity of the accent color (Lime or Gold) with a solid `1px` border of the same color. 

### Inputs
- **Field**: Darker than the base background (`#051a11`), `16px` rounded corners, and a `1px` border that glows Primary Lime when focused.

### Gauges (Circular Progress)
- **Style**: Thick tracks (8px+) with rounded ends. The "unfilled" track should be the Primary Background color with a subtle inner shadow. The "filled" track uses the `Lime Glow` or `Gold Shine` gradient.

### Motion
- **Transitions**: All hover and state transitions should use `cubic-bezier(0.34, 1.56, 0.64, 1)` for a "snappy and bouncy" gaming feel. Duration: `250ms`.