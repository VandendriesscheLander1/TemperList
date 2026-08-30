<script>
  /**
   * Fast weapon entry. Search → craftwork → click eligible Tempers → save.
   * Keyboard-driven so a whole inventory can go in one sitting: Enter saves and
   * resets for the next weapon.
   */
  import { untrack } from 'svelte'
  import IconBadge from './IconBadge.svelte'
  import { CRAFTWORK, ORIGIN_COLORS, craftwork, eligibleTempers, slotsUsed, validateInstance } from '../lib/rules.js'
  import { cycleTemper } from '../lib/inventory.js'
  import { UI_ICONS } from '../lib/ui-icons.js'

  let { catalogue, initial = null, onsave, onclose } = $props()

  // The dialog is unmounted between opens, so `initial` is a one-time seed for
  // the local draft rather than something to stay in sync with.
  const seed = untrack(() => initial) ?? {}
  const editing = Boolean(seed.uid)

  let weaponId = $state(seed.weaponId ?? null)
  let craftworkName = $state(seed.craftwork ?? 'Officer')
  let disposition = $state(seed.disposition ?? 'undecided')
  let tempers = $state(seed.tempers ? [...seed.tempers] : [])

  let search = $state('')
  let temperFilter = $state('')
  let savedCount = $state(0)
  let searchEl = $state(null)
  let filterEl = $state(null)

  const weapon = $derived(weaponId ? catalogue.weaponById.get(weaponId) : null)
  const cw = $derived(craftwork(craftworkName))
  const used = $derived(slotsUsed(tempers))
  const validation = $derived(validateInstance({ craftwork: craftworkName, tempers }))

  const matches = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalogue.weapons.slice(0, 40)
    return catalogue.weapons.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 40)
  })

  const available = $derived.by(() => {
    if (!weapon) return []
    const list = eligibleTempers(weapon, catalogue.tempers)
    const q = temperFilter.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) => t.name.toLowerCase().includes(q))
  })

  const picked = $derived(
    tempers
      .map((t) => ({ ...t, temper: catalogue.temperById.get(t.temperId) }))
      .filter((t) => t.temper),
  )

  function stacksOf(temperId) {
    return tempers.find((t) => t.temperId === temperId)?.stacks ?? 0
  }

  /**
   * Cycle a Temper 0 → ×1 → ×2 → 0, skipping any step that would overflow the
   * craftwork's slot ceiling. Skip rather than block: at capacity a single-stacked
   * Temper must still cycle straight off, or it's stuck on.
   */
  function toggle(temperId) {
    const current = stacksOf(temperId)
    const wouldOverflow = used + 1 > cw.max

    if (current === 0) {
      if (wouldOverflow) return
      tempers = cycleTemper(tempers, temperId)
      return
    }
    if (current === 1 && wouldOverflow) {
      tempers = tempers.filter((t) => t.temperId !== temperId)
      return
    }
    tempers = cycleTemper(tempers, temperId)
  }

  function drop(temperId) {
    tempers = tempers.filter((t) => t.temperId !== temperId)
  }

  function pick(w) {
    weaponId = w.id
    // Tempers from the previous weapon may not be legal on this one.
    const legal = new Set(eligibleTempers(w, catalogue.tempers).map((t) => t.id))
    tempers = tempers.filter((t) => legal.has(t.temperId))
    search = ''
  }

  function reset() {
    weaponId = null
    tempers = []
    disposition = 'undecided'
    search = ''
    temperFilter = ''
    searchEl?.focus()
  }

  function save({ andAnother = false } = {}) {
    if (!weaponId || !validation.ok) return
    onsave({ uid: seed.uid, weaponId, craftwork: craftworkName, disposition, tempers })
    if (andAnother && !editing) {
      savedCount += 1
      reset()
    } else {
      onclose()
    }
  }

  function onkeydown(e) {
    if (e.key === 'Escape') {
      onclose()
      return
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
      e.preventDefault()
      ;(weapon ? filterEl : searchEl)?.focus()
      return
    }
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || !weaponId || !validation.ok) return
    if (e.target?.tagName === 'TEXTAREA') return
    e.preventDefault()
    save({ andAnother: !editing && !e.shiftKey })
  }

  $effect(() => {
    searchEl?.focus()
  })
</script>

<svelte:window {onkeydown} />

<div class="scrim" role="presentation" onclick={onclose}></div>

<div class="dialog" role="dialog" aria-label={editing ? 'Edit weapon' : 'Add weapon'} aria-modal="true">
  <header>
    <img src={UI_ICONS.arsenal} alt="" width="28" height="28" />
    <span class="display heading">{editing ? 'Edit weapon' : 'Add weapon'}</span>
    {#if savedCount > 0}
      <span class="num session">weapon {savedCount + 1} this session</span>
    {/if}
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
  </header>

  <div class="split">
    <div class="picker">
      <div class="setup">
        {#if weapon}
          <div class="chosen">
            <IconBadge file={weapon.icon} alt={weapon.name} size={34} tint={cw.color} />
            <span class="chosen-name">{weapon.name}</span>
            <span class="divider"></span>
            <span class="chosen-meta subtle">
              {weapon.art ?? '—'} · {weapon.origin ?? 'Universal'}
            </span>
            <button class="link" onclick={() => (weaponId = null)}>change</button>
          </div>
        {:else}
          <div class="searchbox">
            <input bind:this={searchEl} type="search" bind:value={search} placeholder="Search weapons" />
          </div>
          <div class="weapon-list">
            {#each matches as w (w.id)}
              <button class="weapon-option" onclick={() => pick(w)}>
                <IconBadge file={w.icon} alt={w.name} size={26} tint={ORIGIN_COLORS[w.origin] ?? 'var(--origin-universal)'} />
                <span class="wname">{w.name}</span>
                <span class="subtle wmeta">{w.origin ?? 'Universal'} · {w.art ?? '—'}</span>
              </button>
            {:else}
              <p class="subtle pad">No weapon matches “{search}”.</p>
            {/each}
          </div>
        {/if}

        {#if weapon}
          <div class="tiers" role="radiogroup" aria-label="Craftwork">
            {#each CRAFTWORK as c (c.name)}
              <button
                class="tier"
                class:on={craftworkName === c.name}
                role="radio"
                aria-checked={craftworkName === c.name}
                onclick={() => (craftworkName = c.name)}
                title="{c.name}: {c.min}–{c.max} Tempers, +{c.damage} damage"
              >
                <span class="swatch" style="background:{c.color}"></span>
                {c.name}
                <span class="num tier-slots">{c.min}–{c.max}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if weapon}
        <div class="filter-row">
          <div class="searchbox">
            <input
              bind:this={filterEl}
              type="search"
              bind:value={temperFilter}
              placeholder="Filter Tempers"
            />
          </div>
          <span class="num available-count subtle">{available.length} eligible</span>
        </div>

        <div class="grid">
          {#each available as t (t.id)}
            {@const n = stacksOf(t.id)}
            {@const blocked = n === 0 && used >= cw.max}
            <button
              class="cell"
              class:on={n > 0}
              class:blocked
              onclick={() => toggle(t.id)}
              disabled={blocked}
              title="{t.name}{t.description ? `: ${t.description}` : ''}"
            >
              <IconBadge
                file={t.icon}
                alt={t.name}
                size={44}
                tint={ORIGIN_COLORS[t.origin || 'Universal'] ?? 'var(--origin-universal)'}
              />
              <span class="cell-name">{t.name}</span>
              {#if n > 0}<span class="num badge">×{n}</span>{/if}
            </button>
          {:else}
            <p class="subtle pad">No Tempers can roll on this weapon.</p>
          {/each}
        </div>
      {/if}
    </div>

    <aside class="side">
      {#if weapon}
        <div class="block">
          <div class="block-head">
            <span class="eyebrow">Slots used</span>
            <span class="num slots" class:over={used > cw.max}>{used} / {cw.min}–{cw.max}</span>
          </div>
          <div class="slotbar">
            {#each Array.from({ length: cw.max }) as _, i (i)}
              <span class:filled={i < used}></span>
            {/each}
          </div>
          <p class="hint subtle">
            {cw.name} takes {cw.min} to {cw.max}. Click a Temper twice for a double stack.
          </p>
        </div>

        <div class="chosen-list">
          {#each picked as p (p.temperId)}
            <div class="chosen-row">
              <IconBadge
                file={p.temper.icon}
                alt={p.temper.name}
                size={26}
                tint={ORIGIN_COLORS[p.temper.origin || 'Universal'] ?? 'var(--origin-universal)'}
              />
              <span class="chosen-row-name">{p.temper.name}</span>
              <span class="num stack">×{p.stacks}</span>
              <button class="link" onclick={() => drop(p.temperId)} aria-label="Remove {p.temper.name}">
                ✕
              </button>
            </div>
          {:else}
            <p class="subtle pad">Nothing picked yet.</p>
          {/each}
        </div>

        <label class="plan-field">
          <span class="eyebrow">Plan</span>
          <select class="input" bind:value={disposition}>
            <option value="undecided">Undecided</option>
            <option value="keep">Keep</option>
            <option value="scrap">Scrap</option>
          </select>
        </label>
      {:else}
        <p class="subtle pad">Pick a weapon to start.</p>
      {/if}

      <div class="side-foot">
        {#each validation.errors as err, i (i)}<span class="msg error">{err}</span>{/each}
        {#each validation.warnings as warn, i (i)}<span class="msg warn">{warn}</span>{/each}

        {#if editing}
          <button class="btn btn-primary" onclick={() => save()} disabled={!weaponId || !validation.ok}>
            Save changes <kbd>↵</kbd>
          </button>
        {:else}
          <button
            class="btn btn-primary"
            onclick={() => save({ andAnother: true })}
            disabled={!weaponId || !validation.ok}
          >
            Save &amp; add another <kbd>↵</kbd>
          </button>
          <button class="btn" onclick={() => save()} disabled={!weaponId || !validation.ok}>
            Save &amp; close <kbd>⇧↵</kbd>
          </button>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--scrim);
  }
  .dialog {
    position: fixed;
    top: 44px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 21;
    display: flex;
    flex-direction: column;
    width: min(940px, calc(100vw - 40px));
    max-height: calc(100vh - 88px);
    background: var(--surface-panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--line-default);
  }
  header img {
    border-radius: var(--radius-xs);
    border: 1px solid var(--line-default);
  }
  .heading {
    flex: 1;
    font-size: 22px;
    color: var(--content-strong);
  }
  .session {
    font-size: 11.5px;
    color: var(--content-muted);
  }
  .close {
    padding: 0;
    border: 0;
    background: none;
    color: var(--content-muted);
    font-size: 15px;
  }
  .close:hover {
    color: var(--content-strong);
  }

  .split {
    display: grid;
    grid-template-columns: 1fr 300px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ----------------------------------------------------------- left column */

  .picker {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line-default);
  }
  .setup {
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--line-default);
  }

  .chosen {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border: 1.5px solid var(--accent-primary);
    border-radius: var(--radius-sm);
    background: var(--surface-canvas);
  }
  .chosen-name {
    font-size: 13.5px;
    color: var(--content-strong);
  }
  .divider {
    width: 1px;
    height: 15px;
    background: var(--accent-primary);
  }
  .chosen-meta {
    flex: 1;
    font-size: 11px;
  }

  .weapon-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 3px;
    max-height: 14rem;
    overflow-y: auto;
  }
  .weapon-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
  }
  .weapon-option:hover {
    border-color: var(--line-strong);
    background: var(--surface-canvas);
  }
  .wname {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--content-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wmeta {
    font-size: 10.5px;
    white-space: nowrap;
  }

  .tiers {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .tier {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 11px;
    border: 1px solid var(--line-default);
    border-radius: 7px;
    background: var(--surface-canvas);
    color: var(--content-muted);
    font-size: 12px;
  }
  .tier:hover {
    color: var(--content-strong);
  }
  .tier.on {
    border-color: var(--accent-primary);
    background: var(--accent-bg);
    color: var(--content-strong);
    font-weight: 600;
  }
  .swatch {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .tier-slots {
    font-size: 10px;
    opacity: 0.7;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line-default);
  }
  .filter-row .searchbox {
    flex: 1;
  }
  .available-count {
    font-size: 11px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 7px;
    align-content: start;
    padding: 14px 20px 20px;
    overflow: auto;
  }
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 5px;
    border: 1px solid var(--line-default);
    border-radius: 9px;
    background: var(--surface-canvas);
    transition: border-color var(--duration-fast) var(--ease-standard);
  }
  .cell:hover:not(:disabled) {
    border-color: var(--line-strong);
  }
  .cell.on {
    border-color: var(--accent-primary);
    background: var(--accent-bg);
  }
  .cell.blocked {
    opacity: 0.32;
    cursor: not-allowed;
  }
  .cell-name {
    font-size: 10.5px;
    line-height: 1.25;
    color: var(--content-default);
    text-align: center;
    overflow: hidden;
  }
  .badge {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: var(--accent-primary);
    color: #f5e6d3;
    font-size: 9.5px;
  }

  /* ---------------------------------------------------------- right column */

  .side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px 20px;
    min-height: 0;
    overflow: auto;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .slots {
    font-size: 15px;
    color: var(--content-strong);
  }
  .slots.over {
    color: var(--error);
  }
  .slotbar {
    display: flex;
    gap: 4px;
  }
  .slotbar span {
    flex: 1;
    height: 6px;
    border-radius: 2px;
    background: var(--surface-raised);
  }
  .slotbar span.filled {
    background: var(--accent-primary);
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }

  .chosen-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chosen-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 8px 10px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-sm);
    background: var(--surface-canvas);
  }
  .chosen-row-name {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--content-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stack {
    padding: 2px 7px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    color: var(--content-muted);
    font-size: 10px;
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

  .plan-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .side-foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
  }
  .side-foot .btn {
    padding: 10px;
  }
  .msg {
    font-size: 11px;
    line-height: 1.4;
  }
  .msg.error {
    color: var(--error);
    font-weight: 600;
  }
  .msg.warn {
    color: var(--warning);
  }

  .pad {
    margin: 0;
    padding: var(--space-4);
    grid-column: 1 / -1;
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 860px) {
    .dialog {
      top: 12px;
      max-height: calc(100vh - 24px);
      width: calc(100vw - 24px);
    }
    .split {
      grid-template-columns: 1fr;
      overflow: auto;
    }
    .picker {
      border-right: 0;
      border-bottom: 1px solid var(--line-default);
    }
    .grid {
      overflow: visible;
    }
    .side {
      overflow: visible;
    }
  }
</style>
