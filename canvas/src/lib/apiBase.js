export function resolveApiBase({
  env = import.meta.env,
  location = typeof window !== 'undefined' ? window.location : null,
} = {}) {
  const configured = env?.VITE_PRIMITIVES_API;
  if (configured) return configured;
  if (location) {
    const { hostname, port } = location;
    if (
      port === '5173'
      && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
    ) {
      return '/api';
    }
  }
  return '/api';
}
