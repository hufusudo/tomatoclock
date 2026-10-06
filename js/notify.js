// TomatoClock 通知：只管权限（仅首次真正请求）与弹通知 + 降级。
// 被拒 / 不支持后永不重复系统弹框；notify 失败一律降级为 false。
// 不碰 DOM、不导入其他模块；NotificationImpl 可注入以便验证。

const FINAL_STATUSES = new Set(['granted', 'denied', 'default']);

function normalizeStatus(value) {
  return FINAL_STATUSES.has(value) ? value : 'default';
}

export function createNotifier({ NotificationImpl = globalThis.Notification } = {}) {
  const supported = typeof NotificationImpl === 'function';

  let status = supported ? normalizeStatus(NotificationImpl.permission) : 'unsupported';
  let requested = false; // 已真正发起过一次权限请求（含被拒/dismissed）

  function permissionStatus() {
    return status;
  }

  async function requestPermission() {
    // 已请求过或状态已非 'default'：直接回报当前状态，不再触发系统弹框。
    if (!supported || requested || status !== 'default') return status;

    requested = true;
    try {
      const result = await NotificationImpl.requestPermission();
      // 'granted'|'denied' 照抄；'dismissed' 等其余值视为仍未授权。
      status = result === 'granted' || result === 'denied' ? result : 'default';
    } catch {
      // 底层抛错/拒绝：不外溢异常，按未授权降级（与 notify() 的 catch 策略一致）。
      status = 'default';
    }
    return status;
  }

  function notify({ title, body } = {}) {
    if (status !== 'granted') return false;
    try {
      new NotificationImpl(title, { body });
      return true;
    } catch {
      return false;
    }
  }

  return { permissionStatus, requestPermission, notify };
}
