const LAYER_PROPERTY_NAMES = [
  /^layer$/i,
  /^presentation layer$/i,
  /^cad layer$/i,
  /^archicad layer$/i,
];

export function resolveElementLayer(properties = []) {
  const match = properties.find((property) => (
    LAYER_PROPERTY_NAMES.some((pattern) => pattern.test(String(property?.propertyName ?? '').trim()))
  ));
  if (match?.value != null && String(match.value).trim() !== '') {
    return String(match.value);
  }
  return null;
}
