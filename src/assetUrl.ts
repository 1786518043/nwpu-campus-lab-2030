/** Resolve public files under the deployed site, preserving external source links. */
export function assetUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
}
