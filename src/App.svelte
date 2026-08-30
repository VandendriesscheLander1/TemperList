<script>
  import { loadCatalogue } from './lib/catalogue.js'
  import { temperRows, summarize } from './lib/derive.js'
  import { addWeapon, updateWeapon } from './lib/inventory.js'
  import { pendingShareCode, clearShareCode, decodeShare } from './lib/share.js'
  import { store } from './lib/store.svelte.js'
  import { UI_ICONS } from './lib/ui-icons.js'

  import DashboardView from './components/DashboardView.svelte'
  import TempersView from './components/TempersView.svelte'
  import ArsenalView from './components/ArsenalView.svelte'
  import PlannerView from './components/PlannerView.svelte'
  import SettingsDialog from './components/SettingsDialog.svelte'
  import TemperDrawer from './components/TemperDrawer.svelte'
  import AddWeaponDialog from './components/AddWeaponDialog.svelte'

  const TABS = [
    { key: 'dashboard', label: 'Overview', icon: UI_ICONS.overview, hint: '1' },
    { key: 'tempers', label: 'Tempers', icon: UI_ICONS.tempers, hint: '2' },
    { key: 'arsenal', label: 'Arsenal', icon: UI_ICONS.arsenal, hint: '3' },
    { key: 'planner', label: 'Planner', icon: UI_ICONS.planner, hint: '4' },
  ]

  let catalogue = $state(null)
  let loadError = $state(null)
  let tab = $state('dashboard')
  let selectedRow = $state(null)
  let editing = $state(null)
  let addOpen = $state(false)
  let settingsOpen = $state(false)
  let shareBanner = $state(null)

  const rows = $derived(catalogue ? temperRows(catalogue, store.data) : [])
  const threshold = $derived(store.data.settings.recipeThreshold)
  const stats = $derived(rows.length ? summarize(rows) : null)
  // Any layer over the shell swallows the shell's single-key shortcuts, so
  // typing "3" in a dialog can't yank the page out from under it.
  const overlayOpen = $derived(addOpen || settingsOpen || Boolean(selectedRow))

  // Keep the open drawer pointed at fresh data as counts change under it.
  const activeRow = $derived(
    selectedRow ? (rows.find((r) => r.temper.id === selectedRow.temper.id) ?? selectedRow) : null,
  )

  $effect(() => {
    loadCatalogue()
      .then((c) => {
        catalogue = c
      })
      .catch((err) => {
        loadError = err.message ?? String(err)
      })
  })

  // A share link should never silently overwrite what's already tracked.
  $effect(() => {
    const code = pendingShareCode()
    if (!code) return
    clearShareCode()
    decodeShare(code)
      .then((inventory) => {
        shareBanner = { inventory, count: inventory.weapons.length }
      })
      .catch((err) => {
        shareBanner = { error: err.message ?? 'That share link could not be read.' }
      })
  })

  function saveWeapon(draft) {
    if (draft.uid) {
      const { uid, ...patch } = draft
      store.commit((inv) => updateWeapon(inv, uid, patch))
    } else {
      store.commit((inv) => addWeapon(inv, draft))
    }
  }

  function openAdd() {
    editing = null
    addOpen = true
  }

  function openEdit(instance) {
    editing = instance
    addOpen = true
  }

  function onkeydown(e) {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) store.redo()
      else store.undo()
      return
    }
    if (typing || overlayOpen || e.ctrlKey || e.metaKey || e.altKey) return

    const jump = TABS.find((t) => t.hint === e.key)
    if (jump) {
      e.preventDefault()
      tab = jump.key
      return
    }
    if (e.key === 'a') {
      e.preventDefault()
      openAdd()
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <img src={UI_ICONS.mark} alt="" width="34" height="34" />
      <span class="brand-text">
        <span class="display wordmark">TemperList</span>
        <span class="eyebrow">Soulframe</span>
      </span>
    </div>

    <nav aria-label="Sections">
      {#each TABS as t (t.key)}
        <button
          class="nav-item"
          class:on={tab === t.key}
          onclick={() => (tab = t.key)}
          aria-current={tab === t.key ? 'page' : undefined}
        >
          <img src={t.icon} alt="" width="26" height="26" />
          <span class="nav-label">{t.label}</span>
          <kbd>{t.hint}</kbd>
        </button>
      {/each}
    </nav>

    {#if stats}
      <div class="tally">
        <div class="tally-head">
          <span class="num tally-count">{stats.ready}</span>
          <span class="subtle">/ {stats.total} recipes</span>
        </div>
        <div class="meter">
          <span style="width:{stats.percent}%"></span>
        </div>
        <div class="tally-foot subtle">
          <span>{store.data.weapons.length} weapons</span>
          <span>{stats.partial} in progress</span>
        </div>
      </div>
    {/if}

    <div class="sidebar-foot">
      <button class="btn btn-primary" onclick={openAdd}>Add weapon <kbd>A</kbd></button>
      <div class="pair">
        <button class="btn btn-sm mono" onclick={() => store.undo()} disabled={!store.canUndo}>
          ↶ undo
        </button>
        <button class="btn btn-sm mono" onclick={() => store.redo()} disabled={!store.canRedo}>
          redo ↷
        </button>
      </div>
      <div class="pair">
        <button class="btn btn-sm" onclick={() => store.toggleTheme()}>
          {store.data.settings.theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button class="btn btn-sm" onclick={() => (settingsOpen = true)} aria-haspopup="dialog">
          Settings
        </button>
      </div>
    </div>
  </aside>

  <div class="main">
    {#if store.persistError}
      <p class="banner error">
        Can't save to this browser ({store.persistError}). Export a backup before closing.
      </p>
    {/if}

    {#if shareBanner}
      <div class="banner share">
        {#if shareBanner.error}
          <span>{shareBanner.error}</span>
          <button class="btn btn-sm" onclick={() => (shareBanner = null)}>Dismiss</button>
        {:else}
          <span>
            Shared collection with <strong>{shareBanner.count}</strong> weapon{shareBanner.count === 1
              ? ''
              : 's'}. Loading it replaces yours (Ctrl+Z undoes).
          </span>
          <button
            class="btn btn-sm btn-primary"
            onclick={() => {
              store.replace(shareBanner.inventory)
              shareBanner = null
            }}
          >
            Load it
          </button>
          <button class="btn btn-sm" onclick={() => (shareBanner = null)}>Keep mine</button>
        {/if}
      </div>
    {/if}

    <main class="content">
      {#if loadError}
        <div class="empty-state">
          <h3>Couldn't load the catalogue</h3>
          <p>{loadError}</p>
          <p class="subtle">
            Run <code>npm run bootstrap-wiki</code> or <code>npm run sync-data</code> to generate it.
          </p>
        </div>
      {:else if !catalogue}
        <div class="empty-state"><p class="subtle">Loading catalogue…</p></div>
      {:else if tab === 'dashboard'}
        <DashboardView
          {rows}
          {threshold}
          onselect={(r) => (selectedRow = r)}
          onadd={openAdd}
          ongoto={(t) => (tab = t)}
        />
      {:else if tab === 'tempers'}
        <TempersView {rows} {catalogue} {threshold} onselect={(r) => (selectedRow = r)} />
      {:else if tab === 'arsenal'}
        <ArsenalView {catalogue} onadd={openAdd} onedit={openEdit} />
      {:else if tab === 'planner'}
        <PlannerView {catalogue} {threshold} ongoto={(t) => (tab = t)} />
      {/if}
    </main>

    <footer class="foot subtle">
      Fan-made · not affiliated with Digital Extremes · data from
      <a href="https://wiki.avakot.org/" target="_blank" rel="noreferrer">the Soulframe Wiki</a>
      and the avakot API
    </footer>
  </div>
</div>

{#if activeRow}
  <TemperDrawer row={activeRow} {catalogue} {threshold} onclose={() => (selectedRow = null)} />
{/if}

{#if settingsOpen}
  <SettingsDialog onclose={() => (settingsOpen = false)} />
{/if}

{#if addOpen && catalogue}
  <AddWeaponDialog
    {catalogue}
    initial={editing}
    onsave={saveWeapon}
    onclose={() => {
      addOpen = false
      editing = null
    }}
  />
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    min-height: 100vh;
  }

  /* ---------------------------------------------------------------- sidebar */

  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
    height: 100vh;
    padding: 18px 14px;
    background: var(--surface-panel);
    border-right: 1px solid var(--line-default);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .brand img {
    border-radius: 6px;
    border: 1px solid var(--line-default);
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .wordmark {
    font-size: 19px;
    line-height: 1;
    color: var(--content-strong);
  }
  .brand .eyebrow {
    font-size: 9.5px;
    letter-spacing: 0.16em;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 7px 9px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--content-muted);
    text-align: left;
    transition: background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }
  .nav-item img {
    border-radius: var(--radius-xs);
    border: 1px solid var(--line-default);
    /* Section art is opaque parchment, so state reads through saturation
       rather than through a fill behind it. */
    filter: grayscale(0.5);
    opacity: 0.8;
    transition: filter var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }
  .nav-item:hover {
    background: var(--surface-raised);
    color: var(--content-strong);
  }
  .nav-item.on {
    background: var(--accent-bg);
    border-color: var(--line-strong);
    color: var(--content-strong);
  }
  .nav-item.on img,
  .nav-item:hover img {
    filter: none;
    opacity: 1;
  }
  .nav-label {
    flex: 1;
    font-size: 13.5px;
    font-weight: 500;
  }
  .nav-item kbd {
    color: var(--content-muted);
  }

  .tally {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 12px;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-md);
    background: var(--surface-canvas);
  }
  .tally-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .tally-count {
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
    color: var(--content-strong);
  }
  .tally-head .subtle,
  .tally-foot {
    font-size: 11px;
  }
  .tally-foot {
    display: flex;
    justify-content: space-between;
  }

  .sidebar-foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sidebar-foot .btn-primary {
    padding: 9px;
  }
  .pair {
    display: flex;
    gap: 6px;
  }
  .pair .btn {
    flex: 1;
    padding: 7px 4px;
  }

  /* ------------------------------------------------------------------- main */

  .main {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    min-width: 0;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin: var(--space-3) 30px 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 12px;
  }
  .banner.error {
    background: var(--error-bg);
    border: 1px solid var(--error);
    color: var(--content-strong);
  }
  .banner.share {
    background: var(--accent-bg);
    border: 1px solid var(--accent-primary);
    color: var(--content-strong);
  }
  .banner span {
    flex: 1;
  }

  .foot {
    padding: var(--space-5) 30px calc(var(--space-5) + var(--safe-bottom));
    border-top: 1px solid var(--line-default);
    font-size: 11px;
    text-align: center;
  }
  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--surface-raised);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  @media (max-width: 860px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .sidebar {
      position: static;
      height: auto;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      border-right: none;
      border-bottom: 1px solid var(--line-default);
    }
    nav {
      flex: 1 1 100%;
      flex-direction: row;
      flex-wrap: wrap;
    }
    .nav-item kbd {
      display: none;
    }
    .tally {
      flex: 1 1 200px;
    }
    .sidebar-foot {
      margin-top: 0;
      flex: 1 1 240px;
    }
    .banner {
      margin-inline: 16px;
    }
    .foot {
      padding-inline: 16px;
    }
  }
</style>
