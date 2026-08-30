<script>
  /**
   * The interface's one item token: a rounded, tinted plaque with the item's
   * art sitting on it. The tint carries the classification (Origin for a
   * Temper, Craftwork for a weapon) so a list reads as colour before it reads
   * as text; the art carries the identity.
   */
  import GameIcon from './GameIcon.svelte'

  let { file = null, alt = '', size = 34, tint = 'var(--origin-universal)', dim = false } = $props()

  const art = $derived(Math.round(size * 0.78))
</script>

<span
  class="badge"
  class:dim
  style="width:{size}px;height:{size}px;background:{tint};border-radius:{Math.max(4, Math.round(size * 0.15))}px"
>
  <GameIcon {file} {alt} size={art} />
</span>

<style>
  .badge {
    display: grid;
    place-items: center;
    flex: none;
    border: 1px solid var(--line-default);
    /* An inset lip and a floor shadow, so the plaque reads as stamped metal
       rather than a flat swatch. */
    box-shadow: inset 0 0 0 2px rgba(28, 26, 22, 0.12), inset 0 -6px 12px rgba(28, 26, 22, 0.1);
    overflow: hidden;
  }
  .dim {
    filter: saturate(0.35);
    opacity: 0.55;
  }
</style>
