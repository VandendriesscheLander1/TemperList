<script>
  /**
   * A Temper as a compact row-card: Origin-tinted plaque, name, held/threshold
   * and a hairline progress bar. Deliberately dense — the catalogue runs to a
   * hundred-odd Tempers and the view's job is to let you scan all of them.
   */
  import IconBadge from './IconBadge.svelte'
  import { ORIGIN_COLORS } from '../lib/rules.js'
  import { STATUS } from '../lib/derive.js'

  let { row, threshold, onclick = () => {} } = $props()

  const origin = $derived(row.temper.origin || 'Universal')
  const accent = $derived(ORIGIN_COLORS[origin] ?? 'var(--origin-universal)')
  const ready = $derived(row.status === STATUS.READY)
</script>

<button
  class="card"
  class:missing={row.status === STATUS.MISSING}
  class:ready
  onclick={() => onclick(row)}
  title="{row.temper.name} · {row.held}/{threshold}"
>
  <IconBadge
    file={row.temper.icon}
    alt={row.temper.name}
    size={34}
    tint={accent}
    dim={row.status === STATUS.MISSING}
  />

  <span class="body">
    <span class="line">
      <span class="name">{row.temper.name}</span>
      <span class="num count">{row.held}/{threshold}</span>
    </span>
    <span class="meter">
      <span style="width:{row.progress * 100}%; background:{ready ? 'var(--success)' : accent}"
      ></span>
    </span>
  </span>

  {#if row.fromShelf > 0}
    <span class="banked" title="{row.fromShelf} banked">◆</span>
  {/if}
</button>

<style>
  .card {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 8px 10px 8px 8px;
    border: 1px solid var(--line-default);
    border-radius: 9px;
    background: var(--surface-panel);
    box-shadow: var(--shadow-card);
    text-align: left;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }
  .card:hover {
    border-color: var(--line-strong);
  }
  .card.missing {
    opacity: 0.55;
  }
  .card.missing:hover {
    opacity: 1;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--content-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    font-size: 11.5px;
    color: var(--content-muted);
  }
  .ready .count {
    color: var(--success);
  }
  .meter {
    height: 3px;
  }

  .banked {
    position: absolute;
    top: 3px;
    left: 3px;
    font-size: 8px;
    line-height: 1;
    color: var(--accent-light);
  }
</style>
