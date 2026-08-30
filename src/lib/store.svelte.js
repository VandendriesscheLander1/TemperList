/**
 * Reactive inventory store (Svelte 5 runes) + localStorage persistence + undo.
 *
 * All mutation goes through `commit`, which is what makes undo and autosave
 * a single concern rather than something every call site has to remember.
 */

import { emptyInventory, migrate } from './inventory.js'

const STORAGE_KEY = 'temperlist:v1'
const THEME_KEY = 'temperlist:theme'
const UNDO_DEPTH = 40

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyInventory()
    return migrate(JSON.parse(raw))
  } catch (err) {
    console.warn('[store] could not read saved inventory, starting fresh:', err)
    return emptyInventory()
  }
}

class InventoryStore {
  #undo = $state([])
  #redo = $state([])

  data = $state(emptyInventory())
  /** Set when a write fails (e.g. private browsing / quota) so the UI can warn. */
  persistError = $state(null)

  constructor() {
    this.data = readStored()
    this.applyTheme(this.data.settings.theme)
  }

  get canUndo() {
    return this.#undo.length > 0
  }
  get canRedo() {
    return this.#redo.length > 0
  }

  /**
   * Apply a pure `inventory => inventory` transform, pushing the previous state
   * onto the undo stack and persisting the result.
   */
  commit(fn, { snapshot = true } = {}) {
    const previous = this.data
    const next = fn(previous)
    if (next === previous) return

    if (snapshot) {
      this.#undo = [...this.#undo.slice(-(UNDO_DEPTH - 1)), previous]
      this.#redo = []
    }
    this.data = next
    this.persist()
  }

  undo() {
    if (!this.canUndo) return
    const previous = this.#undo[this.#undo.length - 1]
    this.#undo = this.#undo.slice(0, -1)
    this.#redo = [...this.#redo, this.data]
    this.data = previous
    this.persist()
  }

  redo() {
    if (!this.canRedo) return
    const next = this.#redo[this.#redo.length - 1]
    this.#redo = this.#redo.slice(0, -1)
    this.#undo = [...this.#undo, this.data]
    this.data = next
    this.persist()
  }

  /** Replace everything (import / share link). Undoable. */
  replace(inventory) {
    this.commit(() => migrate(inventory))
    this.applyTheme(this.data.settings.theme)
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
      this.persistError = null
    } catch (err) {
      this.persistError = err?.message ?? 'Could not save to this browser.'
      console.warn('[store] persist failed:', err)
    }
  }

  applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark'
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {}
  }

  toggleTheme() {
    const next = this.data.settings.theme === 'dark' ? 'light' : 'dark'
    this.commit((inv) => ({ ...inv, settings: { ...inv.settings, theme: next } }), { snapshot: false })
    this.applyTheme(next)
  }
}

export const store = new InventoryStore()
