// SPDX-License-Identifier: AGPL-3.0-only
// Omarchy's current theme and the monospace font the person set (omarchy-theme-set, omarchy-font-set), as rapier's own
// tokens, for the matching rapier theme only (linux/rapier holds the same recipe).
use std::os::unix::fs::MetadataExt;
use std::path::PathBuf;

const DEFAULT_ACCENT: &str = "#12A594";

#[derive(Clone, PartialEq, Debug)]
pub struct Palette {
    pub mode: String,
    background: String,
    foreground: String,
    ink: String,
    accent: Option<String>,
    selection: Option<String>,
}

/// Omarchy's current theme: ~/.local/state/omarchy/current/theme on current Omarchy, ~/.config/omarchy/current/theme on
/// Omarchy 3.x. The first that holds colors.toml is the theme.
fn colors_path() -> PathBuf {
    let home = crate::home();
    let paths = [".local/state/omarchy/current/theme/colors.toml", ".config/omarchy/current/theme/colors.toml"].map(|p| home.join(p));
    paths.iter().find(|p| p.is_file()).unwrap_or(&paths[0]).clone()
}

fn fonts_path() -> PathBuf {
    crate::home().join(".config/fontconfig/fonts.conf")
}

fn rgb(value: &str) -> [f64; 3] {
    let channel = |i: usize| u8::from_str_radix(&value[i..i + 2], 16).unwrap_or(0) as f64;
    [channel(1), channel(3), channel(5)]
}

/// a over b, `share` of a, as #rrggbb (sRGB, as CSS color-mix and omarchy-theme-color mix).
fn mix(a: &str, b: &str, share: f64) -> String {
    let (a, b) = (rgb(a), rgb(b));
    let c = |i: usize| (a[i] * share + b[i] * (1.0 - share)).round() as u8;
    format!("#{:02x}{:02x}{:02x}", c(0), c(1), c(2))
}

fn luminance(value: &str) -> f64 {
    let l: Vec<f64> = rgb(value)
        .iter()
        .map(|c| {
            let c = c / 255.0;
            if c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        })
        .collect();
    0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
}

fn contrast(a: &str, b: &str) -> f64 {
    let (x, y) = (luminance(a), luminance(b));
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}

/// rapier's quieter text steps, moved toward the ink until they read on the paper.
fn readable(ink: &str, paper: &str, mut share: f64) -> String {
    while share < 1.0 && contrast(&mix(ink, paper, share), paper) < 4.5 {
        share = (share + 0.05).min(1.0);
    }
    mix(ink, paper, share)
}

fn is_hex(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// The theme's colours, resolved as omarchy-theme-color does for the keys rapier uses. None without a theme.
pub fn palette() -> Option<Palette> {
    let path = colors_path();
    let text = std::fs::read(&path).ok()?;
    let text = String::from_utf8_lossy(&text[..text.len().min(65536)]).into_owned();
    let mut raw: Vec<(String, String)> = Vec::new();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key
            .trim()
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string();
        let value = value.trim();
        if key.is_empty() || key.starts_with('#') || raw.iter().any(|(k, _)| *k == key) {
            continue;
        }
        let value = if value.starts_with('"') || value.starts_with('\'') {
            let quote = &value[..1];
            value[1..].split(quote).next().unwrap_or("").to_string()
        } else if value.starts_with('#') {
            value.split_whitespace().next().unwrap_or("").to_string()
        } else {
            value.split('#').next().unwrap_or("").trim().to_string()
        };
        raw.push((key, value));
    }
    let get = |key: &str| {
        raw.iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
            .unwrap_or_default()
    };
    let color = |keys: &[&str]| {
        keys.iter()
            .map(|k| get(k))
            .find(|v| is_hex(v))
            .map(|v| v.to_lowercase())
    };
    let background = color(&["background", "bg", "color0"])?;
    let foreground = color(&["foreground", "fg", "color7"])?;
    let mut mode = {
        let m = get("mode");
        if m.is_empty() {
            get("theme_type")
        } else {
            m
        }
    }
    .to_lowercase();
    if mode != "light" && mode != "dark" {
        let light = path
            .parent()
            .map(|p| p.join("light.mode").exists())
            .unwrap_or(false)
            || rgb(&background).iter().sum::<f64>() > 382.0;
        mode = if light { "light" } else { "dark" }.into();
    }
    Some(Palette {
        mode,
        ink: color(&["bright_foreground"]).unwrap_or_else(|| foreground.clone()),
        background,
        foreground,
        accent: color(&["accent"]),
        selection: color(&["selection", "selection_background", "color8"]),
    })
}

/// The monospace family the person picked with omarchy-font-set, or ''.
pub fn font() -> String {
    if !fonts_path().is_file() {
        return String::new();
    }
    let Ok(out) = std::process::Command::new("fc-match")
        .args(["monospace", "-f", "%{family}"])
        .output()
    else {
        return String::new();
    };
    let family = String::from_utf8_lossy(&out.stdout)
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if !family.is_empty()
        && family.len() <= 80
        && family
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || " ._-".contains(c))
    {
        family
    } else {
        String::new()
    }
}

/// rapier's own tokens from the theme. A person who chose the other theme in rapier keeps rapier's colours, and an
/// accent chosen in rapier stays. Document and drawing colours are not tokens.
pub fn css(palette: Option<&Palette>, font: &str) -> String {
    let mut rules: Vec<String> = Vec::new();
    if let Some(p) = palette {
        let light = p.mode == "light";
        let (bg, fg) = (p.background.as_str(), p.foreground.as_str());
        let steps = if light {
            [0.03, 0.055, 0.10, 0.14, 0.23, 0.05]
        } else {
            [0.05, 0.07, 0.10, 0.11, 0.165, 0.11]
        };
        let [surface, surface2, hover, border, focus, inset] = steps.map(|s| mix(fg, bg, s));
        let [r, g, b] = rgb(bg);
        let tokens: Vec<(&str, String)> = vec![
            ("color-bg", bg.into()),
            ("color-surface", surface.clone()),
            ("color-surface-2", surface2),
            ("color-surface-hover", hover),
            ("color-border", border),
            ("color-border-focus", focus),
            ("color-inset", inset),
            ("color-line", fg.into()),
            (
                "color-scrim",
                format!(
                    "color-mix(in srgb,{} {}%,transparent)",
                    surface,
                    if light { 60 } else { 80 }
                ),
            ),
            ("color-text", fg.into()),
            ("color-icon", fg.into()),
            (
                "color-text-secondary",
                readable(fg, bg, if light { 0.73 } else { 0.63 }),
            ),
            (
                "color-text-muted",
                readable(fg, bg, if light { 0.62 } else { 0.53 }),
            ),
            (
                "color-text-subtle",
                readable(fg, bg, if light { 0.61 } else { 0.52 }),
            ),
            (
                "format-toolbar-bg",
                format!(
                    "rgba({},{},{},{})",
                    r as u8,
                    g as u8,
                    b as u8,
                    if light { ".65" } else { ".75" }
                ),
            ),
            ("color-pop-affirm", fg.into()),
            ("color-pop-affirm-ink", bg.into()),
        ];
        let scope = if light {
            "body.light"
        } else {
            "body:not(.light)"
        };
        rules.push(format!(
            "{scope}{{{}}}",
            tokens
                .iter()
                .map(|(k, v)| format!("--{k}:{v}"))
                .collect::<Vec<_>>()
                .join(";")
        ));
        // The boot paper is white or black outright, and in the light it outranks body's token; both take the theme's paper.
        rules.push(if light {
            format!("html.rapier-boot-light{{background:{bg}}}html.rapier-boot-light body{{background:var(--color-bg);color:var(--color-text)}}")
        } else {
            format!("html:not(.rapier-boot-light){{background:{bg}}}")
        });
        if light {
            rules.push(format!(
                "body.light .md-render{{--md-heading-color:{0};--md-heading-muted-color:{0}}}",
                p.ink
            ));
        }
        // Notes keeps its own grounds: cards on a page one step toward the ink, the cards' words in the pure ink.
        let cards = format!(
            "--color-surface-2:{bg};--color-surface:{};--color-text:{}",
            mix(fg, bg, if light { 0.0 } else { 0.03 }),
            p.ink
        );
        rules.push(format!("{scope} .rapier-notes-surface{{--notes-page:{};{cards}}}{scope} .rapier-notes-lift{{{cards}}}", mix(fg, bg, if light { 0.14 } else { 0.10 })));
        if let Some(accent) = &p.accent {
            let (ink, mut share) = if light {
                ("#000000", 0.5)
            } else {
                ("#ffffff", 0.2)
            };
            while share < 1.0 && contrast(&mix(ink, accent, share), bg) < 4.5 {
                share += 0.05;
            }
            let text = mix(ink, accent, share.min(1.0));
            let on = if luminance(accent) > 0.179 {
                "#000000"
            } else {
                "#ffffff"
            };
            rules.push(format!(":root[style*=\"--color-accent: {DEFAULT_ACCENT};\" i] {scope}{{--color-accent:{accent};--color-accent-foreground:{on};--color-accent-text:{text};--color-focus:{}}}",
                if light { &text } else { accent }));
        }
        if let Some(selection) = &p.selection {
            rules.push(format!("{scope} :not(.rapier-draw-label-input)::selection,{scope} .source-mode--code .source-textarea:not(.rapier-check-emphasis)::selection{{background:{selection}}}"));
        }
    }
    if !font.is_empty() {
        let family = format!("'{font}','Geist Mono',monospace");
        rules.push(format!("#editor-blocks .md-render{{--md-font-mono:var(--rapier-doc-mono-face,{family})}}#source-mode{{--font-mono:{family}}}"));
    }
    rules.join("\n")
}

/// What changes when the person switches theme or font: the files' identity and time.
pub fn signature() -> Vec<Option<(u64, u64, u64, i64, i64)>> {
    [colors_path(), fonts_path()]
        .iter()
        .map(|path| {
            std::fs::metadata(path)
                .ok()
                .map(|m| (m.dev(), m.ino(), m.size(), m.mtime(), m.mtime_nsec()))
        })
        .collect()
}
