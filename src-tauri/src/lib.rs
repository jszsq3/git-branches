use std::io::Write;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Serialize)]
struct GitOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

/// 在 `cwd` 下执行一次 git 命令，返回退出码和输出；只有 git 无法启动时才返回错误。
#[tauri::command]
async fn git(cwd: String, args: Vec<String>, stdin: Option<String>) -> Result<GitOutput, String> {
    tauri::async_runtime::spawn_blocking(move || run_git(&cwd, &args, stdin.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

fn run_git(cwd: &str, args: &[String], stdin: Option<&str>) -> Result<GitOutput, String> {
    let mut child = Command::new(git_binary())
        // 中文路径原样输出，不加颜色
        .args(["-c", "core.quotepath=false", "-c", "color.ui=false"])
        .args(args)
        .current_dir(cwd)
        // 需要凭据时直接失败，而不是卡在看不见的终端提示上
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 git：{e}"))?;
    if let (Some(text), Some(mut pipe)) = (stdin, child.stdin.take()) {
        pipe.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(GitOutput {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// 判断仓库内部状态文件（如 MERGE_HEAD、rebase-merge）是否存在。
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// 从 Finder 启动的应用拿不到 shell 的 PATH，按常见安装位置找 git。
fn git_binary() -> &'static str {
    for path in ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"] {
        if std::path::Path::new(path).exists() {
            return path;
        }
    }
    "git"
}

/// 菜单栏。默认菜单的“关闭窗口”占用 ⌘W，这里不放它，⌘W 交给页面关闭当前工作区标签。
fn build_menu<R: Runtime, M: Manager<R>>(app: &M, is_english: bool) -> tauri::Result<Menu<R>> {
    let pick = |zh: &'static str, en: &'static str| if is_english { en } else { zh };
    let app_menu = SubmenuBuilder::new(app, "GitBranches")
        .about_with_text(pick("关于 GitBranches", "About GitBranches"), None)
        .separator()
        .hide_with_text(pick("隐藏 GitBranches", "Hide GitBranches"))
        .hide_others_with_text(pick("隐藏其他", "Hide Others"))
        .show_all_with_text(pick("全部显示", "Show All"))
        .separator()
        .quit_with_text(pick("退出 GitBranches", "Quit GitBranches"))
        .build()?;
    let edit = SubmenuBuilder::new(app, pick("编辑", "Edit"))
        .undo_with_text(pick("撤销", "Undo"))
        .redo_with_text(pick("重做", "Redo"))
        .separator()
        .cut_with_text(pick("剪切", "Cut"))
        .copy_with_text(pick("拷贝", "Copy"))
        .paste_with_text(pick("粘贴", "Paste"))
        .select_all_with_text(pick("全选", "Select All"))
        .build()?;
    let window = SubmenuBuilder::new(app, pick("窗口", "Window"))
        .minimize_with_text(pick("最小化", "Minimize"))
        .maximize_with_text(pick("缩放", "Zoom"))
        .fullscreen_with_text(pick("进入全屏幕", "Enter Full Screen"))
        .build()?;
    MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
}

/// 界面切换语言时重建菜单栏。
#[tauri::command]
fn set_menu_locale(app: AppHandle, locale: String) -> Result<(), String> {
    let menu = build_menu(&app, locale == "en").map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| build_menu(app, false))
        .invoke_handler(tauri::generate_handler![git, path_exists, set_menu_locale])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
