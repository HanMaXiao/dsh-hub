/**
 * The panel's render paths, exercised for real.
 *
 * `client.js` is a browser bundle that calls `window.__ModuleLoader__`, so it is
 * loaded here with a stub module table and a minimal React — enough to render the
 * panel and click through it. That is worth the machinery because the failure
 * this file exists for is invisible to everything else in this package:
 *
 *   - `node --check` passes on an identifier that was never declared, because the
 *     bundle is a function body and `onEdit` resolves at *runtime*;
 *   - there is no lint stage, so nothing else would say `onEdit` is undefined;
 *   - `tests/client-bridge.test.js` reads the file as text, and a typo'd
 *     identifier is perfectly valid text.
 *
 * The consequence of such a throw is not a visible error: React unmounts the
 * entry, so the panel and its handle vanish and nothing brings them back until
 * the page reloads. A test that renders is the only thing that notices.
 *
 * The React stub covers exactly the hooks `HubPanelEntry` uses, and expands
 * nested function components the way React does — a component here may return
 * another component element (`CreateModal` -> `Modal`), which a naive expander
 * skips and which would leave every modal invisible to these assertions.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HubStore } from '../lib/store.js'

/* --- minimal React --------------------------------------------------------- */

let current = null
const pendingEffects = []

function createElement(type, props, ...children) {
  return {
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false),
  }
}

function slot() {
  const panel = current
  const index = panel.cursor++
  return { hooks: panel.hooks, index }
}

function changed(previous, deps) {
  return previous === undefined || deps === undefined || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
}

function useReducer(reducer, initialArg, init) {
  const owner = current
  const { hooks, index } = slot()
  if (hooks.length <= index) hooks[index] = init ? init(initialArg) : initialArg
  const dispatch = action => {
    hooks[index] = reducer(hooks[index], action)
    owner.render()
  }
  return [hooks[index], dispatch]
}

function useState(initial) {
  const owner = current
  const { hooks, index } = slot()
  if (hooks.length <= index) hooks[index] = typeof initial === 'function' ? initial() : initial
  const set = value => {
    const next = typeof value === 'function' ? value(hooks[index]) : value
    if (Object.is(next, hooks[index])) return
    hooks[index] = next
    owner.render()
  }
  return [hooks[index], set]
}

function useRef(initial) {
  const { hooks, index } = slot()
  if (hooks.length <= index) hooks[index] = { current: initial }
  return hooks[index]
}

function useMemo(factory, deps) {
  const { hooks, index } = slot()
  const previous = hooks[index]
  if (changed(previous, deps)) hooks[index] = { deps, value: factory() }
  return hooks[index].value
}

function useEffect(effect, deps) {
  const { hooks, index } = slot()
  const previous = hooks[index]
  if (changed(previous, deps)) {
    hooks[index] = { deps }
    pendingEffects.push(() => effect())
  }
}

function useCallback(callback, deps) { return useMemo(() => callback, deps) }

function useSyncExternalStore(subscribe, getSnapshot) {
  const owner = current
  const { hooks, index } = slot()
  // The subscription fires outside a render, so it must re-render the panel it
  // was created for rather than whatever is current.
  useEffect(() => subscribe(() => { hooks[index] = getSnapshot(); owner.render() }), [subscribe, getSnapshot])
  return getSnapshot()
}

const React = {
  Fragment: 'Fragment',
  createElement,
  useReducer,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useSyncExternalStore,
}

/* --- the bundle, loaded the way the browser module table loads it ---------- */

let factory
globalThis.window = { __ModuleLoader__: { load(entry) { factory = entry.factory } } }
await import(`../client.js?test=${Date.now()}`)

/* --- the real Host store behind the gateway envelope ------------------------ */

/**
 * The panel's own data path, end to end: a real `HubStore` on disk, wrapped in
 * the `RemoteResult` envelope `hubCall` unwraps.
 *
 * The first version of this file used an in-memory stand-in that echoed back
 * whatever the panel sent it. That is the shape of a bug: the stand-in agreed
 * with the panel by construction, so a field the panel never sent, or one the
 * real store never stored, was invisible to every assertion here. The real
 * store needs no protocol package and validates every write, which is exactly
 * the half the panel cannot check for itself.
 */
const stores = []
let store = null
/** Simulate a Host built before `title` existed: it drops the field on write and on read. */
let legacyHost = false

/** The items currently on disk, oldest first. */
function stored() { return store === null ? [] : store.list() }

/** Strip the fields a pre-`title` Host would never emit. */
function asLegacy(items) {
  return items.map(({ title, ...rest }) => rest)
}

const hub = {
  async list() {
    const items = store.list()
    return { ok: true, value: { version: store.document.version, items: legacyHost ? asLegacy(items) : items } }
  },
  async create(draft) {
    const value = store.create(legacyHost ? asLegacy([draft])[0] : draft)
    return { ok: true, value }
  },
  async update(id, patch) {
    const value = store.update(id, legacyHost ? asLegacy([patch])[0] : patch)
    return { ok: true, value }
  },
  async delete(id) { return { ok: true, value: store.remove(id) } },
}
const namespaces = new Map()
const remote = {
  async $mount() {
    namespaces.set('remote.hub', hub)
    return async () => { namespaces.delete('remote.hub') }
  },
}

/* --- mounting ------------------------------------------------------------- */

const dictionaries = new Map()
const logged = []

/**
 * Mount the panel into a fresh context and return a driver.
 * @returns the driver's `panel` object: `tree`, `error`, `find`, `buttons`, `byText`, `click`, `expand`, `leave`, `settle`.
 */
async function mountPanel() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'dsh-hub-panel-'))
  stores.push(dataDir)
  store = new HubStore({ dataDir, maxImageBytes: 2097152 })
  let component
  const ctx = {
    effect(fn) { const disposer = fn(); return typeof disposer === 'function' ? disposer : undefined },
    get: key => (key === 'remote' ? remote : namespaces.get(key)),
    on: () => () => {},
    locale: {
      register: (ns, dicts) => { dictionaries.set(ns, dicts) },
      // Keys, so an assertion can name a label without translating it — and a
      // missing dictionary is loud instead of silently yielding the key anyway.
      bind: ns => key => (dictionaries.has(ns) ? key : `missing:${ns}:${key}`),
    },
    slots: {
      inject(slot, register) { component = register().component },
      register: (descriptor, entry) => ({ ...descriptor, component: entry }),
    },
    logger: { info: () => {}, error: () => {} },
  }
  await factory(name => {
    if (name === 'react') return React
    throw new Error(`unexpected require(${name})`)
  }).apply(ctx)

  const panel = {
    hooks: [],
    cursor: 0,
    tree: undefined,
    error: undefined,
  }
  panel.render = () => renderPanel(panel, component)
  // `expand` needs the panel that is rendering, so publish it before the first
  // render rather than letting each test do it afterwards.
  panel.settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    while (pendingEffects.length > 0) pendingEffects.shift()()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  panel.find = (predicate) => findNode(panel.tree, predicate)
  panel.byClass = className => panel.find(node => node.props?.className === className)
  panel.buttons = () => collectButtons(panel.tree)
  panel.byLabel = label => panel.buttons().find(button => button.props['aria-label'] === label)
  panel.byText = label => panel.find(node => node.type === 'button' && textOf(node).includes(label))
  panel.expand = () => { panel.byClass('hub-handle').props.onPointerEnter?.() }
  panel.hoverRail = () => { panel.byClass('hub-root').props.onPointerEnter?.() }
  panel.leave = () => { panel.byClass('hub-root').props.onPointerLeave?.() }
  panel.click = node => { node?.props.onClick?.({ stopPropagation() {} }) }
  panel.render()
  await panel.settle()
  if (panel.tree === undefined || panel.byClass('hub-root') === undefined) {
    throw new Error(`the panel did not mount: ${panel.error?.stack ?? `component=${typeof component} tree=${typeof panel.tree}`}`)
  }
  return panel
}

/** Render the panel and expand every nested function component, as React does. */
function renderPanel(panel, component) {
  const previous = current
  current = panel
  panel.cursor = 0
  try {
    panel.tree = expand(component({}))
  }
  catch (error) {
    panel.error = error
  }
  finally {
    current = previous
  }
}

function expand(node, depth = 0) {
  if (node === null || typeof node !== 'object' || depth > 60) return node
  let element = node
  // A component may return another component element, so keep going until the
  // element is a host node — otherwise every modal stays invisible here.
  for (let hops = 0; typeof element.type === 'function' && hops < 20; hops += 1) {
    const previous = current
    current = panel()
    try { element = element.type({ ...element.props, children: element.children }) }
    finally { current = previous }
    if (element === null || element === undefined) return element
  }
  return { ...element, children: (element.children ?? []).map(child => expand(child, depth + 1)) }
}

/** The panel currently rendering, for `expand`'s nested component calls. */
let panelRef = null
function panel() { return panelRef }

function findNode(node, predicate) {
  if (node === null || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of node.children ?? []) {
    const hit = findNode(child, predicate)
    if (hit !== undefined) return hit
  }
  return undefined
}

function collectButtons(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (node.type === 'button') out.push(node)
  for (const child of node.children ?? []) collectButtons(child, out)
  return out
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  return ['', ...(node.children ?? []).map(textOf)].join('')
}

/** The control inside the `Field` whose label reads `label`. */
function fieldByLabel(panel, label) {
  const field = panel.find(node => node.props?.className === 'hub-field'
    && textOf(node.children?.find(child => child.props?.className === 'hub-label')) === label)
  return field === undefined ? undefined : field.children.at(-1)
}

/** Drive the panel from a fresh load to a stored item, expanded. */
async function withAnItem(panel, title) {
  panel.expand()
  await panel.settle()
  panel.click(panel.byLabel('action.create'))
  await panel.settle()
  if (title !== undefined) {
    fieldByLabel(panel, 'field.title').props.onChange({ target: { value: title } })
    await panel.settle()
  }
  panel.byClass('hub-textarea').props.onChange?.({ target: { value: '写一份发布检查清单' } })
  await panel.settle()
  panel.click(panel.byText('action.confirm'))
  await panel.settle()
}

/* --- the paths ------------------------------------------------------------- */

test('creating an item shows it in the panel', async () => {
  const panel = await mountPanel()
  await withAnItem(panel)

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.equal(stored().length, 1)
  assert.ok(panel.byClass('hub-card') || panel.byClass('hub-row'), 'the new item must be on screen')
})

test('a title names the item instead of the first line of its content', async () => {
  const panel = await mountPanel()
  await withAnItem(panel, '发布检查清单')

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.equal(stored()[0].title, '发布检查清单')
  assert.equal(stored()[0].description, '写一份发布检查清单')
  assert.equal(textOf(panel.byClass('hub-item-name')), '发布检查清单')
})

test('an untitled item still reads as its first line of content', async () => {
  const panel = await mountPanel()
  await withAnItem(panel)

  assert.equal(stored()[0].title, '', 'an omitted title is stored as empty, not invented')
  assert.equal(textOf(panel.byClass('hub-item-name')), '写一份发布检查清单')
})

test('editing an item offers its own title and can change it', async () => {
  const panel = await mountPanel()
  await withAnItem(panel, '发布检查清单')
  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()
  panel.click(panel.byText('action.edit'))
  await panel.settle()

  assert.equal(fieldByLabel(panel, 'field.title').props.value, '发布检查清单',
    'the edit form must open on the stored title, not blank')
  fieldByLabel(panel, 'field.title').props.onChange({ target: { value: '发布检查清单 v2' } })
  panel.byClass('hub-textarea').props.onChange({ target: { value: '正文也变了' } })
  await panel.settle()
  panel.click(panel.byText('action.confirm'))
  await panel.settle()

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.equal(stored()[0].title, '发布检查清单 v2')
  assert.equal(stored()[0].description, '正文也变了')
})

test('opening an item renders its detail dialog', async () => {
  const panel = await mountPanel()
  await withAnItem(panel)

  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-modal'), 'the detail dialog must be on screen')
})

test('editing from the detail dialog opens the edit form', async () => {
  // The regression: `onEdit` was passed as a bare identifier instead of the
  // `openEdit` callback, so clicking an item threw a ReferenceError, React
  // unmounted the entry, and the panel and its handle disappeared for good.
  const panel = await mountPanel()
  await withAnItem(panel)
  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()

  panel.click(panel.byText('action.edit'))
  await panel.settle()

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-textarea'), 'the edit form must be on screen')
  assert.equal(textOf(panel.byClass('hub-modal-title')), 'modal.edit')
})

test('every menu and dialog opens without a render error', async () => {
  const panel = await mountPanel()
  await withAnItem(panel)

  panel.click(panel.byLabel('action.sort'))
  await panel.settle()
  assert.equal(panel.error, undefined, `sort menu: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-menu'), 'the sort menu must open')

  panel.click(panel.byLabel('action.dock'))
  await panel.settle()
  assert.equal(panel.error, undefined, `dock menu: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-menu'), 'the dock menu must open')

  panel.click(panel.byLabel('action.theme'))
  await panel.settle()
  assert.equal(panel.error, undefined, `theme menu: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-menu'), 'the theme menu must open')

  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()
  panel.click(panel.find(node => node.props?.className === 'hub-item-actions' && node.type === 'span')
    ? panel.buttons().find(button => button.props['aria-label'] === 'action.delete')
    : undefined)
  await panel.settle()
  assert.equal(panel.error, undefined, `delete dialog: ${panel.error?.message}`)
  assert.ok(panel.byClass('hub-modal'), 'the delete confirmation must open')
})

test('a modal holds the panel open, and the handle brings it back', async () => {
  const panel = await mountPanel()
  await withAnItem(panel)
  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()

  assert.equal(panel.byClass('hub-root').props['data-expanded'], 'true')
  assert.equal(panel.byClass('hub-root').props.onPointerLeave, undefined,
    'a panel showing a dialog must not arm the idle collapse')

  // Close the dialog from inside it, then hover the edge again.
  panel.click(panel.byClass('hub-modal-actions') && findInside(panel, 'hub-modal', node => textOf(node) === 'action.close'))
  await panel.settle()
  panel.expand()
  await panel.settle()
  assert.equal(panel.byClass('hub-root').props['data-expanded'], 'true',
    'the collapsed handle must expand the panel again')
  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
})

/** The first node inside `container` matching `predicate`. */
function findInside(panel, className, predicate) {
  const container = panel.byClass(className)
  return container === undefined ? undefined : findNode(container, predicate)
}

test('a Note saves its title on edit as well', async () => {
  // The payload differs per kind, so a TODO alone does not cover this: a note
  // sends `{ title, text, images }` where a TODO sends `{ title, description, … }`.
  const panel = await mountPanel()
  panel.expand()
  await panel.settle()
  panel.click(panel.byText('tab.note'))
  await panel.settle()
  panel.click(panel.byLabel('action.create'))
  await panel.settle()
  fieldByLabel(panel, 'field.title').props.onChange({ target: { value: '一条笔记' } })
  await panel.settle()
  panel.byClass('hub-textarea').props.onChange({ target: { value: '正文第一行' } })
  await panel.settle()
  panel.click(panel.byText('action.confirm'))
  await panel.settle()

  assert.equal(stored()[0].kind, 'note')
  assert.equal(stored()[0].title, '一条笔记')
  assert.equal(textOf(panel.byClass('hub-item-name')), '一条笔记')

  panel.click(panel.byClass('hub-card') ?? panel.byClass('hub-row'))
  await panel.settle()
  panel.click(panel.byText('action.edit'))
  await panel.settle()
  assert.equal(fieldByLabel(panel, 'field.title').props.value, '一条笔记')
  fieldByLabel(panel, 'field.title').props.onChange({ target: { value: '改过的笔记' } })
  await panel.settle()
  panel.click(panel.byText('action.confirm'))
  await panel.settle()

  assert.equal(panel.error, undefined, `a render threw: ${panel.error?.message}`)
  assert.equal(stored()[0].title, '改过的笔记')
  assert.equal(textOf(panel.byClass('hub-item-name')), '改过的笔记')
})

test('an older Host is named instead of silently dropping the title', async () => {
  // The bug this file was rewritten for. A Host that predates `title` drops the
  // field by design — an unknown key is the Client's business, not a reason to
  // fail a save — so the user's title vanishes with no error anywhere and the
  // symptom reads as "my edit did not stick". The panel has to say so.
  legacyHost = true
  try {
    const panel = await mountPanel()
    panel.expand()
    await panel.settle()
    panel.click(panel.byLabel('action.create'))
    await panel.settle()
    fieldByLabel(panel, 'field.title').props.onChange({ target: { value: '会被丢掉的标题' } })
    await panel.settle()
    panel.byClass('hub-textarea').props.onChange({ target: { value: '正文' } })
    await panel.settle()
    panel.click(panel.byText('action.confirm'))
    await panel.settle()

    const notice = panel.byClass('hub-notice')
    assert.ok(notice !== undefined, 'a Host that drops a field must raise a notice')
    assert.equal(notice.props['data-tone'], 'warn')
    // The locale stub hands back keys, so this checks the composition: the
    // translated sentence plus the schema names it lost.
    assert.match(textOf(notice), /state\.hostOlder/, 'the notice must say the Host is behind')
    assert.match(textOf(notice), /\btitle\b/, 'the notice must name the field it lost')
  }
  finally {
    legacyHost = false
  }
})

test('a current Host raises no notice', async () => {
  const panel = await mountPanel()
  await withAnItem(panel, '标题在位')
  assert.equal(panel.byClass('hub-notice'), undefined,
    'every §5 field is present, so the skew check must stay quiet')
})

test('the top rail clears the window chrome instead of hiding under it', () => {
  // CSS is the one thing this harness cannot see: the mini-React renders
  // elements, it does not lay them out, so a rule that parks the rail under the
  // app's drag-enabled titlebar looks identical to a correct one here.
  //
  // That titlebar is drawn across the full width
  // (`[data-windows-titlebar] .frame::before`: `inset: 0 0 auto`,
  // `-webkit-app-region: drag`), so it both paints over the rail and eats the
  // pointer first. The shell publishes `--dsh-frame-overlay-top` for exactly
  // this case.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /--hub-top-inset: var\(--dsh-frame-chrome-top, var\(--dsh-frame-top-clearance, 0px\)\)/,
    'the rail must start flush against the chrome, from the shell tokens')
  assert.match(source, /\.hub-root\[data-edge="top"\] \{ top: var\(--hub-top-inset\)/,
    'the top rail must be inset by that token, not pinned to 0')
  assert.match(source, /data-expanded="true"\]\[data-edge="top"\] \{ height: min\(560px, calc\(74vh - var\(--hub-top-inset\)\)/,
    'an expanded top panel must still fit: its height is measured from the inset')
})

test('only the handle opens the panel, not the rail around it', async () => {
  // On a left or right dock the rail is the whole window height, so expanding on
  // `pointerenter` of the rail means hovering anywhere along the edge pops the
  // panel open under a pointer that never touched the handle.
  const panel = await mountPanel()
  panel.hoverRail()
  await panel.settle()
  assert.equal(panel.byClass('hub-surface'), undefined, 'the rail itself must not open the panel')

  panel.expand()
  await panel.settle()
  assert.notEqual(panel.byClass('hub-surface'), undefined, 'the handle must still open it')
})

test('an expanded left panel is bounded and centred, not full height', () => {
  // Same reason as the rail test: nothing here lays anything out. Left and right
  // stretch `top: 0; bottom: 0`, so without an explicit height the surface runs
  // the whole window and lands its toolbar on the window titlebar's row.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /data-expanded="true"\]\[data-edge="left"\],\s*\n?[^}]*height: min\(560px, calc\(100vh - 2 \* var\(--hub-top-inset\)\)\)/,
    'an expanded left or right panel must be height-bounded and vertically centred')
})

test('left and right run handle and surface along a row, like top and bottom', () => {
  // A column stacked the two instead of laying them side by side. The surface's
  // width is `calc(100% - var(--hub-handle-open))`, which only means anything
  // when the handle is its neighbour — as a column it left the panel one
  // handle-width short of the screen edge, and `align-self: center` (written for
  // the cross axis) floated the handle into the middle of the panel.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\.hub-root\[data-edge="left"\], \.hub-root\[data-edge="right"\] \{\s*\n[^}]*flex-direction: row;/,
    'a left or right rail must run its handle and surface along a row')
  assert.match(source, /\.hub-root\[data-edge="right"\] \{ right: 0; flex-direction: row-reverse; \}/,
    'a right rail must put the handle on the screen edge, not the inner side')
})

test('the panel folds away promptly, and opens in step with the rail', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /const COLLAPSE_IDLE_MS = (\d+)/, 'the idle delay must be named')
  const idle = Number(source.match(/const COLLAPSE_IDLE_MS = (\d+)/)[1])
  assert.ok(idle <= 200, `a hover-opened panel must fold promptly, got ${idle}ms`)
  assert.match(source, /animation: hubPanelIn var\(--hub-mid\)/,
    'the panel must not open slower than the rail it grows from')
})

test('the collapsed handle sits at the middle of its edge', () => {
  // Same reason as the rail test: this harness lays nothing out. `align-self:
  // center` only moves the cross axis, and the cross axis of a 7px rail is the
  // 7px one — so without `justify-content` the handle rests at the rail's
  // start (top-left of the window) on all four edges.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\.hub-root\[data-expanded="false"\] \{ justify-content: center; align-items: center; \}/,
    'the collapsed rail must centre its only child on both axes')
})

test('both dictionaries carry the same keys', () => {
  // The bundle's own `locale.register` enforces this, but only in a real
  // composition; the stub here would let a key drift silently.
  const dicts = dictionaries.get('hub')
  assert.ok(dicts !== undefined, 'the panel must register its dictionaries')
  assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort())
})

test.after(() => { for (const dir of stores.splice(0)) rmSync(dir, { recursive: true, force: true }) })
