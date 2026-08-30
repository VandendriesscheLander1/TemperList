<script>
  import IconBadge from './IconBadge.svelte'
  import { CRAFTWORK_NAMES, ORIGIN_COLORS, craftwork, slotsUsed } from '../lib/rules.js'
  import { arsenalRows } from '../lib/derive.js'
  import { removeWeapon, updateWeapon } from '../lib/inventory.js'
  import { store } from '../lib/store.svelte.js'

  let { catalogue, onadd, onedit } = $props()

  let query = $state('')
  let sort = $state('recent')
  let plan = $state('all')
  let searchEl = $state(null)

  const PLANS = [
    { key: 'all', label: 'All' },
    { key: 'undecided', label: 'Undecided' },
    { key: 'keep', label: 'Keep' },
    { key: 'scrap', label: 'Scrap' },
  ]

  const SORTS = [
    { key: 'recent', label: 'recent ↓' },
    { key: 'craftwork', label: 'tier ↓' },
    { key: 'name', label: 'name ↑' },
    { key: 'tempers', label: 'tempers ↓' },
    { key: 'origin', label: 'origin ↑' },
  ]

  const rows = $derived(arsenalRows(catalogue, store.data))

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) => {
      if (plan !== 'all' && r.instance.disposition !== plan) return false
      if (!q) return true
      return (
        r.weapon.name.toLowerCase().includes(q) ||
        r.tempers.some((t) => t.temper.name.toLowerCase().includes(q)) ||
        (r.weapon.origin ?? '').toLowerCase().includes(q) ||
        r.instance.craftwork.toLowerCase().includes(q)
      )
    })

    const cwRank = (n) => CRAFTWORK_NAMES.indexOf(n)
    const comparators = {
      recent: () => 0, // store keeps newest first
      name: (a, b) => a.weapon.name.localeCompare(b.weapon.name),
      craftwork: (a, b) => cwRank(b.instance.craftwork) - cwRank(a.instance.craftwork),
      tempers: (a, b) => slotsUsed(b.instance.tempers) - slotsUsed(a.instance.tempers),
      origin: (a, b) => (a.weapon.origin ?? '').localeCompare(b.weapon.origin ?? ''),
    }
    return sort === 'recent' ? list : [...list].sort(comparators[sort])
  })

  const planCounts = $derived(
    Object.fromEntries(
      PLANS.map((p) => [
        p.key,
        p.key === 'all' ? rows.length : rows.filter((r) => r.instance.disposition === p.key).length,
      ]),
    ),
  )

  /** Click cycles the pill: undecided → keep → scrap → undecided. */
  function cyclePlan(instance) {
    const order = ['undecided', 'keep', 'scrap']
    const next = order[(order.indexOf(instance.disposition) + 1) % order.length]
    store.commit((inv) => updateWeapon(inv, instance.uid, { disposition: next }))
  }

  function remove(row) {
    if (!confirm(`Remove this ${row.weapon.name} from your arsenal? Its Tempers stop counting.`)) return
    store.commit((inv) => removeWeapon(inv, row.instance.uid))
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
    <div class="heading">
      <span class="display title">Arsenal</span>
      <span class="num subtle">
        {rows.length} weapon{rows.length === 1 ? '' : 's'} · {planCounts.scrap} marked to scrap
      </span>
    </div>

    <div class="controls">
      <div class="searchbox">
        <input bind:this={searchEl} type="search" bind:value={query} placeholder="Search weapons" />
      </div>
      <div class="segmented" role="group" aria-label="Plan filter">
        {#each PLANS as p (p.key)}
          <button class:on={plan === p.key} onclick={() => (plan = p.key)}>
            {p.label}
            <span class="num count">{planCounts[p.key]}</span>
          </button>
        {/each}
      </div>
      <label class="sort">
        <span class="sr-only">Sort</span>
        <select bind:value={sort}>
          {#each SORTS as s (s.key)}
            <option value={s.key}>Sort: {s.label}</option>
          {/each}
        </select>
      </label>
      <button class="btn btn-primary btn-sm" onclick={onadd}>Add</button>
    </div>
  </header>

  <div class="body">
    {#if rows.length === 0}
      <div class="empty-state">
        <h3>Your arsenal is empty</h3>
        <p>Add the weapons you own and the Tempers they rolled.</p>
        <button class="btn btn-primary" onclick={onadd}>Add your first weapon</button>
      </div>
    {:else if visible.length === 0}
      <div class="empty-state">
        <h3>Nothing matches</h3>
        <p>No weapon in your arsenal fits that search and filter.</p>
      </div>
    {:else}
      <div class="table">
        <div class="thead eyebrow">
          <span></span>
          <span>Weapon</span>
          <span>Craftwork</span>
          <span>Origin</span>
          <span>Tempers rolled</span>
          <span></span>
        </div>

        {#each visible as row (row.instance.uid)}
          {@const cw = craftwork(row.instance.craftwork)}
          {@const disp = row.instance.disposition}
          <div class="trow">
            <IconBadge file={row.weapon.icon} alt={row.weapon.name} size={34} tint={cw.color} />

            <div class="wcell">
              <span class="wname">{row.weapon.name}</span>
              <span class="wtype subtle">
                {row.weapon.art ?? '—'}{row.weapon.slot ? ` · ${row.weapon.slot}` : ''}
              </span>
            </div>

            <div>
              <span class="tier" style="--tier:{cw.color}">
                {cw.name}
                <span class="num slots">{slotsUsed(row.instance.tempers)}/{cw.max}</span>
              </span>
            </div>

            <div class="origin">
              {#if row.weapon.origin}
                <span class="dot" style="background:{ORIGIN_COLORS[row.weapon.origin]}"></span>
                {row.weapon.origin}
              {:else}
                <span class="subtle">—</span>
              {/if}
            </div>

            <div class="chips">
              {#each row.tempers as entry (entry.temperId)}
                <span class="chip">
                  {entry.temper.name}{#if entry.stacks > 1}<span class="num x2">×2</span>{/if}
                </span>
              {:else}
                <span class="subtle none">No Tempers recorded</span>
              {/each}
            </div>

            <div class="actions">
              <button
                class="plan {disp}"
                onclick={() => cyclePlan(row.instance)}
                title="Plan: {disp}. Click to cycle."
              >
                {disp === 'undecided' ? '—' : disp}
              </button>
              <button class="link" onclick={() => onedit(row.instance)}>edit</button>
              <button class="link danger" onclick={() => remove(row)} aria-label="Remove">✕</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
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
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding: 18px 30px 14px;
    background: var(--surface-canvas);
    border-bottom: 1px solid var(--line-default);
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
  .searchbox {
    min-width: 200px;
  }
  .segmented .count {
    margin-left: 5px;
    opacity: 0.55;
    font-size: 10px;
  }
  .sort select {
    padding: 7px 10px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--content-muted);
    font-size: 12px;
  }

  .body {
    padding: 14px 30px 70px;
  }

  /* A ledger: one frame, hairline rows, columns that line up down the page. */
  .table {
    border: 1px solid var(--line-default);
    border-radius: var(--radius-md);
    background: var(--surface-panel);
    overflow: hidden;
  }
  .thead,
  .trow {
    display: grid;
    grid-template-columns: 44px 1.5fr 130px 110px 2.4fr 116px;
    gap: 14px;
    align-items: center;
  }
  .thead {
    padding: 9px 16px;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--line-default);
    letter-spacing: 0.14em;
  }
  .trow {
    padding: 11px 16px;
    border-bottom: 1px solid var(--line-default);
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .trow:last-child {
    border-bottom: 0;
  }
  .trow:hover {
    background: var(--surface-canvas);
  }

  .wcell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .wname {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .wtype {
    font-size: 11px;
  }

  .tier {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border: 1px solid color-mix(in srgb, var(--tier) 67%, transparent);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--tier) 20%, transparent);
    color: var(--content-default);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  .slots {
    font-size: 10px;
    opacity: 0.7;
  }

  .origin {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--content-default);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: none;
  }

  .chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .x2 {
    margin-left: 4px;
    font-size: 9.5px;
    color: var(--accent-light);
  }
  .none {
    font-size: 11px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
  }
  .plan {
    min-width: 46px;
    padding: 2px 8px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--content-muted);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
  .plan.scrap {
    border-color: var(--warning);
    color: var(--warning);
  }
  .plan.keep {
    border-color: var(--success);
    color: var(--success);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--content-muted);
    font-size: 12px;
  }
  .link:hover {
    color: var(--accent-hover);
  }
  .link.danger:hover {
    color: var(--error);
  }

  /* Below the width the six columns need, the row stops being a table row and
     becomes a wrapping card — same content, no horizontal scroll. */
  @media (max-width: 1080px) {
    .thead {
      display: none;
    }
    .trow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    .wcell {
      flex: 1 1 40%;
    }
    .chips,
    .actions {
      flex: 1 1 100%;
      justify-content: flex-start;
    }
  }
  @media (max-width: 860px) {
    .bar,
    .body {
      padding-inline: 16px;
    }
    .controls {
      flex: 1 1 100%;
    }
    .searchbox {
      flex: 1;
      min-width: 0;
    }
  }
</style>
