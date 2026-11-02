// 只存本机偏好：最近打开的仓库、每个仓库收藏的分支

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下时只是丢失偏好，不影响使用
  }
}

export function recentRepos(): string[] {
  return readJson<string[]>("recent", []);
}

export function rememberRepo(root: string) {
  writeJson("recent", [root, ...recentRepos().filter(r => r !== root)].slice(0, 12));
}

export function forgetRepo(root: string) {
  writeJson("recent", recentRepos().filter(r => r !== root));
}

export function favorites(root: string): string[] {
  return readJson<string[]>(`favs:${root}`, []);
}

export function setFavorites(root: string, list: string[]) {
  writeJson(`favs:${root}`, list);
}
