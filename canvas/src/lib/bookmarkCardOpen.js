export function externalUrlForCard(card) {
  if (card?.type !== 'bookmark') return '';
  const versions = card.versions ?? [];
  const pinned =
    versions.find((version) => version.version === card.pinnedVersion)
    ?? versions[0];
  return pinned?.externalUrl || '';
}
