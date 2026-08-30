<script>
  import IconBadge from './IconBadge.svelte'
  import { CRAFTWORK, ORIGIN_COLORS } from '../lib/rules.js'
  import {
    attentionCounts,
    closestToUnlocking,
    summarize,
    summarizeByOrigin,
    STATUS,
  } from '../lib/derive.js'
  import { store } from '../lib/store.svelte.js'
  import { UI_ICONS } from '../lib/ui-icons.js'

  let { rows, threshold, onselect, onadd, ongoto } = $props()

  const stats = $derived(summarize(rows))
  const byOrigin = $derived(summarizeByOrigin(rows))
  const shortlist = $derived(store.data.settings.shortlistSize)
  const closest = $derived(closestToUnlocking(rows, shortlist))
  const attention = $derived(attentionCounts(rows, store.data))

  const ready = $derived(
    rows
      .filter((r) => r.status === STATUS.READY)
      .sort((a, b) => b.held - a.held || a.temper.name.localeCompare(b.temper.name)),
  )

  const weapons = $derived(store.data.weapons)
  const tiers = $derived(
    CRAFTWORK.map((c) => ({
      name: c.name,
      color: c.color,
      count: weapons.filter((w) => w.craftwork === c.name).length,
    })),
  )

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`
  }

  // Built in script rather than markup: an inline {#if} inside a sentence loses
  // the spaces around it to whitespace collapsing.
  const prose = $derived.by(() => {
    const lead =
      attention.oneAway > 0
        ? `${plural(attention.oneAway, 'Temper sits', 'Tempers sit')} one dismantle away from ` +
          `${attention.oneAway === 1 ? 'its' : 'their'} recipe.`
        : 'Nothing is a single dismantle away right now.'

    const arsenal =
      attention.lastCopy > 0
        ? `Your arsenal holds ${plural(weapons.length, 'weapon', 'weapons')} — ` +
          `${attention.lastCopy} of them carry the last copy of something you still need.`
        : `Your arsenal holds ${plural(weapons.length, 'weapon', 'weapons')}.`

    return `${lead} ${arsenal}`
  })
</script>

{#if weapons.length === 0}
  <div class="empty-state">
    <h3>Nothing tracked yet</h3>
    <p>Add your weapons and the Tempers they rolled. Recipe progress follows from that.</p>
    <button class="btn btn-primary" onclick={onadd}>Add your first weapon</button>
  </div>
{:else}
  <div class="view">
    <header class="masthead">
      <div class="lede">
        <span class="eyebrow">Overview</span>
        <h1 class="display">{stats.ready} of {stats.total} recipes unlocked</h1>
        <p class="prose">{prose}</p>
      </div>

      <div class="figures">
        <div class="figure">
          <span class="num figure-value">{stats.percent}%</span>
          <span class="figure-label">completion</span>
        </div>
        <div class="figure">
          <span class="num figure-value good">{attention.oneAway}</span>
          <span class="figure-label">one dismantle away</span>
        </div>
      </div>
    </header>

    <div class="columns">
      <div class="col">
        <span class="eyebrow">Progress by Origin</span>
        <div class="origins panel">
          {#each byOrigin as o (o.origin)}
            <button class="origin" onclick={() => ongoto('tempers')}>
              <span class="o-name">
                <span class="dot" style="background:{ORIGIN_COLORS[o.origin]}"></span>
                {o.origin}
              </span>
              <span class="meter">
                <span style="width:{o.percent}%; background:{ORIGIN_COLORS[o.origin]}"></span>
              </span>
              <span class="num o-ratio">{o.ready} / {o.total}</span>
            </button>
          {/each}
        </div>

        <span class="eyebrow spaced">Arsenal by Craftwork tier</span>
        <div class="tiers">
          {#each tiers as t (t.name)}
            <div class="tier panel">
              <span class="swatch" style="background:{t.color}"></span>
              <span class="num tier-count">{t.count}</span>
              <span class="tier-name">{t.name}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="col">
        <div class="block">
          <span class="eyebrow with-icon">
            <img src={UI_ICONS.star} alt="" width="15" height="15" />
            Ready to unlock
          </span>
          {#if ready.length === 0}
            <p class="none subtle">No recipe has reached {threshold} yet.</p>
          {:else}
            <div class="rows">
              {#each ready.slice(0, shortlist) as row (row.temper.id)}
                <button class="row ready" onclick={() => onselect(row)}>
                  <IconBadge
                    file={row.temper.icon}
                    alt={row.temper.name}
                    size={30}
                    tint={ORIGIN_COLORS[row.temper.origin || 'Universal']}
                  />
                  <span class="row-text">
                    <span class="row-name">{row.temper.name}</span>
                    <span class="row-meta subtle">
                      {row.temper.origin || 'Universal'} · {row.held} held
                    </span>
                  </span>
                  <span class="num unlock">unlock</span>
                </button>
              {/each}
            </div>
            {#if ready.length > shortlist}
              <button class="more subtle" onclick={() => ongoto('tempers')}>
                {ready.length - shortlist} more ready →
              </button>
            {/if}
          {/if}
        </div>

        <div class="block">
          <span class="eyebrow">Closest to unlocking</span>
          {#if closest.length === 0}
            <p class="none subtle">
              {stats.partial === 0 && stats.ready > 0
                ? 'Everything you hold is already at threshold.'
                : 'Nothing in progress yet.'}
            </p>
          {:else}
            <div class="rows">
              {#each closest as row (row.temper.id)}
                <button class="row" onclick={() => onselect(row)}>
                  <IconBadge
                    file={row.temper.icon}
                    alt={row.temper.name}
                    size={30}
                    tint={ORIGIN_COLORS[row.temper.origin || 'Universal']}
                  />
                  <span class="row-text">
                    <span class="row-name">{row.temper.name}</span>
                    <span class="meter thin">
                      <span
                        style="width:{row.progress * 100}%; background:{ORIGIN_COLORS[
                          row.temper.origin || 'Universal'
                        ]}"
                      ></span>
                    </span>
                  </span>
                  <span class="num row-ratio">{row.held}/{threshold}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .view {
    display: flex;
    flex-direction: column;
    gap: 26px;
    padding: 26px 30px 60px;
  }

  .masthead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--line-default);
  }
  .lede {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 620px;
  }
  .lede h1 {
    font-size: 34px;
    font-weight: 400;
  }
  .prose {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--content-muted);
    text-wrap: pretty;
  }

  .figures {
    display: flex;
    gap: var(--space-2);
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 104px;
    padding: 12px 16px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-md);
    background: var(--surface-panel);
  }
  .figure-value {
    font-size: 24px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .figure-value.good {
    color: var(--success);
  }
  .figure-label {
    font-size: 11px;
    color: var(--content-muted);
  }

  .columns {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 22px;
    align-items: start;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .spaced {
    margin-top: var(--space-2);
  }

  /* Origin rows share one frame, divided by hairlines — a ledger, not cards. */
  .origins {
    overflow: hidden;
  }
  .origin {
    display: grid;
    grid-template-columns: 120px 1fr 74px;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 16px;
    border: 0;
    border-bottom: 1px solid var(--line-default);
    background: transparent;
    text-align: left;
  }
  .origin:last-child {
    border-bottom: 0;
  }
  .origin:hover {
    background: var(--surface-raised);
  }
  .o-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .origin .meter {
    height: 6px;
  }
  .o-ratio {
    font-size: 12px;
    color: var(--content-muted);
    text-align: right;
  }

  .tiers {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-2);
  }
  .tier {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 12px;
  }
  .swatch {
    height: 5px;
    border-radius: 2px;
  }
  .tier-count {
    font-size: 19px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .tier-name {
    font-size: 10.5px;
    letter-spacing: 0.03em;
    color: var(--content-muted);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .with-icon {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-sm);
    background: var(--surface-panel);
    text-align: left;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }
  .row:hover {
    border-color: var(--line-strong);
  }
  .row.ready {
    border-left: 2px solid var(--success);
  }
  .row-text {
    flex: 1;
    min-width: 0;
  }
  .row-name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--content-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-meta {
    font-size: 11px;
  }
  .meter.thin {
    height: 4px;
    margin-top: 5px;
    background: var(--surface-raised);
  }
  .unlock {
    font-size: 11px;
    color: var(--success);
  }
  .row-ratio {
    font-size: 12px;
    color: var(--content-muted);
  }
  .more {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    font-size: 11.5px;
  }
  .more:hover {
    color: var(--accent-hover);
  }
  .none {
    margin: 0;
    padding: var(--space-4);
    border: 1px dashed var(--line-default);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  @media (max-width: 1180px) {
    .tiers {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 960px) {
    .view {
      padding: 20px 16px 60px;
    }
    .masthead {
      flex-direction: column;
      align-items: flex-start;
    }
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
