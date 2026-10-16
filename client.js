/**
 * dsh-hub — the Client half.
 *
 * ONE FILE, and not by taste. `manifest.ts` states "Entry name == package name"
 * and the bundle resolves it through `exactPackageSpecifier`, which accepts only
 * a whole package name — so a `dsh.client` bundle has exactly one `client.js`
 * and the file is organised under banner comments instead of imports (DESIGN.md
 * §7).
 *
 * ONE SEAT: `shell.overlay`, id `hub.panel`. The layer is click-through, so the
 * entry opts back into `pointer-events`. `sidebar.panellist` is deliberately
 * NOT used: every row of that slot is a `layout.selectPanel(id)` route, and
 * `LayoutController.selectPanel` throws for any id with no `main` keyed entry
 * (`ui-layout/src/client/index.ts:175`), so a floating panel registered there
 * is a crash-on-click button. The collapsed handle is always on screen and is
 * the panel's only entry point.
 *
 * `inject` is `['slots', 'locale']` and nothing else. The Remote carrier and the
 * theme registry are read with `ctx.get()` at call time instead of being
 * declared: a declared `inject` the composition cannot satisfy parks the entry
 * forever, and a property read of an undeclared service throws through Cordis,
 * which optional chaining cannot intercept. The carrier is reached by
 * `ctx.get('remote.hub')` — the gateway gives each mounted namespace its own
 * service — so its absence is a visible failure state rather than a parked
 * fiber.
 *
 * No Harness Client package is required: every control below is hand-written,
 * because the official rule is that a dynamic Client half draws its own.
 * React comes from the browser module table.
 */

window.__ModuleLoader__.load({
  id: '@hanmaxiao/dsh-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useCallback,
      useEffect,
      useMemo,
      useReducer,
      useRef,
      useState,
      useSyncExternalStore,
    } = React

    /** Namespace of every dictionary in this file. */
    const NS = 'hub'
    /**
     * Bound by `apply` once the locale namespace is registered. Starts as a
     * function rather than `undefined` so a component that renders before
     * registration still calls something well-defined.
     */
    let translate = key => key

    /* ==================================================================== *
     * 1. Dictionaries — zh + en
     *
     * Every user-visible string in this file is one of these keys. The key sets
     * are identical by construction and `locale.register` enforces bilingual
     * balance at registration, so a drifting key fails loudly at boot instead of
     * showing a raw key at runtime.
     * ==================================================================== */

    const ZH = {
      'panel.title': 'Hub',
      'action.create': '新建',
      'action.edit': '编辑',
      'action.theme': '主题',
      'action.delete': '删除',
      'action.close': '关闭',
      'action.confirm': '确定',
      'action.cancel': '取消',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.copyFailed': '复制失败',
      'action.retry': '重试',
      'action.search': '搜索',
      'action.sort': '排序与分组',
      'action.viewGrid': '网格视图',
      'action.viewList': '条目视图',
      'action.dock': '停靠位置',
      'action.attach': '添加附件',
      'action.openPanel': '展开 Hub',
      'tab.todo': 'TODO',
      'tab.note': 'Note',
      'tab.prompt': 'Prompt',
      'dock.right': '停靠到右边',
      'dock.bottom': '停靠到下边',
      'dock.left': '停靠到左边',
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.system': '跟随系统',
      'sort.field': '排序字段',
      'sort.name': '名称',
      'sort.updatedAt': '修改日期',
      'sort.category': '类型',
      'sort.size': '大小',
      'sort.createdAt': '创建日期',
      'sort.priority': '标记',
      'sort.direction': '方向',
      'sort.asc': '递增',
      'sort.desc': '递减',
      'group.by': '分组依据',
      'group.none': '无',
      'group.category': '类别',
      'group.priority': '优先级',
      'group.done': '完成状态',
      'group.withImages': '含图片',
      'group.textOnly': '纯文字',
      'group.done.yes': '已完成',
      'group.done.no': '未完成',
      'group.uncategorized': '未分类',
      'filter.by': '过滤',
      'filter.all': '全部',
      'filter.open': '未完成',
      'filter.closed': '已完成',
      'filter.withFiles': '有附件',
      'filter.withoutFiles': '无附件',
      'field.description': '内容',
      'field.text': '内容',
      'field.title': '标题',
      'field.category': '类别',
      'field.priority': '标记',
      'field.done': '已完成',
      'field.note': '备注',
      'field.files': '附件',
      'field.images': '图片',
      'priority.low': '低',
      'priority.normal': '中',
      'priority.high': '高',
      'priority.urgent': '紧急',
      'meta.created': '创建',
      'meta.updated': '修改',
      'meta.size': '大小',
      'meta.files': '附件',
      'modal.create': '新建条目',
      'modal.edit': '编辑条目',
      'modal.detail': '条目详情',
      'modal.delete': '删除条目',
      'modal.delete.body': '删除后无法恢复。',
      'state.empty': '还没有条目',
      'state.emptySearch': '没有匹配的条目',
      'state.untitled': '未命名',
      'state.broken': 'Hub 桥不可用',
      'state.broken.hint': '这个组合里没有 Hub Remote，面板拿不到数据。',
      'state.failed': '操作失败',
      'state.hostOlder': '宿主比面板旧：条目里没有这些字段，这次保存会被它丢掉。改过宿主侧代码就重启 DSH 进程。',
      'count.unit': '条',
      'size.bytes': 'B',
      'size.kib': 'KB',
      'size.mib': 'MB',
    }

    const EN = {
      'panel.title': 'Hub',
      'action.create': 'New',
      'action.edit': 'Edit',
      'action.theme': 'Theme',
      'action.delete': 'Delete',
      'action.close': 'Close',
      'action.confirm': 'Confirm',
      'action.cancel': 'Cancel',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.copyFailed': 'Copy failed',
      'action.retry': 'Retry',
      'action.search': 'Search',
      'action.sort': 'Sort and group',
      'action.viewGrid': 'Grid view',
      'action.viewList': 'List view',
      'action.dock': 'Dock edge',
      'action.attach': 'Add attachment',
      'action.openPanel': 'Open Hub',
      'tab.todo': 'TODO',
      'tab.note': 'Note',
      'tab.prompt': 'Prompt',
      'dock.right': 'Dock to the right edge',
      'dock.bottom': 'Dock to the bottom edge',
      'dock.left': 'Dock to the left edge',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'Follow the system',
      'sort.field': 'Sort field',
      'sort.name': 'Name',
      'sort.updatedAt': 'Modified',
      'sort.category': 'Type',
      'sort.size': 'Size',
      'sort.createdAt': 'Created',
      'sort.priority': 'Flag',
      'sort.direction': 'Direction',
      'sort.asc': 'Ascending',
      'sort.desc': 'Descending',
      'group.by': 'Group by',
      'group.none': 'None',
      'group.category': 'Category',
      'group.priority': 'Priority',
      'group.done': 'Completion',
      'group.withImages': 'With images',
      'group.textOnly': 'Text only',
      'group.done.yes': 'Done',
      'group.done.no': 'Not done',
      'group.uncategorized': 'Uncategorized',
      'filter.by': 'Filter',
      'filter.all': 'All',
      'filter.open': 'Not done',
      'filter.closed': 'Done',
      'filter.withFiles': 'With attachments',
      'filter.withoutFiles': 'Without attachments',
      'field.description': 'Content',
      'field.text': 'Content',
      'field.title': 'Title',
      'field.category': 'Category',
      'field.priority': 'Flag',
      'field.done': 'Done',
      'field.note': 'Note',
      'field.files': 'Attachments',
      'field.images': 'Images',
      'priority.low': 'Low',
      'priority.normal': 'Normal',
      'priority.high': 'High',
      'priority.urgent': 'Urgent',
      'meta.created': 'Created',
      'meta.updated': 'Modified',
      'meta.size': 'Size',
      'meta.files': 'Attachments',
      'modal.create': 'New entry',
      'modal.edit': 'Edit entry',
      'modal.detail': 'Entry detail',
      'modal.delete': 'Delete entry',
      'modal.delete.body': 'This cannot be undone.',
      'state.empty': 'No entries yet',
      'state.emptySearch': 'No matching entries',
      'state.untitled': 'Untitled',
      'state.broken': 'Hub bridge unavailable',
      'state.broken.hint': 'This composition has no Hub Remote, so the panel cannot read data.',
      'state.failed': 'The operation failed',
      'state.hostOlder': 'The Host is older than the panel: its items carry none of these fields, so it drops this save. Restart the DSH process after changing Host-side code.',
      'count.unit': 'entries',
      'size.bytes': 'B',
      'size.kib': 'KB',
      'size.mib': 'MB',
    }

    /* ==================================================================== *
     * 2. SVG icon set — the only glyphs in this file
     *
     * Every affordance is one of these with an `aria-label` on its control; there
     * is no emoji anywhere in the interface. Each entry is a list of SVG shapes
     * drawn on `currentColor` at a 24-unit viewBox, so an icon inherits the
     * control's colour token and needs no palette of its own.
     * ==================================================================== */

    const ICONS = {
      hub: [
        { t: 'path', a: { d: 'M4 7.2l8-3.7 8 3.7-8 3.7z' } },
        { t: 'path', a: { d: 'M4 12l8 3.7 8-3.7' } },
        { t: 'path', a: { d: 'M4 16.8l8 3.7 8-3.7' } },
      ],
      plus: [{ t: 'path', a: { d: 'M12 5.5v13M5.5 12h13' } }],
      close: [{ t: 'path', a: { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' } }],
      copy: [
        { t: 'path', a: { d: 'M9.5 9.5h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z' } },
        { t: 'path', a: { d: 'M15.5 6.5v-1a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1' } },
      ],
      trash: [
        { t: 'path', a: { d: 'M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7' } },
        { t: 'path', a: { d: 'M6.5 7l.9 12a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.9-12M10.5 11v5.5M13.5 11v5.5' } },
      ],
      check: [{ t: 'path', a: { d: 'M5 12.5l4.5 4.5L19 7.5' } }],
      search: [
        { t: 'circle', a: { cx: 11, cy: 11, r: 6.5 } },
        { t: 'path', a: { d: 'M15.8 15.8L20.5 20.5' } },
      ],
      sort: [
        { t: 'path', a: { d: 'M7 4.5v15M7 19.5l-3-3M7 19.5l3-3' } },
        { t: 'path', a: { d: 'M17 19.5v-15M17 4.5l-3 3M17 4.5l3 3' } },
      ],
      grid: [{ t: 'path', a: { d: 'M4.5 5.5h6v6h-6zM13.5 5.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z' } }],
      rows: [{ t: 'path', a: { d: 'M4.5 6.5h15M4.5 12h15M4.5 17.5h15' } }],
      chevronRight: [{ t: 'path', a: { d: 'M9.5 6l6 6-6 6' } }],
      chevronLeft: [{ t: 'path', a: { d: 'M14.5 6l-6 6 6 6' } }],
      chevronDown: [{ t: 'path', a: { d: 'M6 9.5l6 6 6-6' } }],
      dockRight: [{ t: 'path', a: { d: 'M9 4.5v15M9 12h10M19 12l-4-4M19 12l-4 4' } }],
      dockBottom: [{ t: 'path', a: { d: 'M4.5 8.5h15M12 8.5V19M12 19l-4-4M12 19l4-4' } }],
      dockLeft: [{ t: 'path', a: { d: 'M15 4.5v15M15 12H5M5 12l4-4M5 12l4 4' } }],
      sun: [
        { t: 'circle', a: { cx: 12, cy: 12, r: 4 } },
        { t: 'path', a: { d: 'M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6' } },
      ],
      moon: [{ t: 'path', a: { d: 'M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z' } }],
      monitor: [
        { t: 'path', a: { d: 'M3.5 5.5h17a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z' } },
        { t: 'path', a: { d: 'M9 20.5h6M12 17v3.5' } },
      ],
      todo: [{ t: 'path', a: { d: 'M9.5 6.5h10M9.5 12h10M9.5 17.5h10M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' } }],
      note: [
        { t: 'path', a: { d: 'M14 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7.5z' } },
        { t: 'path', a: { d: 'M14 3.5v4h4M9 12.5h6M9 16.5h4' } },
      ],
      prompt: [
        { t: 'path', a: { d: 'M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z' } },
        { t: 'path', a: { d: 'M7.5 10l2.5 2.5-2.5 2.5M13 15h4' } },
      ],
      warning: [
        { t: 'path', a: { d: 'M12 4.2 3 19.5h18z' } },
        { t: 'path', a: { d: 'M12 10v4M12 16.8h.01' } },
      ],
      paperclip: [{ t: 'path', a: { d: 'M19.5 11 12 18.5a4 4 0 0 1-5.7-5.7l7.9-7.9a2.7 2.7 0 0 1 3.8 3.8l-7.8 7.8a1.3 1.3 0 0 1-1.9-1.9l7.2-7.2' } }],
      filter: [{ t: 'path', a: { d: 'M4.5 6.5h15M7.5 12h9M10.5 17.5h3' } }],
      done: [
        { t: 'circle', a: { cx: 12, cy: 12, r: 8.5 } },
        { t: 'path', a: { d: 'M8.2 12.2l2.6 2.6 5-5.2' } },
      ],
      open: [
        { t: 'circle', a: { cx: 12, cy: 12, r: 8.5 } },
        { t: 'path', a: { d: 'M12 7.5V12l3 2' } },
      ],
    }

    /**
     * Render one icon from the set.
     * @param {{name: string, size?: number, width?: number, className?: string}} props - the glyph and its box.
     * @returns an inline `svg` element, decorative for its labelled control.
     */
    function Icon(props) {
      const parts = ICONS[props.name]
      if (parts === undefined) return null
      return h('svg', {
        viewBox: '0 0 24 24',
        width: props.size ?? 16,
        height: props.size ?? 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.width ?? 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: props.className,
        // The label lives on the control that owns the icon.
        'aria-hidden': 'true',
        focusable: 'false',
      }, parts.map((part, index) => h(part.t, { key: index, ...part.a })))
    }

    /* ==================================================================== *
     * 3. Theme-token stylesheet
     *
     * Rendered as a React `<style>` element so it is created and destroyed with
     * the entry and needs no `styles.insert` (a `cordis_run` builtin that a
     * `dsh.client` bundle does not have). Every colour is a `--dsw-alias-*`
     * token from the application's own palette; the only literal values in this
     * sheet are geometry, timing and transparency.
     * ==================================================================== */

    /** Grid geometry, shared by the stylesheet and the skeleton column count. */
    const CARD_MIN = 176
    const CARD_GAP = 6

    /** The one gutter every column of the panel lines up on. */
    const GUTTER = 12

    /** Collapsed strip thickness and the width it grows to on hover. */
    const HANDLE_THICKNESS = 7
    const HANDLE_OPEN = 30

    const STYLES = `
/* ==========================================================================
   The rail: one plane, a handful of hairlines, and the brand accent used
   twice. Cards are unfilled boxes that gain a fill on hover, so the plane —
   not a stack of rounded rectangles — carries the hierarchy.
   ========================================================================== */
.hub-root {
  --hub-card-min: ${CARD_MIN}px;
  --hub-gutter: ${GUTTER}px;
  --hub-handle-thickness: ${HANDLE_THICKNESS}px;
  --hub-handle-open: ${HANDLE_OPEN}px;
  --hub-tab-index: 0;

  /* How much of the window's top and bottom the panel stays clear of. The
     shell publishes its own chrome height (--dsh-frame-chrome-top); 24px is the
     floor for hosts that publish nothing. Only the left and right panels read
     it, and only to keep their cap from outgrowing a short window. */
  --hub-edge-clearance: var(--dsh-frame-chrome-top, 24px);

  /* One easing, three durations. Every transition below is a reply to
     something the pointer or the keyboard just did. */
  --hub-ease: cubic-bezier(.22,.61,.36,1);
  --hub-fast: 110ms;
  --hub-mid: 190ms;
  --hub-slow: 300ms;

  --hub-plane: var(--dsw-alias-bg-layer-2);
  --hub-raised: var(--dsw-alias-bg-layer-3);
  --hub-line: var(--dsw-alias-border-l1);
  --hub-line-strong: var(--dsw-alias-border-l2);
  --hub-ink: var(--dsw-alias-label-primary);
  --hub-ink-2: var(--dsw-alias-label-secondary);
  --hub-ink-3: var(--dsw-alias-label-tertiary);
  --hub-accent: var(--dsw-alias-brand-primary);
  --hub-on-accent: var(--dsw-alias-label-primary-foreground);

  position: fixed;
  z-index: 40;
  display: flex;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  letter-spacing: .01em;
  color: var(--hub-ink);
}
.hub-root *, .hub-root *::before, .hub-root *::after { box-sizing: border-box; }

/* The overlay layer is click-through; only this entry's own boxes take input. */
.hub-root, .hub-root .hub-surface { pointer-events: auto; }

/* Left and right run their handle and surface along a row, exactly like top and
   bottom do across theirs: the handle is a strip on the docked edge and the
   surface takes what is left of it. They used to be a column, which stacked the
   two vertically instead — the surface then sat one handle-width short of the
   screen edge (a visible gap on the right), and the handle's align-self:center,
   meant for the cross axis, floated it into the middle of the panel. */
.hub-root[data-edge="left"], .hub-root[data-edge="right"] {
  top: 0; bottom: 0; width: var(--hub-handle-thickness); flex-direction: row;
}
.hub-root[data-edge="left"] { left: 0; }
.hub-root[data-edge="right"] { right: 0; flex-direction: row-reverse; }
.hub-root[data-edge="bottom"] {
  left: 0; right: 0; bottom: 0; height: var(--hub-handle-thickness); flex-direction: row;
}

/* The collapsed handle sits at the middle of its edge — the one place the
   pointer will look for it. Nothing else in the rail is rendered while
   collapsed, so this needs no alignment caveat. Expanded, the root lays the
   handle and the surface out together and justify-content is left alone: the
   two fill the main axis, and centering a full line only risks pushing its
   start past the overflow edge. */
.hub-root[data-expanded="false"] { justify-content: center; align-items: center; }

.hub-root[data-expanded="true"][data-edge="left"],
.hub-root[data-expanded="true"][data-edge="right"] {
  width: min(416px, 46vw);
  /* Left and right stretch top:0/bottom:0 so the rail spans the edge, and that
     full height used to be the panel's height too: the surface ran the whole
     window, put its own toolbar on the window's titlebar row, and sat beside the
     minimise/maximize buttons. Bounded and centred, it clears the chrome at
     both ends and lines up with the handle's own position. */
  top: 50%;
  transform: translateY(-50%);
  height: min(560px, calc(100vh - 2 * var(--hub-edge-clearance)));
}
.hub-root[data-expanded="true"][data-edge="bottom"] { height: min(560px, 74vh); }

/* --------------------------------------------------------------------------
   The handle. It is the panel's only affordance and what the user sees for
   all but a few seconds at a time, so it is the one element allowed a shape
   of its own: a grip with a notched inner end and a brand line down it.
   -------------------------------------------------------------------------- */
.hub-handle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--hub-ink-3);
  cursor: pointer;
  overflow: hidden;
  transition:
    width var(--hub-mid) var(--hub-ease),
    height var(--hub-mid) var(--hub-ease),
    background var(--hub-fast) ease,
    color var(--hub-fast) ease;
}
.hub-handle::before {
  content: '';
  position: absolute;
  background: var(--hub-accent);
  opacity: .8;
  animation: hubIdle 2600ms ease-in-out infinite;
  transition: opacity var(--hub-mid) ease;
}
.hub-root[data-edge="left"] .hub-handle,
.hub-root[data-edge="right"] .hub-handle {
  width: var(--hub-handle-thickness); height: 176px; align-self: center;
}
.hub-root[data-edge="left"] .hub-handle::before,
.hub-root[data-edge="right"] .hub-handle::before { width: 2px; height: 56px; }
.hub-root[data-edge="bottom"] .hub-handle {
  height: var(--hub-handle-thickness); width: 176px; align-self: center;
}
.hub-root[data-edge="bottom"] .hub-handle::before { width: 56px; height: 2px; }

.hub-root[data-edge="left"] .hub-handle {
  border-top: 1px solid var(--hub-line-strong); border-bottom: 1px solid var(--hub-line-strong);
  border-top-right-radius: 7px; border-bottom-right-radius: 7px;
}
.hub-root[data-edge="right"] .hub-handle {
  border-top: 1px solid var(--hub-line-strong); border-bottom: 1px solid var(--hub-line-strong);
  border-top-left-radius: 7px; border-bottom-left-radius: 7px;
}
.hub-root[data-edge="bottom"] .hub-handle {
  border-left: 1px solid var(--hub-line-strong); border-right: 1px solid var(--hub-line-strong);
  border-top-left-radius: 7px; border-top-right-radius: 7px;
}

.hub-root[data-expanded="true"] .hub-handle { color: var(--hub-ink-2); }
.hub-root[data-expanded="true"] .hub-handle::before { opacity: 0; animation: none; }
/* Expanded, the grip stops being a separate bar and becomes the panel's own
   edge: a full-height rail you can click anywhere along to put it away. */
.hub-root[data-expanded="true"][data-edge="left"] .hub-handle,
.hub-root[data-expanded="true"][data-edge="right"] .hub-handle {
  position: absolute; top: 0; bottom: 0; height: auto; align-self: stretch;
  width: var(--hub-handle-open); flex: 0 0 auto;
  border-top: none; border-bottom: none;
}
.hub-root[data-expanded="true"][data-edge="bottom"] .hub-handle {
  position: absolute; left: 0; right: 0; width: auto; align-self: stretch;
  height: var(--hub-handle-open); flex: 0 0 auto;
  border-left: none; border-right: none;
}
/* The grip is absolutely positioned, so where it sits across the rail is its
   static position — which a row-reverse container resolves differently from a
   plain one, and browsers disagree about the edges. Pin it to the docked side
   outright and let the surface take the whole box instead. */
.hub-root[data-expanded="true"][data-edge="left"] .hub-handle { left: 0; right: auto; }
.hub-root[data-expanded="true"][data-edge="right"] .hub-handle { right: 0; left: auto; }
.hub-root[data-expanded="true"] .hub-surface { width: 100%; height: 100%; }
/* The rail's inner edge is the one line that says "this strip is a control",
   so it is a step stronger than the panel's own hairline. */
.hub-root[data-expanded="true"][data-edge="left"] .hub-handle { border-right: 1px solid var(--dsw-alias-border-l3); }
.hub-root[data-expanded="true"][data-edge="right"] .hub-handle { border-left: 1px solid var(--dsw-alias-border-l3); }
.hub-root[data-expanded="true"][data-edge="bottom"] .hub-handle { border-top: 1px solid var(--dsw-alias-border-l3); }
.hub-root[data-edge="left"] .hub-handle:hover, .hub-root[data-edge="left"] .hub-handle:focus-visible { width: var(--hub-handle-open); }
.hub-root[data-edge="right"] .hub-handle:hover, .hub-root[data-edge="right"] .hub-handle:focus-visible { width: var(--hub-handle-open); }
.hub-root[data-edge="bottom"] .hub-handle:hover, .hub-root[data-edge="bottom"] .hub-handle:focus-visible { height: var(--hub-handle-open); }
.hub-handle:hover::before, .hub-handle:focus-visible::before { opacity: 1; }
.hub-handle:hover, .hub-handle:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--hub-ink);
}

.hub-handle-mark { display: flex; opacity: 0; transition: opacity var(--hub-mid) ease; }
.hub-handle:hover .hub-handle-mark, .hub-handle:focus-visible .hub-handle-mark { opacity: 1; }
.hub-root[data-expanded="true"] .hub-handle-mark { opacity: 1; }

@keyframes hubIdle {
  0%, 100% { opacity: .34; }
  50% { opacity: .9; }
}

/* --------------------------------------------------------------------------
   The surface. Opens from the edge it is docked to.
   -------------------------------------------------------------------------- */
.hub-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--hub-plane);
  /* One step stronger than a hairline: in the light theme every layer is the
     same white, so the panel's edge is carried entirely by this border and the
     shadow below it. */
  border: 1px solid var(--dsw-alias-border-l3);
  box-shadow: 0 2px 8px var(--dsw-alias-bg-mask-2), 0 18px 44px var(--dsw-alias-bg-mask-2);
  transform-origin: var(--hub-origin, center);
  /* Opens in step with the rail it grows out of (--hub-mid, 190ms). The panel
     answering a hover a third of a second later reads as the app hesitating
     rather than as motion. */
  animation: hubPanelIn var(--hub-mid) var(--hub-ease) both;
}
.hub-root[data-edge="left"] .hub-surface, .hub-root[data-edge="right"] .hub-surface {
  flex: 1 1 auto; width: calc(100% - var(--hub-handle-open)); height: 100%;
  --hub-origin: right center;
}
.hub-root[data-edge="left"] .hub-surface { border-left: none; border-radius: 0 12px 12px 0; }
.hub-root[data-edge="right"] .hub-surface { border-right: none; border-radius: 12px 0 0 12px; }
.hub-root[data-edge="bottom"] .hub-surface {
  flex: 1 1 auto; height: calc(100% - var(--hub-handle-open)); width: 100%;
  --hub-origin: center bottom;
}
.hub-root[data-edge="bottom"] .hub-surface { border-bottom: none; border-radius: 12px 12px 0 0; }

@keyframes hubPanelIn {
  from { opacity: 0; transform: scale(.985) translateY(4px); }
  to { opacity: 1; transform: none; }
}

/* --------------------------------------------------------------------------
   Header: identity, search, then the tool cluster. The identity is the only
   thing in the panel allowed to be heavier than an item's own name.
   -------------------------------------------------------------------------- */
.hub-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  height: 38px;
  padding: 0 8px 0 var(--hub-gutter);
  border-bottom: 1px solid var(--hub-line);
}
.hub-title {
  display: flex; align-items: center; gap: 6px;
  margin-right: 2px; white-space: nowrap;
  color: var(--hub-ink); font-size: 13px; font-weight: 500; letter-spacing: .02em;
}
.hub-title svg { color: var(--hub-ink-3); }
.hub-tools { display: flex; align-items: center; gap: 1px; margin-left: auto; }

.hub-tool {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0;
  border: none; border-radius: 7px;
  background: transparent; color: var(--hub-ink-3);
  cursor: pointer;
  transition: background var(--hub-fast) ease, color var(--hub-fast) ease, transform var(--hub-fast) var(--hub-ease);
}
.hub-tool:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-tool:active { transform: scale(.92); }
.hub-tool[data-on="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--hub-ink); }
.hub-tool:disabled { opacity: .4; cursor: default; }
.hub-tool:disabled:active { transform: none; }

.hub-text-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 28px; padding: 0 12px;
  border: 1px solid transparent; border-radius: 7px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink);
  font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; white-space: nowrap;
  transition: background var(--hub-fast) ease, transform var(--hub-fast) var(--hub-ease), opacity var(--hub-fast) ease;
}
.hub-text-button:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.hub-text-button:active { transform: scale(.975); }
.hub-text-button:disabled { opacity: .4; cursor: default; }
.hub-text-button:disabled:active { transform: none; }
.hub-text-button[data-quiet="true"] { background: transparent; border-color: var(--hub-line-strong); color: var(--hub-ink-2); }
.hub-text-button[data-quiet="true"]:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-text-button[data-danger="true"] {
  background: transparent; border-color: var(--hub-line-strong);
  color: var(--dsw-alias-state-error-primary);
}
.hub-text-button[data-danger="true"]:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }
.hub-text-button[data-primary="true"] { background: var(--hub-accent); color: var(--hub-on-accent); }
.hub-text-button[data-primary="true"]:hover { background: var(--dsw-alias-button-primary-hover); }

.hub-search-wrap { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; }
.hub-search-lead {
  position: absolute; left: 7px; display: flex;
  color: var(--hub-ink-3); pointer-events: none;
  transition: color var(--hub-fast) ease;
}
.hub-search-wrap:focus-within .hub-search-lead { color: var(--hub-ink-2); }
.hub-search {
  width: 100%; height: 26px; padding: 0 8px 0 25px;
  border: 1px solid transparent; border-radius: 7px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink);
  font: inherit; font-size: 12px;
  transition: background var(--hub-fast) ease, border-color var(--hub-fast) ease;
}
.hub-search:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.hub-search:focus { outline: none; background: var(--dsw-alias-bg-layer-1); border-color: var(--hub-line-strong); }
.hub-search::placeholder { color: var(--hub-ink-3); }
.hub-search::-webkit-search-cancel-button { filter: grayscale(1) opacity(.6); }

/* A one-line readout between the header and the list: how much is on screen,
   and the field it is ordered by. */
.hub-meta {
  display: flex; align-items: center; gap: 8px;
  flex: 0 0 auto; height: 24px; padding: 0 var(--hub-gutter);
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .04em;
  border-bottom: 1px solid var(--hub-line);
}
.hub-meta-sort { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
.hub-meta-sort svg { transition: transform var(--hub-mid) var(--hub-ease); }
.hub-meta-sort[data-direction="desc"] svg { transform: rotate(180deg); }

.hub-body { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px var(--hub-gutter) 56px; }

/* --------------------------------------------------------------------------
   Tab capsule. One indicator that travels between the three tabs rather than
   a highlight that snaps — the panel's only piece of persistent motion.
   -------------------------------------------------------------------------- */
.hub-tabs {
  position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 3;
  display: flex; align-items: stretch; gap: 0; padding: 3px;
  border: 1px solid var(--hub-line-strong); border-radius: 999px;
  background: var(--hub-raised);
  box-shadow: 0 1px 3px var(--dsw-alias-bg-mask-2), 0 8px 22px var(--dsw-alias-bg-mask-2);
}
.hub-tab-thumb {
  position: absolute; top: 3px; bottom: 3px; left: 3px; z-index: 0;
  width: calc((100% - 6px) / 3);
  border-radius: 999px;
  background: var(--hub-accent);
  transform: translateX(calc(var(--hub-tab-index) * 100%));
  transition: transform var(--hub-mid) var(--hub-ease);
}
.hub-tab {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  flex: 1 1 0; min-width: 62px; height: 26px; padding: 0 10px; white-space: nowrap;
  border: none; border-radius: 999px;
  background: transparent; color: var(--hub-ink-3);
  font: inherit; font-size: 11.5px; cursor: pointer;
  transition: color var(--hub-fast) ease;
}
.hub-tab:hover { color: var(--hub-ink-2); }
.hub-tab[aria-selected="true"] { color: var(--hub-on-accent); font-weight: 500; }
.hub-tab[aria-selected="false"]:hover { color: var(--hub-ink); }

/* --------------------------------------------------------------------------
   Empty and failure states.
   -------------------------------------------------------------------------- */
.hub-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; height: 100%; min-height: 150px; color: var(--hub-ink-3);
}
.hub-empty-mark { color: var(--hub-ink-3); }
.hub-empty-add {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid transparent;
  background: var(--hub-accent); color: var(--hub-on-accent);
  cursor: pointer;
  box-shadow: 0 2px 6px var(--dsw-alias-bg-mask-2), 0 10px 26px var(--dsw-alias-bg-mask-2);
  transition: transform var(--hub-mid) var(--hub-ease), background var(--hub-fast) ease;
}
.hub-empty-add:hover { background: var(--dsw-alias-button-primary-hover); transform: scale(1.06); }
.hub-empty-add:active { transform: scale(.96); }

.hub-broken {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 9px; height: 100%; min-height: 170px; text-align: center; color: var(--hub-ink-2);
}
.hub-broken-mark { color: var(--dsw-alias-state-error-primary); }
.hub-broken-hint { max-width: 30ch; color: var(--hub-ink-3); font-size: 11.5px; }
.hub-broken-detail {
  max-width: 42ch; padding: 5px 8px; border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary); font-size: 10.5px; line-height: 1.45; word-break: break-word;
}
.hub-notice {
  position: absolute; left: 50%; bottom: 54px; transform: translateX(-50%); z-index: 4;
  max-width: calc(100% - 2 * var(--hub-gutter));
  padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--hub-line-strong);
  background: var(--hub-raised); color: var(--hub-ink);
  font-size: 11.5px; box-shadow: 0 8px 22px var(--dsw-alias-bg-mask-2);
  animation: hubToast var(--hub-mid) var(--hub-ease) both;
}
.hub-notice[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.hub-notice[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
@keyframes hubToast {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* --------------------------------------------------------------------------
   Groups: a label, a hairline that runs to the gutter, and a count. The rule
   is the structural device — it says "these belong together" without drawing
   a box around them.
   -------------------------------------------------------------------------- */
.hub-groups { display: flex; flex-direction: column; }
.hub-group { margin-top: 10px; }
.hub-group:first-child { margin-top: 4px; }
.hub-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 0 6px;
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .06em;
}
.hub-group-rule { flex: 1 1 auto; height: 1px; background: var(--hub-line); }
.hub-group-count { color: var(--hub-ink-3); letter-spacing: 0; }

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--hub-card-min)), 1fr));
  gap: 6px;
}
.hub-rows { display: flex; flex-direction: column; gap: 2px; }

/* --------------------------------------------------------------------------
   Cards and rows. Unfilled by default: the plane is the background, a
   hairline is the edge, and the fill arrives with the pointer.
   -------------------------------------------------------------------------- */
.hub-card, .hub-row {
  position: relative;
  display: flex; flex-direction: column; gap: 3px;
  width: 100%; text-align: left;
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--hub-line); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2); color: var(--hub-ink);
  font: inherit; cursor: pointer;
  /* The resting halo is an empty one rather than none, so it can be tweened:
     none and a shadow list do not interpolate. */
  box-shadow: 0 0 0 0 transparent, 0 0 0 0 transparent;
  transition:
    background var(--hub-fast) ease,
    border-color var(--hub-fast) ease,
    box-shadow var(--hub-mid) var(--hub-ease);
}
.hub-card::before, .hub-row::before {
  content: '';
  position: absolute; top: 6px; bottom: 6px; left: 4px; width: 2px;
  border-radius: 1px; background: var(--hub-accent);
  transform: scaleY(0); transform-origin: top;
  transition: transform var(--hub-mid) var(--hub-ease);
}
/* Hover is three replies to one pointer. The fill and the bar say "this one",
   the halo says "here" — a brand-tinted shadow, not a darker border, because a
   card has no fill of its own for a fill to read against. Keyboard focus gets
   the same two, so the affordance is not mouse-only. */
.hub-card:hover, .hub-row:hover,
.hub-card:focus-visible, .hub-row:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--hub-line-strong);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--hub-accent) 26%, transparent),
    0 6px 20px -8px color-mix(in srgb, var(--hub-accent) 38%, transparent);
}
.hub-card:hover::before, .hub-row:hover::before { transform: scaleY(1); }
.hub-card[data-done="true"] .hub-item-name { color: var(--hub-ink-3); text-decoration: line-through; }
.hub-card[data-done="true"]::before, .hub-row[data-done="true"]::before {
  transform: scaleY(1); background: var(--hub-line-strong);
}
/* Completion is edited where the item already is: a checkbox at the trailing
   end of the card's title row, and of the row itself. Always visible, and
   outside the hover cluster — reaching it through the detail dialog and the
   edit form is four activations to flip one boolean. */
.hub-done-check {
  flex: 0 0 auto; width: 14px; height: 14px; margin: 0;
  accent-color: var(--hub-accent); cursor: pointer;
}
.hub-card-head { display: flex; align-items: center; gap: 6px; }
.hub-card-head .hub-item-name { flex: 1 1 auto; min-width: 0; }

.hub-row { flex-direction: row; align-items: center; gap: 10px; padding: 7px 8px 7px 12px; }
.hub-row-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.hub-icon-lead {
  display: flex; flex: 0 0 auto; width: 16px;
  justify-content: center; color: var(--hub-ink-3);
}

.hub-item-name {
  font-size: 13px; font-weight: 500; line-height: 1.35;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hub-item-text {
  font-size: 11.5px; line-height: 1.5; color: var(--hub-ink-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hub-item-text[data-lines="3"] {
  white-space: normal; display: -webkit-box;
  -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.hub-item-meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .02em;
}
.hub-card-foot {
  display: flex; align-items: center; gap: 8px;
  margin-top: 5px; padding-top: 6px;
  border-top: 1px solid var(--hub-line);
}
.hub-card-foot .hub-item-meta { flex: 1 1 auto; min-width: 0; flex-wrap: nowrap; overflow: hidden; }
.hub-card-size { margin-left: auto; flex: 0 0 auto; color: var(--hub-ink-3); font-size: 10.5px; }

.hub-item-actions {
  display: flex; align-items: center; gap: 1px; flex: 0 0 auto;
}
/* Quiet until wanted: an item's own buttons appear on hover, on keyboard
   focus, or where there is no pointer to hover with. */
.hub-card > .hub-item-actions, .hub-row > .hub-item-actions { opacity: 0; transition: opacity var(--hub-fast) ease; }
.hub-card:hover > .hub-item-actions, .hub-card:focus-within > .hub-item-actions,
.hub-row:hover > .hub-item-actions, .hub-row:focus-within > .hub-item-actions { opacity: 1; }
@media (pointer: coarse) {
  .hub-card > .hub-item-actions, .hub-row > .hub-item-actions { opacity: 1; }
}
.hub-item-actions .hub-tool { width: 22px; height: 22px; color: var(--hub-ink-3); }
.hub-item-actions .hub-tool:hover { color: var(--dsw-alias-state-error-primary); }

/* Tags, not outlined buttons: a soft fill and coloured ink, no ring. */
.hub-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px;
  border: none; border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--hub-ink-3); font-size: 10.5px; line-height: 1.5; white-space: nowrap;
}
.hub-chip[data-tone="low"] { color: var(--hub-ink-3); }
.hub-chip[data-tone="normal"] { color: var(--hub-ink-2); }
.hub-chip[data-tone="high"] { background: var(--dsw-alias-interactive-bg-hover-accent); color: var(--dsw-alias-brand-primary); }
.hub-chip[data-tone="urgent"] { background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); }
.hub-chip[data-tone="done"] { color: var(--dsw-alias-state-success-primary); }

/* --------------------------------------------------------------------------
   Two skeletons, deliberately independent (DESIGN.md §8): the grid draws
   cards with a title bar over two text bars, the list draws a disc beside
   offset lines, and the two run on different clocks.
   -------------------------------------------------------------------------- */
.hub-pulse-a { background: var(--dsw-alias-bg-skeleton); animation: hubPulseCard 1.25s ease-in-out infinite; }
.hub-pulse-b { background: var(--dsw-alias-bg-skeleton); animation: hubPulseRow 1.65s ease-in-out infinite; }
@keyframes hubPulseCard {
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
}
@keyframes hubPulseRow {
  0%, 100% { opacity: .3; }
  46% { opacity: .78; }
}
.hub-skel-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--hub-card-min)), 1fr)); gap: 6px;
}
.hub-skel-card {
  display: flex; flex-direction: column; gap: 7px; padding: 9px 10px 10px 12px;
  border: 1px solid var(--hub-line); border-radius: 8px;
}
.hub-skel-block { border-radius: 3px; }
.hub-skel-lines, .hub-skel-rows { display: flex; flex-direction: column; }
.hub-skel-rows { gap: 2px; }
.hub-skel-row { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; }
.hub-skel-dot { width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto; }
.hub-skel-cols { display: flex; flex-direction: column; gap: 5px; flex: 1 1 auto; min-width: 0; }

/* --------------------------------------------------------------------------
   Menus.
   -------------------------------------------------------------------------- */
.hub-menu {
  position: absolute; top: 42px; right: 8px; z-index: 6;
  min-width: 190px; max-height: min(64vh, 380px); overflow: auto;
  padding: 5px; border-radius: 10px;
  border: 1px solid var(--hub-line-strong);
  background: var(--hub-raised);
  box-shadow: 0 2px 6px var(--dsw-alias-bg-mask-2), 0 14px 34px var(--dsw-alias-bg-mask-2);
  transform-origin: top right;
  animation: hubMenuIn var(--hub-fast) var(--hub-ease) both;
}
.hub-menu[data-side="left"] { left: 8px; right: auto; transform-origin: top left; }
@keyframes hubMenuIn {
  from { opacity: 0; transform: scale(.97) translateY(-3px); }
  to { opacity: 1; transform: none; }
}
.hub-menu-label {
  padding: 7px 8px 4px;
  color: var(--hub-ink-3); font-size: 10px; letter-spacing: .06em;
}
.hub-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 5px 8px; text-align: left;
  border: none; border-radius: 6px;
  background: transparent; color: var(--hub-ink-2);
  font: inherit; font-size: 12px; cursor: pointer;
  transition: background var(--hub-fast) ease, color var(--hub-fast) ease;
}
.hub-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-menu-item[aria-checked="true"] { color: var(--hub-ink); font-weight: 500; }
.hub-menu-item > span:first-child {
  display: flex; flex: 0 0 auto; width: 14px; justify-content: center; color: var(--hub-ink-3);
}
.hub-menu-item[aria-checked="true"] > span:first-child { color: var(--hub-accent); }

/* --------------------------------------------------------------------------
   Modals.
   -------------------------------------------------------------------------- */
.hub-scrim {
  position: absolute; inset: 0; z-index: 7;
  display: flex; align-items: center; justify-content: center; padding: 14px;
  /* The lighter of the two masks: the dialog already sits a step off the
     plane, and a heavier scrim only greys the panel the user came from. */
  background: var(--dsw-alias-bg-mask-2);
  animation: hubFade var(--hub-fast) ease both;
}
.hub-modal {
  display: flex; flex-direction: column; gap: 12px;
  width: 100%; max-height: 100%; padding: 14px;
  border: 1px solid var(--hub-line-strong); border-radius: 14px;
  background: var(--hub-raised); color: var(--hub-ink);
  box-shadow: 0 2px 6px var(--dsw-alias-bg-mask-2), 0 20px 48px var(--dsw-alias-bg-mask-3);
  animation: hubModalIn var(--hub-mid) var(--hub-ease) both;
}
@keyframes hubFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes hubModalIn {
  from { opacity: 0; transform: scale(.975) translateY(8px); }
  to { opacity: 1; transform: none; }
}
.hub-modal-head { display: flex; align-items: center; gap: 8px; }
.hub-modal-title {
  margin-right: auto; font-size: 13px; font-weight: 500; letter-spacing: .02em;
}
.hub-modal-body {
  display: flex; flex-direction: column; gap: 11px; min-height: 0; overflow: auto;
  margin: 0 -2px; padding: 0 2px;
}
.hub-modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }

.hub-field { display: flex; flex-direction: column; gap: 5px; }
.hub-label {
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .06em;
}
.hub-input, .hub-textarea, .hub-select {
  width: 100%; padding: 6px 8px;
  border: 1px solid var(--hub-line-strong); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--hub-ink);
  font: inherit; font-size: 12.5px;
  transition: border-color var(--hub-fast) ease, background var(--hub-fast) ease;
}
.hub-input:hover, .hub-textarea:hover, .hub-select:hover { border-color: var(--hub-line-strong); background: var(--dsw-alias-interactive-bg-hover); }
.hub-input:focus, .hub-textarea:focus, .hub-select:focus {
  outline: none; border-color: var(--dsw-alias-state-business-primary);
}
.hub-textarea { min-height: 88px; line-height: 1.55; resize: vertical; }
.hub-select { cursor: pointer; }
/* The native file control is the one place the platform's chrome would show
   through, so only its button is redrawn — the input itself stays the real
   one, so the picker and its accessibility behaviour are untouched. */
.hub-input[type="file"] { padding: 5px 7px; }
.hub-input[type="file"]::file-selector-button {
  margin-right: 8px; padding: 3px 9px;
  border: 1px solid var(--hub-line-strong); border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink);
  font: inherit; font-size: 11.5px; cursor: pointer;
  transition: background var(--hub-fast) ease;
}
.hub-input[type="file"]::file-selector-button:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.hub-inline { display: flex; gap: 8px; }
.hub-inline > * { flex: 1 1 0; min-width: 0; }

.hub-file-list { display: flex; flex-wrap: wrap; gap: 5px; }
.hub-file {
  display: flex; align-items: center; gap: 5px; padding: 2px 3px 2px 8px;
  border: 1px solid var(--hub-line-strong); border-radius: 5px;
  color: var(--hub-ink-2); font-size: 11px;
}
.hub-thumbs { display: flex; flex-wrap: wrap; gap: 6px; }
.hub-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--hub-line-strong); }

.hub-detail-name { font-size: 14px; font-weight: 500; line-height: 1.4; }
.hub-detail-text {
  white-space: pre-wrap; word-break: break-word;
  color: var(--hub-ink); font-size: 12.5px; line-height: 1.6;
}
.hub-detail-note {
  padding: 7px 9px; border-left: 2px solid var(--hub-line-strong); border-radius: 0 5px 5px 0;
  background: var(--dsw-alias-interactive-bg-hover);
  white-space: pre-wrap; word-break: break-word;
  color: var(--hub-ink-2); font-size: 12px; line-height: 1.55;
}

/* --------------------------------------------------------------------------
   Focus. The application's own ring, so keyboard travel through the panel
   looks like keyboard travel through the rest of the app.
   -------------------------------------------------------------------------- */
.hub-root :focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
  border-radius: 6px;
}
.hub-card:focus-visible, .hub-row:focus-visible { border-radius: 8px; }
.hub-root :focus:not(:focus-visible) { outline: none; }

@keyframes hubRise {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}
.hub-card, .hub-row { animation: hubRise var(--hub-mid) var(--hub-ease) both; }

/* Motion is decoration here; without it every state is already legible. */
@media (prefers-reduced-motion: reduce) {
  .hub-root *, .hub-root *::before, .hub-root *::after {
    animation: none !important;
    transition: none !important;
  }
  .hub-card, .hub-row, .hub-scrim, .hub-modal, .hub-menu, .hub-surface, .hub-notice { opacity: 1; }
  .hub-handle::before { opacity: .8; }
}
`

    /* ==================================================================== *
     * 4. Remote bridge
     *
     * The one Host bridge available to a browser half is the Typert Remote
     * (DESIGN.md §3). It reaches the page in two steps, and both are load
     * bearing: the namespace is mounted **by this file** through
     * `ctx.remote.$mount()`, and it then lives as its own Cordis service under
     * `ctx.get('remote.hub')` — not as a property of `ctx.get('remote')`. The
     * carrier can mount after the first render and can go away when its Host
     * half unloads, so every call re-reads it. A missing carrier is a
     * persistent, visible failure state — never a silent fall back to
     * `localStorage`, and never a throw out of a render.
     *
     * Contract (with `remote.js`): `list()` -> `{ version, items }`;
     * `create(draft)`, `update(id, patch)` and `delete(id)` each -> the stored
     * `Item`, bare. `delete` reaches the Host's `remove` through the
     * contribution's `implementation`, because the namespace service owns the
     * name `remove` itself. The gateway wraps every one of them in a
     * `RemoteResult` envelope, so `hubCall` unwraps it and throws what the Host
     * rejected with.
     * ==================================================================== */

    let readTheme = () => undefined
    let subscribeTheme = () => undefined

    /** Cordis service key of the gateway's client carrier. */
    const REMOTE_KEY = 'remote'

    /** Cordis service key the gateway gives the `hub` namespace it mounts. */
    const HUB_KEY = 'remote.hub'

    /** Distinguishes "the carrier is not here" from "the Host rejected the call". */
    class HubBridgeMissing extends Error {}

    /**
     * The `hub` namespace service, re-read at call time.
     *
     * The gateway does not hang namespaces off the `remote` service: `$mount()`
     * installs each one as its own traced Cordis service under `remote.<namespace>`
     * (`api-gateway/src/client/index.ts`, `remoteServiceKey`). So the namespace is
     * `ctx.get('remote.hub')`, never a property of `ctx.get('remote')` — that
     * carrier only ever carries `$mount`, `$stream`, `$host` and `$on`.
     */
    let readNamespace = () => undefined

    /**
     * Mounts the contribution if it is not mounted yet, or rethrows why it could
     * not be. Rebound by `apply`; before that it fails with the reason a panel
     * would have shown anyway.
     */
    let ensureBridge = async () => {
      throw new HubBridgeMissing('the Hub Remote contribution was never mounted')
    }

    /** Why the last mount attempt failed, shown verbatim when nothing is mounted. */
    let bridgeFailure = null

    /** The contribution `apply` disposes, or `null` while it was never mounted. */
    let disposeBridge = null

    /** The in-flight mount, so two callers join one attempt instead of racing it. */
    let mounting = null

    /** This package's own manifest identity; `typert.js` declares the same one. */
    const PACKAGE = '@hanmaxiao/dsh-hub'

    /** Wire namespace promised by `remote.js` (`SERVICE_KEY`). */
    const NAMESPACE = 'hub'

    /**
     * A strict codec with a pass-through schema — the same zero-zod shape
     * `typert.js` publishes, and the one the loader and the gateway both accept:
     * both only require `mode: 'strict'` plus a `create()` factory.
     *
     * @param typeSymbol Stable identity of the described value.
     * @returns A strict codec.
     */
    const passThrough = typeSymbol => ({
      mode: 'strict',
      typeSymbol,
      create: () => ({ parse: value => value }),
    })

    /**
     * One client-facing invocation, mirroring what `typert.js` publishes.
     * @param method Remote method name.
     * @param parameters Wire-ordered parameter names.
     * @returns One descriptor for `CONTRIBUTION.descriptors`.
     */
    function clientInvocation(method, parameters) {
      return {
        id: `${PACKAGE}#${NAMESPACE}/${method}`,
        service: NAMESPACE,
        namespace: NAMESPACE,
        method,
        implementation: method,
        invocation: { kind: 'direct' },
        parameters: parameters.map(name => ({
          name,
          wire: name,
          source: 'json',
          codec: passThrough(`${PACKAGE}#${NAMESPACE}/${method}/${name}`),
        })),
        result: passThrough(`${PACKAGE}#${NAMESPACE}/${method}:result`),
      }
    }

    /**
     * The Host-for-Client contribution this file mounts for itself.
     *
     * `dsh-typert-loader` discovers a package's `./typert` export on the **Host**
     * only, and the only client-side mounts shipped in the base are the generated
     * first-party ones inside `@deepseek-ai/dsh-api-remotes`. Nothing mounts a
     * third-party package's namespace for it, so a hand-written bundle calls
     * `ctx.remote.$mount()` itself — the technique
     * `@deepseek-ai/dsh-experimental-client-ui-voice-input` uses for its `speech`
     * namespace. Without this the namespace service is never created and every
     * call fails, whatever the Host published.
     *
     * The roster is spelled out here rather than imported because the browser
     * module table serves one entry per package and cannot reach `lib/` or
     * `./typert`; `tests/typert.test.js` is what keeps this copy equal to the
     * manifest and to the methods `remote.js` marks.
     */
    const CONTRIBUTION = {
      package: PACKAGE,
      descriptors: [
        clientInvocation('list', []),
        clientInvocation('create', ['draft']),
        clientInvocation('update', ['id', 'patch']),
        // Published as `delete`: the namespace service the gateway mounts owns a
        // `remove` of its own and refuses a mounted method that shadows it. The
        // Host still implements `remove`, reached through `implementation`.
        { ...clientInvocation('delete', ['id']), implementation: 'remove' },
      ],
    }

    /**
     * The `hub` namespace of the live Remote carrier.
     * @returns the namespace service.
     * @throws HubBridgeMissing when no carrier is mounted.
     */
    function hubNamespace() {
      const namespace = readNamespace()
      if (namespace === undefined || namespace === null) {
        if (bridgeFailure !== null) throw bridgeFailure
        throw new HubBridgeMissing(`ctx.get("${HUB_KEY}") is not mounted`)
      }
      return namespace
    }

    /**
     * One Remote invocation, re-reading the carrier at call time.
     * @param {'list'|'create'|'update'|'delete'} method Published Remote method name.
     * @param args Positional arguments in the manifest's order.
     * @returns the decoded payload.
     */
    async function hubCall(method, ...args) {
      await ensureBridge()
      const namespace = hubNamespace()
      const target = namespace[method]
      if (typeof target !== 'function') {
        throw new HubBridgeMissing(`the Hub Remote does not expose "${method}"`)
      }
      // A mounted method answers with a `RemoteResult` envelope and never throws
      // a business failure: carrier loss, cancellation and every Host `RemoteError`
      // all arrive as `{ ok: false, error }`. Only an assembly fault — a wrong
      // argument count, a withdrawn mount — rejects.
      const result = await target(...args)
      if (result === null || typeof result !== 'object' || result.ok !== true) {
        throw result?.error
          ?? new HubBridgeMissing(`the Hub Remote returned no result for "${method}"`)
      }
      // The codec is pass-through, so the decoded payload arrives as the Host
      // wrote it: an envelope for `list`, a bare `Item` for the rest.
      return result.value
    }

    /**
     * The fields DESIGN §5 requires an item of each kind to carry.
     *
     * The Host's normalisation is total, so a Host that knows a field always
     * returns it — an untitled item carries `title: ''`, never nothing. A
     * missing key therefore means exactly one thing: the Host is running an
     * older build that has never heard of the field.
     */
    const REQUIRED_KEYS = {
      todo: ['id', 'kind', 'title', 'description', 'category', 'priority', 'done', 'attachments', 'note', 'createdAt', 'updatedAt'],
      note: ['id', 'kind', 'title', 'text', 'images', 'createdAt', 'updatedAt'],
      prompt: ['id', 'kind', 'title', 'text', 'images', 'createdAt', 'updatedAt'],
    }

    /**
     * The §5 keys the Host's own items are missing.
     *
     * This exists because version skew is otherwise **silent and lossy**: the
     * Host drops a field it does not recognise (by design — an unknown key is
     * the Client's business, not a reason to fail a save), so a panel that knows
     * `title` talking to a Host that does not loses every title the user typed,
     * with no error anywhere. The symptom reads as "my title edit did not
     * stick", which sends the reader looking at the panel instead of at the
     * process. Reporting the gap turns that into a sentence with a fix.
     *
     * Only the first item is read: one is enough, and a store's items all come
     * from the same build. An empty store says nothing either way.
     *
     * @param {object[]} items Raw items as `list` returned them.
     * @returns The missing field names, empty when the Host is current.
     */
    function missingHostFields(items) {
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue
        const required = REQUIRED_KEYS[item.kind]
        if (required === undefined) continue
        return required.filter(key => !Object.prototype.hasOwnProperty.call(item, key))
      }
      return []
    }

    /* ==================================================================== *
     * 5. Panel store
     *
     * Two halves, split by who has to read them:
     *
     * - `useReducer` owns everything one mounted panel needs (items, phase,
     *   per-tab query, the open modal). It lives with the component, so
     *   unmounting the panel forgets nothing it should keep.
     * - a tiny subscription store owns the two values the frame must see across
     *   re-mounts — the dock edge and the view — read through
     *   `useSyncExternalStore`.
     * ==================================================================== */

    /** The three tabs; the id is also the `kind` the Host stores. */
    const KINDS = ['todo', 'note', 'prompt']
    const KIND_ICON = { todo: 'todo', note: 'note', prompt: 'prompt' }
    const KIND_LABEL_KEY = { todo: 'tab.todo', note: 'tab.note', prompt: 'tab.prompt' }

    /**
     * Dock edges, in the order the menu offers them.
     *
     * No top edge. The shell's own header sits at the top of the window, and a
     * rail there either lands under its drag region — where the pointer never
     * reaches it — or, cleared of it, sits on the conversation's own title row.
     * Both failures are silent and both cost the edge more than it is worth, so
     * the panel docks to the three sides that have no chrome of their own.
     */
    const EDGES = ['left', 'right', 'bottom']
    const EDGE_ICON = { left: 'dockLeft', right: 'dockRight', bottom: 'dockBottom' }
    const EDGE_LABEL_KEY = { left: 'dock.left', right: 'dock.right', bottom: 'dock.bottom' }

    /** Only these two views exist; both are persisted. */
    const VIEWS = ['grid', 'list']

    /**
     * Grace between the pointer leaving the panel and it folding away.
     *
     * Long enough that a pointer which skims the boundary does not flap, short
     * enough to read as immediate: the panel opened because the pointer was
     * here, so it should leave when the pointer does. It only ever runs after
     * `pointerleave` has fired on the whole rail, which already means the
     * pointer is outside the panel and the handle together.
     */
    const COLLAPSE_IDLE_MS = 120

    /**
     * Durable presentation choices. This key carries an edge and a view and
     * nothing else — item bytes belong to the Host, and a second copy in the
     * browser would go stale exactly when it hurts.
     */
    const PREFS_KEY = 'dsh-hub.prefs.v1'

    function readPrefs() {
      try {
        const raw = globalThis.localStorage?.getItem(PREFS_KEY)
        if (typeof raw !== 'string') return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      }
      catch (error) {
        // A blocked or corrupt preference store costs persistence, not the
        // session: the defaults below are already sane.
        void error
        return {}
      }
    }

    function writePrefs(patch) {
      try {
        globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
      }
      catch (error) {
        // Same reason as the read: a full store must not break the panel.
        void error
      }
    }

    const storedPrefs = readPrefs()

    function createUiStore() {
      let state = {
        edge: EDGES.includes(storedPrefs.edge) ? storedPrefs.edge : 'right',
        view: VIEWS.includes(storedPrefs.view) ? storedPrefs.view : 'grid',
      }
      const listeners = new Set()
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        update(patch) {
          const next = { ...state, ...patch }
          if (next.edge === state.edge && next.view === state.view) return
          state = next
          for (const listener of listeners) listener()
        },
      }
    }

    const uiStore = createUiStore()

    /** Read the persisted presentation slice. */
    function useUi() {
      return useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot)
    }

    /** Read the live theme preference, re-rendering when the app switches. */
    function useThemePreference() {
      const [preference, setPreference] = useState(
        () => readTheme()?.getTheme?.()?.preference ?? 'system',
      )
      useEffect(() => {
        const sync = () => { setPreference(readTheme()?.getTheme?.()?.preference ?? 'system') }
        sync()
        return subscribeTheme(sync)
      }, [])
      return preference
    }

    /** Which query each kind starts with; the field sets differ per kind (§6). */
    function initialQueries() {
      const queries = {}
      for (const kind of KINDS) {
        queries[kind] = { search: '', field: 'name', direction: 'asc', group: 'none', filter: 'all' }
      }
      return queries
    }

    function initialPanelState() {
      return {
        tab: 'todo',
        phase: 'loading',
        items: [],
        failure: null,
        busy: false,
        queries: initialQueries(),
        modal: null,
        draft: null,
        notice: null,
      }
    }

    function panelReducer(state, action) {
      switch (action.type) {
        case 'load/start':
          return { ...state, phase: 'loading', failure: null }
        case 'load/ok':
          return { ...state, phase: 'ready', items: action.items, failure: null }
        case 'load/broken':
          return { ...state, phase: 'broken', items: [], failure: action.failure }
        case 'load/fail':
          return { ...state, phase: 'error', failure: action.failure }
        case 'busy':
          return { ...state, busy: action.busy }
        case 'tab':
          return { ...state, tab: action.tab, modal: null, draft: null }
        case 'query':
          return {
            ...state,
            queries: { ...state.queries, [state.tab]: { ...state.queries[state.tab], ...action.patch } },
          }
        case 'modal':
          return { ...state, modal: action.modal, draft: action.draft ?? null }
        case 'draft/merge':
          return { ...state, draft: { ...(state.draft ?? {}), ...action.draft } }
        case 'draft/append':
          return { ...state, draft: { ...(state.draft ?? {}), files: [...(state.draft?.files ?? []), ...action.files] } }
        case 'notice':
          return { ...state, notice: action.notice }
        default:
          return state
      }
    }

    /** Human text for a failure, so the panel can show what went wrong. */
    function failureText(failure) {
      if (failure === null || failure === undefined) return ''
      if (failure instanceof HubBridgeMissing) return failure.message
      return failure instanceof Error ? failure.message : String(failure)
    }

    /* ==================================================================== *
     * 6. Query layer — the single owner of search / filter / sort / group
     *
     * This whole section implements DESIGN.md §6 and nothing else computes an
     * ordering. The Host never re-implements it (DESIGN.md, ownership table).
     * ==================================================================== */

    /** Priority rank. Ascending is low to high (§6). */
    const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 }

    /** The order priority groups appear in, independent of sort direction. */
    const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low']

    /**
     * Sort fields, per kind (§6).
     *
     * Obsidian's `作者` and `标题` are absent on purpose and are NOT rendered as
     * empty entries: no model field backs them and `标题` duplicates `名称`. A
     * TODO carries six fields — `类型` maps to `category` and `标记` to
     * `priority` — while a Note and a Prompt carry exactly four.
     */
    const SORT_FIELDS = {
      todo: [
        { id: 'name', labelKey: 'sort.name' },
        { id: 'updatedAt', labelKey: 'sort.updatedAt' },
        { id: 'category', labelKey: 'sort.category' },
        { id: 'size', labelKey: 'sort.size' },
        { id: 'createdAt', labelKey: 'sort.createdAt' },
        { id: 'priority', labelKey: 'sort.priority' },
      ],
      note: [
        { id: 'name', labelKey: 'sort.name' },
        { id: 'updatedAt', labelKey: 'sort.updatedAt' },
        { id: 'size', labelKey: 'sort.size' },
        { id: 'createdAt', labelKey: 'sort.createdAt' },
      ],
      prompt: [
        { id: 'name', labelKey: 'sort.name' },
        { id: 'updatedAt', labelKey: 'sort.updatedAt' },
        { id: 'size', labelKey: 'sort.size' },
        { id: 'createdAt', labelKey: 'sort.createdAt' },
      ],
    }

    /**
     * Field id to locale key, for the readout under the header. Derived from
     * `SORT_FIELDS` so the readout cannot name a field the menu does not offer.
     */
    const SORT_FIELD_LABEL_KEY = Object.fromEntries(Object.entries(SORT_FIELDS)
      .map(([kind, fields]) => [kind, Object.fromEntries(fields.map(field => [field.id, field.labelKey]))]))

    /** Grouping choices, per kind (§6). */
    const GROUP_FIELDS = {
      todo: [
        { id: 'none', labelKey: 'group.none' },
        { id: 'category', labelKey: 'group.category' },
        { id: 'priority', labelKey: 'group.priority' },
        { id: 'done', labelKey: 'group.done' },
      ],
      note: [
        { id: 'none', labelKey: 'group.none' },
        { id: 'withImages', labelKey: 'group.withImages' },
        { id: 'textOnly', labelKey: 'group.textOnly' },
      ],
      prompt: [
        { id: 'none', labelKey: 'group.none' },
        { id: 'withImages', labelKey: 'group.withImages' },
        { id: 'textOnly', labelKey: 'group.textOnly' },
      ],
    }

    /**
     * Filter choices, per kind.
     *
     * Filtering is a narrowing predicate, distinct from grouping: it changes
     * which rows exist, while grouping only changes which section they sit in.
     */
    const FILTER_FIELDS = {
      todo: [
        { id: 'all', labelKey: 'filter.all' },
        { id: 'open', labelKey: 'filter.open' },
        { id: 'closed', labelKey: 'filter.closed' },
      ],
      note: [
        { id: 'all', labelKey: 'filter.all' },
        { id: 'withFiles', labelKey: 'filter.withFiles' },
        { id: 'withoutFiles', labelKey: 'filter.withoutFiles' },
      ],
      prompt: [
        { id: 'all', labelKey: 'filter.all' },
        { id: 'withFiles', labelKey: 'filter.withFiles' },
        { id: 'withoutFiles', labelKey: 'filter.withoutFiles' },
      ],
    }

    const collator = (() => {
      try {
        return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      }
      catch (error) {
        // A missing Intl is the only reason this falls back: plain comparison
        // orders worse but still orders.
        void error
        return { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }
      }
    })()

    /** UTF-8 byte length of a string, which is what "size" means here (§6). */
    function byteLength(text) {
      try {
        return new TextEncoder().encode(text).length
      }
      catch (error) {
        // Older engines without TextEncoder: the escaped form is still UTF-8.
        void error
        return unescape(encodeURIComponent(text)).length
      }
    }

    /**
     * Decoded byte count of a base64 data URL, measured without decoding it.
     * @param {string} dataUrl A `data:<mime>;base64,<payload>` URL.
     * @returns the payload's byte length.
     */
    function dataUrlBytes(dataUrl) {
      if (typeof dataUrl !== 'string') return 0
      const comma = dataUrl.indexOf(',')
      if (!dataUrl.slice(0, comma).includes(';base64')) return 0
      const body = dataUrl.slice(comma + 1)
      const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
      return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
    }

    /** First non-empty line, collapsed: what the `名称` field means here. */
    function firstLine(text) {
      for (const line of String(text ?? '').split('\n')) {
        const trimmed = line.trim()
        if (trimmed !== '') return trimmed.replace(/\s+/g, ' ')
      }
      return ''
    }

    /**
     * Normalize one Host item into the shape the query layer sorts.
     *
     * `name` is the display and sort name, and it is **derived**: the item's own
     * title when it has one, otherwise the first line of its content. That
     * fallback is why a document written before titles existed keeps reading
     * exactly as it did, and why an untitled item is never blank.
     *
     * The `size` the sort uses is computed here from the item's own bytes —
     * title, content, note and attachments — because §6 makes that the Client's
     * job and the Host stores no denormalised size to drift out of step.
     */
    function normalizeItem(raw) {
      const kind = KINDS.includes(raw?.kind) ? raw.kind : null
      if (kind === null) return null
      const content = kind === 'todo' ? String(raw.description ?? '') : String(raw.text ?? '')
      const title = String(raw.title ?? '').trim()
      const files = (kind === 'todo' ? raw.attachments : raw.images) ?? []
      const list = Array.isArray(files) ? files : []
      const size = byteLength(title)
        + byteLength(content)
        + (kind === 'todo' ? byteLength(String(raw.note ?? '')) : 0)
        + list.reduce((total, file) => total + dataUrlBytes(file?.dataUrl), 0)
      const haystack = [
        title,
        content,
        kind === 'todo' ? String(raw.category ?? '') : '',
        kind === 'todo' ? String(raw.note ?? '') : '',
        ...list.map(file => String(file?.name ?? '')),
      ].join('\n').toLowerCase()
      return {
        id: String(raw.id ?? ''),
        kind,
        title,
        name: title === '' ? firstLine(content) : firstLine(title),
        content,
        files: list.map(file => ({
          name: String(file?.name ?? ''),
          mime: String(file?.mime ?? ''),
          dataUrl: typeof file?.dataUrl === 'string' ? file.dataUrl : '',
        })),
        category: kind === 'todo' ? String(raw.category ?? '') : '',
        note: kind === 'todo' ? String(raw.note ?? '') : '',
        // `in` throws on a non-string left operand, so an absent priority is
        // asked about the same way every other field is: by membership.
        priority: kind === 'todo' && Object.prototype.hasOwnProperty.call(PRIORITY_RANK, raw.priority)
          ? raw.priority
          : 'normal',
        done: kind === 'todo' ? raw.done === true : false,
        createdAt: Date.parse(raw.createdAt) || 0,
        updatedAt: Date.parse(raw.updatedAt) || 0,
        size,
        haystack,
      }
    }

    /**
     * The comparator for one field and direction (§6).
     *
     * Ascending means name A to Z, date old to new, size small to large and
     * priority low to high; descending inverts the primary key only.
     *
     * @param {object} a First normalized item.
     * @param {object} b Second normalized item.
     * @param {string} field Field id from `SORT_FIELDS`.
     * @param {'asc'|'desc'} direction Direction id.
     * @returns a negative, zero or positive ordering.
     */
    function compareItems(a, b, field, direction) {
      const sign = direction === 'desc' ? -1 : 1
      let difference = 0
      switch (field) {
        case 'name': difference = collator.compare(a.name, b.name); break
        case 'updatedAt': difference = a.updatedAt - b.updatedAt; break
        case 'createdAt': difference = a.createdAt - b.createdAt; break
        case 'size': difference = a.size - b.size; break
        case 'category': difference = collator.compare(a.category, b.category); break
        case 'priority': difference = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]; break
        default: difference = 0
      }
      if (difference !== 0) return sign * difference
      // Tiebreak (§6): always ascending, and deliberately NOT flipped with the
      // direction. Equal keys then land in one fixed order across renders and
      // across a direction flip, instead of exchanging places each time.
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    }

    /** Narrow by the filter choice (§6's `过滤` row). */
    function applyFilter(items, kind, filterId) {
      if (filterId === 'all') return items
      if (kind === 'todo') {
        if (filterId === 'open') return items.filter(item => !item.done)
        if (filterId === 'closed') return items.filter(item => item.done)
        return items
      }
      if (filterId === 'withFiles') return items.filter(item => item.files.length > 0)
      if (filterId === 'withoutFiles') return items.filter(item => item.files.length === 0)
      return items
    }

    /** Whitespace-separated terms, all of which must appear (§6's search). */
    function matchesSearch(item, search) {
      const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
      return terms.every(term => item.haystack.includes(term))
    }

    /**
     * Split one kind's items into labelled groups.
     *
     * Group ORDER is the natural order of the grouping key (priority most to
     * least urgent, unfinished before done) and never follows the sort
     * direction — a descending sort should not walk the sections backwards.
     */
    function groupItems(items, kind, groupId) {
      if (groupId === 'none') return [{ id: 'none', labelKey: null, items }]
      if (kind === 'todo') {
        if (groupId === 'category') {
          const keys = [...new Set(items.map(item => item.category))]
          keys.sort(collator.compare)
          return keys.map(key => ({
            id: `category:${key}`,
            labelKey: key === '' ? 'group.uncategorized' : null,
            label: key,
            items: items.filter(item => item.category === key),
          }))
        }
        if (groupId === 'priority') {
          return PRIORITY_ORDER
            .map(priority => ({
              id: `priority:${priority}`,
              labelKey: `priority.${priority}`,
              items: items.filter(item => item.priority === priority),
            }))
            .filter(group => group.items.length > 0)
        }
        return [
          { id: 'done:false', labelKey: 'group.done.no', items: items.filter(item => !item.done) },
          { id: 'done:true', labelKey: 'group.done.yes', items: items.filter(item => item.done) },
        ].filter(group => group.items.length > 0)
      }
      return [
        { id: 'images', labelKey: 'group.withImages', items: items.filter(item => item.files.length > 0) },
        { id: 'text', labelKey: 'group.textOnly', items: items.filter(item => item.files.length === 0) },
      ].filter(group => group.items.length > 0)
    }

    /**
     * The one pipeline: kind, then search, then filter, then sort, then group.
     * @param {object[]} items Every normalized item the Host returned.
     * @param {string} kind The active tab.
     * @param {object} query The tab's query state.
     * @returns ordered, labelled groups; empty when nothing matched.
     */
    function runQuery(items, kind, query) {
      const matching = applyFilter(
        items.filter(item => item.kind === kind && matchesSearch(item, query.search)),
        kind,
        query.filter,
      )
      const sorted = [...matching].sort((a, b) => compareItems(a, b, query.field, query.direction))
      return groupItems(sorted, kind, query.group)
    }

    /* ==================================================================== *
     * 7. Components
     * ==================================================================== */

    /** Icon-only control; the label is the accessible name and the tooltip. */
    function IconButton(props) {
      return h('button', {
        type: 'button',
        className: props.className ?? 'hub-tool',
        title: props.label,
        'aria-label': props.label,
        disabled: props.disabled === true,
        'data-on': props.on === undefined ? undefined : String(props.on),
        onClick: props.onClick,
      }, h(Icon, { name: props.icon, size: props.size ?? 16 }))
    }

    /**
     * Measure a node's content box with a `ResizeObserver`.
     *
     * A callback ref, not `useRef` + effect: the measured node only exists while
     * the panel is expanded, and an effect that ran once on mount would find a
     * null ref and never observe the node that appears later. React calls this
     * with null on detach, which is where the old observer is released.
     *
     * @returns `[ref, width]`.
     */
    function useMeasuredWidth() {
      const [width, setWidth] = useState(0)
      const observer = useRef(null)
      const ref = useCallback(node => {
        if (observer.current !== null) {
          observer.current.disconnect()
          observer.current = null
        }
        if (node === null) return
        if (typeof ResizeObserver === 'undefined') {
          setWidth(node.getBoundingClientRect().width)
          return
        }
        const created = new ResizeObserver(entries => {
          for (const entry of entries) setWidth(entry.contentRect.width)
        })
        created.observe(node)
        observer.current = created
        setWidth(node.getBoundingClientRect().width)
      }, [])
      useEffect(() => () => {
        if (observer.current !== null) observer.current.disconnect()
      }, [])
      return [ref, width]
    }

    /** Human byte size; the only place the unit suffixes are produced. */
    function formatSize(bytes) {
      if (bytes < 1024) return `${bytes} ${translate('size.bytes')}`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${translate('size.kib')}`
      return `${(bytes / (1024 * 1024)).toFixed(1)} ${translate('size.mib')}`
    }

    /** Local date and time of an epoch value; invalid input reads as unknown. */
    function formatTime(epoch) {
      if (!Number.isFinite(epoch) || epoch <= 0) return ''
      try {
        return new Date(epoch).toLocaleString()
      }
      catch (error) {
        // A locale that cannot format must not blank the row.
        void error
        return new Date(epoch).toISOString()
      }
    }

    /** Copy to the clipboard, with a selection fallback for non-secure pages. */
    async function copyText(text) {
      try {
        if (globalThis.navigator?.clipboard?.writeText) {
          await globalThis.navigator.clipboard.writeText(text)
          return true
        }
      }
      catch (error) {
        // Permission denied or an insecure origin: the fallback still works.
        void error
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(area)
        return copied
      }
      catch (error) {
        void error
        return false
      }
    }

    /** One picked file as a base64 data URL, which is how the Host stores it. */
    function readFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(`could not read "${file.name}"`))
        reader.onload = () => resolve({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          dataUrl: String(reader.result ?? ''),
        })
        reader.readAsDataURL(file)
      })
    }

    /* --- The two loading skeletons, kept genuinely apart (DESIGN.md §8). ---
     * A shared skeleton is a defect, so these are two components with two
     * shapes and two animations: tiles for the grid, rows for the list. */

    /**
     * Card-grid skeleton: square-ish tiles, each with a title bar and two text
     * bars, pulsing on the `hub-pulse-a` timing.
     * @param {{count: number}} props How many tiles to draw.
     * @returns the grid placeholder.
     */
    function GridSkeleton(props) {
      return h('div', { className: 'hub-skel-grid', 'aria-hidden': 'true' },
        Array.from({ length: Math.max(4, props.count) }, (_, index) => h('div', {
          key: index,
          className: 'hub-skel-card',
        }, [
          h('div', {
            key: 't',
            className: 'hub-skel-block hub-pulse-a',
            style: { height: '12px', width: `${58 + (index % 3) * 14}%`, animationDelay: `${(index % 5) * 110}ms` },
          }),
          h('div', { key: 'l', className: 'hub-skel-lines' }, [
            h('div', {
              key: 0,
              className: 'hub-skel-block hub-pulse-b',
              style: { height: '8px', width: '100%', animationDelay: `${(index % 4) * 90}ms` },
            }),
            h('div', {
              key: 1,
              className: 'hub-skel-block hub-pulse-b',
              style: { height: '8px', width: `${46 + (index % 3) * 16}%`, animationDelay: `${(index % 4) * 90 + 60}ms` },
            }),
          ]),
        ])))
    }

    /**
     * Row-list skeleton: one leading disc and two offset bars per row, pulsing
     * on the `hub-pulse-b` timing — a different geometry and a different clock
     * from the card grid above.
     * @param {{count: number}} props How many rows to draw.
     * @returns the list placeholder.
     */
    function RowSkeleton(props) {
      return h('div', { className: 'hub-skel-rows', 'aria-hidden': 'true' },
        Array.from({ length: Math.max(3, props.count) }, (_, index) => h('div', {
          key: index,
          className: 'hub-skel-row',
        }, [
          h('div', {
            key: 'd',
            className: 'hub-skel-dot hub-pulse-a',
            style: { animationDelay: `${(index % 6) * 130}ms` },
          }),
          h('div', { key: 'c', className: 'hub-skel-cols' }, [
            h('div', {
              key: 0,
              className: 'hub-skel-block hub-pulse-b',
              style: { height: '9px', width: `${44 + ((index * 7) % 34)}%`, animationDelay: `${(index % 6) * 130 + 40}ms` },
            }),
            h('div', {
              key: 1,
              className: 'hub-skel-block hub-pulse-b',
              style: { height: '8px', width: `${22 + ((index * 5) % 26)}%`, animationDelay: `${(index % 6) * 130 + 110}ms` },
            }),
          ]),
        ])))
    }

    /**
     * One item's tags: category, priority, completion and attachment count.
     *
     * `withState` is off in the list and the grid, where completion already
     * reads from the struck-through name and the leading glyph: repeating it as
     * a tag costs a slot in the one line the tags have. The detail dialog
     * keeps it, because there it is the only thing saying so.
     */
    function ItemChips(props) {
      const item = props.item
      const chips = []
      if (item.kind === 'todo' && item.category !== '') {
        chips.push(h('span', { key: 'c', className: 'hub-chip' }, item.category))
      }
      if (item.kind === 'todo') {
        chips.push(h('span', { key: 'p', className: 'hub-chip', 'data-tone': item.priority },
          translate(`priority.${item.priority}`)))
      }
      if (item.kind === 'todo' && props.withState !== false) {
        chips.push(h('span', { key: 'd', className: 'hub-chip', 'data-tone': item.done ? 'done' : 'open' },
          h(Icon, { name: item.done ? 'done' : 'open', size: 11 }),
          translate(item.done ? 'group.done.yes' : 'group.done.no')))
      }
      if (item.files.length > 0) {
        chips.push(h('span', { key: 'f', className: 'hub-chip' },
          h(Icon, { name: 'paperclip', size: 11 }),
          String(item.files.length)))
      }
      return chips
    }

    /**
     * Stagger for the list reveal.
     *
     * Keyed items only animate when React mounts them, so this plays when a tab
     * changes or the panel opens and stays quiet when a sort merely reorders
     * nodes that were already on screen. The cap keeps a long list from spending
     * half a second watching it arrive.
     *
     * @param index Position within its group.
     * @returns A CSS delay string.
     */
    function revealDelay(index) {
      const step = Math.min(index ?? 0, 8)
      return `${step * 16}ms`
    }
    /**
     * Completion, on the item rather than in a form.
     *
     * The item is a button that opens the detail dialog, so the click stops
     * here: completing a TODO must not also open the thing it just changed. The
     * box reflects the stored item and nothing else, so it does not tick on the
     * click and untick on the reload that follows it.
     *
     * @param {{item: object, onToggle: (item: object, done: boolean) => void}} props
     * @returns a labelled checkbox, or nothing for a kind that has no `done`.
     */
    function DoneToggle(props) {
      if (props.item.kind !== 'todo') return null
      return h('input', {
        key: 'k',
        type: 'checkbox',
        className: 'hub-done-check',
        checked: props.item.done === true,
        title: translate('field.done'),
        'aria-label': translate('field.done'),
        onClick: event => { event.stopPropagation() },
        onChange: event => { props.onToggle(props.item, event.target.checked === true) },
      })
    }

    /** Detail and delete affordances shared by the card and the row. */
    function ItemActions(props) {
      return h('span', { key: 'a', className: 'hub-item-actions' }, [
        IconButton({
          key: 'c',
          icon: 'copy',
          label: translate('action.copy'),
          size: 14,
          onClick: event => { event.stopPropagation(); props.onCopy(props.item) },
        }),
        IconButton({
          key: 'd',
          icon: 'trash',
          label: translate('action.delete'),
          size: 14,
          onClick: event => { event.stopPropagation(); props.onDelete(props.item) },
        }),
      ])
    }

    /** One item as a grid card. */
    function ItemCard(props) {
      const item = props.item
      return h('div', {
        className: 'hub-card',
        'data-done': String(item.done),
        style: { animationDelay: revealDelay(props.index) },
        role: 'button',
        tabIndex: 0,
        onClick: () => props.onOpen(item),
        onKeyDown: event => {
          // A nested control owns its own keys. Space on the checkbox toggles it
          // and Space on an item action fires that action; both bubble here, and
          // opening the item on top of them would put the detail dialog between
          // the user and the thing they just pressed.
          if (event.target !== event.currentTarget) return
          // Space is the second activation key on a role=button; without this it
          // also scrolls the panel body underneath.
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          props.onOpen(item)
        },
      }, [
        h('div', { key: 'h', className: 'hub-card-head' }, [
          h('span', { key: 'n', className: 'hub-item-name' }, item.name),
          DoneToggle({ item, onToggle: props.onToggle }),
        ]),
        h('div', { key: 't', className: 'hub-item-text', 'data-lines': '3' }, item.content),
        // One foot rather than two loose rows: the tags and the size share a
        // rule, so the card reads as a unit instead of a stack of facts.
        h('div', { key: 'f', className: 'hub-card-foot' }, [
          h('span', { key: 'c', className: 'hub-item-meta' }, ItemChips({ item, withState: false })),
          h('span', { key: 's', className: 'hub-card-size' }, formatSize(item.size)),
        ]),
        ItemActions({ item, onCopy: props.onCopy, onDelete: props.onDelete }),
      ])
    }

    /** One item as a list row: a leading glyph, two lines, then the actions. */
    function ItemRow(props) {
      const item = props.item
      return h('div', {
        className: 'hub-row',
        'data-done': String(item.done),
        style: { animationDelay: revealDelay(props.index) },
        role: 'button',
        tabIndex: 0,
        onClick: () => props.onOpen(item),
        onKeyDown: event => {
          // Same reason as the card: a nested control's keys are its own.
          if (event.target !== event.currentTarget) return
          // Space is the second activation key on a role=button; without this it
          // also scrolls the panel body underneath.
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          props.onOpen(item)
        },
      }, [
        h('span', { key: 'i', className: 'hub-icon-lead' },
          h(Icon, { name: item.done ? 'done' : KIND_ICON[item.kind], size: 15 })),
        h('span', { key: 'm', className: 'hub-row-main' }, [
          h('span', { key: 'n', className: 'hub-item-name' }, item.name),
          h('span', { key: 't', className: 'hub-item-text' }, item.content),
          h('span', { key: 'c', className: 'hub-item-meta' }, ItemChips({ item, withState: false })),
        ]),
        h('span', { key: 's', className: 'hub-card-size' }, formatSize(item.size)),
        ItemActions({ item, onCopy: props.onCopy, onDelete: props.onDelete }),
        DoneToggle({ item, onToggle: props.onToggle }),
      ])
    }

    /** The shared modal frame: a scrim, a title bar with the right-hand actions. */
    function Modal(props) {
      return h('div', {
        className: 'hub-scrim',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': props.title,
        onClick: event => { if (event.target === event.currentTarget) props.onClose() },
      }, h('div', { className: 'hub-modal' }, [
        h('div', { key: 'h', className: 'hub-modal-head' }, [
          h('span', { key: 't', className: 'hub-modal-title' }, props.title),
          props.headActions,
        ]),
        h('div', { key: 'b', className: 'hub-modal-body' }, props.children),
        props.actions === undefined ? null : h('div', { key: 'a', className: 'hub-modal-actions' }, props.actions),
      ]))
    }

    /** A labelled form control. */
    function Field(props) {
      return h('label', { className: 'hub-field' }, [
        h('span', { key: 'l', className: 'hub-label' }, props.label),
        props.children,
      ])
    }

    /** Create / edit form for any of the three kinds. */
    function CreateModal(props) {
      const kind = props.kind
      const draft = props.draft
      const editing = props.editing === true
      const patch = (patch) => props.onDraft({ ...draft, ...patch })
      const isTodo = kind === 'todo'
      const contentKey = isTodo ? 'field.description' : 'field.text'
      const contentValue = isTodo ? draft.description : draft.text
      const canSubmit = String(contentValue ?? '').trim() !== ''

      return h(Modal, {
        // The same form serves both, so the title is what tells them apart: an
        // edit dialog labelled "New entry" would claim to create the item it is
        // about to rewrite.
        title: translate(editing ? 'modal.edit' : 'modal.create'),
        onClose: props.onClose,
        actions: [
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'hub-text-button',
            'data-quiet': 'true',
            onClick: props.onClose,
          }, translate('action.cancel')),
          h('button', {
            key: 'save',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            disabled: !canSubmit || props.busy,
            onClick: props.onSubmit,
          }, translate('action.confirm')),
        ],
      }, [
        h(Field, { key: 'title', label: translate('field.title') },
          h('input', {
            className: 'hub-input',
            value: draft.title ?? '',
            placeholder: translate('state.untitled'),
            onChange: event => patch({ title: event.target.value }),
          })),
        h(Field, { key: 'c', label: translate(contentKey) },
          h('textarea', {
            className: 'hub-textarea',
            value: contentValue ?? '',
            onChange: event => patch(isTodo ? { description: event.target.value } : { text: event.target.value }),
          })),
        isTodo
          ? h('div', { key: 'todo', className: 'hub-inline' }, [
            h(Field, { key: 'cat', label: translate('field.category') },
              h('input', {
                className: 'hub-input',
                value: draft.category ?? '',
                onChange: event => patch({ category: event.target.value }),
              })),
            h(Field, { key: 'pri', label: translate('field.priority') },
              h('select', {
                className: 'hub-select',
                value: draft.priority ?? 'normal',
                onChange: event => patch({ priority: event.target.value }),
              }, PRIORITY_ORDER.slice().reverse().map(priority => h('option', {
                key: priority,
                value: priority,
              }, translate(`priority.${priority}`))))),
          ])
          : null,
        isTodo
          ? h(Field, { key: 'note', label: translate('field.note') },
            h('textarea', {
              className: 'hub-textarea',
              style: { minHeight: '54px' },
              value: draft.note ?? '',
              onChange: event => patch({ note: event.target.value }),
            }))
          : null,
        h(Field, { key: 'files', label: translate(isTodo ? 'field.files' : 'field.images') },
          [
            h('input', {
              key: 'input',
              type: 'file',
              multiple: true,
              className: 'hub-input',
              'aria-label': translate('action.attach'),
              onChange: event => props.onPickFiles(event.target.files),
            }),
            draft.files.length === 0
              ? null
              : h('div', { key: 'list', className: 'hub-file-list' }, draft.files.map((file, index) => h('span', {
                key: `${file.name}:${index}`,
                className: 'hub-file',
              }, [
                h('span', { key: 'n' }, file.name),
                IconButton({
                  key: 'x',
                  icon: 'close',
                  label: translate('action.close'),
                  size: 11,
                  onClick: () => patch({ files: draft.files.filter((_, at) => at !== index) }),
                }),
              ]))),
          ]),
      ])
    }

    /** Detail view: everything the item carries, with copy and close top-right. */
    function DetailModal(props) {
      const item = props.item
      const copyControl = h(IconButton, {
        icon: 'copy',
        label: translate('action.copy'),
        onClick: () => props.onCopy(item),
      })
      const closeControl = h(IconButton, {
        icon: 'close',
        label: translate('action.close'),
        onClick: props.onClose,
      })
      return h(Modal, {
        title: translate('modal.detail'),
        onClose: props.onClose,
        headActions: h('span', { className: 'hub-item-actions' }, [copyControl, closeControl]),
        actions: [
          h('button', {
            key: 'edit',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            onClick: () => props.onEdit(item),
          }, translate('action.edit')),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'hub-text-button',
            'data-quiet': 'true',
            onClick: props.onClose,
          }, translate('action.close')),
        ],
      }, [
        h('div', { key: 'n', className: 'hub-detail-name' },
          item.name === '' ? translate('state.untitled') : item.name),
        h('div', { key: 'm', className: 'hub-item-meta' }, [
          h('span', { key: 's' }, `${translate('meta.size')} ${formatSize(item.size)}`),
          h('span', { key: 'c' }, `${translate('meta.created')} ${formatTime(item.createdAt)}`),
          h('span', { key: 'u' }, `${translate('meta.updated')} ${formatTime(item.updatedAt)}`),
        ]),
        h('div', { key: 'c', className: 'hub-item-meta' }, ItemChips({ item })),
        h('div', { key: 'x', className: 'hub-detail-text' }, item.content),
        item.note === '' ? null : h('div', { key: 'nt', className: 'hub-detail-note' }, item.note),
        item.files.length === 0 ? null : h('div', { key: 'f', className: 'hub-file-list' },
          item.files.map((file, index) => file.mime.startsWith('image/')
            ? h('img', { key: index, className: 'hub-thumb', src: file.dataUrl, alt: file.name })
            : h('span', { key: index, className: 'hub-file' },
              h(Icon, { name: 'paperclip', size: 11 }), file.name))),
      ])
    }

    /** Confirmation before a hard delete. */
    function DeleteModal(props) {
      return h(Modal, {
        title: translate('modal.delete'),
        onClose: props.onClose,
        actions: [
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'hub-text-button',
            'data-quiet': 'true',
            onClick: props.onClose,
          }, translate('action.cancel')),
          h('button', {
            key: 'confirm',
            type: 'button',
            className: 'hub-text-button',
            'data-danger': 'true',
            disabled: props.busy,
            onClick: props.onConfirm,
          }, translate('action.confirm')),
        ],
      }, [
        h('div', { key: 'n', className: 'hub-detail-name' }, props.item.name),
        h('div', { key: 'b', className: 'hub-detail-note' }, translate('modal.delete.body')),
      ])
    }

    /**
     * One radio group inside the sort menu.
     *
     * The leading column carries exactly one check per group — on the selected
     * choice. Anything else would either mark every row (a check on every
     * option reads as "all are on") or leave the selection unmarked.
     */
    function MenuGroup(props) {
      return h('div', { className: 'hub-group' }, [
        h('div', { key: 'l', className: 'hub-menu-label' }, translate(props.labelKey)),
        props.choices.map(choice => {
          const selected = choice.id === props.value
          return h('button', {
            key: choice.id,
            type: 'button',
            className: 'hub-menu-item',
            role: 'menuitemradio',
            'aria-checked': String(selected),
            onClick: () => props.onSelect(choice.id),
          }, [
            h('span', { key: 'i' }, selected
              ? h(Icon, { name: 'check', size: 13, width: 2 })
              : (choice.icon === undefined ? null : h(Icon, { name: choice.icon, size: 14 }))),
            h('span', { key: 'l' }, translate(choice.labelKey)),
          ])
        }),
      ])
    }

    /** The sort menu: one field, one direction, optional grouping, plus filter. */
    function SortMenu(props) {
      const kind = props.kind
      const query = props.query
      // An arrow rather than a second copy of the same word: the direction is
      // read off the group, so each option still names itself once.
      const direction = [
        { id: 'asc', labelKey: 'sort.asc', icon: 'chevronDown' },
        { id: 'desc', labelKey: 'sort.desc', icon: 'chevronDown' },
      ]
      return h('div', {
        className: 'hub-menu',
        role: 'menu',
        onClick: event => event.stopPropagation(),
      }, [
        h(MenuGroup, {
          key: 'f',
          labelKey: 'sort.field',
          choices: SORT_FIELDS[kind],
          value: query.field,
          onSelect: value => props.onQuery({ field: value }),
        }),
        h(MenuGroup, {
          key: 'd',
          labelKey: 'sort.direction',
          choices: direction,
          value: query.direction,
          onSelect: value => props.onQuery({ direction: value }),
        }),
        h(MenuGroup, {
          key: 'g',
          labelKey: 'group.by',
          choices: GROUP_FIELDS[kind],
          value: query.group,
          onSelect: value => props.onQuery({ group: value }),
        }),
        h(MenuGroup, {
          key: 'x',
          labelKey: 'filter.by',
          choices: FILTER_FIELDS[kind],
          value: query.filter,
          onSelect: value => props.onQuery({ filter: value }),
        }),
      ])
    }

    /** Edge picker and the three-state theme picker. */
    function FrameMenu(props) {
      const setTheme = (id) => {
        // The application owns the theme preference. This panel writes it through
        // `setTheme` and keeps no second copy, so the two can never disagree.
        try {
          readTheme()?.setTheme?.(id)
        }
        catch (error) {
          // An unregistered id is a wiring bug; the panel must survive it.
          void error
        }
      }
      if (props.menu === 'dock') {
        return h('div', { className: 'hub-menu', role: 'menu', onClick: event => event.stopPropagation() },
          h(MenuGroup, {
            labelKey: 'action.dock',
            choices: EDGES.map(edge => ({
              id: edge,
              labelKey: EDGE_LABEL_KEY[edge],
              icon: EDGE_ICON[edge],
            })),
            value: props.edge,
            onSelect: value => {
              uiStore.update({ edge: value })
              writePrefs({ edge: value })
              props.onClose()
            },
          }))
      }
      const themes = [
        { id: 'light', labelKey: 'theme.light', icon: 'sun' },
        { id: 'dark', labelKey: 'theme.dark', icon: 'moon' },
        { id: 'system', labelKey: 'theme.system', icon: 'monitor' },
      ]
      return h('div', { className: 'hub-menu', role: 'menu', onClick: event => event.stopPropagation() },
        h(MenuGroup, {
          labelKey: 'action.theme',
          choices: themes,
          value: props.preference,
          onSelect: setTheme,
        }))
    }

    /**
     * The docked panel: handle, header, body, floating tab capsule, modals.
     * @returns the `shell.overlay` entry element.
     */
    function HubPanelEntry() {
      const ui = useUi()
      const [state, dispatch] = useReducer(panelReducer, undefined, initialPanelState)
      const [expanded, setExpanded] = useState(false)
      const [pinned, setPinned] = useState(false)
      const [menu, setMenu] = useState('none')
      const themePreference = useThemePreference()
      const [gridRef, gridWidth] = useMeasuredWidth()
      const collapseTimer = useRef(null)
      const noticeTimer = useRef(null)
      // `pinned` drives both the hold-open rule and the ref the collapse timer
      // reads; the ref is the timer-safe copy.
      const pinnedRef = useRef(false)
      pinnedRef.current = pinned
      const query = state.queries[state.tab]

      // A collapse timer must not outlive the entry: firing into a torn-down
      // tree would be a React state update on an unmounted component.
      useEffect(() => () => {
        if (collapseTimer.current !== null) clearTimeout(collapseTimer.current)
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
      }, [])

      const clearCollapse = useCallback(() => {
        if (collapseTimer.current !== null) {
          clearTimeout(collapseTimer.current)
          collapseTimer.current = null
        }
      }, [])

      const expand = useCallback(() => {
        clearCollapse()
        setExpanded(true)
      }, [clearCollapse])

      // Pointer leaving plus an idle delay collapses again. A pinned panel (the
      // user clicked the handle) or one showing a modal holds open: collapsing
      // then would hide work in progress behind a 7-pixel strip.
      //
      // `pinnedRef` is read inside the timer rather than closed over: the timer
      // outlives the render that armed it, so a captured `pinned` would be the
      // value from that render and could undo a click made in between.
      const scheduleCollapse = useCallback(() => {
        clearCollapse()
        collapseTimer.current = setTimeout(() => {
          collapseTimer.current = null
          if (pinnedRef.current) return
          setExpanded(false)
        }, COLLAPSE_IDLE_MS)
      }, [clearCollapse])

      const load = useCallback(async () => {
        dispatch({ type: 'load/start' })
        try {
          const envelope = await hubCall('list')
          const raw = Array.isArray(envelope) ? envelope : envelope?.items
          if (!Array.isArray(raw)) throw new Error('hub.list did not return an items array')
          // `version` rides the envelope for a future compatibility rule; there
          // is no defined one yet, so nothing here gates on it.
          const items = raw.map(normalizeItem).filter(Boolean)
          dispatch({ type: 'load/ok', items })
          const behind = missingHostFields(raw)
          if (behind.length > 0) {
            // The field names go in bare: they are schema identifiers, not
            // prose, and they are the part the reader has to search the Host
            // source for.
            say(`${translate('state.hostOlder')} (${behind.join(', ')})`, 'warn')
          }
        }
        catch (error) {
          dispatch({
            type: error instanceof HubBridgeMissing ? 'load/broken' : 'load/fail',
            failure: error,
          })
        }
      }, [])

      useEffect(() => { void load() }, [load])

      const say = useCallback((text, tone) => {
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        dispatch({ type: 'notice', notice: text === null ? null : { text, tone } })
        if (text !== null) {
          noticeTimer.current = setTimeout(() => {
            noticeTimer.current = null
            dispatch({ type: 'notice', notice: null })
          }, 2200)
        }
      }, [])

      const openCreate = useCallback(() => {
        dispatch({
          type: 'modal',
          modal: { kind: 'create' },
          draft: { title: '', description: '', text: '', category: '', priority: 'normal', done: false, note: '', files: [] },
        })
      }, [])

      const openDetail = useCallback(item => dispatch({ type: 'modal', modal: { kind: 'detail', id: item.id } }))

      const openEdit = useCallback(item => dispatch({
        type: 'modal',
        modal: { kind: 'edit', id: item.id },
        draft: {
          title: item.title,
          description: item.content,
          text: item.content,
          category: item.category,
          priority: item.priority,
          done: item.done,
          note: item.note,
          files: item.files.map(file => ({ ...file })),
        },
      }))

      const closeModal = useCallback(() => dispatch({ type: 'modal', modal: null }))

      const askDelete = useCallback(item => dispatch({ type: 'modal', modal: { kind: 'delete', id: item.id } }))

      // Escape backs out one layer at a time — a menu first, then a dialog.
      // Bound to the panel rather than the document: once the pointer has
      // wandered off, the focused control is still inside the panel, and a
      // document-wide listener would also fire in other panels of the app.
      const menuOpen = menu !== 'none'
      const modalOpen = state.modal !== null
      const onPanelKey = useCallback((event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (modalOpen) closeModal()
        else if (menuOpen) setMenu('none')
      }, [menuOpen, modalOpen, closeModal])

      const pickFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList ?? [])
        if (files.length === 0) return
        try {
          const read = await Promise.all(files.map(readFile))
          // Appended through the reducer so a keystroke typed while the reader
          // was running is not lost.
          dispatch({ type: 'draft/append', files: read })
        }
        catch (error) {
          say(error instanceof Error ? error.message : String(error), 'error')
        }
      }, [say])

      const submit = useCallback(async () => {
        const draft = state.draft
        if (draft === null) return
        dispatch({ type: 'busy', busy: true })
        try {
          const files = draft.files.map(file => ({
            name: file.name,
            mime: file.mime,
            // The Host re-measures every attachment and rejects a mismatch, so
            // the byte count sent here is the one measured from the data URL.
            size: dataUrlBytes(file.dataUrl),
            dataUrl: file.dataUrl,
          }))
          const editing = state.modal?.kind === 'edit'
          const send = payload => (editing
            ? hubCall('update', state.modal.id, payload)
            : // `kind` is declared by the Client on create: the Host refuses to
              // guess it (`lib/model.js` enumField), and a Note draft and a TODO
              // draft are not distinguishable from their fields alone. It is
              // omitted from an update, where the existing kind already holds.
              hubCall('create', { ...payload, kind: state.tab }))
          if (state.tab === 'todo') {
            await send({
              title: draft.title,
              description: draft.description,
              category: draft.category,
              priority: draft.priority,
              // The form carries no completion control — the item's own
              // checkbox owns that — but the round trip still sends the value:
              // an update that dropped it would clear the completion a checkbox
              // set, every time somebody edited the title.
              done: draft.done,
              note: draft.note,
              attachments: files,
            })
          }
          else {
            await send({ title: draft.title, text: draft.text, images: files })
          }
          closeModal()
          say(null)
          await load()
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
        }
        finally {
          dispatch({ type: 'busy', busy: false })
        }
      }, [state.draft, state.modal, state.tab, closeModal, say, load])

      const confirmDelete = useCallback(async () => {
        const id = state.modal?.id
        if (typeof id !== 'string') return
        dispatch({ type: 'busy', busy: true })
        try {
          await hubCall('delete', id)
          closeModal()
          say(null)
          await load()
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
        }
        finally {
          dispatch({ type: 'busy', busy: false })
        }
      }, [state.modal, closeModal, say, load])

      // Completion, from the item's own checkbox rather than the edit form. The
      // write is the one the form used to make, minus the dialog, and it reloads
      // like every other write — so the item comes back from the store rather
      // than from a local guess a rejected write would have to be undone from.
      // Nothing is marked `busy` while it runs: that would re-render the item
      // with the completion it does not have yet and snap the box back under the
      // pointer. One completion write at a time, instead, which is what keeps a
      // double click from sending two.
      const writingDone = useRef(false)
      const toggleDone = useCallback(async (item, done) => {
        if (writingDone.current) return
        writingDone.current = true
        try {
          await hubCall('update', item.id, { done })
          say(null)
          await load()
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
        }
        finally {
          writingDone.current = false
        }
      }, [say, load])

      const copyItem = useCallback(async (item) => {
        const copied = await copyText(item.content)
        say(copied ? translate('action.copied') : translate('action.copyFailed'), copied ? 'ok' : 'error')
      }, [say])

      const setQuery = useCallback(patch => dispatch({ type: 'query', patch }), [])

      const selectView = useCallback(view => {
        uiStore.update({ view })
        writePrefs({ view })
      }, [])

      const groups = useMemo(
        () => runQuery(state.items, state.tab, query),
        [state.items, state.tab, query],
      )

      const visible = useMemo(() => groups.reduce((total, group) => total + group.items.length, 0), [groups])

      // The grid's column count follows the measured width, so the n-by-m layout
      // tracks the window instead of a hard-coded column count. It mirrors the
      // CSS `auto-fill` rule rather than replacing it: the stylesheet still owns
      // the track sizing, and this only decides how many skeleton tiles to draw.
      const columns = Math.max(1, Math.round((gridWidth + CARD_GAP) / (CARD_MIN + CARD_GAP)))

      const modalItem = useMemo(() => {
        if (state.modal === null) return null
        if (state.modal.kind === 'create' || state.modal.kind === 'edit') return null
        return state.items.find(item => item.id === state.modal.id) ?? null
      }, [state.modal, state.items])

      const searching = query.search.trim() !== ''
      const holding = pinned || state.modal !== null

      const handleClick = useCallback(() => {
        clearCollapse()
        setExpanded(true)
        setPinned(true)
      }, [clearCollapse])

      const body = state.phase === 'loading'
        ? (ui.view === 'grid'
          ? GridSkeleton({ count: columns * 2 })
          : RowSkeleton({ count: 7 }))
        : state.phase === 'broken' || state.phase === 'error'
          ? h('div', { className: 'hub-broken' }, [
            h('span', { key: 'i', className: 'hub-broken-mark' }, h(Icon, { name: 'warning', size: 22 })),
            h('span', { key: 't' }, translate(state.phase === 'broken' ? 'state.broken' : 'state.failed')),
            state.phase === 'broken' ? h('span', { key: 'h', className: 'hub-broken-hint' }, translate('state.broken.hint')) : null,
            h('span', { key: 'd', className: 'hub-broken-detail' }, failureText(state.failure)),
            h('button', { key: 'r', type: 'button', className: 'hub-text-button', onClick: () => { void load() } },
              translate('action.retry')),
          ])
          : visible === 0
            ? (searching || query.filter !== 'all'
              // DESIGN.md §8: the empty state is one add button and nothing
              // else, so the search-empty case keeps to the same one-mark rule.
              ? h('div', { className: 'hub-empty' },
                h('span', { className: 'hub-empty-mark' }, h(Icon, { name: 'search', size: 22 })))
              : h('div', { className: 'hub-empty' },
                h('button', {
                  type: 'button',
                  className: 'hub-empty-add',
                  title: translate('action.create'),
                  'aria-label': translate('action.create'),
                  onClick: openCreate,
                }, h(Icon, { name: 'plus', size: 24 }))))
            : h('div', { className: 'hub-groups' },
              groups.map(group => h('section', { key: group.id, className: 'hub-group' }, [
                group.labelKey === null && group.label === undefined
                  ? null
                  : h('div', { key: 'h', className: 'hub-group-head' }, [
                    h('span', { key: 'l' }, group.labelKey === null ? group.label : translate(group.labelKey)),
                    h('span', { key: 'r', className: 'hub-group-rule' }),
                    h('span', { key: 'c', className: 'hub-group-count' },
                      `${group.items.length} ${translate('count.unit')}`),
                  ]),
                ui.view === 'grid'
                  ? h('div', { key: 'g', className: 'hub-grid' },
                    group.items.map((item, index) => ItemCard({
                      key: item.id,
                      item,
                      index,
                      onOpen: openDetail,
                      onToggle: (target, done) => { void toggleDone(target, done) },
                      onCopy: item => { void copyItem(item) },
                      onDelete: askDelete,
                    })))
                  : h('div', { key: 'g', className: 'hub-rows' },
                    group.items.map((item, index) => ItemRow({
                      key: item.id,
                      item,
                      index,
                      onOpen: openDetail,
                      onToggle: (target, done) => { void toggleDone(target, done) },
                      onCopy: item => { void copyItem(item) },
                      onDelete: askDelete,
                    }))),
              ])))

      // The stylesheet is a React element rather than an inserted one: a
      // `dsh.client` bundle has no `styles.insert`, and tying the rule sheet to
      // this component's lifetime means unloading the entry removes it too.
      return h(React.Fragment, null, [
        h('style', { key: 'sheet' }, STYLES),
        h('div', {
          key: 'root',
          className: 'hub-root',
          'data-edge': ui.edge,
          'data-expanded': String(expanded),
          // Entering the rail is not an invitation to open the panel: on a left
          // or right dock the rail is the whole window height while the handle is
          // a 176px mark in the middle of it, so entering the rail would pop the
          // panel open under a pointer that never went near the handle. `expand`
          // belongs on the handle; `onPointerLeave` stays here so moving from the
          // handle into the panel does not start the idle countdown.
          onPointerLeave: holding ? undefined : scheduleCollapse,
          onKeyDown: onPanelKey,
        }, [
          h('button', {
            key: 'handle',
            type: 'button',
            className: 'hub-handle',
            title: translate('action.openPanel'),
            'aria-label': translate('action.openPanel'),
            'aria-expanded': String(expanded),
            onPointerEnter: expand,
            onClick: handleClick,
          }, h('span', { className: 'hub-handle-mark' }, h(Icon, { name: 'hub', size: 16 }))),
        expanded
          ? h('div', { key: 'panel', className: 'hub-surface' }, [
            h('div', { key: 'head', className: 'hub-head' }, [
              h('span', { key: 'title', className: 'hub-title' },
                h(Icon, { name: 'hub', size: 15 }),
                translate('panel.title')),
              h('div', { key: 'search', className: 'hub-search-wrap' }, [
                h('span', { key: 'i', className: 'hub-search-lead' }, h(Icon, { name: 'search', size: 13 })),
                h('input', {
                  key: 'input',
                  type: 'search',
                  className: 'hub-search',
                  value: query.search,
                  'aria-label': translate('action.search'),
                  placeholder: translate('action.search'),
                  onChange: event => setQuery({ search: event.target.value }),
                }),
              ]),
              h('div', { key: 'tools', className: 'hub-tools' }, [
                IconButton({
                  key: 'create',
                  icon: 'plus',
                  label: translate('action.create'),
                  onClick: openCreate,
                }),
                IconButton({
                  key: 'sort',
                  icon: 'sort',
                  label: translate('action.sort'),
                  on: menu === 'sort',
                  onClick: () => setMenu(current => (current === 'sort' ? 'none' : 'sort')),
                }),
                IconButton({
                  key: 'view',
                  icon: ui.view === 'grid' ? 'grid' : 'rows',
                  label: translate(ui.view === 'grid' ? 'action.viewGrid' : 'action.viewList'),
                  onClick: () => selectView(ui.view === 'grid' ? 'list' : 'grid'),
                }),
                IconButton({
                  key: 'dock',
                  icon: 'dock' + (ui.edge === 'left' ? 'Left' : ui.edge === 'right' ? 'Right' : 'Bottom'),
                  label: translate('action.dock'),
                  on: menu === 'dock',
                  onClick: () => setMenu(current => (current === 'dock' ? 'none' : 'dock')),
                }),
                IconButton({
                  key: 'theme',
                  icon: themePreference === 'light'
                    ? 'sun'
                    : themePreference === 'dark' ? 'moon' : 'monitor',
                  label: translate('action.theme'),
                  on: menu === 'theme',
                  onClick: () => setMenu(current => (current === 'theme' ? 'none' : 'theme')),
                }),
                IconButton({
                  key: 'close',
                  icon: 'close',
                  label: translate('action.close'),
                  onClick: () => { setExpanded(false); setPinned(false); setMenu('none') },
                }),
              ]),
            ]),
            h('div', { key: 'meta', className: 'hub-meta' }, [
              h('span', { key: 'n' }, `${visible} ${translate('count.unit')}`),
              h('span', { key: 's', className: 'hub-meta-sort', 'data-direction': query.direction },
                translate(SORT_FIELD_LABEL_KEY[state.tab][query.field]),
                h(Icon, { key: 'c', name: 'chevronDown', size: 11 })),
            ]),
            menu !== 'none' && menu !== 'sort'
              ? h(FrameMenu, {
                key: 'menu',
                menu,
                edge: ui.edge,
                preference: themePreference,
                onClose: () => setMenu('none'),
              })
              : null,
            menu === 'sort'
              ? h(SortMenu, { key: 'sort', kind: state.tab, query, onQuery: setQuery })
              : null,
            // One measured node for every group: a ref shared across the per-group
            // grids would only ever hold the last one React attached it to.
            h('div', { key: 'body', className: 'hub-body', ref: gridRef }, body),
            state.notice === null
              ? null
              : h('div', { key: 'notice', className: 'hub-notice', 'data-tone': state.notice.tone },
                state.notice.text),
            h('div', {
              key: 'tabs',
              className: 'hub-tabs',
              role: 'tablist',
              // One indicator translated by the tab index, so the selection
              // travels between the three tabs instead of snapping.
              style: { '--hub-tab-index': String(KINDS.indexOf(state.tab)) },
            }, [
              h('span', { key: 'thumb', className: 'hub-tab-thumb' }),
              KINDS.map(kind => h('button', {
                key: kind,
                type: 'button',
                role: 'tab',
                className: 'hub-tab',
                'aria-selected': String(kind === state.tab),
                onClick: () => { setMenu('none'); dispatch({ type: 'tab', tab: kind }) },
              }, [
                h(Icon, { key: 'i', name: KIND_ICON[kind], size: 13 }),
                translate(KIND_LABEL_KEY[kind]),
              ])),
            ]),
            state.modal !== null
              ? (state.modal.kind === 'create' || state.modal.kind === 'edit'
                ? h(CreateModal, {
                  key: 'create',
                  kind: state.tab,
                  editing: state.modal.kind === 'edit',
                  draft: state.draft ?? { title: '', description: '', text: '', files: [] },
                  busy: state.busy,
                  onDraft: value => dispatch({ type: 'draft/merge', draft: value }),
                  onPickFiles: files => { void pickFiles(files) },
                  onSubmit: () => { void submit() },
                  onClose: closeModal,
                })
                : state.modal.kind === 'detail' && modalItem !== null
                  ? h(DetailModal, {
                    key: 'detail',
                    item: modalItem,
                    onCopy: item => { void copyItem(item) },
                    onEdit: openEdit,
                    onClose: closeModal,
                  })
                  : state.modal.kind === 'delete' && modalItem !== null
                    ? h(DeleteModal, {
                      key: 'delete',
                      item: modalItem,
                      busy: state.busy,
                      onConfirm: () => { void confirmDelete() },
                      onClose: closeModal,
                    })
                    : null)
              : null,
          ])
          : null,
        ]),
      ])
    }

    /* ==================================================================== *
     * 8. apply(ctx) — the seat registration
     * ==================================================================== */

    /**
     * Mount the Client half.
     *
     * The Remote contribution is mounted here and awaited before the seat is
     * registered, so the panel's first `list()` never races the namespace into
     * existence. A refused mount is remembered rather than thrown: the panel
     * still mounts and reports the real reason, which is the difference between
     * "no Hub Remote here" and "the Hub Remote refused this composition".
     *
     * @param ctx Client context carrying the injected `slots` and `locale`.
     * @returns A disposer withdrawing the Remote contribution with the entry.
     */
    async function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'hub: dictionaries')
      translate = ctx.locale.bind(NS)
      // Read through `ctx.get`, never as properties: a property read of an
      // undeclared service throws, and declaring either of these in `inject`
      // would park the entry forever where the carrier is absent.
      readNamespace = () => ctx.get(HUB_KEY)
      readTheme = () => ctx.get('theme')
      subscribeTheme = listener => ctx.on('theme/change', listener)

      const mount = async () => {
        const remote = ctx.get(REMOTE_KEY)
        if (typeof remote?.$mount !== 'function') {
          throw new HubBridgeMissing(`this composition has no Remote carrier: ctx.get("${REMOTE_KEY}") is absent`)
        }
        return await remote.$mount(CONTRIBUTION)
      }
      // Not memoized on failure: every later attempt is what the panel's retry
      // button promises, and a refused contribution is cheap to refuse again.
      // A mount already in flight is joined rather than raced, because a second
      // `$mount` of the same package is rejected as a duplicate registration.
      ensureBridge = async () => {
        if (disposeBridge !== null) return
        mounting ??= mount()
          .then(
            dispose => { disposeBridge = dispose; bridgeFailure = null },
            error => {
              bridgeFailure = new HubBridgeMissing(
                `mounting the Hub Remote contribution failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
              )
              throw bridgeFailure
            },
          )
          .finally(() => { mounting = null })
        return mounting
      }
      try {
        await ensureBridge()
      }
      catch (error) {
        // Swallowed on purpose: the panel below turns this into a failure state
        // with the reason in it. Throwing here would leave the seat unregistered
        // and the panel invisible, which reports less than the message does.
        void error
      }

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'hub.panel',
        order: 60,
        // A thunk, not a string: the owner re-reads it on every projection, so
        // the label follows the active locale without re-registering.
        label: () => translate('panel.title'),
      }, HubPanelEntry)), 'hub: panel seat')

      return async () => {
        if (disposeBridge === null) return
        const dispose = disposeBridge
        disposeBridge = null
        await dispose()
      }
    }

    return {
      // Only these two. Declaring `remote` or `theme` would park the entry
      // forever in a composition where the carrier is absent — see the module doc.
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
