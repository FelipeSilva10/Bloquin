export function normalizeExternalLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || !url.hostname
      || url.username
      || url.password
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeYoutubeUrl(value: string): { url: string; id: string } | null {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    if (host !== 'youtube.com' && host !== 'youtu.be') return null;

    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    else if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') ?? '';
    else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] ?? '';
    else if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] ?? '';

    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return { id, url: `https://www.youtube.com/watch?v=${id}` };
  } catch {
    return null;
  }
}
