//! Native macOS title-area chrome via `NSTitlebarAccessoryViewController`.
//! Lives in the titlebar (not WKWebView's contentView) so the WebUI does not blank.

use std::sync::Mutex;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{define_class, msg_send, sel, MainThreadOnly};
use objc2_app_kit::{
    NSBezelStyle, NSButton, NSColor, NSControlSize, NSCursor, NSImage, NSImageScaling,
    NSImageSymbolConfiguration, NSLayoutAttribute, NSTitlebarAccessoryViewController, NSView,
    NSWindow, NSWindowButton,
};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSInteger, NSObject, NSObjectProtocol, NSPoint, NSRect,
    NSSize, NSString,
};
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::{CHROME_DOWN, TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_Y};

/// Match WebUI `NATIVE_SIDEBAR_WIDTH` (desktop host) — kept for reference / future layout.
#[allow(dead_code)]
const NATIVE_SIDEBAR_WIDTH: f64 = 240.0;
/// Approximate width of the three traffic-light buttons + gaps.
#[allow(dead_code)]
const TRAFFIC_LIGHT_CLUSTER_WIDTH: f64 = 62.0;
/// Icon hit target. Accessory height adds top pad from `CHROME_DOWN` so the
/// cluster sits lower while AppKit still centers the accessory view.
const BUTTON: f64 = 28.0;
/// Gap between chrome icons.
const CLUSTER_GAP: f64 = 5.0;
/// Extra space between traffic lights and the first chrome icon.
const LEADING_GAP: f64 = 8.0;
/// Where a leading titlebar accessory typically begins (after traffic lights).
#[allow(dead_code)]
const ACCESSORY_LEADING_ORIGIN_X: f64 = TRAFFIC_LIGHT_X + TRAFFIC_LIGHT_CLUSTER_WIDTH;

static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);
static SIDEBAR_OPEN: Mutex<bool> = Mutex::new(true);
/// WebUI syncs the real theme right after install via `host_set_native_chrome_dark`.
static CHROME_DARK: Mutex<bool> = Mutex::new(false);

struct ChromeState {
    accessory: Retained<NSTitlebarAccessoryViewController>,
    container: Retained<ChromeAccessoryView>,
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

// Accessory container: re-apply traffic-light frames on every layout.
// AppKit / wry otherwise reset button Y each pass, so one-shot insets look like
// TRAFFIC_LIGHT_Y "does nothing".
define_class!(
    #[unsafe(super(NSView))]
    #[thread_kind = MainThreadOnly]
    #[name = "MinibotChromeAccessoryView"]
    struct ChromeAccessoryView;

    impl ChromeAccessoryView {
        #[unsafe(method(layout))]
        fn layout(&self) {
            let _: () = unsafe { msg_send![super(self), layout] };
            if let Some(window) = self.window() {
                apply_traffic_light_inset(&window);
            }
        }
    }
);

fn apply_installed_layout(_sidebar_open: bool) {
    let Ok(slot) = CHROME.lock() else {
        return;
    };
    let Some(chrome) = slot.as_ref() else {
        return;
    };
    apply_chrome_layout(&chrome.0);
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

fn cluster_width(show_new_chat: bool) -> f64 {
    let icons = if show_new_chat { 3.0 } else { 2.0 };
    let gaps = if show_new_chat { 2.0 } else { 1.0 };
    LEADING_GAP + icons * BUTTON + gaps * CLUSTER_GAP
}

fn accessory_height() -> f64 {
    // Top pad = 2 * CHROME_DOWN so AppKit-centered accessory shifts icon centers
    // down by exactly CHROME_DOWN (icons sit on the bottom of the taller view).
    BUTTON + CHROME_DOWN * 2.0
}

fn apply_chrome_layout(state: &ChromeState) {
    // New-chat only when sidebar is collapsed (WebUI already has it in the sidebar).
    let sidebar_open = SIDEBAR_OPEN
        .lock()
        .map(|g| *g)
        .unwrap_or(true);
    let show_new_chat = !sidebar_open;
    let cw = cluster_width(show_new_chat);
    let h = accessory_height();
    state.new_chat.setHidden(!show_new_chat);
    state.container.setFrame(NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(cw, h),
    ));
    // y=0 → bottom of accessory → optically lower when CHROME_DOWN > 0.
    let x0 = LEADING_GAP;
    state.toggle.setFrameOrigin(NSPoint::new(x0, 0.0));
    state
        .search
        .setFrameOrigin(NSPoint::new(x0 + BUTTON + CLUSTER_GAP, 0.0));
    if show_new_chat {
        state
            .new_chat
            .setFrameOrigin(NSPoint::new(x0 + (BUTTON + CLUSTER_GAP) * 2.0, 0.0));
    }
}

/// Re-assert traffic-light inset. Called from accessory `layout` so it sticks
/// against wry's drawRect / AppKit resets. `CHROME_DOWN` shifts the cluster down
/// from the vertical mid of the titlebar strip.
fn apply_traffic_light_inset(ns_window: &NSWindow) {
    let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);

    let Some(btn_superview) = (unsafe { close.superview() }) else {
        return;
    };
    let Some(title_bar_container) = (unsafe { btn_superview.superview() }) else {
        return;
    };

    let close_rect = close.frame();
    let btn_h = close_rect.size.height;
    // Same height formula as wry `inset_traffic_lights` so drawRect won't fight it.
    let title_bar_h = btn_h + TRAFFIC_LIGHT_Y;
    let mut title_bar_rect = title_bar_container.frame();
    title_bar_rect.size.height = title_bar_h;
    title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_h;
    title_bar_container.setFrame(title_bar_rect);

    let space_between = miniaturize.frame().origin.x - close_rect.origin.x;
    // Center, then push down (AppKit y-up → smaller y).
    let btn_y = ((title_bar_h - btn_h) / 2.0 - CHROME_DOWN).max(0.0);

    let mut buttons = vec![close, miniaturize];
    if let Some(zoom) = zoom {
        buttons.push(zoom);
    }
    for (i, button) in buttons.into_iter().enumerate() {
        button.setFrameOrigin(NSPoint::new(
            TRAFFIC_LIGHT_X + (i as f64) * space_between,
            btn_y,
        ));
    }
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
        let allocated = ChromeAccessoryView::alloc(mtm).set_ivars(());
        let view: Retained<ChromeAccessoryView> = unsafe { msg_send![super(allocated), init] };
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
    // Keep accessory_height() (includes CHROME_DOWN pad); don't let AppKit shrink it.
    accessory.setAutomaticallyAdjustsSize(false);

    let state = ChromeState {
        accessory,
        container,
        toggle,
        search,
        new_chat,
    };
    apply_chrome_layout(&state);

    ns_window.addTitlebarAccessoryViewController(&state.accessory);
    // Accessory install resets traffic lights; re-apply our inset (x + vertical center).
    apply_traffic_light_inset(ns_window);
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
