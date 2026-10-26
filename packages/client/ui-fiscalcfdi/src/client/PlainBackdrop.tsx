import css from './guided.module.css'

/**
 * Start-page backdrop with no artwork: only the space that keeps the headline off the top edge.
 * @returns an empty spacer.
 */
export function PlainBackdrop() {
  return <div className={css.backdrop} aria-hidden="true" />
}
