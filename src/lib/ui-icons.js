/**
 * The app's own chrome icons, as opposed to catalogue art (see catalogue.js).
 *
 * Imported rather than referenced by path so Vite fingerprints them and the
 * build fails loudly if one goes missing. Regenerate with
 * `npm run build-ui-icons` after changing anything in assets/ui/source/.
 */

import mark from '../assets/ui/mark.webp'
import overview from '../assets/ui/overview.webp'
import tempers from '../assets/ui/tempers.webp'
import arsenal from '../assets/ui/arsenal.webp'
import planner from '../assets/ui/planner.webp'
import star from '../assets/ui/star.webp'

export const UI_ICONS = { mark, overview, tempers, arsenal, planner, star }
