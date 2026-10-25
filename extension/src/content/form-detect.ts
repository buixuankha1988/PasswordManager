export type LoginFormContext = {
  form: HTMLFormElement | null;
  username: HTMLInputElement | null;
  password: HTMLInputElement;
};

const USER_HINT =
  /user|email|login|account|phone|mobile|ten|tên|đăng nhập/i;

function isVisible(el: HTMLElement): boolean {
  if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) {
    return false;
  }
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none";
}

function scoreUsernameInput(input: HTMLInputElement): number {
  let score = 0;
  const type = (input.type || "text").toLowerCase();
  if (type === "email") score += 3;
  if (type === "text" || type === "tel") score += 1;
  if (type === "password" || type === "hidden") return -1;

  const ac = input.autocomplete?.toLowerCase() ?? "";
  if (ac.includes("username") || ac.includes("email")) score += 4;

  const blob = `${input.name} ${input.id} ${input.placeholder} ${input.labels?.[0]?.textContent ?? ""}`;
  if (USER_HINT.test(blob)) score += 3;

  return score;
}

function findUsernameInForm(form: HTMLFormElement | null): HTMLInputElement | null {
  const scope: ParentNode = form ?? document;
  const inputs = [...scope.querySelectorAll("input")].filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement && isVisible(el),
  );

  let best: HTMLInputElement | null = null;
  let bestScore = 0;
  for (const input of inputs) {
    const s = scoreUsernameInput(input);
    if (s > bestScore) {
      bestScore = s;
      best = input;
    }
  }
  return bestScore > 0 ? best : null;
}

function findUsernameBeforePassword(password: HTMLInputElement): HTMLInputElement | null {
  const form = password.form;
  const candidates: HTMLInputElement[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === password) break;
    if (node instanceof HTMLInputElement && isVisible(node)) {
      candidates.push(node);
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const s = scoreUsernameInput(candidates[i]!);
    if (s > 0) return candidates[i]!;
  }
  return findUsernameInForm(form);
}

export function discoverLoginFields(): LoginFormContext[] {
  const passwords = [
    ...document.querySelectorAll('input[type="password"]'),
  ].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && isVisible(el));

  const seen = new Set<HTMLInputElement>();
  const out: LoginFormContext[] = [];

  for (const password of passwords) {
    if (seen.has(password)) continue;
    seen.add(password);
    const form = password.form;
    const username =
      findUsernameInForm(form) ?? findUsernameBeforePassword(password);
    out.push({ form, username, password });
  }
  return out;
}

/** Gán value cho input controlled (React/Vue/Angular). */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const proto = HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const inputProto = Object.getPrototypeOf(input);
  const instanceSetter =
    inputProto !== proto
      ? Object.getOwnPropertyDescriptor(inputProto, "value")?.set
      : undefined;

  if (instanceSetter && valueSetter && instanceSetter !== valueSetter) {
    instanceSetter.call(input, value);
  } else {
    valueSetter?.call(input, value);
  }

  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      data: value,
    }),
  );
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyFill(
  ctx: LoginFormContext,
  username: string,
  password: string,
): void {
  if (ctx.username) setInputValue(ctx.username, username);
  setInputValue(ctx.password, password);
}

export function fillLoginContext(
  ctx: LoginFormContext,
  username: string,
  password: string,
): void {
  ctx.password.focus();
  applyFill(ctx, username, password);
  // Một số form (React) xóa password sau khi username đổi — gán lại sau tick render.
  requestAnimationFrame(() => {
    applyFill(ctx, username, password);
    requestAnimationFrame(() => setInputValue(ctx.password, password));
  });
}
