use crate::settings::SettingsStore;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

/// How many physical pixels a window must be away from an edge to be considered
/// "near" it and eligible for docking.
const SNAP_THRESHOLD: i32 = 28;
/// Gap kept between a docked window and the screen edge (physical pixels).
const SNAP_MARGIN: i32 = 8;
/// Visible strip left on screen while a docked window is hidden.
const REVEAL_STRIP: i32 = 8;
/// Animation: 12 steps x 12ms (~144ms), cubic ease-out.
const ANIM_STEPS: u32 = 12;
const ANIM_STEP_MS: u64 = 12;

#[derive(Clone, Copy, PartialEq, Eq)]
enum DockEdge {
    Left,
    Right,
    Top,
}

impl DockEdge {
    fn as_str(self) -> &'static str {
        match self {
            DockEdge::Left => "left",
            DockEdge::Right => "right",
            DockEdge::Top => "top",
        }
    }
}

#[derive(Clone, Copy)]
struct Rect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

#[derive(Clone, Copy)]
struct WindowGeom {
    /// Client-area rect (what the user actually sees). Windows resizable windows
    /// keep an invisible resize border even when undecorated, so `outer_position`
    /// can sit several pixels off-screen while the visible content is flush with
    /// the edge. All edge detection therefore uses the inner rect.
    inner: Rect,
    /// `outer_position - inner_position`; `set_position()` targets the outer rect,
    /// so inner coordinates must be shifted back before moving the window.
    dx: i32,
    dy: i32,
}

impl Rect {
    fn right(self) -> i32 {
        self.x + self.w
    }

    fn bottom(self) -> i32 {
        self.y + self.h
    }

    /// Squared distance between this rect and another (0 when they overlap).
    fn distance_sq(self, other: &Rect) -> i64 {
        let dx = if self.right() < other.x {
            (other.x - self.right()) as i64
        } else if self.x > other.right() {
            (self.x - other.right()) as i64
        } else {
            0
        };
        let dy = if self.bottom() < other.y {
            (other.y - self.bottom()) as i64
        } else if self.y > other.bottom() {
            (self.y - other.bottom()) as i64
        } else {
            0
        };
        dx * dx + dy * dy
    }
}

fn monitor_work_rect(monitor: &tauri::Monitor) -> Rect {
    let work = monitor.work_area();
    Rect {
        x: work.position.x,
        y: work.position.y,
        w: work.size.width as i32,
        h: work.size.height as i32,
    }
}

fn window_geometry(window: &WebviewWindow) -> Result<(WindowGeom, Vec<tauri::Monitor>), String> {
    let outer_position = window.outer_position().map_err(|e| e.to_string())?;
    let inner_position = window.inner_position().map_err(|e| e.to_string())?;
    let inner_size = window.inner_size().map_err(|e| e.to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let inner = Rect {
        x: inner_position.x,
        y: inner_position.y,
        w: inner_size.width as i32,
        h: inner_size.height as i32,
    };
    Ok((
        WindowGeom {
            inner,
            dx: outer_position.x - inner_position.x,
            dy: outer_position.y - inner_position.y,
        },
        monitors,
    ))
}

/// Distance (physical px) from the window's nearest edge to a monitor edge.
/// Flush windows score 0, slightly-overhanging windows score the overhang, and
/// docked-hidden strips score their visible width. `None` when neither edge of the
/// window comes within the snap threshold of this monitor edge.
fn edge_gap(rect: &Rect, mon: &Rect, edge: DockEdge) -> Option<i32> {
    let t = SNAP_THRESHOLD;
    let gap = match edge {
        DockEdge::Left => (rect.x - mon.x).abs().min((rect.right() - mon.x).abs()),
        DockEdge::Right => (rect.x - mon.right()).abs().min((rect.right() - mon.right()).abs()),
        DockEdge::Top => (rect.y - mon.y).abs().min((rect.bottom() - mon.y).abs()),
    };
    if gap <= t {
        Some(gap)
    } else {
        None
    }
}

/// Pick the monitor work-area + edge the window is closest to (or already docked on).
/// Prefers the monitor whose work area contains the window's center, then the
/// smallest edge gap, then the nearest monitor (resolves seams between displays).
fn find_dock_edge(rect: &Rect, monitors: &[tauri::Monitor]) -> Option<(Rect, DockEdge)> {
    let mut candidates: Vec<(Rect, DockEdge, i32, i64, bool)> = Vec::new();
    let cx = rect.x + rect.w / 2;
    let cy = rect.y + rect.h / 2;
    for monitor in monitors {
        let work = monitor_work_rect(monitor);
        let mon_dist = rect.distance_sq(&work);
        let center_inside = cx >= work.x && cx <= work.right() && cy >= work.y && cy <= work.bottom();
        for edge in [DockEdge::Left, DockEdge::Right, DockEdge::Top] {
            if let Some(gap) = edge_gap(rect, &work, edge) {
                candidates.push((work, edge, gap, mon_dist, center_inside));
            }
        }
    }
    candidates.sort_by(|a, b| {
        b.4
            .cmp(&a.4)
            .then(a.2.cmp(&b.2))
            .then(a.3.cmp(&b.3))
    });
    candidates
        .into_iter()
        .next()
        .map(|(work, edge, _, _, _)| (work, edge))
}

fn clamped_y(win: &Rect, mon: &Rect) -> i32 {
    let min = mon.y;
    let max = (mon.y + mon.h - win.h).max(min);
    win.y.clamp(min, max)
}

fn clamped_x(win: &Rect, mon: &Rect) -> i32 {
    let min = mon.x;
    let max = (mon.x + mon.w - win.w).max(min);
    win.x.clamp(min, max)
}

fn snapped_position(win: &Rect, mon: &Rect, edge: DockEdge) -> PhysicalPosition<i32> {
    match edge {
        DockEdge::Left => PhysicalPosition::new(mon.x + SNAP_MARGIN, clamped_y(win, mon)),
        DockEdge::Right => {
            PhysicalPosition::new(mon.x + mon.w - win.w - SNAP_MARGIN, clamped_y(win, mon))
        }
        DockEdge::Top => PhysicalPosition::new(clamped_x(win, mon), mon.y + SNAP_MARGIN),
    }
}

fn hidden_position(win: &Rect, mon: &Rect, edge: DockEdge) -> PhysicalPosition<i32> {
    match edge {
        DockEdge::Left => PhysicalPosition::new(mon.x - win.w + REVEAL_STRIP, clamped_y(win, mon)),
        DockEdge::Right => {
            PhysicalPosition::new(mon.x + mon.w - REVEAL_STRIP, clamped_y(win, mon))
        }
        DockEdge::Top => PhysicalPosition::new(clamped_x(win, mon), mon.y - win.h + REVEAL_STRIP),
    }
}

fn to_outer(inner: PhysicalPosition<i32>, geom: &WindowGeom) -> PhysicalPosition<i32> {
    PhysicalPosition::new(inner.x + geom.dx, inner.y + geom.dy)
}

/// Tauri has no native window animation API, so slide positions in a short
/// background thread with cubic ease-out.
fn animate_position(
    window: &WebviewWindow,
    from: PhysicalPosition<i32>,
    to: PhysicalPosition<i32>,
) {
    let window = window.clone();
    std::thread::spawn(move || {
        for step in 1..=ANIM_STEPS {
            let t = step as f32 / ANIM_STEPS as f32;
            let eased = 1.0 - (1.0 - t).powi(3);
            let x = from.x + ((to.x - from.x) as f32 * eased).round() as i32;
            let y = from.y + ((to.y - from.y) as f32 * eased).round() as i32;
            if window.set_position(PhysicalPosition::new(x, y)).is_err() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(ANIM_STEP_MS));
        }
    });
}

/// Called after a user drag ends (auto_hide=false) or after the mouse leaves a
/// docked note (auto_hide=true). Only acts when edge docking is enabled; returns
/// the docked edge ("left" / "right" / "top") when a snap/hide happened.
#[tauri::command]
pub async fn snap_note_to_edge(
    app: AppHandle,
    note_id: String,
    auto_hide: bool,
) -> Result<Option<String>, String> {
    let settings = app.state::<SettingsStore>();
    if !settings.edge_dock_enabled() {
        return Ok(None);
    }

    let window = app
        .get_webview_window(&format!("note-{}", note_id))
        .ok_or_else(|| format!("便笺窗口不存在: {}", note_id))?;

    let (geom, monitors) = window_geometry(&window)?;
    let Some((work, edge)) = find_dock_edge(&geom.inner, &monitors) else {
        return Ok(None);
    };

    let current = PhysicalPosition::new(geom.inner.x + geom.dx, geom.inner.y + geom.dy);
    let target = to_outer(
        if auto_hide {
            hidden_position(&geom.inner, &work, edge)
        } else {
            snapped_position(&geom.inner, &work, edge)
        },
        &geom,
    );

    // Hidden docked notes stay out of the taskbar (and Alt+Tab); revealing or
    // snapping back to a visible position restores the taskbar button.
    let _ = window.set_skip_taskbar(auto_hide);
    animate_position(&window, current, target);

    Ok(Some(edge.as_str().to_string()))
}

/// Always reveals a note that is currently docked to a screen edge (even when the
/// edge-dock setting was turned off). Returns true when a reveal happened.
#[tauri::command]
pub async fn reveal_docked_note(app: AppHandle, note_id: String) -> Result<bool, String> {
    let window = app
        .get_webview_window(&format!("note-{}", note_id))
        .ok_or_else(|| format!("便笺窗口不存在: {}", note_id))?;

    let (geom, monitors) = window_geometry(&window)?;
    let Some((work, edge)) = find_dock_edge(&geom.inner, &monitors) else {
        return Ok(false);
    };

    let current = PhysicalPosition::new(geom.inner.x + geom.dx, geom.inner.y + geom.dy);
    let target = to_outer(snapped_position(&geom.inner, &work, edge), &geom);
    let _ = window.set_skip_taskbar(false);
    animate_position(&window, current, target);

    Ok(true)
}
