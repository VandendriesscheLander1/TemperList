<script>
  import TemperTile from './TemperTile.svelte'
  import { ORIGIN_COLORS } from '../lib/rules.js'
  import { GROUP_BY, STATUS, groupRows, summarize } from '../lib/derive.js'

  let { rows, catalogue, threshold, onselect } = $props()

  let query = $state('')
  let groupBy = $state(GROUP_BY.ORIGIN)
  let status = $state('all')
  let collapsed = $state(new Set())
  let searchEl = $state(null)

  // Short labels: the group control is a segmented strip, not a dropdown.
  const GROUPS = [
    { key: GROUP_BY.ORIGIN, label: 'Origin' },
    { key: GROUP_BY.ART, label: 'Art' },
    { key: GROUP_BY.WEAPON_TYPE, label: 'Type' },
    { key: GROUP_BY.SOURCE, label: 'Weapon' },
    { key: GROUP_BY.NONE, label: 'A→Z' },
  ]

  // "Close" is one dismantle out — a slice of Partial, not a status of its own.
  const FILTERS = [
    { key: 'all', label: 'All', match: () => true },
    { key: STATUS.READY, label: 'Ready', match: (r) => r.status === STATUS.READY },
    { key: 'close', label: 'Close', match: (r) => r.remaining === 1 },
    { key: STATUS.PARTIAL, label: 'Partial', match: (r) => r.status === STATUS.PARTIAL },
    { key: STATUS.MISSING, label: 'Missing', match: (r) => r.status === STATUS.MISSING },
  ]

  const counts = $derived(
    Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.match).length])),
  )

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    const match = FILTERS.find((f) => f.key === status)?.match ?? (() => true)
    return rows.filter((r) => {
      if (!match(r)) return false
      if (!q) return true
      return (
        r.temper.name.toLowerCase().includes(q) ||
        (r.temper.description ?? '').toLowerCase().includes(q) ||
        (r.temper.origin ?? '').toLowerCase().includes(q) ||
        (r.temper.weaponType ?? '').toLowerCase().includes(q)
      )
    })
  })

  const groups = $derived(groupRows(filtered, groupBy, catalogue))

  function dotColor(group) {
    if (groupBy === GROUP_BY.ORIGIN) return ORIGIN_COLORS[group.key] ?? 'var(--origin-universal)'
    return 'var(--line-ink)'
  }

  function toggleGroup(key) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsed = next
  }

  function onkeydown(e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey) return
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
    e.preventDefault()
    searchEl?.focus()
  }
</script>

<svelte:window {onkeydown} />

<div class="view">
  <header class="bar">
    <div class="bar-top">
      <div class="heading">
        <span class="display title">Tempers</span>
        <span class="num subtle">{filtered.length} shown · {rows.length} total</span>
      </div>

      <div class="controls">
        <div class="searchbox wide">
          <input bind:this={searchEl} type="search" bind:value={query} placeholder="Search Tempers" />
        </div>
        <div class="segmented" role="group" aria-label="Group by">
          {#each GROUPS as g (g.key)}
            <button class:on={groupBy === g.key} onclick={() => (groupBy = g.key)}>{g.label}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="pills" role="group" aria-label="Status filter">
      {#each FILTERS as f (f.key)}
        <button class="pill" class:on={status === f.key} onclick={() => (status = f.key)}>
          {f.label}
          <span class="num pill-count">{counts[f.key]}</span>
        </button>
      {/each}
    </div>
  </header>

  <div class="body">
    {#if groups.length === 0}
      <div class="empty-state">
        <h3>Nothing matches</h3>
        <p>
          {#if groupBy === GROUP_BY.SOURCE}
            Grouping by source weapon only shows Tempers you hold. Add a weapon first.
          {:else}
            Try a different search or filter.
          {/if}
        </p>
      </div>
    {/if}

    {#each groups as group (group.key)}
      {@const stats = summarize(group.rows)}
      {@const shut = collapsed.has(group.key)}
      <section class="group">
        <button class="group-head" onclick={() => toggleGroup(group.key)} aria-expanded={!shut}>
          <span class="dot" style="background:{dotColor(group)}"></span>
          <span class="group-label">{group.label}</span>
          <span class="num group-meta">{stats.ready} of {stats.total} unlocked</span>
          <span class="rule"></span>
          <span class="caret" class:shut>▾</span>
        </button>

        {#if !shut}
          <div class="grid">
            {#each group.rows as row (row.temper.id)}
              <TemperTile {row} {threshold} onclick={onselect} />
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
  }

  .bar {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding: 18px 30px 14px;
    background: var(--surface-canvas);
    border-bottom: 1px solid var(--line-default);
  }
  .bar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
  }
  .heading {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .title {
    font-size: 26px;
    color: var(--content-strong);
  }
  .heading .subtle {
    font-size: 12px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .searchbox.wide {
    min-width: 250px;
  }

  .pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--content-muted);
    font-size: 12px;
  }
  .pill:hover {
    color: var(--content-strong);
  }
  .pill.on {
    border-color: var(--accent-primary);
    background: var(--accent-bg);
    color: var(--content-strong);
  }
  .pill-count {
    opacity: 0.6;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 18px 30px 70px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .group-label {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--content-strong);
  }
  .group-meta {
    font-size: 11px;
    color: var(--content-muted);
  }
  .rule {
    flex: 1;
    height: 1px;
    background: var(--line-default);
  }
  .caret {
    font-size: 10px;
    color: var(--content-muted);
    transition: transform var(--duration-fast) var(--ease-standard);
  }
  .caret.shut {
    transform: rotate(-90deg);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 7px;
  }

  @media (max-width: 860px) {
    .bar,
    .body {
      padding-inline: 16px;
    }
    .searchbox.wide {
      min-width: 0;
      flex: 1;
    }
    .controls {
      flex: 1 1 100%;
    }
  }
</style>
