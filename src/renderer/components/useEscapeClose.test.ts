import { describe, expect, it, vi } from 'vitest';
import { createEscapeStack } from './useEscapeClose';

describe('ESC 弹窗栈', () => {
  // 多层弹窗叠加时一次 ESC 只能关闭最上层，下层弹窗保持打开。
  it('只有栈顶弹窗响应 ESC', () => {
    const stack = createEscapeStack();
    const bottom = { onEscape: vi.fn() };
    const top = { onEscape: vi.fn() };
    stack.push(bottom);
    stack.push(top);

    stack.dispatch();

    expect(top.onEscape).toHaveBeenCalledTimes(1);
    expect(bottom.onEscape).not.toHaveBeenCalled();
  });

  // 上层弹窗关闭卸载后，下层弹窗重新成为栈顶，恢复 ESC 响应。
  it('栈顶移除后下层恢复响应', () => {
    const stack = createEscapeStack();
    const bottom = { onEscape: vi.fn() };
    const top = { onEscape: vi.fn() };
    stack.push(bottom);
    const removeTop = stack.push(top);

    removeTop();
    stack.dispatch();

    expect(bottom.onEscape).toHaveBeenCalledTimes(1);
    expect(top.onEscape).not.toHaveBeenCalled();
  });

  // React 严格模式等场景可能重复执行清理，移除必须幂等且不误伤其他弹窗。
  it('重复移除同一弹窗不影响其他弹窗', () => {
    const stack = createEscapeStack();
    const bottom = { onEscape: vi.fn() };
    const top = { onEscape: vi.fn() };
    const removeBottom = stack.push(bottom);
    stack.push(top);

    removeBottom();
    removeBottom();
    stack.dispatch();

    expect(top.onEscape).toHaveBeenCalledTimes(1);
    expect(bottom.onEscape).not.toHaveBeenCalled();
  });

  // 没有弹窗打开时按 ESC 不应抛错。
  it('空栈时不报错', () => {
    const stack = createEscapeStack();
    expect(() => stack.dispatch()).not.toThrow();
  });
});
