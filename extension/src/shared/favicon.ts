/** Favicon công khai theo hostname (fallback initials nếu null). */
export function siteFaviconUrl(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (!h) return null;
  if (h.endsWith(".kpmapp")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`;
}

export function wireFaviconImages(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img[data-favicon-host]").forEach((img) => {
    img.addEventListener("error", () => {
      img.hidden = true;
      const fb = img.nextElementSibling;
      if (fb instanceof HTMLElement) fb.hidden = false;
    });
    img.addEventListener("load", () => {
      const fb = img.nextElementSibling;
      if (fb instanceof HTMLElement && img.naturalWidth > 0) fb.hidden = true;
    });
  });
}

export function faviconImgHtml(host: string, initials: string): string {
  const url = siteFaviconUrl(host);
  if (!url) {
    return `<span class="favicon-fallback">${initials}</span>`;
  }
  return `<img src="${url}" alt="" width="36" height="36" loading="lazy" data-favicon-host="${host}" />
    <span class="favicon-fallback" hidden>${initials}</span>`;
}
