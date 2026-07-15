// True once the app shell has mounted in this tab's session — lets BackButton
// tell a real in-app navigation apart from a freshly opened/shared link.
const APP_LOADED_KEY = 'shiurim:appLoaded'

export function markAppLoaded() {
  sessionStorage.setItem(APP_LOADED_KEY, '1')
}

export function isAppLoaded() {
  return sessionStorage.getItem(APP_LOADED_KEY) === '1'
}
