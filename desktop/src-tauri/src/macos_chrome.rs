//! Native macOS title-area chrome via `NSTitlebarAccessoryViewController`.
//! Lives in the titlebar (not WKWebView's contentView) so the WebUI does not blank.

use std::sync::Mutex;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{define_class, msg_send, sel, MainThreadOnly};
use objc2_app_kit::{
    NSBezelStyle, NSButton, NSColor, NSControlSize, NSCursor, NSImage, NSImageScaling,
    NSImageSymbolConfiguration, NSLayoutAttribute, NSTitlebarAccessoryViewController, NSView,
    NSWindow,
};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSInteger, NSObject, NSObjectProtocol, NSPoint, NSRect,
    NSSize, NSString,
};
use tauri::{AppHandle, Manager, WebviewWindow};

/// Match WebUI `NATIVE_SIDEBAR_WIDTH` (desktop host).
const NATIVE_SIDEBAR_WIDTH: f64 = 240.0;
/// Keep in sync with `lib.rs` / `tauri.conf.json` trafficLightPosition.x.
const TRAFFIC_LIGHT_X: f64 = 22.0;
/// Approximate width of the three traffic-light buttons + gaps.
const TRAFFIC_LIGHT_CLUSTER_WIDTH: f64 = 62.0;
const BUTTON: f64 = 28.0;
/// Gap between chrome icons (and between traffic lights → first icon when collapsed).
const CLUSTER_GAP: f64 = 5.0;
/// Where a leading titlebar accessory typically begins (after traffic lights).
const ACCESSORY_LEADING_ORIGIN_X: f64 = TRAFFIC_LIGHT_X + TRAFFIC_LIGHT_CLUSTER_WIDTH;

static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);
static SIDEBAR_OPEN: Mutex<bool> = Mutex::new(true);
/// WebUI syncs the real theme right after install via `host_set_native_chrome_dark`.
static CHROME_DARK: Mutex<bool> = Mutex::new(false);

struct ChromeState {
    accessory: Retained<NSTitlebarAccessoryViewController>,
    container: Retained<NSView>,
    toggle: Retained<ChromeButton>,
    search: Retained<ChromeButton>,
    new_chat: Retained<ChromeButton>,
}

/// AppKit views are main-thread-only; we only touch this from the UI thread.
struct MainThreadChrome(ChromeState);
// SAFETY: install/set_sidebar_open run on the Tauri main thread.
unsafe impl Send for MainThreadChrome {}
unsafe impl Sync for MainThreadChrome {}

static CHROME: Mutex<Option<MainThreadChrome>> = Mutex::new(None);

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MinibotNativeChromeTarget"]
    struct ChromeTarget;

    unsafe impl NSObjectProtocol for ChromeTarget {}

    impl ChromeTarget {
        #[unsafe(method(toggleSidebar:))]
        fn toggle_sidebar(&self, _sender: Option<&AnyObject>) {
            // Apply layout immediately — do not wait for WebUI→invoke round-trip.
            let next = {
                let mut g = SIDEBAR_OPEN.lock().unwrap_or_else(|e| e.into_inner());
                *g = !*g;
                *g
            };
            apply_installed_layout(next);
            dispatch_web_action("set-sidebar-open", Some(next));
        }

        #[unsafe(method(openSearch:))]
        fn open_search(&self, _sender: Option<&AnyObject>) {
            dispatch_web_action("open-search", None);
        }

        #[unsafe(method(newChat:))]
        fn new_chat(&self, _sender: Option<&AnyObject>) {
            dispatch_web_action("new-chat", None);
        }
    }
);

define_class!(
    // NSButton subclass so hover shows the pointing-hand cursor.
    #[unsafe(super(NSButton))]
    #[thread_kind = MainThreadOnly]
    #[name = "MinibotChromeButton"]
    struct ChromeButton;

    impl ChromeButton {
        #[unsafe(method(resetCursorRects))]
        fn reset_cursor_rects(&self) {
            self.addCursorRect_cursor(self.bounds(), &NSCursor::pointingHandCursor());
        }
    }
);

fn apply_installed_layout(sidebar_open: bool) {
    let Ok(slot) = CHROME.lock() else {
        return;
    };
    let Some(chrome) = slot.as_ref() else {
        return;
    };
    apply_chrome_layout(&chrome.0, sidebar_open);
}

fn dispatch_web_action(action: &str, open: Option<bool>) {
    let app = APP_HANDLE.lock().ok().and_then(|g| g.clone());
    let Some(app) = app else {
        return;
    };
    if let Some(win) = app.get_webview_window("main") {
        let open_js = match open {
            Some(true) => ", open: true",
            Some(false) => ", open: false",
            None => "",
        };
        let script = format!(
            r#"(function(){{
  try {{
    window.dispatchEvent(new CustomEvent("minibot:native-chrome", {{ detail: {{ action: "{action}"{open_js} }} }}));
  }} catch (_) {{}}
}})();"#
        );
        let _ = win.eval(&script);
    }
}

fn chrome_tint(dark: bool) -> Retained<NSColor> {
    if dark {
        NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0)
    } else {
        // Same near-black as the pre-titlebar chrome tint.
        NSColor::colorWithSRGBRed_green_blue_alpha(0.12, 0.13, 0.15, 1.0)
    }
}

fn apply_button_theme(btn: &ChromeButton, symbol: &NSString, tooltip: &NSString, dark: bool) {
    let base = NSImage::imageWithSystemSymbolName_accessibilityDescription(symbol, Some(tooltip))
        .expect("SF Symbol should resolve on modern macOS");
    let tint = chrome_tint(dark);
    // Always palette-bake: titlebar accessories ignore template contentTintColor
    // (both light and dark end up looking washed / white).
    let size_cfg = NSImageSymbolConfiguration::configurationWithPointSize_weight(13.0, 0.0);
    let palette = NSArray::from_slice(&[tint.as_ref()]);
    let palette_cfg = NSImageSymbolConfiguration::configurationWithPaletteColors(&palette);
    let cfg = size_cfg.configurationByApplyingConfiguration(&palette_cfg);
    let image = base
        .imageWithSymbolConfiguration(&cfg)
        .unwrap_or_else(|| base);
    image.setTemplate(false);
    btn.setImage(Some(&image));
    btn.setImageScaling(NSImageScaling::ScaleProportionallyDown);
    btn.setContentTintColor(Some(&tint));
    btn.setSymbolConfiguration(Some(&cfg));
}

fn apply_chrome_tints(state: &ChromeState, dark: bool) {
    apply_button_theme(
        &state.toggle,
        ns_string!("sidebar.left"),
        ns_string!("Toggle sidebar"),
        dark,
    );
    apply_button_theme(
        &state.search,
        ns_string!("magnifyingglass"),
        ns_string!("Search"),
        dark,
    );
    apply_button_theme(
        &state.new_chat,
        ns_string!("square.and.pencil"),
        ns_string!("New chat"),
        dark,
    );
}

fn symbol_button(
    mtm: MainThreadMarker,
    symbol: &NSString,
    tooltip: &NSString,
    target: &ChromeTarget,
    action: Sel,
    dark: bool,
) -> Retained<ChromeButton> {
    let btn: Retained<ChromeButton> = unsafe {
        let allocated = ChromeButton::alloc(mtm).set_ivars(());
        msg_send![super(allocated), init]
    };
    unsafe {
        let _: () = msg_send![&*btn, setTarget: target];
        btn.setAction(Some(action));
        btn.setBordered(false);
        btn.setBezelStyle(NSBezelStyle::Toolbar);
        btn.setControlSize(NSControlSize::Regular);
        btn.setToolTip(Some(tooltip));
        btn.setFrameSize(NSSize::new(BUTTON, BUTTON));
    }
    apply_button_theme(&btn, symbol, tooltip, dark);
    btn
}

fn cluster_width(sidebar_open: bool) -> f64 {
    let count = if sidebar_open { 2.0 } else { 3.0 };
    count * BUTTON + (count - 1.0) * CLUSTER_GAP
}

fn cluster_origin_x(sidebar_open: bool) -> f64 {
    let width = cluster_width(sidebar_open);
    if sidebar_open {
        (NATIVE_SIDEBAR_WIDTH - 10.0 - width).max(80.0)
    } else {
        // Sit just after traffic lights; gap == icon-to-icon spacing.
        ACCESSORY_LEADING_ORIGIN_X + CLUSTER_GAP
    }
}

fn apply_chrome_layout(state: &ChromeState, sidebar_open: bool) {
    state.new_chat.setHidden(sidebar_open);
    let cw = cluster_width(sidebar_open);
    let (view_w, btn_x) = if sidebar_open {
        let desired = cluster_origin_x(true);
        let x = (desired - ACCESSORY_LEADING_ORIGIN_X).max(0.0);
        (x + cw, x)
    } else {
        (cw, 0.0)
    };
    state.container.setFrame(NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(view_w, BUTTON),
    ));
    state.toggle.setFrameOrigin(NSPoint::new(btn_x, 0.0));
    state
        .search
        .setFrameOrigin(NSPoint::new(btn_x + BUTTON + CLUSTER_GAP, 0.0));
    state
        .new_chat
        .setFrameOrigin(NSPoint::new(btn_x + (BUTTON + CLUSTER_GAP) * 2.0, 0.0));
}

fn remove_our_accessory(ns_window: &NSWindow, accessory: &NSTitlebarAccessoryViewController) {
    let controllers = ns_window.titlebarAccessoryViewControllers();
    let count = controllers.count();
    for i in (0..count).rev() {
        let existing = controllers.objectAtIndex(i);
        if std::ptr::eq(existing.as_ref(), accessory) {
            ns_window.removeTitlebarAccessoryViewControllerAtIndex(i as NSInteger);
        }
    }
}

/// Install (or reinstall) native sidebar/search controls in the titlebar accessory.
pub fn install_native_chrome(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    if let Ok(mut g) = APP_HANDLE.lock() {
        *g = Some(app.clone());
    }

    // Prefer checked marker; fall back when dispatched via `run_on_main_thread`
    // (objc2/Tauri main-thread probes can disagree during early startup).
    let mtm = MainThreadMarker::new().unwrap_or_else(|| unsafe { MainThreadMarker::new_unchecked() });

    let ns_ptr = window.ns_window().map_err(|e| format!("ns_window: {e}"))? as *mut NSWindow;
    if ns_ptr.is_null() {
        return Err("ns_window was null".into());
    }
    // SAFETY: Tauri returns a valid NSWindow pointer for this WebviewWindow.
    let ns_window = unsafe { &*ns_ptr };

    if let Ok(mut slot) = CHROME.lock() {
        if let Some(existing) = slot.take() {
            remove_our_accessory(ns_window, &existing.0.accessory);
        }
    }

    let target = {
        let allocated = ChromeTarget::alloc(mtm).set_ivars(());
        let init: Retained<ChromeTarget> = unsafe { msg_send![super(allocated), init] };
        init
    };

    let dark = CHROME_DARK.lock().map(|g| *g).unwrap_or(false);
    let toggle = symbol_button(
        mtm,
        ns_string!("sidebar.left"),
        ns_string!("Toggle sidebar"),
        &target,
        sel!(toggleSidebar:),
        dark,
    );
    let search = symbol_button(
        mtm,
        ns_string!("magnifyingglass"),
        ns_string!("Search"),
        &target,
        sel!(openSearch:),
        dark,
    );
    let new_chat = symbol_button(
        mtm,
        ns_string!("square.and.pencil"),
        ns_string!("New chat"),
        &target,
        sel!(newChat:),
        dark,
    );

    let container = {
        let view = NSView::new(mtm);
        view.addSubview(&toggle);
        view.addSubview(&search);
        view.addSubview(&new_chat);
        view
    };

    let accessory: Retained<NSTitlebarAccessoryViewController> = unsafe {
        let allocated = NSTitlebarAccessoryViewController::alloc(mtm);
        msg_send![allocated, init]
    };
    accessory.setView(&container);
    accessory.setLayoutAttribute(NSLayoutAttribute::Leading);
    accessory.setAutomaticallyAdjustsSize(true);

    let open = SIDEBAR_OPEN.lock().map(|g| *g).unwrap_or(true);
    let state = ChromeState {
        accessory,
        container,
        toggle,
        search,
        new_chat,
    };
    apply_chrome_layout(&state, open);

    ns_window.addTitlebarAccessoryViewController(&state.accessory);
    ns_window.invalidateCursorRectsForView(&state.container);

    if let Ok(mut slot) = CHROME.lock() {
        *slot = Some(MainThreadChrome(state));
    }

    // Buttons retain the target via setTarget; forget the local strong ref.
    std::mem::forget(target);

    let _ = window.eval(
        r#"(function(){
  window.minibotNativeChrome = true;
  try { window.dispatchEvent(new Event("minibot:native-chrome-ready")); } catch(_){}
})();"#,
    );

    Ok(())
}

/// Reposition the native cluster when the WebUI sidebar open state changes.
pub fn set_sidebar_open(_window: &WebviewWindow, open: bool) -> Result<(), String> {
    if let Ok(mut g) = SIDEBAR_OPEN.lock() {
        *g = open;
    } else {
        return Err("SIDEBAR_OPEN mutex poisoned".into());
    }

    let installed = CHROME
        .lock()
        .map(|slot| slot.is_some())
        .unwrap_or(false);
    if !installed {
        // WebUI may sync before install finishes; SIDEBAR_OPEN is updated for install.
        eprintln!("minibot-desktop native chrome: set_sidebar_open({open}) before install");
        return Ok(());
    }
    apply_installed_layout(open);
    eprintln!("minibot-desktop native chrome: set_sidebar_open({open}) applied");
    Ok(())
}

/// Tint native chrome icons for WebUI light/dark.
pub fn set_dark_appearance(dark: bool) -> Result<(), String> {
    if let Ok(mut g) = CHROME_DARK.lock() {
        *g = dark;
    } else {
        return Err("CHROME_DARK mutex poisoned".into());
    }
    let Ok(slot) = CHROME.lock() else {
        return Ok(());
    };
    if let Some(chrome) = slot.as_ref() {
        apply_chrome_tints(&chrome.0, dark);
        eprintln!("minibot-desktop: native chrome tint dark={dark}");
        let _ = std::io::Write::flush(&mut std::io::stderr());
    }
    Ok(())
}
