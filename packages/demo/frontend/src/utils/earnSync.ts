export const EARN_POSITIONS_CHANGED_EVENT = 'earn:positions-changed'

export function dispatchEarnPositionsChanged() {
  window.dispatchEvent(new Event(EARN_POSITIONS_CHANGED_EVENT))
}
