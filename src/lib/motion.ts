'use client'

/**
 * 60fps-tuned motion presets (framer-motion).
 *
 * Design principles (60fps.design):
 *  - Animate ONLY transform + opacity (GPU-composited, no layout/paint thrash).
 *  - Use spring physics for organic motion; reserve easing curves for fades.
 *  - Short durations: micro-interactions land in ~150-250ms.
 *  - Respect `prefers-reduced-motion` — the hook below disables motion.
 *
 * Usage:
 *   import { spring, pressable, staggerContainer } from '@/lib/motion'
 *   <motion.div variants={pressable} whileTap="tap">...</motion.div>
 */

import type { Variants, Transition } from 'framer-motion'

/* ------------------------------------------------------------------ */
/* Springs                                                             */
/* ------------------------------------------------------------------ */

/** Snappy spring for small UI elements (taps, toggles, badges). */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 32,
  mass: 0.7,
}

/** Default spring for cards / sheets / shared layout. */
export const spring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.9,
}

/** Soft/gentle spring for page transitions and large surfaces. */
export const springSoft: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 26,
  mass: 1,
}

/** Bouncy spring for playful emphasis (success states, onboarding). */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 14,
  mass: 0.8,
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

/**
 * Press interaction for tappable surfaces. Apply `whileTap="tap"` and
 * optionally `whileHover="hover"` on a motion element using these variants.
 * Scales only (transform) so it stays on the compositor thread at 60fps.
 */
export const pressable: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.96 },
}

/** A slightly subtler press for larger cards. */
export const pressableSubtle: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.01 },
  tap: { scale: 0.985 },
}

/** Fade + rise for in-view reveals. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
}

/** Pure fade (for overlays/toasts where movement feels noisy). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
}

/**
 * Stagger container: children animate in sequence. Use with a `*Child`
 * variant on each direct child and `staggerContainer()` on the parent.
 */
export function staggerContainer(stagger = 0.06, delayChildren = 0.05): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren,
      },
    },
  }
}

/** Pair with staggerContainer — each list item fades/rises in. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: spring },
}

/** Pair with staggerContainer — each item scales/fades in (for cards/tiles). */
export const staggerScaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring },
}

/* ------------------------------------------------------------------ */
/* Page transitions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Page transition tuned to feel native on mobile (iOS push-like).
 * Keep it short and transform/opacity only.
 */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
}

/* ------------------------------------------------------------------ */
/* Bottom sheet                                                        */
/* ------------------------------------------------------------------ */

/**
 * Variants for a bottom sheet: rises from below with a gentle spring,
 * fades out on exit. Overlay fade is separate.
 */
export const sheetVariants: Variants = {
  hidden: { y: '100%', opacity: 0.4 },
  visible: { y: 0, opacity: 1, transition: springSoft },
  exit: { y: '100%', opacity: 0.2, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
}

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/* Reduced motion                                                      */
/* ------------------------------------------------------------------ */

/**
 * Returns true when the user has requested reduced motion. Components should
 * branch to instant/static variants in that case (no transforms, no stagger).
 *
 * SSR-safe: returns false on the server.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
