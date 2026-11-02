use std::io::Write;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::menu::{MenuBuilder, SubmenuBuilder};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 默认菜单的“关闭窗口”占用 ⌘W；这里不放它，⌘W 交给页面关闭当前工作区标签
        .menu(|app| {
            let app_menu = SubmenuBuilder::new(app, "GitBranches")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit = SubmenuBuilder::new(app, "编辑")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window = SubmenuBuilder::new(app, "窗口").minimize().maximize().fullscreen().build()?;
            MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
        })
        .invoke_handler(tauri::generate_handler![git, path_exists])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
