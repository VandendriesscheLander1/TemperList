<script>
  import { updateSettings, emptyInventory } from '../lib/inventory.js'
  import { downloadJSON, readJSONFile, shareUrl, decodeShare } from '../lib/share.js'
  import { store } from '../lib/store.svelte.js'

  let { onclose } = $props()

  let link = $state('')
  let importCode = $state('')
  let message = $state(null)
  let fileInput = $state(null)

  const settings = $derived(store.data.settings)

  function notify(text, kind = 'ok') {
    message = { text, kind }
    setTimeout(() => (message = null), 4000)
  }

  function set(patch) {
    store.commit((inv) => updateSettings(inv, patch))
  }

  function step(key, delta, lo, hi) {
    const next = Math.min(hi, Math.max(lo, (settings[key] ?? lo) + delta))
    if (next !== settings[key]) set({ [key]: next })
  }

  async function makeLink() {
    try {
      link = await shareUrl(store.data)
      await navigator.clipboard?.writeText(link)
      notify('Link copied to clipboard.')
    } catch (err) {
      notify(err.message ?? 'Could not build a link.', 'error')
    }
  }

  async function importFromCode() {
    try {
      const code = importCode.trim().replace(/^.*#s=/, '')
      store.replace(await decodeShare(code))
      importCode = ''
      notify('Collection imported.')
    } catch (err) {
      notify(err.message ?? 'That code could not be read.', 'error')
    }
  }

  async function importFromFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      store.replace(await readJSONFile(file))
      notify('Collection imported.')
    } catch (err) {
      notify(err.message ?? 'That file could not be read.', 'error')
    }
    event.target.value = ''
  }

  function clearAll() {
    if (!confirm('Delete every tracked weapon and banked Temper? Ctrl+Z undoes it.')) return
    store.commit(() => emptyInventory())
    notify('Cleared.')
  }

  function onkeydown(e) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<div class="scrim" role="presentation" onclick={onclose}></div>

<div class="dialog" role="dialog" aria-label="Settings" aria-modal="true">
  <header>
    <span class="display heading">Settings</span>
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
  </header>

  <div class="body">
    <div class="row">
      <div class="row-text">
        <span class="row-title">Dismantles per recipe</span>
        <span class="subtle">unlock threshold for every Temper</span>
      </div>
      <div class="stepper">
        <button onclick={() => step('recipeThreshold', -1, 1, 99)} aria-label="Fewer">−</button>
        <span class="num stepper-value">{settings.recipeThreshold}</span>
        <button onclick={() => step('recipeThreshold', 1, 1, 99)} aria-label="More">+</button>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <span class="row-title">“Closest” shortlist size</span>
        <span class="subtle">rows on the Overview</span>
      </div>
      <div class="stepper">
        <button onclick={() => step('shortlistSize', -1, 3, 20)} aria-label="Fewer">−</button>
        <span class="num stepper-value">{settings.shortlistSize}</span>
        <button onclick={() => step('shortlistSize', 1, 3, 20)} aria-label="More">+</button>
      </div>
    </div>

    <label class="row">
      <div class="row-text">
        <span class="row-title">Double-stacks count twice</span>
        <span class="subtle">a double-stack fills two slots, so assume it banks two</span>
      </div>
      <input
        type="checkbox"
        checked={settings.doubleStackCountsTwice}
        onchange={(e) => set({ doubleStackCountsTwice: e.currentTarget.checked })}
      />
    </label>

    <div class="row bordered">
      <span class="row-title">Theme</span>
      <div class="themes">
        {#each [['light', 'Light'], ['dark', 'Dark']] as [key, label] (key)}
          <button
            class:on={settings.theme === key}
            onclick={() => settings.theme !== key && store.toggleTheme()}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>

    <section class="block bordered">
      <span class="eyebrow">Your data</span>
      <div class="buttons">
        <button class="btn" onclick={() => downloadJSON(store.data)}>Export JSON</button>
        <button class="btn" onclick={() => fileInput?.click()}>Import</button>
        <button class="btn" onclick={makeLink}>Copy share link</button>
        <input bind:this={fileInput} type="file" accept="application/json" hidden onchange={importFromFile} />
      </div>

      {#if link}
        <input class="input mono link" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
      {/if}

      <div class="import">
        <input class="input" bind:value={importCode} placeholder="Paste a share link or code…" />
        <button class="btn" onclick={importFromCode} disabled={!importCode.trim()}>Load</button>
      </div>

      <p class="hint subtle">
        Everything stays in this browser. The share link packs your list into the URL.
      </p>

      {#if message}
        <p class="message" class:error={message.kind === 'error'}>{message.text}</p>
      {/if}
    </section>

    <div class="danger">
      <div class="row-text">
        <span class="row-title">Clear everything</span>
        <span class="subtle">
          {store.data.weapons.length} weapon{store.data.weapons.length === 1 ? '' : 's'} and every tally.
          Ctrl+Z undoes it.
        </span>
      </div>
      <button class="clear" onclick={clearAll}>Clear</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--scrim);
  }
  .dialog {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 51;
    display: flex;
    flex-direction: column;
    width: min(520px, calc(100vw - 40px));
    max-height: 76vh;
    background: var(--surface-panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--line-default);
  }
  .heading {
    flex: 1;
    font-size: 22px;
    color: var(--content-strong);
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

  .body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 22px;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--content-strong);
  }
  .row-text .subtle {
    font-size: 11.5px;
    line-height: 1.4;
  }
  .bordered {
    padding-top: 18px;
    border-top: 1px solid var(--line-default);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
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
  .stepper button:hover {
    border-color: var(--accent-primary);
    color: var(--accent-hover);
  }
  .stepper-value {
    min-width: 1.25rem;
    text-align: center;
    font-size: 16px;
    color: var(--content-strong);
  }

  .themes {
    display: flex;
    border: 1px solid var(--line-default);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .themes button {
    padding: 6px 14px;
    border: 0;
    background: transparent;
    color: var(--content-muted);
    font-size: 12px;
  }
  .themes button.on {
    background: var(--surface-raised);
    color: var(--content-strong);
    font-weight: 500;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .buttons {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  .buttons .btn {
    border-color: var(--line-strong);
    color: var(--content-default);
  }
  .buttons .btn:hover {
    background: var(--surface-raised);
  }
  .import {
    display: flex;
    gap: 7px;
  }
  .link {
    font-size: 11px;
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .message {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--success);
  }
  .message.error {
    color: var(--error);
  }

  .danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 13px 15px;
    border: 1px solid var(--error);
    border-radius: var(--radius-md);
    background: var(--error-bg);
  }
  .clear {
    padding: 8px 13px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--error);
    color: #f5e6d3;
    font-size: 12.5px;
    font-weight: 600;
  }
  .clear:hover {
    filter: brightness(1.1);
  }
</style>
