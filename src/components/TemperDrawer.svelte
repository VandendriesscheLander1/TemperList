<script>
  import IconBadge from './IconBadge.svelte'
  import { ORIGIN_COLORS, craftwork } from '../lib/rules.js'
  import { sourceBreakdown, STATUS } from '../lib/derive.js'
  import { setShelf } from '../lib/inventory.js'
  import { store } from '../lib/store.svelte.js'

  let { row, catalogue, threshold, onclose } = $props()

  const origin = $derived(row.temper.origin || 'Universal')
  const accent = $derived(ORIGIN_COLORS[origin] ?? 'var(--origin-universal)')
  const breakdown = $derived(sourceBreakdown(row, catalogue))
  const shelfCount = $derived(store.data.shelf[row.temper.id] ?? 0)
  const instanceByUid = $derived(new Map(store.data.weapons.map((w) => [w.uid, w])))

  /** Weapons in the catalogue that can roll this Temper but that you don't own. */
  const couldRollOn = $derived.by(() => {
    const owned = new Set(breakdown.map((b) => b.weaponId))
    return catalogue.weapons
      .filter((w) => !owned.has(w.id))
      .filter((w) => {
        if (row.temper.possibleWeapons?.length) {
          return row.temper.possibleWeapons.some((n) => n.toLowerCase() === w.name.toLowerCase())
        }
        if (w.possibleTempers?.length) {
          return w.possibleTempers.some((n) => n.toLowerCase() === row.temper.name.toLowerCase())
        }
        const originOk = origin === 'Universal' || origin === w.origin
        const gate = row.temper.weaponType || 'All Weapons'
        const artType = { Bow: 'Bow', Magick: 'Magick' }[w.art] ?? 'Melee'
        return originOk && (gate === 'All Weapons' || gate === artType)
      })
      .slice(0, 24)
  })

  /** The disposition of the weapon instance an owned copy sits on. */
  function planOf(entry) {
    const dispositions = entry.instances.map((i) => instanceByUid.get(i.uid)?.disposition)
    if (dispositions.every((d) => d === 'scrap')) return 'scrap'
    if (dispositions.every((d) => d === 'keep')) return 'keep'
    return 'undecided'
  }

  function adjustShelf(delta) {
    store.commit((inv) => setShelf(inv, row.temper.id, (inv.shelf[row.temper.id] ?? 0) + delta))
  }

  function onkeydown(e) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<div class="scrim" role="presentation" onclick={onclose}></div>

<aside class="drawer" aria-label="{row.temper.name} details">
  <header>
    <IconBadge file={row.temper.icon} alt={row.temper.name} size={62} tint={accent} />
    <div class="title">
      <h2 class="display">{row.temper.name}</h2>
      <p class="tags subtle">
        <span class="dot" style="background:{accent}"></span>
        {origin} · {row.temper.weaponType || 'All Weapons'}{row.temper.subcategory
          ? ` · ${row.temper.subcategory}`
          : ''}
      </p>
    </div>
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
  </header>

  <div class="body">
    {#if row.temper.description}
      <p class="description">{row.temper.description}</p>
    {/if}

    <section class="block">
      <div class="block-head">
        <span class="eyebrow">Recipe progress</span>
        <span class="num progress-count">{row.held} / {threshold}</span>
      </div>
      <div class="meter tall">
        <span
          style="width:{row.progress * 100}%; background:{row.status === STATUS.READY
            ? 'var(--success)'
            : 'var(--accent-primary)'}"
        ></span>
      </div>
      <p class="note subtle">
        {#if row.status === STATUS.READY}
          Enough to unlock. Dismantle {threshold} to claim the recipe.
        {:else if row.remaining === 1}
          One more dismantle unlocks the recipe.
        {:else}
          {row.remaining} more needed — {row.fromWeapons} on weapons, {row.fromShelf} banked.
        {/if}
      </p>
    </section>

    <div class="banked">
      <div class="banked-text">
        <span class="banked-title">Banked</span>
        <span class="subtle">counted by hand, outside your arsenal</span>
      </div>
      <div class="stepper">
        <button onclick={() => adjustShelf(-1)} disabled={shelfCount === 0} aria-label="Bank one fewer">
          −
        </button>
        <span class="num stepper-value">{shelfCount}</span>
        <button onclick={() => adjustShelf(1)} aria-label="Bank one more">+</button>
      </div>
    </div>

    <section class="block">
      <span class="eyebrow">
        On your weapons ({breakdown.length})
      </span>
      {#if breakdown.length === 0}
        <p class="none subtle">None of your weapons carry this Temper yet.</p>
      {:else}
        <div class="rows">
          {#each breakdown as entry (entry.weaponId)}
            {@const cw = craftwork(instanceByUid.get(entry.instances[0].uid)?.craftwork)}
            {@const plan = planOf(entry)}
            <div class="row">
              <IconBadge
                file={entry.weapon?.icon}
                alt={entry.weapon?.name ?? entry.weaponId}
                size={28}
                tint={cw.color}
              />
              <span class="row-name">{entry.weapon?.name ?? entry.weaponId}</span>
              {#if entry.instances.some((i) => i.stacks > 1)}
                <span class="num stack" title="Includes a double-stack">×2</span>
              {/if}
              <span class="tier" style="--tier:{cw.color}">{cw.name}</span>
              <span class="plan {plan}">{plan === 'undecided' ? '—' : plan}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if row.temper.stats?.length}
      <section class="block">
        <span class="eyebrow">Rank effects</span>
        <div class="ranks">
          {#each row.temper.stats as stat, i (i)}
            <div class="rank">
              <span class="num rank-key">{stat.ranks ?? `—`}</span>
              <span class="rank-effect">
                <span class="rank-title">{stat.effect}</span>
                {#if stat.notes}<span class="rank-note subtle">{stat.notes}</span>{/if}
              </span>
            </div>
          {/each}
        </div>
        <p class="note subtle">Ranks are shown as single-stack / double-stack.</p>
      </section>
    {/if}

    {#if couldRollOn.length}
      <section class="block">
        <span class="eyebrow">Also rolls on</span>
        <div class="pills">
          {#each couldRollOn as w (w.id)}
            <span class="pill" title="{w.name} · {w.origin} {w.art}">{w.name}</span>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</aside>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--scrim);
    animation: fade var(--duration-normal) var(--ease-standard);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    display: flex;
    flex-direction: column;
    width: min(436px, 100vw);
    overflow: auto;
    background: var(--surface-panel);
    border-left: 1px solid var(--line-strong);
    box-shadow: -14px 0 40px rgba(28, 26, 22, 0.28);
    animation: slide var(--duration-normal) var(--ease-standard);
  }
  @keyframes slide {
    from {
      transform: translateX(1.5rem);
      opacity: 0;
    }
  }

  header {
    display: flex;
    gap: 14px;
    padding: 22px;
    border-bottom: 1px solid var(--line-default);
  }
  .title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .title h2 {
    font-size: 24px;
    font-weight: 400;
  }
  .tags {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: 12px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
  }
  .close {
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--content-muted);
    font-size: 15px;
  }
  .close:hover {
    color: var(--content-strong);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 22px;
  }
  .description {
    margin: 0;
    color: var(--content-muted);
    font-size: 12.5px;
    line-height: 1.6;
    font-style: italic;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .progress-count {
    font-size: 14px;
    color: var(--content-strong);
  }
  .meter.tall {
    height: 7px;
  }
  .note {
    margin: 0;
    font-size: 12px;
  }
  .none {
    margin: 0;
    font-size: 12px;
  }

  .banked {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 13px 15px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-md);
    background: var(--surface-canvas);
  }
  .banked-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .banked-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .banked-text .subtle {
    font-size: 11px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .stepper button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: transparent;
    color: var(--content-default);
  }
  .stepper button:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-hover);
  }
  .stepper button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .stepper-value {
    min-width: 1.25rem;
    text-align: center;
    font-size: 17px;
    color: var(--content-strong);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 9px 11px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-sm);
    background: var(--surface-canvas);
  }
  .row-name {
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
    font-size: 10px;
    color: var(--accent-light);
  }
  .tier {
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--tier) 67%, transparent);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--tier) 20%, transparent);
    font-size: 10.5px;
    white-space: nowrap;
  }
  .plan {
    min-width: 40px;
    padding: 2px 7px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    color: var(--content-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    text-align: center;
  }
  .plan.scrap {
    border-color: var(--warning);
    color: var(--warning);
  }
  .plan.keep {
    border-color: var(--success);
    color: var(--success);
  }

  .ranks {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .rank {
    display: grid;
    grid-template-columns: 86px 1fr;
    gap: 12px;
    padding: 10px 13px;
    background: var(--surface-canvas);
    border-bottom: 1px solid var(--line-default);
    font-size: 12.5px;
  }
  .rank:last-child {
    border-bottom: 0;
  }
  .rank-key {
    color: var(--content-muted);
  }
  .rank-effect {
    color: var(--content-default);
  }
  .rank-title {
    display: block;
    font-weight: 500;
    color: var(--content-strong);
  }
  .rank-note {
    display: block;
    margin-top: 3px;
    font-size: 11.5px;
    line-height: 1.45;
  }

  .pills {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .pill {
    padding: 4px 9px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-pill);
    font-size: 11.5px;
    color: var(--content-default);
  }
</style>
