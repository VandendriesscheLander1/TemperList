<script>
  import IconBadge from './IconBadge.svelte'
  import { ORIGIN_COLORS, craftwork } from '../lib/rules.js'
  import { PLANNER_POOLS, planDismantles, poolCandidates, applyPlan } from '../lib/planner.js'
  import { store } from '../lib/store.svelte.js'
  import { UI_ICONS } from '../lib/ui-icons.js'

  let { catalogue, threshold, ongoto } = $props()

  let pool = $state('scrap')
  let limit = $state(6)
  let selected = $state(new Set())

  const plan = $derived(planDismantles(catalogue, store.data, { pool, limit }))
  const poolCounts = $derived(
    Object.fromEntries(PLANNER_POOLS.map((p) => [p.key, poolCandidates(store.data, p.key).length])),
  )

  // Default every recommended step to selected. Re-runs whenever the plan
  // changes, which is the point: a new plan is a new set of recommendations.
  $effect(() => {
    selected = new Set(plan.steps.map((s) => s.uid))
  })

  const instanceByUid = $derived(new Map(store.data.weapons.map((w) => [w.uid, w])))

  /**
   * One warning line per weapon rather than per Temper: a Legendary can be the
   * last source of six Tempers, and six near-identical lines is noise.
   */
  const warningByUid = $derived.by(() => {
    const map = new Map()
    for (const w of plan.warnings) {
      if (!map.has(w.uid)) map.set(w.uid, [])
      map.get(w.uid).push(catalogue.temperById.get(w.temperId)?.name ?? w.temperId)
    }
    return map
  })

  const chosen = $derived(plan.steps.filter((s) => selected.has(s.uid)))
  const unlockedBySelection = $derived([...new Set(chosen.flatMap((s) => s.unlocks))])
  const atRisk = $derived(
    chosen.reduce((n, s) => n + (warningByUid.get(s.uid)?.length ?? 0), 0),
  )

  function toggle(uid) {
    const next = new Set(selected)
    if (next.has(uid)) next.delete(uid)
    else next.add(uid)
    selected = next
  }

  function apply() {
    const uids = [...selected]
    if (uids.length === 0) return
    const msg =
      `Dismantle ${uids.length} weapon${uids.length === 1 ? '' : 's'}?\n\n` +
      `Their Tempers move to your banked shelf and the weapons leave your arsenal. Ctrl+Z undoes it.`
    if (!confirm(msg)) return
    store.commit((inv) => applyPlan(inv, uids))
  }

  function onkeydown(e) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target?.tagName)) return
    if (chosen.length === 0) return
    e.preventDefault()
    apply()
  }
</script>

<svelte:window {onkeydown} />

<div class="view">
  <aside class="config">
    <div class="intro">
      <span class="display title">Planner</span>
      <p class="blurb subtle">
        Choose a pool and a step budget. The plan orders dismantles so each one moves the most
        recipes.
      </p>
    </div>

    <div class="panel card">
      <div class="field">
        <span class="eyebrow">Candidate pool</span>
        <div class="options" role="radiogroup" aria-label="Candidate pool">
          {#each PLANNER_POOLS as p (p.key)}
            <button
              class="option"
              class:on={pool === p.key}
              role="radio"
              aria-checked={pool === p.key}
              onclick={() => (pool = p.key)}
            >
              <span class="radio"></span>
              {p.label} <span class="num">({poolCounts[p.key]})</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <div class="field-head">
          <span class="eyebrow">Max steps</span>
          <span class="num steps-value">{limit}</span>
        </div>
        <input class="slider" type="range" min="1" max="25" bind:value={limit} aria-label="Max steps" />
      </div>

      <div class="outcome">
        <span>Recipes unlocked</span>
        <span class="num good">+{unlockedBySelection.length}</span>
      </div>
      <div class="outcome">
        <span>Tempers lost</span>
        <span class="num" class:risk={atRisk > 0}>
          {atRisk > 0 ? `${atRisk} at risk` : 'none'}
        </span>
      </div>

      <button class="btn btn-primary" onclick={apply} disabled={chosen.length === 0}>
        Apply plan <kbd>↵</kbd>
      </button>
    </div>
  </aside>

  <div class="plan">
    {#if plan.consideredCount === 0}
      <div class="empty-state">
        <h3>No candidates</h3>
        <p>
          {#if pool === 'scrap'}
            Mark some weapons as “Scrap” in the Arsenal, or widen the pool above.
          {:else if pool === 'low'}
            You own no Stock or Military weapon that isn't marked “Keep”.
          {:else}
            Every weapon in your arsenal is marked “Keep”.
          {/if}
        </p>
        <button class="btn" onclick={() => ongoto('arsenal')}>Go to Arsenal</button>
      </div>
    {:else if plan.steps.length === 0}
      <div class="empty-state">
        <h3>Nothing left to gain</h3>
        <p>
          Every Temper on the {plan.consideredCount} candidate weapon{plan.consideredCount === 1
            ? ''
            : 's'} is already at {threshold}.
        </p>
      </div>
    {:else}
      <div class="plan-head">
        <span class="eyebrow">Dismantle order</span>
        <span class="subtle">
          {plan.steps.length} step{plan.steps.length === 1 ? '' : 's'} ·
          {unlockedBySelection.length} recipe{unlockedBySelection.length === 1 ? '' : 's'}
        </span>
      </div>

      {#each plan.steps as step, i (step.uid)}
        {@const instance = instanceByUid.get(step.uid)}
        {@const weapon = catalogue.weaponById.get(step.weaponId)}
        {@const cw = craftwork(instance?.craftwork)}
        {@const lost = warningByUid.get(step.uid) ?? []}
        {@const on = selected.has(step.uid)}
        <div class="step panel" class:on class:risky={lost.length > 0}>
          <div class="step-main">
            <label class="pick">
              <input type="checkbox" checked={on} onchange={() => toggle(step.uid)} />
              <span class="sr-only">Include {weapon?.name ?? step.weaponId}</span>
            </label>
            <span class="num index">{i + 1}.</span>

            <IconBadge file={weapon?.icon} alt={weapon?.name ?? step.weaponId} size={32} tint={cw.color} />

            <div class="step-text">
              <span class="step-name">{weapon?.name ?? step.weaponId}</span>
              <span class="step-meta subtle">
                <span>{cw.name}</span>
                {#if weapon?.origin}
                  <span aria-hidden="true">·</span>
                  <span class="dot" style="background:{ORIGIN_COLORS[weapon.origin]}"></span>
                  <span>{weapon.origin}</span>
                {/if}
              </span>
            </div>

            <div class="outcomes">
              {#each step.unlocks as id (id)}
                {@const t = catalogue.temperById.get(id)}
                <span class="tag unlocks">{t?.name ?? id} ✓ unlocks</span>
              {/each}
              {#each step.advances as adv (adv.temperId)}
                {@const t = catalogue.temperById.get(adv.temperId)}
                <span class="tag num">{t?.name ?? adv.temperId} {adv.to}/{threshold}</span>
              {/each}
              {#if step.unlocks.length === 0 && step.advances.length === 0}
                <span class="subtle">No progress, cleanup only.</span>
              {/if}
            </div>
          </div>

          {#if lost.length}
            <p class="warn">
              <img src={UI_ICONS.star} alt="" width="13" height="13" />
              <span>
                Last copy of {lost.slice(0, 4).join(', ')}{lost.length > 4
                  ? ` and ${lost.length - 4} more`
                  : ''}. {lost.length === 1 ? 'It stays' : 'They stay'} below {threshold} after this,
                with no other source in your arsenal.
              </span>
            </p>
          {/if}
        </div>
      {/each}

      {#if plan.truncated}
        <p class="truncated subtle">Showing the first {limit} steps. Raise “Max steps” for more.</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .view {
    display: grid;
    grid-template-columns: 288px 1fr;
    gap: 26px;
    align-items: start;
    padding: 26px 30px 70px;
  }

  .config {
    position: sticky;
    top: 26px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .title {
    font-size: 26px;
    color: var(--content-strong);
  }
  .blurb {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.6;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .steps-value {
    font-size: 15px;
    color: var(--content-strong);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 1px solid var(--line-default);
    border-radius: 7px;
    background: transparent;
    color: var(--content-muted);
    font-size: 12.5px;
    text-align: left;
  }
  .option:hover {
    color: var(--content-strong);
  }
  .option.on {
    border-color: var(--accent-primary);
    background: var(--accent-bg);
    color: var(--content-strong);
  }
  .radio {
    width: 9px;
    height: 9px;
    flex: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
  }
  .option.on .radio {
    border-color: var(--accent-primary);
    background: var(--accent-primary);
  }

  .slider {
    width: 100%;
  }

  .outcome {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--content-muted);
  }
  .outcome:first-of-type {
    padding-top: 12px;
    border-top: 1px solid var(--line-default);
  }
  .good {
    color: var(--success);
  }
  .risk {
    color: var(--warning);
  }

  /* ------------------------------------------------------------------ plan */

  .plan {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }
  .plan-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .plan-head .subtle {
    font-size: 12px;
  }

  .step {
    padding: 13px 16px;
    box-shadow: var(--shadow-card);
    opacity: 0.55;
    transition: opacity var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .step.on {
    opacity: 1;
  }
  .step.risky {
    border-color: var(--warning);
  }
  .step-main {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .pick {
    display: flex;
    cursor: pointer;
  }
  .index {
    width: 18px;
    font-size: 12px;
    color: var(--content-muted);
  }
  .step-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .step-name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .step-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .outcomes {
    flex: 1;
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: flex-end;
    font-size: 11px;
  }
  .tag {
    padding: 3px 9px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-xs);
    color: var(--content-muted);
    white-space: nowrap;
  }
  .tag.unlocks {
    border-color: var(--success);
    color: var(--success);
  }

  .warn {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 11px 0 0;
    padding: 9px 11px;
    border: 1px solid var(--warning);
    border-radius: 7px;
    background: var(--warning-bg);
    color: var(--content-default);
    font-size: 12px;
    line-height: 1.5;
  }
  .warn img {
    margin-top: 1px;
    flex: none;
  }

  .truncated {
    margin: var(--space-3) 0 0;
    font-size: 11px;
    text-align: center;
  }

  @media (max-width: 1024px) {
    .view {
      grid-template-columns: 1fr;
      padding: 20px 16px 70px;
    }
    .config {
      position: static;
    }
    .outcomes {
      justify-content: flex-start;
      flex: 1 1 100%;
    }
    .step-main {
      flex-wrap: wrap;
    }
  }
</style>
