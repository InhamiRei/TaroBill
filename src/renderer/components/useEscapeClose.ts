import { useEffect, useRef } from 'react';

type EscapeEntry = { onEscape: () => void };

// 弹窗按挂载顺序入栈，栈顶即视觉最上层；ESC 只派发给栈顶，实现逐层关闭。
export const createEscapeStack = () => {
  const entries: EscapeEntry[] = [];
  return {
    push(entry: EscapeEntry) {
      entries.push(entry);
      return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
      };
    },
    dispatch() {
      entries[entries.length - 1]?.onEscape();
    },
  };
};

const escapeStack = createEscapeStack();

let listening = false;

// 全窗口共用一个键盘监听，中文输入法组词期间的 ESC 交给输入法取消组词，不触发关闭。
const ensureEscapeListener = () => {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    escapeStack.dispatch();
  });
};

// 所有弹窗共用的 ESC 关闭入口：挂载入栈、卸载出栈，多层叠加时只有最上层响应。
export function useEscapeClose(onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    ensureEscapeListener();
    return escapeStack.push({ onEscape: () => onEscapeRef.current() });
  }, []);
}

// 条件入栈的 ESC 层：只在 active 时压入栈顶。下拉面板展开时注册，ESC 先关面板再轮到底层弹窗。
export function useEscapeCloseLayer(active: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    ensureEscapeListener();
    return escapeStack.push({ onEscape: () => onEscapeRef.current() });
  }, [active]);
}
