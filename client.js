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
      'action.add': '添加',
      'action.moveUp': '上移',
      'action.moveDown': '下移',
      'action.export': '导出',
      'action.import': '导入',
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
      'group.withImages': '含图片',
      'group.textOnly': '纯文字',
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
      'field.note': '备注',
      'field.files': '附件',
      'field.images': '图片',
      'field.status': '完成状态',
      'status.pending': '待处理',
      'status.doing': '处理中',
      'status.done': '已完成',
      'status.failed': '处理失败',
      'status.onhold': '暂时搁置',
      'status.cancelled': '已取消',
      'status.manage': '管理状态',
      'status.manager': '状态管理',
      'status.manager.hint': '这是一份你自己维护的清单：改名、换颜色、调整顺序都可以。勾上「计入已完成」的状态，它的条目会落进已完成那一区。',
      'status.name': '名称',
      'status.newName': '状态名称',
      'status.terminal': '计入已完成',
      'status.tone': '颜色',
      'tone.neutral': '中性',
      'tone.info': '信息',
      'tone.brand': '品牌',
      'tone.success': '成功',
      'tone.warn': '警告',
      'tone.danger': '危险',
      'tone.muted': '弱化',
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
      'modal.deleteStatus': '删除状态',
      'modal.deleteStatus.body': '删除后，这个状态会从列表中消失。',
      'state.empty': '还没有条目',
      'state.emptySearch': '没有匹配的条目',
      'state.untitled': '未命名',
      'state.contentOptional': '可留空：标题已经说清楚时',
      'state.broken': 'Hub 桥不可用',
      'state.broken.hint': '这个组合里没有 Hub Remote，面板拿不到数据。',
      'state.failed': '操作失败',
      'state.hostOlder': '宿主比面板旧：条目里没有这些字段，这次保存会被它丢掉。改过宿主侧代码就重启 DSH 进程。',
      'count.unit': '条',
      'size.bytes': 'B',
      'size.kib': 'KB',
      'size.mib': 'MB',
      'transfer.scope': '范围',
      'transfer.scope.tab': '当前标签',
      'transfer.scope.all': '全部',
      'transfer.format': '格式',
      'transfer.format.json': 'JSON',
      'transfer.format.markdown': 'Markdown',
      'transfer.export.hint': '导出内容与 store.json 同构：version、items、statuses。',
      'transfer.import.hint': '从导出的 JSON 读入条目：id 已存在的条目会被更新，新 id 的条目会被创建。',
      'transfer.chooseFile': '选择文件',
      'transfer.import.ready': '待导入',
      'transfer.import.new': '新建',
      'transfer.import.update': '更新',
      'transfer.import.empty': '这个文件里没有条目。',
      'transfer.import.unreadable': '读不出这个文件：它不是 Hub 导出的 JSON。',
      'transfer.imported': '导入完成',
      'transfer.result.ok': '成功',
      'transfer.result.failed': '失败',
      'region.folded': '已折叠',
      'region.unfolded': '已展开',
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
      'action.add': 'Add',
      'action.moveUp': 'Move up',
      'action.moveDown': 'Move down',
      'action.export': 'Export',
      'action.import': 'Import',
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
      'group.withImages': 'With images',
      'group.textOnly': 'Text only',
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
      'field.note': 'Note',
      'field.files': 'Attachments',
      'field.images': 'Images',
      'field.status': 'Status',
      'status.pending': 'Pending',
      'status.doing': 'In progress',
      'status.done': 'Done',
      'status.failed': 'Failed',
      'status.onhold': 'On hold',
      'status.cancelled': 'Cancelled',
      'status.manage': 'Manage statuses',
      'status.manager': 'Manage statuses',
      'status.manager.hint': 'A status is an entry\'s completion state. A status marked as finished puts its entries in the finished region.',
      'status.name': 'Name',
      'status.newName': 'Status name',
      'status.terminal': 'Counts as finished',
      'status.tone': 'Colour',
      'tone.neutral': 'Neutral',
      'tone.info': 'Info',
      'tone.brand': 'Brand',
      'tone.success': 'Success',
      'tone.warn': 'Warning',
      'tone.danger': 'Danger',
      'tone.muted': 'Muted',
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
      'modal.deleteStatus': 'Delete status',
      'modal.deleteStatus.body': 'This removes the status from the list.',
      'state.empty': 'No entries yet',
      'state.emptySearch': 'No matching entries',
      'state.untitled': 'Untitled',
      'state.contentOptional': 'Optional — leave blank when the title says it all',
      'state.broken': 'Hub bridge unavailable',
      'state.broken.hint': 'This composition has no Hub Remote, so the panel cannot read data.',
      'state.failed': 'The operation failed',
      'state.hostOlder': 'The Host is older than the panel: its items carry none of these fields, so it drops this save. Restart the DSH process after changing Host-side code.',
      'count.unit': 'entries',
      'size.bytes': 'B',
      'size.kib': 'KB',
      'size.mib': 'MB',
      'transfer.scope': 'Scope',
      'transfer.scope.tab': 'Current tab',
      'transfer.scope.all': 'Everything',
      'transfer.format': 'Format',
      'transfer.format.json': 'JSON',
      'transfer.format.markdown': 'Markdown',
      'transfer.export.hint': 'The export carries the shape store.json does: version, items, statuses.',
      'transfer.import.hint': 'Reads entries from an exported JSON file: a known id is updated, a new id is created.',
      'transfer.chooseFile': 'Choose a file',
      'transfer.import.ready': 'To import',
      'transfer.import.new': 'New',
      'transfer.import.update': 'Update',
      'transfer.import.empty': 'This file holds no entries.',
      'transfer.import.unreadable': 'This file could not be read: it is not a Hub JSON export.',
      'transfer.imported': 'Import finished',
      'transfer.result.ok': 'Imported',
      'transfer.result.failed': 'Failed',
      'region.folded': 'collapsed',
      'region.unfolded': 'expanded',
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
      arrowUp: [{ t: 'path', a: { d: 'M12 19V5M6 11l6-6 6 6' } }],
      arrowDown: [{ t: 'path', a: { d: 'M12 5v14M6 13l6 6 6-6' } }],
      sliders: [
        { t: 'path', a: { d: 'M4 8h9M17.5 8H20M4 16h3.5M12 16h8' } },
        { t: 'circle', a: { cx: 15, cy: 8, r: 2.2 } },
        { t: 'circle', a: { cx: 9.5, cy: 16, r: 2.2 } },
      ],
      exportFile: [
        { t: 'path', a: { d: 'M12 15.5v-11M12 4.5l-3.5 3.5M12 4.5l3.5 3.5' } },
        { t: 'path', a: { d: 'M4.5 13v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V13' } },
      ],
      importFile: [
        { t: 'path', a: { d: 'M12 8.5v11M12 19.5l-3.5-3.5M12 19.5l3.5-3.5' } },
        { t: 'path', a: { d: 'M4.5 11V5.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1V11' } },
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

    /**
     * The tallest the status popover ever gets.
     *
     * The stylesheet and the placement share it: the popover flips above the
     * badge when there is not this much room below it, so the two cannot
     * disagree about how tall it is.
     */
    const POPOVER_MAX_HEIGHT = 320

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

  /* One easing, four durations. Every transition below is a reply to
     something the pointer or the keyboard just did. */
  --hub-ease: cubic-bezier(.22,.61,.36,1);
  /* Below 100ms on purpose: a region folding is the user confirming a click,
     not the panel performing a gesture, and anything slower reads as lag on the
     press rather than as motion answering it. */
  --hub-instant: 90ms;
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
  /* The surface does not clip: the status popover is its own child and is
     positioned against it, and a clip here would cut the popover off at the
     panel's edge. The body scrolls on its own, so nothing else needed this. */
  overflow: visible;
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

/* A one-line bar between the header and the list: how much is on screen, and
   the control that says what it is ordered by. */
.hub-meta {
  display: flex; align-items: center; gap: 8px;
  flex: 0 0 auto; height: 24px; padding: 0 var(--hub-gutter);
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .04em;
  border-bottom: 1px solid var(--hub-line);
}
/* The current sort, drawn as the control it is. The chevron turns with the
   direction, so this has always read as a dropdown; the button chrome is reset
   to the meta row's own type and ink rather than a second button style, and the
   replies it gives are the hub-tool ones at text size. Note that this block is
   a template literal: a backtick in a comment ends the stylesheet. */
.hub-meta-sort {
  display: inline-flex; align-items: center; gap: 4px;
  margin: 0 0 0 auto; padding: 2px 5px;
  border: none; border-radius: 6px;
  background: transparent; color: inherit;
  font: inherit; letter-spacing: inherit; cursor: pointer;
  transition: background var(--hub-fast) ease, color var(--hub-fast) ease;
}
.hub-meta-sort:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-meta-sort:active { transform: scale(.97); }
.hub-meta-sort[data-on="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--hub-ink); }
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
   The live region. A fold is a state change with no visible text of its own,
   so the announcement is made here rather than read off the header: the
   header already carries aria-expanded, and a screen reader that is looking
   at the list is not looking at the button that moved.
   -------------------------------------------------------------------------- */
.hub-live {
  position: absolute; width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* --------------------------------------------------------------------------
   Groups: a label, a hairline that runs to the gutter, and a count. The rule
   is the structural device — it says "these belong together" without drawing
   a box around them.
   -------------------------------------------------------------------------- */
.hub-groups { display: flex; flex-direction: column; padding-bottom: 8px; }
.hub-group { margin-top: 10px; }
.hub-group:first-child { margin-top: 4px; }
.hub-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 0 6px;
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .06em;
}
.hub-group-rule { flex: 1 1 auto; height: 1px; background: var(--hub-line); }
.hub-group-count { color: var(--hub-ink-3); letter-spacing: 0; }

/* --------------------------------------------------------------------------
   Regions. A TODO's regions are its statuses, one region each: a task in
   progress and a task on hold are both unfinished, and filing them under one
   header says the same thing twice. The status list is the frame, and the
   order the user curates it in is the order the regions appear in. Note and
   Prompt have no status and render as a single unlabelled region, so nothing
   here shows for them.

   The body collapses on grid-template-rows 0fr -> 1fr, which is the one height
   transition that measures its own content — max-height needs a number the
   panel would have to keep in step with every card, and height:auto does not
   transition at all. The inner box carries the overflow:hidden that lets an fr
   track shrink below its content, and therefore does the clipping; the padding
   that would cost at zero height is why the space below the last card lives on
   .hub-groups instead, inside the clip.
   -------------------------------------------------------------------------- */
.hub-regions { display: flex; flex-direction: column; }
/* The empty height a windowed list leaves out, so the scroll range still
   describes the whole list and the scrollbar stays where the content is. */
.hub-spacer { flex: 0 0 auto; }
.hub-region-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  margin-top: 10px; padding: 5px 4px;
  border: none; border-radius: 7px;
  background: transparent; color: var(--hub-ink-2);
  font: inherit; font-size: 11.5px; text-align: left; cursor: pointer;
  transition: background var(--hub-instant) ease, color var(--hub-instant) ease;
}
.hub-region:first-child .hub-region-head { margin-top: 4px; }
.hub-region-head:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-region-head:active { transform: scale(.995); }
/* The region's dot is the status's own dot, at the header's scale: the header
   and the badges under it are the same thing, so they wear the same colour. */
.hub-region-dot { display: flex; flex: 0 0 auto; }
.hub-region-dot .hub-status-dot { width: 8px; height: 8px; }
.hub-region-label { font-weight: 500; }
.hub-region-chevron {
  display: flex; flex: 0 0 auto; margin-left: auto; color: var(--hub-ink-3);
  transition: transform var(--hub-instant) var(--hub-ease);
}
.hub-region-head[aria-expanded="true"] .hub-region-chevron { transform: rotate(180deg); }
.hub-region-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--hub-instant) var(--hub-ease);
}
.hub-region[data-open="true"] .hub-region-body { grid-template-rows: 1fr; }
/* A folded region is not merely short. Without this the items inside it stay
   focusable and still announced — a list the eye cannot see and the keyboard
   can still walk into. The delayed step holds it visible for the length of the
   collapse and drops it the instant the fold finishes. */
.hub-region-inner {
  min-height: 0; overflow: hidden;
  visibility: hidden;
  transition: visibility 0s linear var(--hub-instant);
}
.hub-region[data-open="true"] .hub-region-inner { visibility: visible; transition-delay: 0s; }
/* The first group sits directly under its region header rather than repeating
   the margin every other group needs. */
.hub-region-inner > .hub-groups > .hub-group:first-child { margin-top: 2px; }

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
/* --------------------------------------------------------------------------
   The status badge (DESIGN.md §8.3).

   A status is a colour rather than a label, so the badge is the one place in
   the panel allowed to mix two colours: a wash of the first token is laid in
   from the left, a wash of the second from the right, and the two overlap in
   the middle. Each wash is masked by a radial gradient that fades it towards
   the other side, so the two bleed into each other instead of meeting at a
   seam. The mask carries alpha only, so its opaque end may be any opaque
   token — the ink — and no literal colour is needed anywhere.

   The pane is frosted, so the card's own fill shows through it: the badge sits
   *on* the card rather than over it, and picks up the plane's depth instead of
   floating free.
   -------------------------------------------------------------------------- */
.hub-status {
  /* The pair of tokens a tone maps to; overridden per tone below. */
  --hub-status-a: var(--dsw-alias-label-secondary);
  --hub-status-b: var(--dsw-alias-border-l2);
  /* How hard the washes are laid on. The dot is the same mix at a smaller
     scale, so it is allowed to sit nearer full strength than the badge. */
  --hub-status-strength: 34%;

  position: relative;
  display: inline-flex; align-items: center; gap: 5px;
  flex: 0 0 auto;
  height: 20px; padding: 0 8px;
  border: 1px solid var(--hub-line); border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-3) 48%, transparent);
  backdrop-filter: blur(9px) saturate(150%);
  -webkit-backdrop-filter: blur(9px) saturate(150%);
  color: var(--hub-ink);
  font: inherit; font-size: 10.5px; line-height: 1;
  cursor: pointer; overflow: hidden;
  /* The glass edge and the lift. The blur above frosts whatever is behind the
     pane, and these two are what make it read as a pane rather than as a fill:
     a bright rim along the top edge, and a shadow under it. */
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--hub-ink) 12%, transparent),
    0 1px 2px color-mix(in srgb, var(--hub-ink) 16%, transparent);
  transition: border-color var(--hub-fast) ease, transform var(--hub-fast) var(--hub-ease);
}
.hub-status:hover { border-color: var(--hub-line-strong); }
.hub-status:active { transform: scale(.97); }
/* The washes are painted over the pane's own content, so the label and the
   dot are lifted above them. */
.hub-status > * { position: relative; z-index: 1; }
.hub-status-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.hub-status-dot {
  --hub-status-strength: 92%;
  position: relative;
  display: block; flex: 0 0 auto;
  width: 9px; height: 9px; border-radius: 50%;
  overflow: hidden;
}

/* The two washes. Each is one of the tone's own tokens, faded out towards the
   other side by a radial mask whose opaque end is the ink. */
.hub-status::before, .hub-status-dot::before,
.hub-status::after, .hub-status-dot::after {
  content: '';
  position: absolute; inset: 0; z-index: 0;
  pointer-events: none;
}
.hub-status::before, .hub-status-dot::before {
  background: color-mix(in srgb, var(--hub-status-a) var(--hub-status-strength), transparent);
  -webkit-mask-image: radial-gradient(130% 160% at 0% 50%, var(--hub-ink) 0%, transparent 72%);
  mask-image: radial-gradient(130% 160% at 0% 50%, var(--hub-ink) 0%, transparent 72%);
}
.hub-status::after, .hub-status-dot::after {
  background: color-mix(in srgb, var(--hub-status-b) var(--hub-status-strength), transparent);
  -webkit-mask-image: radial-gradient(130% 160% at 100% 50%, var(--hub-ink) 0%, transparent 72%);
  mask-image: radial-gradient(130% 160% at 100% 50%, var(--hub-ink) 0%, transparent 72%);
}

/* The tone -> token pair mapping. This is the only place a tone becomes a
   colour (DESIGN.md §8.3). */
.hub-status[data-tone="neutral"],
.hub-status-dot[data-tone="neutral"],
.hub-tone-swatch[data-tone="neutral"] {
  --hub-status-a: var(--dsw-alias-label-secondary);
  --hub-status-b: var(--dsw-alias-border-l2);
}
.hub-status[data-tone="info"],
.hub-status-dot[data-tone="info"],
.hub-tone-swatch[data-tone="info"] {
  --hub-status-a: var(--dsw-alias-state-business-primary);
  --hub-status-b: var(--dsw-alias-label-primary-bluish);
}
.hub-status[data-tone="brand"],
.hub-status-dot[data-tone="brand"],
.hub-tone-swatch[data-tone="brand"] {
  --hub-status-a: var(--dsw-alias-brand-primary);
  --hub-status-b: var(--dsw-alias-label-primary-bluish);
}
.hub-status[data-tone="success"],
.hub-status-dot[data-tone="success"],
.hub-tone-swatch[data-tone="success"] {
  --hub-status-a: var(--dsw-alias-state-success-primary);
  --hub-status-b: var(--dsw-alias-state-success-secondary);
}
.hub-status[data-tone="warn"],
.hub-status-dot[data-tone="warn"],
.hub-tone-swatch[data-tone="warn"] {
  --hub-status-a: var(--dsw-alias-state-warn-primary);
  --hub-status-b: var(--dsw-alias-state-warn-secondary);
}
.hub-status[data-tone="danger"],
.hub-status-dot[data-tone="danger"],
.hub-tone-swatch[data-tone="danger"] {
  --hub-status-a: var(--dsw-alias-state-error-primary);
  --hub-status-b: var(--dsw-alias-state-error-secondary);
}
.hub-status[data-tone="muted"],
.hub-status-dot[data-tone="muted"],
.hub-tone-swatch[data-tone="muted"] {
  --hub-status-a: var(--dsw-alias-state-idle-primary);
  --hub-status-b: var(--dsw-alias-label-quaternary);
}

/* --------------------------------------------------------------------------
   The status popover: the badge's own list, placed at the badge.
   -------------------------------------------------------------------------- */
.hub-popover {
  position: absolute; z-index: 6;
  min-width: 172px; max-width: 240px; max-height: min(52vh, ${POPOVER_MAX_HEIGHT}px); overflow: auto;
  padding: 5px; border-radius: 10px;
  border: 1px solid var(--hub-line-strong);
  background: var(--hub-raised);
  box-shadow: 0 2px 6px var(--dsw-alias-bg-mask-2), 0 14px 34px var(--dsw-alias-bg-mask-2);
  transform-origin: top right;
  animation: hubMenuIn var(--hub-fast) var(--hub-ease) both;
}
.hub-popover-sep { height: 1px; margin: 4px 3px; background: var(--hub-line); }

/* --------------------------------------------------------------------------
   The status manager: one row per definition, and a row that adds one.
   -------------------------------------------------------------------------- */
.hub-hint { color: var(--hub-ink-3); font-size: 11px; line-height: 1.5; }
/* The import report: one row per entry, the failures carrying their reason.
   A summary line alone would leave the user counting a long import by hand. */
.hub-result { display: flex; flex-direction: column; gap: 1px; }
.hub-result-row {
  display: flex; align-items: baseline; gap: 6px;
  padding: 3px 6px; border-radius: 6px;
  color: var(--hub-ink-2); font-size: 11.5px;
}
.hub-result-row[data-ok="false"] { color: var(--dsw-alias-state-error-primary); }
.hub-result-mark { display: flex; flex: 0 0 auto; color: var(--hub-ink-3); }
.hub-result-row[data-ok="false"] .hub-result-mark { color: var(--dsw-alias-state-error-primary); }
.hub-result-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-result-reason { color: var(--hub-ink-3); font-size: 10.5px; }
.hub-file-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--hub-ink-2); font-size: 11.5px;
}
.hub-status-list { display: flex; flex-direction: column; gap: 5px; }
.hub-status-block { display: flex; flex-direction: column; gap: 4px; }
.hub-status-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.hub-status-row .hub-input { flex: 1 1 auto; min-width: 0; height: 24px; padding: 2px 7px; }
.hub-status-row .hub-tool { width: 20px; height: 20px; }
.hub-tool-danger:hover { color: var(--dsw-alias-state-error-primary); }
.hub-tone-swatch {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: 20px; height: 20px; padding: 0;
  border: 1px solid var(--hub-line-strong); border-radius: 50%;
  background: transparent; color: var(--hub-status-a);
  cursor: pointer;
  transition: transform var(--hub-fast) var(--hub-ease);
}
.hub-tone-swatch:hover { transform: scale(1.08); }
.hub-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: 22px; height: 18px; padding: 0;
  border: 1px solid var(--hub-line-strong); border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink-3);
  cursor: pointer;
  transition: background var(--hub-fast) ease, color var(--hub-fast) ease;
}
.hub-toggle[aria-checked="true"] {
  background: var(--dsw-alias-interactive-bg-hover-accent);
  color: var(--dsw-alias-brand-primary);
}
.hub-tone-picker {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 7px; border-radius: 8px;
  border: 1px solid var(--hub-line-strong);
  background: var(--hub-raised);
  box-shadow: 0 2px 6px var(--dsw-alias-bg-mask-2);
}
.hub-status-add {
  display: flex; align-items: center; gap: 6px;
  margin-top: 2px; padding-top: 8px;
  border-top: 1px solid var(--hub-line);
}
.hub-status-add .hub-input { flex: 1 1 auto; min-width: 0; }

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
/* The status tag carries its own colour in its dot, so it needs no tone rule of
   its own — the dot is painted from the same two-token mix as the badge. */

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
/* The dialog container is focused only to take the focus off the page behind
   it, so it wears no ring of its own: the control the user tabs to is the one
   that should be marked. */
.hub-modal:focus-visible { outline: none; }

.hub-field { display: flex; flex-direction: column; gap: 5px; }
.hub-label {
  color: var(--hub-ink-3); font-size: 10.5px; letter-spacing: .06em;
}
.hub-input, .hub-textarea {
  width: 100%; padding: 6px 8px;
  border: 1px solid var(--hub-line-strong); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--hub-ink);
  font: inherit; font-size: 12.5px;
  transition: border-color var(--hub-fast) ease, background var(--hub-fast) ease;
}
.hub-input:hover, .hub-textarea:hover { border-color: var(--hub-line-strong); background: var(--dsw-alias-interactive-bg-hover); }
.hub-input:focus, .hub-textarea:focus {
  outline: none; border-color: var(--dsw-alias-state-business-primary);
}
.hub-input::placeholder, .hub-textarea::placeholder { color: var(--hub-ink-3); }
.hub-textarea { min-height: 88px; line-height: 1.55; resize: vertical; }
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

/* --------------------------------------------------------------------------
   The priority field: a radio row the panel draws, not a platform select.

   A native select popup is rendered outside the page, by the OS, in the OS's
   own colours. The document does carry color-scheme — dsh-client-ui-layout
   projects the resolved scheme onto the document element on every theme change
   — and it still arrives light: the panel's dark form is followed by a white
   list that no token in this file can reach. So the control is drawn here
   instead, and it wears the same marks MenuGroup draws — one leading check on
   the selection, ink weight carrying the rest — laid out along a row rather
   than down a menu.
   -------------------------------------------------------------------------- */
.hub-choices {
  display: flex; gap: 2px; padding: 2px;
  border: 1px solid var(--hub-line-strong); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
}
.hub-choice {
  flex: 1 1 0; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 5px 4px;
  border: none; border-radius: 5px;
  background: transparent; color: var(--hub-ink-2);
  font: inherit; font-size: 12.5px; cursor: pointer;
  transition: background var(--hub-fast) ease, color var(--hub-fast) ease;
}
.hub-choice:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); }
.hub-choice:active { transform: scale(.975); }
.hub-choice[aria-checked="true"] {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--hub-ink); font-weight: 500;
}
.hub-choice > span:first-child {
  display: flex; flex: 0 0 auto; width: 12px; justify-content: center; color: var(--hub-ink-3);
}
.hub-choice[aria-checked="true"] > span:first-child { color: var(--hub-accent); }
.hub-choice-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
/* The panel's focus ring is a rounded rectangle, which would square off the
   controls that are round. */
.hub-status:focus-visible, .hub-toggle:focus-visible { border-radius: 999px; }
.hub-tone-swatch:focus-visible { border-radius: 50%; }
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
  .hub-card, .hub-row, .hub-scrim, .hub-modal, .hub-menu, .hub-popover, .hub-surface, .hub-notice { opacity: 1; }
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
     * Contract (with `remote.js`): `list()` -> `{ version, items, statuses }`;
     * `create(draft)`, `update(id, patch)` and `delete(id)` each -> the stored
     * `Item`, bare; `createStatus(draft)`, `updateStatus(id, patch)` and
     * `deleteStatus(id)` each -> the stored `Status`, bare. `delete` reaches the
     * Host's `remove` through the contribution's `implementation`, because the
     * namespace service owns the name `remove` itself, and `deleteStatus`
     * reaches `removeStatus` the same way. The gateway wraps every one of them
     * in a `RemoteResult` envelope, so `hubCall` unwraps it and throws what the
     * Host rejected with.
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
        // The status definitions are the Host's bytes like the items are, so
        // their CRUD travels over the same Remote.
        clientInvocation('createStatus', ['draft']),
        clientInvocation('updateStatus', ['id', 'patch']),
        // The same pairing as `delete` above: the wire says "delete", the
        // service says "remove".
        { ...clientInvocation('deleteStatus', ['id']), implementation: 'removeStatus' },
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
     * @param {'list'|'create'|'update'|'delete'|'createStatus'|'updateStatus'|'deleteStatus'} method Published Remote method name.
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
      todo: ['id', 'kind', 'title', 'description', 'category', 'priority', 'status', 'completedAt', 'attachments', 'note', 'createdAt', 'updatedAt'],
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

    /**
     * The preference key that holds which TODO regions are open.
     *
     * The regions are the statuses, and the statuses are a list the user
     * curates, so the key is a map keyed by status id rather than a pair of
     * fixed keys. A status the user later retires leaves its entry behind; it
     * is inert, because a status that is not in the list has no region to
     * fold, and the map is small.
     */
    const REGION_PREFS = 'todoRegions'

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
     * Durable presentation choices. This key carries an edge, a view and which
     * TODO regions are open — nothing else. Item bytes belong to the Host, and
     * a second copy in the browser would go stale exactly when it hurts.
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

    /**
     * Which TODO regions are open, read from the persisted map.
     *
     * A map keyed by status id, and only the entries that are actually open:
     * a folded region is the default, so storing it would grow the blob with
     * every status the user has ever seen. The two keys the previous layout
     * wrote are dropped on the way out — they named halves that no longer
     * exist, and leaving them in the blob would make it describe a panel that
     * is not this one.
     */
    function readOpenRegions() {
      const stored = storedPrefs[REGION_PREFS]
      if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {}
      const open = {}
      for (const [id, value] of Object.entries(stored)) {
        if (value === true) open[id] = true
      }
      return open
    }

    function createUiStore() {
      let state = {
        edge: EDGES.includes(storedPrefs.edge) ? storedPrefs.edge : 'right',
        view: VIEWS.includes(storedPrefs.view) ? storedPrefs.view : 'grid',
        // Every TODO region starts folded. The counts are the point of the
        // split, and a list that opens itself is the mixing it replaces — so
        // the user opens the region they came for.
        [REGION_PREFS]: readOpenRegions(),
      }
      // The two keys the previous two-region layout wrote name halves that no
      // longer exist. They are dropped once, here, so the stored blob stops
      // describing a panel that is not this one. `undefined` is how a key is
      // removed: `JSON.stringify` drops it.
      if (storedPrefs.todoOpen !== undefined || storedPrefs.todoDone !== undefined) {
        writePrefs({ todoOpen: undefined, todoDone: undefined })
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
          if (Object.keys(next).every(key => next[key] === state[key])) return
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
        // The status definitions the Host sent. They are the Host's bytes, so
        // the panel keeps exactly what arrived and never a list of its own.
        statuses: [],
        // The document's schema version, which rides the `list` envelope and is
        // what an export writes back out: an export is a store.json, so it
        // carries the same version the document it came from does.
        version: 0,
        failure: null,
        busy: false,
        queries: initialQueries(),
        modal: null,
        draft: null,
        notice: null,
        // The status picker's anchor: which item it belongs to and where the
        // badge was. One popover in the panel, not one per item.
        popover: null,
        // The manager's own scratch state: the name being typed, the tone being
        // chosen, which row has its tone chooser open, and the name each row is
        // being renamed to.
        manager: { name: '', tone: 'neutral', picker: null, drafts: {} },
      }
    }

    function panelReducer(state, action) {
      switch (action.type) {
        case 'load/start':
          return { ...state, phase: 'loading', failure: null }
        case 'load/ok':
          return {
            ...state,
            phase: 'ready',
            items: action.items,
            statuses: action.statuses,
            version: action.version,
            failure: null,
          }
        case 'load/broken':
          return { ...state, phase: 'broken', items: [], failure: action.failure }
        case 'load/fail':
          return { ...state, phase: 'error', failure: action.failure }
        case 'busy':
          return { ...state, busy: action.busy }
        case 'tab':
          return { ...state, tab: action.tab, modal: null, draft: null, popover: null }
        case 'query':
          return {
            ...state,
            queries: { ...state.queries, [state.tab]: { ...state.queries[state.tab], ...action.patch } },
          }
        case 'modal':
          // A dialog takes the panel: a popover left open would sit behind the
          // scrim, dimmed and unreachable.
          return { ...state, modal: action.modal, draft: action.draft ?? null, popover: null }
        case 'draft/merge':
          return { ...state, draft: { ...(state.draft ?? {}), ...action.draft } }
        case 'draft/append':
          return { ...state, draft: { ...(state.draft ?? {}), files: [...(state.draft?.files ?? []), ...action.files] } }
        case 'notice':
          return { ...state, notice: action.notice }
        case 'popover':
          return { ...state, popover: action.popover }
        case 'manager/draft':
          return { ...state, manager: { ...state.manager, ...action.draft } }
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

    /**
     * One object without one key.
     *
     * The manager's rename drafts are a map keyed by status id, and committing
     * one of them drops that draft rather than the others.
     *
     * @param {object} object The map.
     * @param {string} key The key to drop.
     * @returns A copy without it.
     */
    function withoutKey(object, key) {
      const next = { ...object }
      delete next[key]
      return next
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
     * The priority field's choices, least urgent first — the order the native
     * select used to list them in, so the row reads the same way the dropdown
     * did. Grouping above keeps the most urgent first, which is the opposite
     * order on purpose (§6).
     */
    const PRIORITY_CHOICES = PRIORITY_ORDER.slice().reverse()
      .map(id => ({ id, labelKey: `priority.${id}` }))

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

    /**
     * Grouping choices, per kind (§6).
     *
     * `完成状态` is absent from TODO on purpose: the status enum is the frame the
     * list is built in — `runRegions` gives every status a region of its own —
     * so a grouping choice for it would put a second set of headers inside
     * regions that are already named by a status.
     */
    const GROUP_FIELDS = {
      todo: [
        { id: 'none', labelKey: 'group.none' },
        { id: 'category', labelKey: 'group.category' },
        { id: 'priority', labelKey: 'group.priority' },
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
     * The tones a status may be painted with (DESIGN §5.1).
     *
     * A closed vocabulary rather than a setting, so it is fixed here as it is
     * fixed on the Host side: a tone the Host does not know cannot be painted,
     * and one the panel does not know would arrive unpainted.
     */
    const TONES = ['neutral', 'info', 'brand', 'success', 'warn', 'danger', 'muted']

    /**
     * Normalize the status definitions the Host sent.
     *
     * The list is the Host's and is durable bytes beside the items, so the
     * panel keeps exactly what arrived — including the order, which is the
     * order the manager offers the definitions in. A Host that sends no list at
     * all is an older Host, and an empty list is what the panel can still
     * render with.
     *
     * @param {unknown} raw The `statuses` key of the `list` envelope.
     * @returns The definitions, in the order they arrived.
     */
    function normalizeStatuses(raw) {
      if (!Array.isArray(raw)) return []
      return raw
        .filter(entry => entry !== null && typeof entry === 'object')
        .map(entry => ({
          id: String(entry.id ?? ''),
          label: String(entry.label ?? ''),
          labelKey: String(entry.labelKey ?? ''),
          tone: TONES.includes(entry.tone) ? entry.tone : 'neutral',
          done: entry.done === true,
        }))
        .filter(status => status.id !== '')
    }

    /**
     * The text a status shows (DESIGN §5.1).
     *
     * A definition the user never renamed carries a locale key and follows the
     * application's language; one they renamed carries its own text.
     *
     * @param {object} status A normalized definition.
     * @returns The text to show.
     */
    function statusText(status) {
      if (status === null || status === undefined) return ''
      return status.labelKey !== '' ? translate(status.labelKey) : status.label
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
     *
     * @param {object} raw The item as `list` returned it.
     * @param {Map<string, object>} statusIndex The status definitions by id.
     * @returns The normalized item.
     */
    function normalizeItem(raw, statusIndex) {
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
      // The status a TODO is in, and the definition behind it. An item whose
      // status no definition carries — a Host that predates the enum — keeps
      // the old boolean's meaning, so the panel still reads right while the
      // "the Host is older" notice says what is missing.
      const status = kind === 'todo' ? String(raw.status ?? '') : ''
      const definition = kind === 'todo' ? (statusIndex.get(status) ?? null) : null
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
        status,
        statusDef: definition,
        // "Finished" is a property of the status, not of the item: one flag,
        // read by one rule, so the two cannot drift apart. A status no
        // definition carries is not terminal — a task cannot be sitting in a
        // state that does not exist — and an older Host's boolean is read
        // instead, so the panel keeps working against one.
        done: kind === 'todo'
          ? (definition !== null ? definition.done === true : raw.done === true)
          : false,
        // A TODO finished before this field existed carries no stamp, and `0`
        // sorts it as the oldest completion rather than as the newest.
        completedAt: kind === 'todo' ? Date.parse(raw.completedAt) || 0 : 0,
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
     * `completedAt` is the one field id that is not in `SORT_FIELDS`: the menu
     * does not offer it, because a terminal status's region orders itself by it
     * whatever the user chose (see `runRegions`). It lives here rather than in a
     * comparator of its own so that the `createdAt`/`id` tiebreak below still
     * ends the ordering.
     *
     * @param {object} a First normalized item.
     * @param {object} b Second normalized item.
     * @param {string} field Field id from `SORT_FIELDS`, or `completedAt`.
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
        case 'completedAt': difference = a.completedAt - b.completedAt; break
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
        // The status is not a grouping choice — it is the frame the TODO list is
        // built in, and `runRegions` gives every status a region of its own.
        // Anything unrecognised lands here too, so a query naming an option this
        // build has dropped reads as one flat group rather than as a silent
        // split.
        return [{ id: 'none', labelKey: null, items }]
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

    /** Every item across a region's groups, and their count. */
    function regionTotal(groups) {
      return groups.reduce((total, group) => total + group.items.length, 0)
    }

    /**
     * Split a kind's items into the regions the panel frames them in.
     *
     * **A TODO's regions are its statuses.** The list used to be split into two
     * hard-coded halves — unfinished above finished — which was all a boolean
     * could express. The status enum is finer-grained than that: "in progress"
     * and "on hold" are both unfinished, and a list that files them together
     * says the same thing twice. So every status is a region of its own, in the
     * order the user curates them, and the terminal flag decides what a region
     * *orders* by rather than which half an item is in.
     *
     * The split runs *before* the pipeline so search, filter, sort and grouping
     * all still apply inside each region rather than across the seam.
     *
     * A **terminal** status's region orders itself by completion, newest first,
     * whatever the user chose in the sort menu — a log whose newest entry is
     * not at the top is not a log. Every other region follows the menu, and
     * the menu is not silently contradicted: it is the terminal region that
     * overrides.
     *
     * A region with nothing in it is not returned at all, so a filter that hides
     * a status leaves no empty header behind, and a region appears at the
     * moment there is something to put in it.
     *
     * A TODO whose status **no definition carries** is in no region at all —
     * a Host that predates the enum sends no definitions, and a definition the
     * user retired leaves the items that carried it behind. Filing them in
     * their own unlabelled region is what keeps the panel from showing an
     * empty list over a store full of items; the skew notice is what says why.
     *
     * @param {object[]} items Every normalized item the Host returned.
     * @param {string} kind The active tab.
     * @param {object} query The tab's query state.
     * @param {object[]} statuses The status definitions, in the user's order.
     * @returns the regions, in display order, each with its own groups.
     */
    function runRegions(items, kind, query, statuses) {
      // A Note or a Prompt has no status, so it is one undivided list with
      // nothing to fold and nothing to name.
      if (kind !== 'todo') return [{ id: 'all', groups: runQuery(items, kind, query) }]
      const todo = items.filter(item => item.kind === 'todo')
      const known = new Set(statuses.map(status => status.id))
      const regions = statuses
        .map(status => ({
          // The status id is the region's id: it is what the item carries, and
          // what the fold state is remembered against.
          id: status.id,
          status,
          groups: runQuery(
            todo.filter(item => item.status === status.id),
            kind,
            status.done === true ? { ...query, field: 'completedAt', direction: 'desc' } : query,
          ),
        }))
        .filter(region => regionTotal(region.groups) > 0)
      const unfiled = todo.filter(item => !known.has(item.status))
      if (unfiled.length > 0) {
        regions.push({ id: 'unfiled', groups: runQuery(unfiled, kind, query) })
      }
      return regions
    }

    /* ==================================================================== *
     * 7. Components
     * ==================================================================== */

    /* --- Windowed rendering ------------------------------------------------
     * A long list is drawn as a window rather than in full. The body is one
     * scroll container over regions, groups and rows, so the window is taken
     * against that one scroll and everything outside it is replaced by empty
     * height. It is the same components with a slice — the skeletons, the
     * motion and the fold behaviour are the windowed path's too. */

    /**
     * Items below which the whole list is drawn.
     *
     * Windowing costs a layout walk, an estimated row pitch and a scroll
     * listener, and it pays for itself only once the DOM is the bottleneck:
     * below this the whole list is cheaper to draw than to measure.
     */
    const WINDOW_THRESHOLD = 200

    /** Rows drawn above and below the window, so a fast scroll is never blank. */
    const WINDOW_OVERSCAN = 8

    /**
     * The estimated pitch of one row, per view.
     *
     * An estimate, and the one number here that starts unmeasured: the window
     * is placed by it, so a list whose rows are taller than this renders a
     * little late and a shorter one a little early. It is corrected once
     * against the rows actually drawn (see `HubPanelEntry`), and the overscan
     * is what absorbs the difference until then.
     */
    const ROW_PITCH = { grid: 112, list: 70 }

    /** The heights the layout walk charges for the two kinds of header. */
    const REGION_HEAD_HEIGHT = 34
    const GROUP_HEAD_HEIGHT = 30

    /**
     * The viewport the window opens with.
     *
     * The body is measured as soon as it is laid out; this is what the first
     * paint of a long list uses, and it is the panel's own height less its
     * header and meta row.
     */
    const FALLBACK_VIEWPORT = 470

    /**
     * The slice of the panel the window covers.
     *
     * The walk charges every header and row its estimated pitch, keeps the
     * blocks that overlap `[reach, limit]`, and records the gap in front of
     * each kept block. Those gaps are drawn as empty boxes, so the scroll range
     * still describes the whole list and the scrollbar stays where the content
     * is. A block outside the window is skipped whole rather than measured,
     * which is what keeps a thousand-item list from costing a thousand-item
     * walk.
     *
     * @param regions The regions `runRegions` produced.
     * @param view The active view, which picks the row pitch.
     * @param openRegions The persisted fold map.
     * @param scrollTop The body's scroll offset.
     * @param viewport The body's height.
     * @param pitch The row pitch to charge, corrected or estimated.
     * @returns `{ height, tail, regions }`, or `null` when nothing is drawn.
     */
    function windowLayout(regions, view, openRegions, scrollTop, viewport, pitch) {
      const row = pitch ?? ROW_PITCH[view] ?? ROW_PITCH.grid
      const reach = scrollTop - WINDOW_OVERSCAN * row
      const limit = scrollTop + viewport + WINDOW_OVERSCAN * row
      const drawn = []
      let offset = 0
      // The bottom of the last block actually drawn, so the gap recorded in
      // front of the next one is the height the skipped blocks left behind.
      let placed = 0
      for (const region of regions) {
        const labelled = region.status !== null && region.status !== undefined
        const regionTop = offset
        const regionHeadEnd = labelled ? regionTop + REGION_HEAD_HEIGHT : regionTop
        if (labelled) offset = regionHeadEnd
        // A folded region keeps its header and nothing else, exactly as the
        // unfolded render does.
        const open = !labelled || openRegions[region.id] === true
        const groups = []
        if (open) {
          for (const group of region.groups) {
            const headed = !(group.labelKey === null && group.label === undefined)
            const groupTop = offset
            const groupHeadEnd = headed ? groupTop + GROUP_HEAD_HEIGHT : groupTop
            if (headed) offset = groupHeadEnd
            const rowsTop = offset
            const rowsEnd = rowsTop + group.items.length * row
            offset = rowsEnd
            if (rowsEnd < reach || rowsTop > limit) continue
            const start = Math.max(0, Math.min(
              group.items.length - 1,
              Math.floor((reach - rowsTop) / row),
            ))
            const end = Math.min(
              group.items.length,
              Math.max(start + 1, Math.ceil((limit - rowsTop) / row)),
            )
            const drawHead = headed && groupHeadEnd > reach
            const headPad = Math.max(0, (drawHead ? groupTop : groupHeadEnd) - placed)
            placed = groupHeadEnd
            groups.push({
              group,
              drawHead,
              headPad,
              rowsPad: Math.max(0, rowsTop - placed),
              start,
              end,
            })
            placed = rowsTop + (end - start) * row
          }
        }
        if (regionTop > limit || offset < reach) continue
        const drawHead = labelled && regionHeadEnd > reach
        // A region whose header has scrolled past and whose rows are all
        // outside the window has nothing to draw. Skipping it leaves its whole
        // height to the gap in front of the next block that is drawn.
        if (!drawHead && groups.length === 0) continue
        const headPad = Math.max(0, (drawHead ? regionTop : regionHeadEnd) - placed)
        placed = regionHeadEnd
        drawn.push({ region, labelled, open, drawHead, headPad, groups })
      }
      if (drawn.length === 0) return null
      return { height: offset, tail: Math.max(0, offset - placed), regions: drawn }
    }

    /** Empty height, so a windowed list keeps the scroll range it would have. */
    function Spacer(props) {
      if (!(props.height > 0)) return null
      return h('div', {
        className: 'hub-spacer',
        style: { height: `${props.height}px` },
        'aria-hidden': 'true',
      })
    }

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
     * The height travels with the width because the body is the scroll
     * container the windowed list takes its viewport from: one observer, one
     * node, both numbers the layout needs.
     *
     * @returns `[ref, width, height]`.
     */
    function useMeasuredWidth() {
      const [box, setBox] = useState({ width: 0, height: 0 })
      const observer = useRef(null)
      const ref = useCallback(node => {
        if (observer.current !== null) {
          observer.current.disconnect()
          observer.current = null
        }
        if (node === null) return
        const measure = () => {
          const rect = node.getBoundingClientRect()
          setBox({ width: rect.width, height: rect.height })
        }
        if (typeof ResizeObserver === 'undefined') {
          measure()
          return
        }
        const created = new ResizeObserver(entries => {
          for (const entry of entries) {
            setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
          }
        })
        created.observe(node)
        observer.current = created
        measure()
      }, [])
      useEffect(() => () => {
        if (observer.current !== null) observer.current.disconnect()
      }, [])
      return [ref, box.width, box.height]
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

    /** One picked file as text, for an import. */
    function readTextFile(file) {
      // `File.text()` where the engine has it and the reader where it does not:
      // the picker is the platform's, so the file it hands back is the
      // platform's too, and the two name the same operation differently.
      if (typeof file?.text === 'function') return file.text()
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(`could not read "${file.name}"`))
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.readAsText(file)
      })
    }

    /* --- Import and export ---------------------------------------------------
     * Both halves go through the Remote that is already there: an export is
     * built from what `list` returned, and an import is one `create` or
     * `update` per entry. There is no second data path and no new method — a
     * transfer feature that needed one would be a feature the bridge could not
     * carry. */

    /** ISO-8601 of an epoch value, or `''` when there is no such moment. */
    function isoFromEpoch(epoch) {
      if (!Number.isFinite(epoch) || epoch <= 0) return ''
      return new Date(epoch).toISOString()
    }

    /**
     * The §5 shape of one normalized item, as the Host stores it.
     *
     * The panel holds a derived view of every item — a name, a byte total, a
     * search haystack — and none of that is the document's. An export is a
     * store.json, so it is rebuilt from the fields the model defines and the
     * derived ones are left out rather than written where the Host would only
     * drop them.
     *
     * `completedAt` travels even though an update refuses it: a create honours
     * it, so a restored TODO keeps the moment it was finished instead of being
     * stamped with the moment it was restored.
     *
     * @param item One normalized item.
     * @returns The item as the document holds it.
     */
    function toStoredItem(item) {
      const files = item.files.map(file => ({
        name: file.name,
        size: dataUrlBytes(file.dataUrl),
        dataUrl: file.dataUrl,
      }))
      const stored = { id: item.id, kind: item.kind, title: item.title }
      // An item whose timestamp the Host could not parse has none to keep, and
      // an empty string is not one: leaving the key out is what lets the Host
      // stamp it rather than refuse it.
      const created = isoFromEpoch(item.createdAt)
      const updated = isoFromEpoch(item.updatedAt)
      if (created !== '') stored.createdAt = created
      if (updated !== '') stored.updatedAt = updated
      if (item.kind === 'todo') {
        stored.description = item.content
        stored.category = item.category
        stored.priority = item.priority
        stored.status = item.status
        const completed = isoFromEpoch(item.completedAt)
        // `''` is what the document carries for an unfinished task, and an empty
        // stamp is only *read* for a terminal one — where it would be refused.
        // So an unfinished task writes its empty stamp, and a finished one with
        // no stamp of its own writes nothing and lets the Host stamp it as it
        // was created.
        if (completed !== '' || item.done !== true) stored.completedAt = completed
        stored.attachments = files
        stored.note = item.note
        return stored
      }
      stored.text = item.content
      stored.images = files
      return stored
    }

    /**
     * One kind's items as a Markdown document.
     *
     * The item's name is the heading, because that is what the panel shows and
     * what a reader scans for; what the panel knows about it follows as one
     * meta line and then the body.
     *
     * @param items The kind's items, in the order the panel lists them.
     * @param kind The kind they belong to.
     * @returns The document.
     */
    function toMarkdown(items, kind) {
      const lines = [
        `# ${translate('panel.title')}`,
        '',
        `## ${translate(KIND_LABEL_KEY[kind])} — ${items.length} ${translate('count.unit')}`,
        '',
      ]
      for (const item of items) {
        lines.push(`### ${item.name === '' ? translate('state.untitled') : item.name}`)
        const meta = []
        if (kind === 'todo') {
          meta.push(`${translate('field.priority')} ${translate(`priority.${item.priority}`)}`)
          if (item.category !== '') meta.push(`${translate('field.category')} ${item.category}`)
          if (item.statusDef !== null) meta.push(`${translate('field.status')} ${statusText(item.statusDef)}`)
        }
        const created = formatTime(item.createdAt)
        const updated = formatTime(item.updatedAt)
        if (created !== '') meta.push(`${translate('meta.created')} ${created}`)
        if (updated !== '') meta.push(`${translate('meta.updated')} ${updated}`)
        if (meta.length > 0) lines.push(meta.join(' — '))
        if (item.content !== '') lines.push('', item.content)
        // The note is what the user wrote about the item rather than in it, so
        // it reads as a quotation under the body.
        if (item.note !== '') lines.push('', `> ${item.note}`)
        if (item.files.length > 0) {
          lines.push('', `${translate('meta.files')}:`, ...item.files.map(file => `- ${file.name}`))
        }
        lines.push('')
      }
      return `${lines.join('\n')}\n`
    }

    /**
     * Hand a file to the browser's own download.
     *
     * A blob URL and an anchor the panel never keeps: the file is the user's,
     * and the panel's job is to put it somewhere they can pick it up.
     *
     * @param name The name to save under.
     * @param mime The media type.
     * @param text The file's contents.
     */
    function downloadFile(name, mime, text) {
      const url = URL.createObjectURL(new Blob([text], { type: mime }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    }

    /**
     * What an import would do, counted before it does it.
     *
     * Counted from the ids the panel already holds, because that is what
     * decides create against update, and the panel is the only side that knows
     * which of the file's ids the store already has.
     *
     * @param items The file's entries.
     * @param statuses The file's status definitions.
     * @param itemsById The stored items, keyed by id.
     * @param statusIds The stored status ids.
     * @returns The counts the confirm step shows.
     */
    function countImport(items, statuses, itemsById, statusIds) {
      const count = (list, known) => list.reduce((totals, entry) => {
        const key = String(entry.id ?? '')
        if (key !== '' && known.has(key)) totals.updates += 1
        else totals.creates += 1
        return totals
      }, { creates: 0, updates: 0 })
      return {
        items: count(items, new Set(itemsById.keys())),
        statuses: count(statuses, statusIds),
      }
    }

    /**
     * The patch a status import sends for a definition the store already has.
     *
     * `order` travels with it, so an import restores the list's order and not
     * only its contents. A definition the file renames takes the text and gives
     * up its locale key — the same rule the manager follows — and one it leaves
     * alone is sent no label at all, so it keeps following the application.
     *
     * @param raw The file's definition.
     * @param index Its position in the file.
     * @returns The patch.
     */
    function statusPatch(raw, index) {
      const patch = { order: index }
      const label = typeof raw.label === 'string' ? raw.label.trim() : ''
      if (label !== '') patch.label = label
      if (typeof raw.tone === 'string' && TONES.includes(raw.tone)) patch.tone = raw.tone
      if (typeof raw.done === 'boolean') patch.done = raw.done
      return patch
    }

    /**
     * The draft a status import sends for a definition the store does not have.
     *
     * The Host mints the id, so the file's id is only a name the entries point
     * at until this lands; `statusMap` records what it became. A definition
     * that carries a locale key and no text of its own is created from the
     * translated key, because a new definition has no key to fall back on.
     *
     * @param raw The file's definition.
     * @returns The draft.
     */
    function statusDraft(raw) {
      const label = typeof raw.label === 'string' ? raw.label.trim() : ''
      const key = typeof raw.labelKey === 'string' ? raw.labelKey : ''
      const draft = { label: label !== '' ? label : translate(key) }
      if (typeof raw.tone === 'string' && TONES.includes(raw.tone)) draft.tone = raw.tone
      if (typeof raw.done === 'boolean') draft.done = raw.done
      return draft
    }

    /**
     * The status an imported entry names, after the definitions have landed.
     *
     * @param raw The file's entry.
     * @param statusMap File status id to the id the store gave it.
     * @returns The status id to write, or `undefined` when the entry names none.
     */
    function importedStatus(raw, statusMap) {
      if (typeof raw.status !== 'string' || raw.status === '') return undefined
      return statusMap[raw.status] ?? raw.status
    }

    /** One entry's files, in the shape the Host re-measures them from. */
    function importedFiles(raw, kind) {
      const list = kind === 'todo' ? raw.attachments : raw.images
      if (!Array.isArray(list)) return undefined
      return list
        .filter(file => file !== null && typeof file === 'object')
        // `mime` and `size` are left out on purpose: the Host reads both off
        // the data URL, and a file whose declared size disagrees with its
        // payload is refused rather than repaired.
        .map(file => ({ name: String(file.name ?? ''), dataUrl: String(file.dataUrl ?? '') }))
    }

    /**
     * The create payload for one imported entry.
     *
     * `id`, `kind` and the timestamps travel because a restore is meant to
     * restore: an entry that comes back with a new id is a duplicate, and one
     * that comes back stamped now is a different entry. Everything else is the
     * §5 field set, so a field this build has never heard of is dropped here
     * exactly as the Host would drop it.
     *
     * @param raw The file's entry.
     * @param statusMap File status id to the id the store gave it.
     * @returns The payload.
     */
    function createPayload(raw, statusMap) {
      const kind = typeof raw.kind === 'string' ? raw.kind : ''
      const payload = {}
      if (typeof raw.id === 'string' && raw.id !== '') payload.id = raw.id
      if (kind !== '') payload.kind = kind
      if (typeof raw.title === 'string') payload.title = raw.title
      const content = kind === 'todo' ? 'description' : 'text'
      if (typeof raw[content] === 'string') payload[content] = raw[content]
      if (typeof raw.category === 'string') payload.category = raw.category
      if (typeof raw.priority === 'string') payload.priority = raw.priority
      const status = importedStatus(raw, statusMap)
      if (status !== undefined) payload.status = status
      if (typeof raw.note === 'string') payload.note = raw.note
      const files = importedFiles(raw, kind)
      if (files !== undefined) payload[kind === 'todo' ? 'attachments' : 'images'] = files
      for (const field of ['createdAt', 'updatedAt', 'completedAt']) {
        if (typeof raw[field] === 'string' && raw[field] !== '') payload[field] = raw[field]
      }
      return payload
    }

    /**
     * The update payload for one imported entry.
     *
     * `id`, `kind` and `createdAt` are provenance and an update refuses them,
     * and `updatedAt` and `completedAt` are the Host's to stamp — so only the
     * content fields travel. An import that moves an entry between statuses
     * does it here, the same way the badge does.
     *
     * @param raw The file's entry.
     * @param existing The stored item the id names.
     * @param statusMap File status id to the id the store gave it.
     * @returns The payload.
     */
    function updatePayload(raw, existing, statusMap) {
      const kind = existing.kind
      const payload = {}
      if (typeof raw.title === 'string') payload.title = raw.title
      const content = kind === 'todo' ? 'description' : 'text'
      if (typeof raw[content] === 'string') payload[content] = raw[content]
      if (typeof raw.category === 'string') payload.category = raw.category
      if (typeof raw.priority === 'string') payload.priority = raw.priority
      const status = importedStatus(raw, statusMap)
      if (status !== undefined) payload.status = status
      if (typeof raw.note === 'string') payload.note = raw.note
      const files = importedFiles(raw, kind)
      if (files !== undefined) payload[kind === 'todo' ? 'attachments' : 'images'] = files
      // A file that renames an entry's kind is sent the kind rather than
      // quietly dropped: an update cannot change it, and writing the other
      // kind's content field would silently do nothing. The Host refuses it
      // with the reason, which is where that rule lives.
      if (typeof raw.kind === 'string' && KINDS.includes(raw.kind) && raw.kind !== kind) {
        payload.kind = raw.kind
      }
      return payload
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
     * One item's tags: category, priority, status and attachment count.
     *
     * `withState` is off in the list and the grid, where the item already
     * carries its own badge: repeating the status as a tag costs a slot in the
     * one line the tags have. The detail dialog keeps it, because there the
     * badge is not on screen and the status would otherwise be nowhere.
     *
     * The tag names the **status**, not the coarse "finished or not": a task
     * in progress and a task on hold are both unfinished, and the detail view
     * is the one place the difference is worth spelling out.
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
      if (item.kind === 'todo' && props.withState !== false && item.statusDef !== null) {
        chips.push(h('span', { key: 'd', className: 'hub-chip' },
          StatusDot({ tone: item.statusDef.tone }),
          statusText(item.statusDef)))
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
     * The status dot: the badge's two-token mix at a smaller scale (DESIGN §8.3).
     *
     * It is the same wash of the tone's first token on the left and of its
     * second on the right, masked the same way, so the dot says at a glance
     * what the badge says in full.
     *
     * @param {{tone: string}} props The tone to paint.
     * @returns the dot element.
     */
    function StatusDot(props) {
      return h('span', { className: 'hub-status-dot', 'data-tone': props.tone })
    }

    /**
     * The status badge: the item's own completion control.
     *
     * A TODO's completion is one choice out of a list the user curates, so it
     * opens a picker rather than toggling. The badge sits at the trailing end
     * of the card's title row and of the row itself, and it stops its own
     * click: the card behind it opens the detail dialog, and opening that here
     * would put a dialog between the user and the thing they just changed.
     *
     * @param {{item: object, onOpen: (item: object, event: object) => void}} props
     * @returns the badge, or nothing for a kind that has no status.
     */
    function StatusBadge(props) {
      const item = props.item
      // An item whose status no definition carries has no badge to paint: a
      // Host that predates the enum is told so by the notice, and a pill with
      // nothing in it says less than no pill at all.
      if (item.kind !== 'todo' || item.statusDef === null) return null
      return h('button', {
        type: 'button',
        className: 'hub-status',
        'data-tone': item.statusDef.tone,
        // The accessible name says what the control *is* and what it currently
        // holds: a bare "Status" would hide the value the button shows, and the
        // value is the whole point of the control.
        'aria-label': `${translate('field.status')}: ${statusText(item.statusDef)}`,
        'aria-haspopup': 'menu',
        title: translate('field.status'),
        onClick: event => {
          event.stopPropagation()
          props.onOpen(item, event)
        },
      }, [
        h('span', { key: 'd' }, StatusDot({ tone: item.statusDef.tone })),
        h('span', { key: 't', className: 'hub-status-text' }, statusText(item.statusDef)),
      ])
    }

    /**
     * The status picker: the badge's own list of the definitions.
     *
     * One popover for the panel rather than one per item, placed at the badge
     * that opened it — the trigger's box is measured against the surface's, and
     * the popover is positioned inside the panel, so it follows the badge
     * rather than the scroll.
     */
    function StatusPopover(props) {
      return h('div', {
        className: 'hub-popover',
        role: 'menu',
        'aria-label': translate('field.status'),
        style: {
          right: `${props.right}px`,
          top: props.top === undefined ? undefined : `${props.top}px`,
          bottom: props.bottom === undefined ? undefined : `${props.bottom}px`,
        },
        onClick: event => event.stopPropagation(),
      }, [
        props.statuses.map(status => h('button', {
          key: status.id,
          type: 'button',
          className: 'hub-menu-item',
          role: 'menuitemradio',
          'aria-checked': String(status.id === props.currentId),
          onClick: () => props.onPick(status.id),
        }, [
          h('span', { key: 'i' }, status.id === props.currentId
            ? h(Icon, { name: 'check', size: 13, width: 2 })
            : StatusDot({ tone: status.tone })),
          h('span', { key: 'l' }, statusText(status)),
        ])),
        h('div', { key: 'sep', className: 'hub-popover-sep' }),
        h('button', {
          key: 'm',
          type: 'button',
          className: 'hub-menu-item',
          role: 'menuitem',
          onClick: props.onManage,
        }, [
          h('span', { key: 'i' }, h(Icon, { name: 'sliders', size: 14 })),
          h('span', { key: 'l' }, translate('status.manage')),
        ]),
      ])
    }

    /**
     * One tone in the chooser: the tone's own colour, drawn as an inline SVG so
     * the control carries a mark rather than a bare patch of colour.
     */
    function ToneSwatch(props) {
      return h('button', {
        type: 'button',
        className: 'hub-tone-swatch',
        'data-tone': props.tone,
        'aria-label': props.label,
        title: props.label,
        'aria-pressed': props.pressed === undefined ? undefined : String(props.pressed),
        onClick: props.onClick,
      }, h('svg', {
        viewBox: '0 0 24 24',
        width: 12,
        height: 12,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('circle', { cx: 12, cy: 12, r: 9 })))
    }

    /**
     * The tone chooser: the seven tones a status may be painted with.
     */
    function TonePicker(props) {
      return h('div', {
        className: 'hub-tone-picker',
        role: 'group',
        'aria-label': translate('status.tone'),
      }, TONES.map(tone => ToneSwatch({
        key: tone,
        tone,
        label: translate(`tone.${tone}`),
        pressed: tone === props.value,
        onClick: () => props.onPick(tone),
      })))
    }

    /**
     * The status manager: full CRUD over the definitions.
     *
     * Every write goes through the Remote — the definitions are the Host's
     * bytes, so a list the panel kept for itself would show a status the store
     * does not have and lose it on the next reload. Each row is one definition
     * as the Host sent it, and the row at the bottom mints a new one.
     */
    function StatusManagerModal(props) {
      const manager = props.manager
      const statuses = props.statuses
      return h(Modal, {
        title: translate('status.manager'),
        onClose: props.onClose,
        actions: [
          h('button', {
            key: 'close',
            type: 'button',
            className: 'hub-text-button',
            'data-quiet': 'true',
            onClick: props.onClose,
          }, translate('action.close')),
        ],
      }, [
        h('div', { key: 'h', className: 'hub-hint' }, translate('status.manager.hint')),
        h('div', { key: 'l', className: 'hub-status-list' },
          statuses.map((status, index) => h('div', { key: status.id, className: 'hub-status-block' }, [
            h('div', { key: 'r', className: 'hub-status-row' }, [
              ToneSwatch({
                key: 't',
                tone: status.tone,
                // The tone's own name, not "colour": seven rows all labelled
                // "colour" would say the same thing about each of them.
                label: translate(`tone.${status.tone}`),
                onClick: () => props.onPickTone(status.id),
              }),
              h('input', {
                key: 'n',
                className: 'hub-input',
                // The stored text until the user types, then their own draft:
                // a rename is committed when the field loses the focus, not on
                // every keystroke.
                value: manager.drafts[status.id] ?? statusText(status),
                'aria-label': translate('status.name'),
                onChange: event => props.onDraft({ id: status.id, name: event.target.value }),
                onBlur: () => props.onCommitName(status.id),
                onKeyDown: event => { if (event.key === 'Enter') props.onCommitName(status.id) },
              }),
              h('button', {
                key: 'd',
                type: 'button',
                className: 'hub-toggle',
                role: 'switch',
                'aria-checked': String(status.done),
                'aria-label': translate('status.terminal'),
                title: translate('status.terminal'),
                onClick: () => props.onToggleDone(status.id),
              }, status.done ? h(Icon, { name: 'check', size: 11, width: 2 }) : null),
              IconButton({
                key: 'u',
                icon: 'arrowUp',
                label: translate('action.moveUp'),
                size: 13,
                disabled: index === 0,
                onClick: () => props.onMove(status.id, -1),
              }),
              IconButton({
                key: 'dn',
                icon: 'arrowDown',
                label: translate('action.moveDown'),
                size: 13,
                disabled: index === statuses.length - 1,
                onClick: () => props.onMove(status.id, 1),
              }),
              IconButton({
                key: 'x',
                icon: 'trash',
                label: translate('action.delete'),
                size: 13,
                className: 'hub-tool hub-tool-danger',
                onClick: () => props.onDelete(status.id),
              }),
            ]),
            manager.picker === status.id
              ? h(TonePicker, {
                key: 'p',
                value: status.tone,
                onPick: tone => props.onTone(status.id, tone),
              })
              : null,
          ]))),
        h('div', { key: 'a', className: 'hub-status-add' }, [
          h('input', {
            key: 'n',
            className: 'hub-input',
            value: manager.name,
            placeholder: translate('status.newName'),
            'aria-label': translate('status.newName'),
            onChange: event => props.onDraft({ name: event.target.value }),
          }),
          ToneSwatch({
            key: 't',
            tone: manager.tone,
            label: translate(`tone.${manager.tone}`),
            onClick: () => props.onPickTone('new'),
          }),
          h('button', {
            key: 'go',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            disabled: manager.name.trim() === '' || props.busy,
            onClick: props.onAdd,
          }, translate('action.add')),
        ]),
        manager.picker === 'new'
          ? h(TonePicker, {
            key: 'p',
            value: manager.tone,
            onPick: tone => props.onDraft({ tone }),
          })
          : null,
      ])
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
          // A nested control owns its own keys. Space on the status badge opens
          // the picker and Space on an item action fires that action; both
          // bubble here, and opening the item on top of them would put the
          // detail dialog between the user and the thing they just pressed.
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
          StatusBadge({ item, onOpen: props.onStatus }),
        ]),
        // Content is optional (DESIGN §5), so an item whose title says it all
        // carries none: the box is not drawn at all rather than drawn empty,
        // which would leave a clamped gap between the name and the foot.
        item.content === ''
          ? null
          : h('div', { key: 't', className: 'hub-item-text', 'data-lines': '3' }, item.content),
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
          item.content === ''
            ? null
            : h('span', { key: 't', className: 'hub-item-text' }, item.content),
          h('span', { key: 'c', className: 'hub-item-meta' }, ItemChips({ item, withState: false })),
        ]),
        h('span', { key: 's', className: 'hub-card-size' }, formatSize(item.size)),
        ItemActions({ item, onCopy: props.onCopy, onDelete: props.onDelete }),
        StatusBadge({ item, onOpen: props.onStatus }),
      ])
    }

    /**
     * The class a node carries, whether it is a DOM node or a rendered element.
     *
     * The arrow-key walk reads the list's own children, and this file is also
     * rendered by a harness whose "DOM" is the element tree — so the two are
     * asked the same question here rather than in two places.
     *
     * @param node A DOM node or a rendered element.
     * @returns The class string, or `undefined`.
     */
    function classOf(node) {
      return typeof node?.className === 'string' ? node.className : node?.props?.className
    }

    /**
     * Move focus along one list's rows with the arrow keys.
     *
     * The grid walks by the column count, so up and down cross a row rather
     * than the whole column of a wrapping grid; the list walks by one row
     * either way. Focus moves only among the rows that are drawn, which for a
     * windowed list is the window — the rows past it are not on screen to move
     * to, and a walk that promised them would strand the focus.
     *
     * @param event The key event, whose target is the focused row.
     * @param stride Rows one vertical step covers.
     */
    function moveFocus(event, stride) {
      const step = event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowLeft' ? -1
          : event.key === 'ArrowDown' ? stride
            : event.key === 'ArrowUp' ? -stride
              : 0
      if (step === 0) return
      const container = event?.currentTarget
      if (container === null || container === undefined) return
      const rows = [...(container.children ?? [])].filter(child => {
        const name = classOf(child)
        return name === 'hub-card' || name === 'hub-row'
      })
      const current = rows.indexOf(event.target)
      if (current === -1) return
      const next = current + step
      if (next < 0 || next >= rows.length) return
      // The arrow's own job is to scroll, and the panel body is what it would
      // scroll: focus is already moving, so the page must not move under it.
      event.preventDefault()
      rows[next].focus?.()
    }

    /**
     * One group of items: a rule-and-count header when it has a label.
     *
     * `slice` is the windowed view of this group — which of its rows are drawn
     * and the empty height around them. It is absent for every list below the
     * windowing threshold, which is the same code drawing every row.
     */
    function GroupSection(props) {
      const group = props.group
      const slice = props.slice ?? null
      const start = slice === null ? 0 : slice.start
      const end = slice === null ? group.items.length : slice.end
      const headed = !(group.labelKey === null && group.label === undefined)
      const drawHead = headed && (slice === null || slice.drawHead)
      const items = group.items.slice(start, end)
      // The grid's column count follows the measured width, the same number
      // the skeleton uses, so the walk crosses a row the way the row is drawn.
      const stride = props.view === 'grid' ? Math.max(1, props.columns ?? 1) : 1
      const onKeyDown = event => moveFocus(event, stride)
      const rows = Item => items.map((item, index) => Item({
        key: item.id,
        item,
        // The position in the group, not in the window: the arrival stagger is
        // a fact about the list, and slicing it would re-stagger a scroll.
        index: start + index,
        onOpen: props.onOpen,
        onStatus: props.onStatus,
        onCopy: props.onCopy,
        onDelete: props.onDelete,
      }))
      return h('section', { className: 'hub-group' }, [
        slice === null ? null : Spacer({ key: 'sh', height: slice.headPad }),
        drawHead
          ? h('div', { key: 'h', className: 'hub-group-head' }, [
            h('span', { key: 'l' }, group.labelKey === null ? group.label : translate(group.labelKey)),
            h('span', { key: 'r', className: 'hub-group-rule' }),
            h('span', { key: 'c', className: 'hub-group-count' },
              `${group.items.length} ${translate('count.unit')}`),
          ])
          : null,
        slice === null ? null : Spacer({ key: 'sr', height: slice.rowsPad }),
        props.view === 'grid'
          ? h('div', { key: 'g', className: 'hub-grid', onKeyDown }, rows(ItemCard))
          : h('div', { key: 'g', className: 'hub-rows', onKeyDown }, rows(ItemRow)),
      ])
    }

    /**
     * One region: a header carrying its label and count, and a body that folds.
     *
     * The body stays mounted either way. Folding it to `0fr` rather than
     * unmounting it is what lets the collapse animate at all, and it keeps a
     * region's scroll position across a fold and unfold.
     *
     * A TODO's region is named by its status, and it wears that status's dot —
     * the same dot the item's badge carries, so the header and the items under
     * it read as one thing.
     *
     * A region with no status — every Note and Prompt — draws no header and
     * never folds: there is one list there, and a header over it would say
     * nothing.
     *
     * `slice` is the windowed view of this region: whether its header is still
     * on screen, and which of its groups are drawn with what gaps around them.
     * It is absent for every list below the windowing threshold.
     */
    function Region(props) {
      const region = props.region
      const status = region.status ?? null
      const labelled = status !== null
      // An unlabelled region is every Note and Prompt: one undivided list with
      // nothing to fold, so it is always open rather than folded to a header it
      // does not have.
      const open = !labelled || props.open === true
      const slice = props.slice ?? null
      const shared = {
        view: props.view,
        columns: props.columns,
        onOpen: props.onOpen,
        onStatus: props.onStatus,
        onCopy: props.onCopy,
        onDelete: props.onDelete,
      }
      // A windowed region whose header has scrolled past draws its groups
      // without it; the empty height the header would have taken is in the gap
      // in front of the first group that is drawn.
      const drawHead = labelled && (slice === null || slice.drawHead)
      return h('section', { className: 'hub-region', 'data-open': String(open) }, [
        slice === null ? null : Spacer({ key: 'rh', height: slice.headPad }),
        drawHead
          ? h('button', {
            key: 'h',
            type: 'button',
            className: 'hub-region-head',
            'aria-expanded': String(open),
            onClick: props.onFold,
          }, [
            h('span', { key: 'd', className: 'hub-region-dot' },
              StatusDot({ tone: status.tone })),
            h('span', { key: 'l', className: 'hub-region-label' }, statusText(status)),
            h('span', { key: 'c', className: 'hub-group-count' },
              `${regionTotal(region.groups)} ${translate('count.unit')}`),
            h('span', { key: 'a', className: 'hub-region-chevron' },
              h(Icon, { name: 'chevronDown', size: 12 })),
          ])
          : null,
        h('div', { key: 'b', className: 'hub-region-body' },
          h('div', { className: 'hub-region-inner' },
            h('div', { className: 'hub-groups' },
              (slice === null ? region.groups.map(group => ({ group, slice: null })) : slice.groups)
                .map(entry => GroupSection({ group: entry.group, slice: entry, ...shared }))))),
      ])
    }

    /**
     * The dialog's focusable controls, in tab order.
     *
     * A walk over the subtree rather than `querySelectorAll`, because this file
     * is also rendered by a harness whose "DOM" is the element tree: both carry
     * `children`, and only one of them carries `matches`.
     *
     * @param node The dialog, or any subtree of it.
     * @returns The controls Tab may stop on, in document order.
     */
    function focusableIn(node) {
      if (node === null || node === undefined) return []
      const found = []
      const walk = current => {
        if (current === null || typeof current !== 'object') return
        const tag = typeof current.tagName === 'string' ? current.tagName.toLowerCase() : current.type
        const tabIndex = current.tabIndex ?? current.props?.tabIndex
        const disabled = current.disabled === true || current.props?.disabled === true
        // A row the panel made focusable itself — a card, a region header — is
        // as tabbable as a button, and behind a scrim it is exactly what a trap
        // has to keep the focus out of.
        const focusable = Number(tabIndex) >= 0
          ? true
          : ['button', 'input', 'select', 'textarea'].includes(tag)
        if (focusable && !disabled) found.push(current)
        for (const child of current.children ?? []) walk(child)
      }
      walk(node)
      return found
    }

    /**
     * Hold Tab inside the dialog.
     *
     * The native walk is left alone except at the two edges: Tab off the last
     * control comes back to the first, and Shift+Tab off the first goes to the
     * last. Everything in between is the browser's own and is already right.
     *
     * @param event The key event on the dialog.
     * @param node The dialog element.
     */
    function trapTab(event, node) {
      if (event.key !== 'Tab') return
      const focusable = focusableIn(node)
      if (focusable.length === 0) return
      const current = focusable.indexOf(event.target)
      if (current === -1) return
      const last = focusable.length - 1
      if (!event.shiftKey && current === last) {
        event.preventDefault()
        focusable[0].focus?.()
      }
      else if (event.shiftKey && current === 0) {
        event.preventDefault()
        focusable[last].focus?.()
      }
    }

    /**
     * Move focus into a dialog when it opens, and back out when it closes.
     *
     * The container itself takes it rather than the first control: a delete
     * confirmation that opens with Confirm focused answers Enter with the
     * destructive branch, and a form that opens on its first field is no better
     * than one that opens on nothing. Both halves are guarded because this file
     * is also rendered without a DOM.
     *
     * @param dialog Ref to the dialog element.
     */
    function useFocusTrap(dialog) {
      useEffect(() => {
        const node = dialog.current
        if (node === null || node === undefined) return
        const previous = typeof document === 'undefined' ? undefined : document.activeElement
        node.focus?.()
        return () => { previous?.focus?.() }
      }, [dialog])
    }

    /** The shared modal frame: a scrim, a title bar with the right-hand actions. */
    function Modal(props) {
      // Focus is held inside the dialog while it is open and handed back to
      // whatever opened it when it closes: a dialog that drops the focus on the
      // page behind it is one the keyboard has already left.
      const dialog = useRef(null)
      useFocusTrap(dialog)
      return h('div', {
        className: 'hub-scrim',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': props.title,
        onClick: event => { if (event.target === event.currentTarget) props.onClose() },
      }, h('div', {
        className: 'hub-modal',
        ref: dialog,
        // Focusable so the trap has somewhere to put the focus that is not a
        // control the user did not ask for.
        tabIndex: -1,
        onKeyDown: event => trapTab(event, dialog.current),
      }, [
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

    /**
     * One labelled radio row: a closed set of choices, always visible, exactly
     * one marked.
     *
     * It brings its own label rather than going through `Field`, because
     * `Field` renders a `<label>` and a label forwards a click to the first
     * labelable descendant — which here is always the first option, so clicking
     * the word "Priority" would silently select it. The group is named with the
     * same string the label shows, so nothing is announced twice.
     *
     * @param {{labelKey: string, value: string, choices: Array<{id: string, labelKey: string}>, onSelect: (id: string) => void}} props
     * @returns the labelled radio row.
     */
    function ChoiceRow(props) {
      return h('div', { className: 'hub-field' }, [
        h('span', { key: 'l', className: 'hub-label' }, translate(props.labelKey)),
        h('div', {
          key: 'g',
          className: 'hub-choices',
          role: 'radiogroup',
          'aria-label': translate(props.labelKey),
        }, props.choices.map(choice => {
          const selected = choice.id === props.value
          return h('button', {
            key: choice.id,
            type: 'button',
            className: 'hub-choice',
            role: 'radio',
            'aria-checked': String(selected),
            onClick: () => props.onSelect(choice.id),
          }, [
            // The column is a fixed width rather than sized by the check, so the
            // labels do not jump sideways as the selection moves along the row.
            h('span', { key: 'i' }, selected ? h(Icon, { name: 'check', size: 12, width: 2 }) : null),
            h('span', { key: 'l', className: 'hub-choice-label' }, translate(choice.labelKey)),
          ])
        })),
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
      // The title summarises the content, so either one is enough to name the
      // item and either may be left blank (DESIGN §5). What is not allowed is
      // both: an entry with no words in it lists as a blank row and opens as an
      // empty dialog, and the Host refuses it anyway (`requireSomeContent`).
      const canSubmit = [draft.title, contentValue].some(value => String(value ?? '').trim() !== '')

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
            placeholder: translate('state.contentOptional'),
            onChange: event => patch(isTodo ? { description: event.target.value } : { text: event.target.value }),
          })),
        isTodo
          ? h(Field, { key: 'cat', label: translate('field.category') },
            h('input', {
              className: 'hub-input',
              value: draft.category ?? '',
              onChange: event => patch({ category: event.target.value }),
            }))
          : null,
        // Its own row rather than sharing one with the category: four choices
        // need the width, and a category is free text that only needs half.
        isTodo
          ? ChoiceRow({
            labelKey: 'field.priority',
            choices: PRIORITY_CHOICES,
            value: draft.priority ?? 'normal',
            onSelect: value => patch({ priority: value }),
          })
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
              // A filter, not a validation: the Host still refuses what it does
              // not recognise, and this only keeps the picker from offering a
              // file the store would turn away (an SVG can carry a script, and
              // every attachment is stored inline in the one document).
              accept: 'image/png,image/jpeg,image/gif,image/webp',
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
        item.content === '' ? null : h('div', { key: 'x', className: 'hub-detail-text' }, item.content),
        item.note === '' ? null : h('div', { key: 'nt', className: 'hub-detail-note' }, item.note),
        item.files.length === 0 ? null : h('div', { key: 'f', className: 'hub-file-list' },
          item.files.map((file, index) => file.mime.startsWith('image/')
            ? h('img', { key: index, className: 'hub-thumb', src: file.dataUrl, alt: file.name })
            : h('span', { key: index, className: 'hub-file' },
              h(Icon, { name: 'paperclip', size: 11 }), file.name))),
      ])
    }

    /**
     * Confirmation before a hard delete.
     *
     * The same dialog serves an item and a status definition: the wording is
     * the only difference, and a second dialog would say the same thing twice.
     */
    function DeleteModal(props) {
      return h(Modal, {
        title: translate(props.titleKey),
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
        h('div', { key: 'n', className: 'hub-detail-name' }, props.name),
        h('div', { key: 'b', className: 'hub-detail-note' }, translate(props.bodyKey)),
      ])
    }

    /** What an export covers: the tab in front of the user, or the whole store. */
    const TRANSFER_SCOPES = [
      { id: 'tab', labelKey: 'transfer.scope.tab' },
      { id: 'all', labelKey: 'transfer.scope.all' },
    ]

    /** The two formats an export is written in. */
    const TRANSFER_FORMATS = [
      { id: 'json', labelKey: 'transfer.format.json' },
      { id: 'markdown', labelKey: 'transfer.format.markdown' },
    ]

    /**
     * The export dialog: what to cover, and what to write it as.
     *
     * Two radio rows rather than four buttons, because the two questions are
     * independent — a Markdown of everything and a JSON of one tab are both
     * things a user wants, and four buttons would ask them twice.
     */
    function ExportModal(props) {
      return h(Modal, {
        title: translate('modal.export'),
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
            key: 'go',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            onClick: props.onExport,
          }, translate('action.export')),
        ],
      }, [
        h('div', { key: 'h', className: 'hub-hint' }, translate('transfer.export.hint')),
        ChoiceRow({
          key: 's',
          labelKey: 'transfer.scope',
          choices: TRANSFER_SCOPES,
          value: props.choice.scope,
          onSelect: value => props.onChoice({ scope: value }),
        }),
        ChoiceRow({
          key: 'f',
          labelKey: 'transfer.format',
          choices: TRANSFER_FORMATS,
          value: props.choice.format,
          onSelect: value => props.onChoice({ format: value }),
        }),
      ])
    }

    /**
     * The import dialog: pick a file, see what it would do, then confirm.
     *
     * The file control is the one native control in the panel (DESIGN §8): the
     * picker itself has to stay the platform's, and only its button is redrawn.
     * It is restricted to what an export writes, which is a filter and not a
     * validation — the Host still refuses what it does not recognise.
     */
    function ImportModal(props) {
      const file = props.file
      const readable = file !== null && file.error === undefined
      const counts = readable
        ? countImport(file.items, file.statuses, props.itemsById, props.statusIds)
        : null
      const total = counts === null
        ? 0
        : counts.items.creates + counts.items.updates + counts.statuses.creates + counts.statuses.updates
      const ready = counts !== null && total > 0
      // What the file holds, in the words the confirm button will act on. The
      // definitions are counted with the entries because a restore that lost
      // them would produce entries the store refuses.
      const summary = counts === null ? null : [
        `${translate('transfer.import.ready')} ${counts.items.creates + counts.items.updates} ${translate('count.unit')}`,
        ' · ',
        `${translate('transfer.import.new')} ${counts.items.creates}`,
        ' · ',
        `${translate('transfer.import.update')} ${counts.items.updates}`,
        counts.statuses.creates + counts.statuses.updates === 0
          ? null
          : [
            ' · ',
            `${translate('status.manager')} ${counts.statuses.creates + counts.statuses.updates}`,
            ' · ',
            `${translate('transfer.import.new')} ${counts.statuses.creates}`,
            ' · ',
            `${translate('transfer.import.update')} ${counts.statuses.updates}`,
          ],
      ]
      return h(Modal, {
        title: translate('modal.import'),
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
            key: 'go',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            disabled: !ready || props.busy,
            onClick: props.onImport,
          }, translate('action.import')),
        ],
      }, [
        h('div', { key: 'h', className: 'hub-hint' }, translate('transfer.import.hint')),
        h(Field, { key: 'f', label: translate('transfer.chooseFile') },
          h('input', {
            key: 'input',
            type: 'file',
            className: 'hub-input',
            accept: '.json,.md',
            'aria-label': translate('transfer.chooseFile'),
            onChange: event => props.onPickFiles(event.target.files),
          })),
        file === null
          ? null
          : h('div', { key: 'n', className: 'hub-file-name' }, file.name),
        // Three states, and only one of them is a summary: no file yet says
        // nothing, a file that is not an export says so, and one that holds
        // nothing says that instead of offering an import of nothing.
        file === null
          ? null
          : h('div', { key: 'm', className: 'hub-hint' }, file.error !== undefined
            ? translate('transfer.import.unreadable')
            : total === 0
              ? translate('transfer.import.empty')
              : summary),
      ])
    }

    /**
     * The import report: one line per entry, and the reason on every failure.
     *
     * A summary alone would leave the user counting a long import by hand, and
     * a failure with no name is one they cannot find in the list afterwards.
     */
    function ImportResultModal(props) {
      const result = props.result
      return h(Modal, {
        title: translate('modal.importResult'),
        onClose: props.onClose,
        actions: [
          h('button', {
            key: 'close',
            type: 'button',
            className: 'hub-text-button',
            'data-primary': 'true',
            onClick: props.onClose,
          }, translate('action.close')),
        ],
      }, [
        h('div', { key: 's', className: 'hub-hint' },
          `${result.ok} ${translate('transfer.result.ok')} · ${result.failed} ${translate('transfer.result.failed')}`),
        h('div', { key: 'l', className: 'hub-result' },
          result.entries.map((entry, index) => h('div', {
            key: index,
            className: 'hub-result-row',
            'data-ok': String(entry.ok),
          }, [
            h('span', { key: 'm', className: 'hub-result-mark' },
              h(Icon, { name: entry.ok ? 'check' : 'warning', size: 12, width: 2 })),
            h('span', { key: 'n', className: 'hub-result-name' },
              entry.name === '' ? translate('state.untitled') : entry.name),
            entry.ok
              ? null
              : h('span', { key: 'r', className: 'hub-result-reason' }, entry.error),
          ]))),
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
      const [gridRef, gridWidth, bodyHeight] = useMeasuredWidth()
      const [scrollTop, setScrollTop] = useState(0)
      // The row pitch, per view, corrected once against the rows actually drawn.
      const [pitch, setPitch] = useState(() => ({ ...ROW_PITCH }))
      const pitchFixed = useRef({})
      // What the fold changed, for the live region. A state, not a ref: the
      // announcement is text the panel renders, and a ref would not redraw it.
      const [announcement, setAnnouncement] = useState('')
      // The transfer dialogs' own state: what the export dialog is set to, the
      // file the import dialog has read, and what the last import did.
      const [transfer, setTransfer] = useState({
        export: { scope: 'tab', format: 'json' },
        file: null,
        result: null,
      })
      const collapseTimer = useRef(null)
      const noticeTimer = useRef(null)
      // The surface the status popover is positioned against.
      const surfaceRef = useRef(null)
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
          // `version` rides the envelope and is kept, not gated on: nothing
          // here branches on it, and an export has to write the same one back
          // out or the file it produces is a document from no build at all.
          //
          // A Host that predates the enum sends no list at all. That is an
          // empty list here rather than a crash: the panel still renders, and
          // the notice below names the field the running Host is missing.
          const statuses = normalizeStatuses(envelope?.statuses)
          const index = new Map(statuses.map(status => [status.id, status]))
          const items = raw.map(item => normalizeItem(item, index)).filter(Boolean)
          dispatch({
            type: 'load/ok',
            items,
            statuses,
            version: typeof envelope?.version === 'number' ? envelope.version : 0,
          })
          const behind = missingHostFields(raw)
          if (behind.length > 0) {
            // The field names go in bare: they are schema identifiers, not
            // prose, and they are the part the reader has to search the Host
            // source for.
            say(`${translate('state.hostOlder')} (${behind.join(', ')})`, 'warn')
          }
          return items
        }
        catch (error) {
          dispatch({
            type: error instanceof HubBridgeMissing ? 'load/broken' : 'load/fail',
            failure: error,
          })
          return []
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
          draft: { title: '', description: '', text: '', category: '', priority: 'normal', note: '', files: [] },
        })
      }, [])

      const openDetail = useCallback(item => dispatch({ type: 'modal', modal: { kind: 'detail', id: item.id } }))

      // Declared ahead of every writer that lands an item somewhere: `submit`
      // and the status picker both put something in a region and then need it
      // open, and a `useCallback` dependency array reads this binding at
      // declaration time.
      //
      // The regions are the statuses, so the id is a status id and the open
      // state is a map entry. A region that is folded is simply absent from
      // the map, so the map holds only what the user opened.
      const setRegionOpen = useCallback((id, open) => {
        if (typeof id !== 'string' || id === '') return
        const current = uiStore.getSnapshot()[REGION_PREFS]
        if ((current[id] === true) === open) return
        const next = { ...current }
        if (open) next[id] = true
        else delete next[id]
        uiStore.update({ [REGION_PREFS]: next })
        // The two keys the previous two-region layout wrote name halves that no
        // longer exist. `undefined` is how a key is *removed* here:
        // `JSON.stringify` drops it, so the stored blob stops describing a
        // panel that is not this one.
        writePrefs({ [REGION_PREFS]: next, todoOpen: undefined, todoDone: undefined })
      }, [])

      const foldRegion = useCallback(id => {
        const open = !(uiStore.getSnapshot()[REGION_PREFS][id] === true)
        setRegionOpen(id, open)
        // The fold is announced because the change is invisible to anyone not
        // looking at the header: the count moves and the rows vanish, and a
        // screen reader that is reading the list is not reading the button.
        const status = state.statuses.find(candidate => candidate.id === id)
        if (status !== undefined) {
          setAnnouncement(`${statusText(status)} ${translate(open ? 'region.unfolded' : 'region.folded')}`)
        }
      }, [setRegionOpen, state.statuses])

      const openEdit = useCallback(item => dispatch({
        type: 'modal',
        modal: { kind: 'edit', id: item.id },
        draft: {
          title: item.title,
          description: item.content,
          text: item.content,
          category: item.category,
          priority: item.priority,
          // The form carries no status control, but the draft has to carry the
          // status the item already has: an update that dropped it would clear
          // the status a badge set, every time somebody edited the title.
          status: item.status,
          note: item.note,
          files: item.files.map(file => ({ ...file })),
        },
      }))

      const closeModal = useCallback(() => {
        // A transfer dialog leaves nothing behind: the file it read and the
        // report it produced belong to the import that just ran, and the next
        // one starts from the picker again.
        if (state.modal?.kind === 'import' || state.modal?.kind === 'importResult') {
          setTransfer(current => ({ ...current, file: null, result: null }))
        }
        // A refused delete of a status comes back to the manager, which is
        // where the delete was asked for.
        if (state.modal?.kind === 'deleteStatus') {
          dispatch({ type: 'modal', modal: { kind: 'statusManager' } })
          return
        }
        dispatch({ type: 'modal', modal: null })
      }, [state.modal])

      const askDelete = useCallback(item => dispatch({ type: 'modal', modal: { kind: 'delete', id: item.id } }))

      const closePopover = useCallback(() => dispatch({ type: 'popover', popover: null }), [])

      // The status picker is placed at the badge that opened it: the trigger's
      // box is measured against the surface's, at click time, because the body
      // scrolls and the badge moves under the pointer.
      //
      // It opens **towards the panel's inside**. The badge sits at the trailing
      // end of the card, so a popover that grew rightwards from it would hang
      // out of the panel and over the conversation behind it; hanging its right
      // edge off the badge's right edge makes it grow leftwards instead. It
      // drops below the badge unless there is no room there, in which case it
      // rises above it.
      const openStatusPicker = useCallback((item, event) => {
        const trigger = event?.currentTarget
        const surface = surfaceRef.current
        const triggerRect = typeof trigger?.getBoundingClientRect === 'function'
          ? trigger.getBoundingClientRect()
          : null
        const surfaceRect = typeof surface?.getBoundingClientRect === 'function'
          ? surface.getBoundingClientRect()
          : null
        const placed = triggerRect !== null && surfaceRect !== null
        const room = placed ? surfaceRect.bottom - triggerRect.bottom : 0
        const above = placed ? triggerRect.top - surfaceRect.top : 0
        // The popover is at most this tall, so this much room below it is
        // enough for it to open without being cut off.
        const flip = placed && room < POPOVER_MAX_HEIGHT && above > room
        dispatch({
          type: 'popover',
          popover: {
            itemId: item.id,
            right: placed ? Math.round(surfaceRect.right - triggerRect.right) : 0,
            top: placed && !flip ? Math.round(triggerRect.bottom - surfaceRect.top) : undefined,
            bottom: placed && flip ? Math.round(surfaceRect.bottom - triggerRect.top) : undefined,
          },
        })
      }, [])

      // One menu at a time, and the status popover is not a second one:
      // opening a menu closes the popover, so the two are never both on
      // screen and the popover's anchor is never under a menu.
      const toggleMenu = useCallback(id => {
        closePopover()
        setMenu(current => (current === id ? 'none' : id))
      }, [closePopover])

      // Escape backs out one layer at a time — a dialog first, then the status
      // popover, then a menu. Bound to the panel rather than the document: once
      // the pointer has wandered off, the focused control is still inside the
      // panel, and a document-wide listener would also fire in other panels of
      // the app.
      const menuOpen = menu !== 'none'
      const popoverOpen = state.popover !== null
      const modalOpen = state.modal !== null
      const onPanelKey = useCallback((event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (modalOpen) closeModal()
        else if (popoverOpen) closePopover()
        else if (menuOpen) setMenu('none')
      }, [menuOpen, popoverOpen, modalOpen, closeModal, closePopover])

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
          // What the Host stored, so the region the item landed in is known
          // rather than guessed: a new TODO is filed under the Host's default
          // status, and only the Host knows which one that is.
          let saved = null
          if (state.tab === 'todo') {
            const payload = {
              title: draft.title,
              description: draft.description,
              category: draft.category,
              priority: draft.priority,
              note: draft.note,
              attachments: files,
            }
            // The form carries no completion control — the item's own badge
            // owns that — but the round trip still sends the status the item
            // already has: an update that dropped it would clear the status a
            // badge set, every time somebody edited the title. A create has no
            // status yet, so the Host picks the default one.
            if (typeof draft.status === 'string' && draft.status !== '') payload.status = draft.status
            saved = await send(payload)
          }
          else {
            await send({ title: draft.title, text: draft.text, images: files })
          }
          closeModal()
          say(null)
          await load()
          // The same rule the status picker follows: a region opens itself
          // when something lands in it. A new TODO would otherwise disappear
          // into a folded region the moment the dialog closed, and the empty
          // state would read as "the save did not work". The region is named
          // by the status the Host filed the item under, which is the only
          // one it can be in.
          if (!editing && state.tab === 'todo') {
            setRegionOpen(saved?.status, true)
          }
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
        }
        finally {
          dispatch({ type: 'busy', busy: false })
        }
      }, [state.draft, state.modal, state.tab, closeModal, say, load, setRegionOpen])

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

      // The status a TODO carries is the Host's, so the write goes through the
      // Remote and the item comes back from the store rather than from a local
      // guess: a refused write must not leave the badge showing a status the
      // store never took.
      const chooseStatus = useCallback(async (item, statusId) => {
        dispatch({ type: 'popover', popover: null })
        try {
          await hubCall('update', item.id, { status: statusId })
          const items = await load()
          // The region the item landed in opens itself. Folding is what keeps
          // the regions apart, but a task that moves while its region is shut
          // has moved invisibly — the count would move and nothing else would,
          // which reads as a miscount rather than as a task changing state.
          // The region is named by the status the item now carries.
          const landed = items.find(candidate => candidate.id === item.id)
          if (landed !== undefined) setRegionOpen(landed.status, true)
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
        }
      }, [load, say, setRegionOpen])

      // Every write over the status definitions goes through the Remote and
      // reloads the list: the definitions are the Host's bytes, so the panel
      // never keeps a second copy of them.
      const writeStatus = useCallback(async (method, args) => {
        dispatch({ type: 'busy', busy: true })
        try {
          await hubCall(method, ...args)
          await load()
          return true
        }
        catch (error) {
          say(failureText(error) || translate('state.failed'), 'error')
          return false
        }
        finally {
          dispatch({ type: 'busy', busy: false })
        }
      }, [load, say])

      const pickTone = useCallback(id => {
        dispatch({
          type: 'manager/draft',
          draft: { picker: state.manager.picker === id ? null : id },
        })
      }, [state.manager.picker])

      const setStatusTone = useCallback(async (id, tone) => {
        dispatch({ type: 'manager/draft', draft: { picker: null } })
        await writeStatus('updateStatus', [id, { tone }])
      }, [writeStatus])

      const setStatusTerminal = useCallback(async id => {
        const status = state.statuses.find(candidate => candidate.id === id)
        if (status === undefined) return
        await writeStatus('updateStatus', [id, { done: !status.done }])
      }, [state.statuses, writeStatus])

      const moveStatus = useCallback(async (id, delta) => {
        const index = state.statuses.findIndex(candidate => candidate.id === id)
        if (index === -1) return
        const target = index + delta
        if (target < 0 || target >= state.statuses.length) return
        // `order` is the position the definition ends up at: the Host takes it
        // out of the list and puts it back at that index.
        await writeStatus('updateStatus', [id, { order: target }])
      }, [state.statuses, writeStatus])

      // A rename is committed when the field loses the focus, not on every
      // keystroke: a write per character would be a write per character.
      const commitStatusName = useCallback(async id => {
        const draft = state.manager.drafts[id]
        if (draft === undefined) return
        const status = state.statuses.find(candidate => candidate.id === id)
        if (status === undefined) return
        const label = draft.trim()
        const cleared = { drafts: withoutKey(state.manager.drafts, id) }
        // Compared against the text the field *showed*, not against the stored
        // label: a definition the user never renamed shows its locale key's
        // text, and writing that back would turn a definition that follows the
        // application into one frozen in this language.
        if (label === '' || label === statusText(status)) {
          dispatch({ type: 'manager/draft', draft: cleared })
          return
        }
        const written = await writeStatus('updateStatus', [id, { label }])
        if (written) dispatch({ type: 'manager/draft', draft: cleared })
      }, [state.manager.drafts, state.statuses, writeStatus])

      const addStatus = useCallback(async () => {
        const label = state.manager.name.trim()
        if (label === '') return
        const written = await writeStatus('createStatus', [{ label, tone: state.manager.tone }])
        if (written) dispatch({ type: 'manager/draft', draft: { name: '' } })
      }, [state.manager.name, state.manager.tone, writeStatus])

      const askDeleteStatus = useCallback(id => {
        dispatch({ type: 'modal', modal: { kind: 'deleteStatus', id } })
      }, [])

      const confirmDeleteStatus = useCallback(async () => {
        const id = state.modal?.id
        if (typeof id !== 'string') return
        await writeStatus('deleteStatus', [id])
        // The manager is where the delete was asked for, so it comes back
        // whether the delete landed or not — a refusal is said in the notice.
        dispatch({ type: 'modal', modal: { kind: 'statusManager' } })
      }, [state.modal, writeStatus])

      // The manager's scratch state: the name being typed for a new status, the
      // tone it is being given, and the name each row is being renamed to.
      const draftManager = useCallback(draft => {
        if (draft.id !== undefined) {
          dispatch({
            type: 'manager/draft',
            draft: { drafts: { ...state.manager.drafts, [draft.id]: draft.name } },
          })
          return
        }
        dispatch({ type: 'manager/draft', draft })
      }, [state.manager.drafts])

      const copyItem = useCallback(async (item) => {
        // A title-only item has no body to copy, and an empty string on the
        // clipboard reads as a success that copied nothing. The display name is
        // what such an item has to give, and it is derived, so this is the
        // Client's call rather than another field for the Host to own.
        const text = item.content === '' ? item.name : item.content
        const copied = await copyText(text)
        say(copied ? translate('action.copied') : translate('action.copyFailed'), copied ? 'ok' : 'error')
      }, [say])

      /* --- Transfer ---------------------------------------------------------
       * An export is written from what the panel already holds, and an import
       * is one write per entry through the Remote that is already mounted. The
       * status definitions travel with the items because a restore that lost
       * them would produce entries the store refuses. */

      const itemsById = useMemo(() => new Map(state.items.map(item => [item.id, item])), [state.items])
      const statusIds = useMemo(() => new Set(state.statuses.map(status => status.id)), [state.statuses])

      const exportData = useCallback(() => {
        const choice = transfer.export
        const everything = choice.scope === 'all'
        const items = everything ? state.items : state.items.filter(item => item.kind === state.tab)
        const stamp = new Date().toISOString().slice(0, 10)
        try {
          if (choice.format === 'markdown') {
            const body = (everything ? KINDS : [state.tab])
              .map(kind => toMarkdown(items.filter(item => item.kind === kind), kind))
              .join('\n')
            downloadFile(`hub-${stamp}.md`, 'text/markdown', body)
          }
          else {
            // The document's own shape, so a file the panel writes is a file the
            // store could have written: same version, same items, same
            // definitions, and nothing derived in between.
            const snapshot = {
              version: state.version,
              items: items.map(toStoredItem),
              statuses: state.statuses.map(status => ({ ...status })),
            }
            downloadFile(
              `hub-${stamp}.json`,
              'application/json',
              `${JSON.stringify(snapshot, null, 2)}\n`,
            )
          }
          closeModal()
          say(translate('transfer.exported'), 'ok')
        }
        catch (error) {
          // A browser that refuses a download leaves nothing on disk, so the
          // panel says so rather than closing over a file that never landed.
          say(failureText(error) || translate('state.failed'), 'error')
        }
      }, [transfer.export, state.items, state.tab, state.version, state.statuses, closeModal, say])

      const pickImportFile = useCallback(async (fileList) => {
        const file = Array.from(fileList ?? [])[0]
        if (file === undefined) return
        const name = String(file.name ?? '')
        const unreadable = () => setTransfer(current => ({
          ...current,
          file: { name, error: true, items: [], statuses: [] },
        }))
        try {
          const parsed = JSON.parse(await readTextFile(file))
          if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
            unreadable()
            return
          }
          const objects = list => (Array.isArray(list)
            ? list.filter(entry => entry !== null && typeof entry === 'object')
            : [])
          const items = objects(parsed.items)
          const statuses = objects(parsed.statuses)
          setTransfer(current => ({ ...current, file: { name, items, statuses } }))
        }
        catch (error) {
          // A file that is not an export is a file, not a failure of the panel:
          // the dialog says so and stays open for another one.
          void error
          unreadable()
        }
      }, [itemsById, statusIds])

      const runImport = useCallback(async () => {
        const file = transfer.file
        if (file === null || file.error !== undefined) return
        dispatch({ type: 'busy', busy: true })
        const entries = []
        // The definitions land first, and their ids are mapped as they do: a
        // definition the store does not have is created with an id the Host
        // mints, so the entries that named the file's id have to name the new
        // one or they would be filed under a status that does not exist.
        const statusMap = {}
        const opened = new Set()
        try {
          for (const [index, raw] of file.statuses.entries()) {
            const name = typeof raw.label === 'string' && raw.label.trim() !== ''
              ? raw.label.trim()
              : translate(String(raw.labelKey ?? ''))
            try {
              if (typeof raw.id === 'string' && statusIds.has(raw.id)) {
                await hubCall('updateStatus', raw.id, statusPatch(raw, index))
                statusMap[raw.id] = raw.id
              }
              else {
                const stored = await hubCall('createStatus', statusDraft(raw))
                statusMap[String(raw.id)] = stored.id
              }
              entries.push({ name, ok: true })
            }
            catch (error) {
              entries.push({ name, ok: false, error: failureText(error) })
            }
          }
          for (const raw of file.items) {
            const existing = typeof raw.id === 'string' ? itemsById.get(raw.id) : undefined
            const name = typeof raw.title === 'string' && raw.title.trim() !== ''
              ? raw.title.trim()
              : firstLine(raw.kind === 'todo' ? raw.description : raw.text)
            try {
              const stored = existing === undefined
                ? await hubCall('create', createPayload(raw, statusMap))
                : await hubCall('update', existing.id, updatePayload(raw, existing, statusMap))
              entries.push({ name, ok: true })
              // The same rule the status picker follows: a region opens itself
              // when something lands in it, or an import into a folded region
              // would read as a save that did not work.
              if (stored?.kind === 'todo') opened.add(stored.status)
            }
            catch (error) {
              entries.push({ name, ok: false, error: failureText(error) })
            }
          }
          await load()
        }
        finally {
          dispatch({ type: 'busy', busy: false })
        }
        for (const id of opened) setRegionOpen(id, true)
        const failed = entries.filter(entry => !entry.ok).length
        setTransfer(current => ({
          ...current,
          result: { entries, ok: entries.length - failed, failed },
        }))
        dispatch({ type: 'modal', modal: { kind: 'importResult' } })
      }, [transfer.file, itemsById, statusIds, load, setRegionOpen])

      const setQuery = useCallback(patch => dispatch({ type: 'query', patch }), [])

      const selectView = useCallback(view => {
        uiStore.update({ view })
        writePrefs({ view })
      }, [])

      // The regions are the statuses, so the list is re-framed whenever the
      // definitions change — a new status, a rename, a different order.
      const regions = useMemo(
        () => runRegions(state.items, state.tab, query, state.statuses),
        [state.items, state.statuses, state.tab, query],
      )

      const visible = useMemo(
        () => regions.reduce((total, region) => total + regionTotal(region.groups), 0),
        [regions],
      )

      // The grid's column count follows the measured width, so the n-by-m layout
      // tracks the window instead of a hard-coded column count. It mirrors the
      // CSS `auto-fill` rule rather than replacing it: the stylesheet still owns
      // the track sizing, and this only decides how many skeleton tiles to draw.
      const columns = Math.max(1, Math.round((gridWidth + CARD_GAP) / (CARD_MIN + CARD_GAP)))

      // A long list is drawn as a window. Below the threshold the whole list is
      // drawn instead, which is the same components with no slice at all.
      const windowed = visible > WINDOW_THRESHOLD
      const viewport = bodyHeight > 0 ? bodyHeight : FALLBACK_VIEWPORT
      const layout = useMemo(
        () => (windowed
          ? windowLayout(regions, ui.view, ui[REGION_PREFS], scrollTop, viewport, pitch[ui.view])
          : null),
        [windowed, regions, ui.view, ui[REGION_PREFS], scrollTop, viewport, pitch],
      )

      // The pitch is corrected once per view, against the first window drawn: a
      // list of title-only cards is half the height of a list of full ones, and
      // a pitch that is wrong by a third shows up as blank space at the end of
      // the scroll. Once, because a pitch that chased its own measurement would
      // oscillate on a list whose rows are not all the same height.
      useEffect(() => {
        if (!windowed || pitchFixed.current[ui.view] === true) return
        const body = gridRef.current
        if (body === null || body === undefined || typeof body.querySelector !== 'function') return
        const list = body.querySelector('.hub-grid, .hub-rows')
        if (list === null || typeof list.getBoundingClientRect !== 'function') return
        const rows = list.children.length
        if (rows === 0) return
        const measured = list.getBoundingClientRect().height / rows
        if (!Number.isFinite(measured) || measured <= 0) return
        pitchFixed.current[ui.view] = true
        setPitch(current => (Math.abs(current[ui.view] - measured) < 4
          ? current
          : { ...current, [ui.view]: Math.round(measured) }))
      }, [windowed, ui.view, layout, gridRef])

      const modalItem = useMemo(() => {
        if (state.modal === null) return null
        if (state.modal.kind === 'create' || state.modal.kind === 'edit') return null
        if (state.modal.kind === 'statusManager' || state.modal.kind === 'deleteStatus') return null
        return state.items.find(item => item.id === state.modal.id) ?? null
      }, [state.modal, state.items])

      // The item the status popover belongs to. It is looked up rather than
      // kept, so a popover whose item has gone renders nothing.
      const popoverItem = useMemo(() => {
        if (state.popover === null) return null
        return state.items.find(item => item.id === state.popover.itemId) ?? null
      }, [state.popover, state.items])

      const deleteStatusTarget = useMemo(() => {
        if (state.modal?.kind !== 'deleteStatus') return null
        return state.statuses.find(status => status.id === state.modal.id) ?? null
      }, [state.modal, state.statuses])

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
            : h('div', { className: 'hub-regions' }, [
              // One list of regions either way: a windowed one is drawn from its
              // slice, which also says whether a region's header is still on
              // screen, and an unwindowed one is the same code with no slice.
              ...(!windowed
                ? regions.map(region => ({ region, slice: null }))
                : (layout?.regions ?? []).map(entry => ({ region: entry.region, slice: entry })))
                .map(entry => Region({
                  key: entry.region.id,
                  region: entry.region,
                  slice: entry.slice,
                  open: ui[REGION_PREFS][entry.region.id] === true,
                  view: ui.view,
                  columns,
                  onFold: () => foldRegion(entry.region.id),
                  onOpen: openDetail,
                  onStatus: (item, event) => { openStatusPicker(item, event) },
                  onCopy: item => { void copyItem(item) },
                  onDelete: askDelete,
                })),
              // The empty height below the last drawn region. Without it the
              // scroll would end where the drawing did.
              layout === null ? null : Spacer({ key: 'tail', height: layout.tail }),
            ])

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
          ? h('div', { key: 'panel', className: 'hub-surface', ref: surfaceRef }, [
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
                  onClick: () => toggleMenu('sort'),
                }),
                IconButton({
                  key: 'view',
                  icon: ui.view === 'grid' ? 'grid' : 'rows',
                  label: translate(ui.view === 'grid' ? 'action.viewGrid' : 'action.viewList'),
                  onClick: () => selectView(ui.view === 'grid' ? 'list' : 'grid'),
                }),
                IconButton({
                  key: 'export',
                  icon: 'exportFile',
                  label: translate('action.export'),
                  onClick: () => dispatch({ type: 'modal', modal: { kind: 'export' } }),
                }),
                IconButton({
                  key: 'import',
                  icon: 'importFile',
                  label: translate('action.import'),
                  onClick: () => dispatch({ type: 'modal', modal: { kind: 'import' } }),
                }),
                IconButton({
                  key: 'dock',
                  icon: 'dock' + (ui.edge === 'left' ? 'Left' : ui.edge === 'right' ? 'Right' : 'Bottom'),
                  label: translate('action.dock'),
                  on: menu === 'dock',
                  onClick: () => toggleMenu('dock'),
                }),
                IconButton({
                  key: 'theme',
                  icon: themePreference === 'light'
                    ? 'sun'
                    : themePreference === 'dark' ? 'moon' : 'monitor',
                  label: translate('action.theme'),
                  on: menu === 'theme',
                  onClick: () => toggleMenu('theme'),
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
              // A button, not a readout: it carries a chevron that turns with the
              // direction, so it reads as a dropdown, and a dropdown that opens
              // nothing is worse than one that is not there. It drives the same
              // menu as the toolbar's sort icon, so the two cannot disagree about
              // whether it is open.
              h('button', {
                key: 's',
                type: 'button',
                className: 'hub-meta-sort',
                'data-direction': query.direction,
                'data-on': String(menu === 'sort'),
                'aria-haspopup': 'menu',
                'aria-expanded': String(menu === 'sort'),
                title: translate('action.sort'),
                onClick: () => toggleMenu('sort'),
              }, [
                h('span', { key: 'l' }, translate(SORT_FIELD_LABEL_KEY[state.tab][query.field])),
                h(Icon, { key: 'c', name: 'chevronDown', size: 11 }),
              ]),
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
            h('div', {
              key: 'body',
              className: 'hub-body',
              ref: gridRef,
              // The only thing a windowed list needs from the scroll: where the
              // top of the viewport is. The height is measured, so this carries
              // one number and nothing else.
              onScroll: event => {
                const top = Number(event?.currentTarget?.scrollTop ?? event?.target?.scrollTop)
                if (Number.isFinite(top)) setScrollTop(top)
              },
            }, body),
            // The fold announcement. Always mounted, because a live region that
            // appears with its text is not one anything is listening to yet.
            h('div', { key: 'live', className: 'hub-live', role: 'status', 'aria-live': 'polite' },
              announcement),
            // One popover for the panel, placed at the badge that opened it.
            state.popover === null || popoverItem === null
              ? null
              : h(StatusPopover, {
                key: 'popover',
                statuses: state.statuses,
                currentId: popoverItem.status,
                right: state.popover.right,
                top: state.popover.top,
                bottom: state.popover.bottom,
                onPick: statusId => { void chooseStatus(popoverItem, statusId) },
                onManage: () => { dispatch({ type: 'modal', modal: { kind: 'statusManager' } }) },
              }),
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
                      titleKey: 'modal.delete',
                      bodyKey: 'modal.delete.body',
                      name: modalItem.name,
                      busy: state.busy,
                      onConfirm: () => { void confirmDelete() },
                      onClose: closeModal,
                    })
                    : state.modal.kind === 'statusManager'
                      ? h(StatusManagerModal, {
                        key: 'statuses',
                        statuses: state.statuses,
                        manager: state.manager,
                        busy: state.busy,
                        onDraft: draftManager,
                        onPickTone: pickTone,
                        onTone: (id, tone) => { void setStatusTone(id, tone) },
                        onToggleDone: id => { void setStatusTerminal(id) },
                        onMove: (id, delta) => { void moveStatus(id, delta) },
                        onCommitName: id => { void commitStatusName(id) },
                        onAdd: () => { void addStatus() },
                        onDelete: askDeleteStatus,
                        onClose: closeModal,
                      })
                      : state.modal.kind === 'deleteStatus' && deleteStatusTarget !== null
                        ? h(DeleteModal, {
                          key: 'deleteStatus',
                          titleKey: 'modal.deleteStatus',
                          bodyKey: 'modal.deleteStatus.body',
                          name: statusText(deleteStatusTarget),
                          busy: state.busy,
                          onConfirm: () => { void confirmDeleteStatus() },
                          onClose: closeModal,
                        })
                        : state.modal.kind === 'export'
                          ? h(ExportModal, {
                            key: 'export',
                            choice: transfer.export,
                            onChoice: patch => setTransfer(current => ({
                              ...current,
                              export: { ...current.export, ...patch },
                            })),
                            onExport: () => { exportData() },
                            onClose: closeModal,
                          })
                          : state.modal.kind === 'import'
                            ? h(ImportModal, {
                              key: 'import',
                              file: transfer.file,
                              busy: state.busy,
                              itemsById,
                              statusIds,
                              onPickFiles: files => { void pickImportFile(files) },
                              onImport: () => { void runImport() },
                              onClose: closeModal,
                            })
                            : state.modal.kind === 'importResult' && transfer.result !== null
                              ? h(ImportResultModal, {
                                key: 'importResult',
                                result: transfer.result,
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
