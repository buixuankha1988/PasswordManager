let clipboardClearTimer: number | undefined;

/** Copy text; optionally xóa clipboard sau vài giây (giảm rủi ro dán lại). */
export async function copyToClipboard(
  text: string,
  clearAfterMs = 45_000,
): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      scheduleClipboardClear(clearAfterMs);
      return true;
    } catch {
      /* fallback */
    }
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "2em";
  ta.style.height = "2em";
  ta.style.padding = "0";
  ta.style.border = "none";
  ta.style.outline = "none";
  ta.style.boxShadow = "none";
  ta.style.background = "transparent";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (ok) scheduleClipboardClear(clearAfterMs);
  return ok;
}

function scheduleClipboardClear(ms: number): void {
  if (ms <= 0) return;
  window.clearTimeout(clipboardClearTimer);
  clipboardClearTimer = window.setTimeout(() => {
    void navigator.clipboard.writeText("").catch(() => {});
  }, ms);
}
