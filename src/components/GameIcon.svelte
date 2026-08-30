<script>
  /**
   * An item icon. Prefers the locally-compressed WebP written by the sync
   * script; if that's missing (snapshot synced without icons) it falls back to
   * the public API host so the grid never shows holes.
   */
  import { iconUrl, remoteIconUrl } from '../lib/catalogue.js'

  let { file = null, alt = '', size = 40, dim = false } = $props()

  let src = $state(null)
  let failed = $state(false)

  $effect(() => {
    src = iconUrl(file)
    failed = false
  })

  function onError() {
    const remote = remoteIconUrl(file)
    if (src !== remote && remote) src = remote
    else failed = true
  }
</script>

{#if src && !failed}
  <img
    class="game-icon"
    class:dim
    {src}
    {alt}
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    onerror={onError}
  />
{:else}
  <span
    class="game-icon placeholder"
    class:dim
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.62)}px"
    aria-hidden="true"
  >
    {(alt || '?').slice(0, 1)}
  </span>
{/if}

<style>
  .game-icon {
    display: block;
    object-fit: contain;
    flex-shrink: 0;
    transition: filter var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
  }
  .dim {
    filter: grayscale(1) brightness(0.7);
    opacity: 0.45;
  }
  /* Missing art falls back to a serif initial. It sits on IconBadge's tinted
     plaque, so it stays transparent and borrows the plaque's colour. */
  .placeholder {
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    color: rgba(28, 26, 22, 0.62);
    line-height: 1;
  }
</style>
