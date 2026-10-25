import type { LoginFormContext } from "./form-detect.js";
import { createFieldIcon } from "./panel.js";

const ICON_ATTR = "data-pm-icon";
const WRAP_ATTR = "data-pm-wrap";
const ICON_SIZE = 22;
const ICON_INSET = 8;

type Binding = {
  btn: HTMLButtonElement;
  reposition: () => void;
};

const bindings = new Map<HTMLInputElement, Binding>();
let layer: HTMLDivElement | null = null;
let globalListeners = false;

function ensureLayer(): HTMLDivElement {
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "pm-icon-layer";
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483645;";
  document.documentElement.appendChild(layer);
  return layer;
}

function isInputVisible(input: HTMLInputElement): boolean {
  const r = input.getBoundingClientRect();
  if (r.width < 40 || r.height < 12) return false;
  const st = getComputedStyle(input);
  if (st.visibility === "hidden" || st.display === "none") return false;
  return true;
}

function unwrapLegacy(input: HTMLInputElement): void {
  const wrap = input.closest(`[${WRAP_ATTR}]`);
  if (wrap?.parentNode) {
    wrap.parentNode.insertBefore(input, wrap);
    wrap.remove();
  }
  input.removeAttribute(ICON_ATTR);
}

function removeBinding(input: HTMLInputElement): void {
  const b = bindings.get(input);
  if (!b) return;
  b.btn.remove();
  bindings.delete(input);
}

function repositionAll(): void {
  for (const [input, { btn, reposition }] of bindings) {
    if (!document.contains(input)) {
      removeBinding(input);
      continue;
    }
    reposition();
  }
}

function ensureGlobalListeners(): void {
  if (globalListeners) return;
  globalListeners = true;
  window.addEventListener("scroll", repositionAll, true);
  window.addEventListener("resize", repositionAll);
}

export function syncFieldIcons(
  fields: Array<{ input: HTMLInputElement; ctx: LoginFormContext }>,
  onIconClick: (ctx: LoginFormContext, anchor: HTMLButtonElement) => void,
): void {
  ensureLayer();
  ensureGlobalListeners();

  const activeInputs = new Set<HTMLInputElement>();

  for (const { input, ctx } of fields) {
    activeInputs.add(input);
    unwrapLegacy(input);

    let binding = bindings.get(input);
    if (!binding) {
      const btn = createFieldIcon((anchor) => onIconClick(ctx, anchor));
      btn.className = "pm-field-icon";
      btn.style.pointerEvents = "auto";
      btn.style.position = "fixed";
      btn.style.margin = "0";
      ensureLayer().appendChild(btn);

      const reposition = () => {
        if (!document.contains(input)) {
          removeBinding(input);
          return;
        }
        if (!isInputVisible(input)) {
          btn.hidden = true;
          return;
        }
        btn.hidden = false;
        const r = input.getBoundingClientRect();
        const left = r.right - ICON_SIZE - ICON_INSET;
        const top = r.top + (r.height - ICON_SIZE) / 2;
        btn.style.left = `${Math.max(4, left)}px`;
        btn.style.top = `${top}px`;
        btn.style.width = `${ICON_SIZE}px`;
        btn.style.height = `${ICON_SIZE}px`;
      };

      binding = { btn, reposition };
      bindings.set(input, binding);
      input.setAttribute(ICON_ATTR, "1");
    }

    binding.reposition();
  }

  for (const input of [...bindings.keys()]) {
    if (!activeInputs.has(input)) removeBinding(input);
  }
}
