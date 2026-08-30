import { mount } from 'svelte'
import './styles/app.css'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app') })

// Offline support: the catalogue and icons never change between syncs, so a
// plain cache-first worker makes the whole tool usable with no network.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('[sw] registration failed:', err)
    })
  })
}
