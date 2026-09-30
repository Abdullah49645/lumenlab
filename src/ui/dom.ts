type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element factory. Keys starting with "on" become event listeners,
 * "class" sets className, aria-/data-/role and unknown keys become attributes,
 * everything else is set as a DOM property.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role' || !(key in el)) {
      el.setAttribute(key, value === true ? '' : String(value));
    } else {
      (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'number' ? String(child) : child);
  }
  return el;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
