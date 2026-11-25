export function toast(message: string, ms = 3500) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pp-toast', { detail: { message, ms } }));
}
