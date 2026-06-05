export function resolveApiBase() {
  const configured = import.meta.env.VITE_PRIMITIVES_API;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    if (
      port === '5173'
      && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
    ) {
      return 'http://127.0.0.1:3001';
    }
  }
  return '/api';
}
