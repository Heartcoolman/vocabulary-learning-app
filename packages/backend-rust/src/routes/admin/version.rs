use axum::{extract::State, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use crate::state::AppState;

const GITHUB_API_URL: &str =
    "https://api.github.com/repos/Heartcoolman/vocabulary-learning-app/releases/latest";
const CACHE_TTL: Duration = Duration::from_secs(300);
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_RELEASE_NOTES_LEN: usize = 2000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemVersionInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub release_url: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
}

struct CachedVersion {
    info: SystemVersionInfo,
    fetched_at: Instant,
}

struct VersionCache {
    data: RwLock<Option<CachedVersion>>,
    fetch_lock: Mutex<()>,
}

static VERSION_CACHE: std::sync::OnceLock<Arc<VersionCache>> = std::sync::OnceLock::new();

fn get_cache() -> &'static Arc<VersionCache> {
    VERSION_CACHE.get_or_init(|| {
        Arc::new(VersionCache {
            data: RwLock::new(None),
            fetch_lock: Mutex::new(()),
        })
    })
}

fn normalize_version(v: &str) -> String {
    let v = v.trim_start_matches('v').trim_start_matches('V');
    v.split('-').next().unwrap_or(v).to_string()
}

fn compare_versions(current: &str, latest: &str) -> bool {
    let current = normalize_version(current);
    let latest = normalize_version(latest);

    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .take(3)
            .filter_map(|p| {
                p.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse::<u32>()
                    .ok()
            })
            .collect()
    };

    let cur_parts = parse(&current);
    let lat_parts = parse(&latest);

    for i in 0..cur_parts.len().max(lat_parts.len()) {
        let c = cur_parts.get(i).copied().unwrap_or(0);
        let l = lat_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

async fn fetch_github_release() -> Result<GitHubRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(GITHUB_API_URL)
        .header("User-Agent", "danci-backend-rust")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status: {}", resp.status()));
    }

    resp.json::<GitHubRelease>()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))
}

fn truncate_release_notes(notes: Option<String>) -> Option<String> {
    notes.map(|s| {
        if s.len() > MAX_RELEASE_NOTES_LEN {
            format!("{}...", &s[..MAX_RELEASE_NOTES_LEN])
        } else {
            s
        }
    })
}

async fn get_version_info() -> SystemVersionInfo {
    let cache = get_cache();

    {
        let guard = cache.data.read().await;
        if let Some(cached) = guard.as_ref() {
            if cached.fetched_at.elapsed() < CACHE_TTL {
                return cached.info.clone();
            }
        }
    }

    let _fetch_guard = cache.fetch_lock.lock().await;

    {
        let guard = cache.data.read().await;
        if let Some(cached) = guard.as_ref() {
            if cached.fetched_at.elapsed() < CACHE_TTL {
                return cached.info.clone();
            }
        }
    }

    match fetch_github_release().await {
        Ok(release) => {
            let latest = normalize_version(&release.tag_name);
            let has_update = compare_versions(CURRENT_VERSION, &latest);
            let info = SystemVersionInfo {
                current_version: CURRENT_VERSION.to_string(),
                latest_version: Some(latest),
                has_update,
                release_url: Some(release.html_url),
                release_notes: truncate_release_notes(release.body),
                published_at: release.published_at,
            };

            let mut guard = cache.data.write().await;
            *guard = Some(CachedVersion {
                info: info.clone(),
                fetched_at: Instant::now(),
            });
            info
        }
        Err(e) => {
            warn!("Failed to fetch GitHub release: {}", e);

            let guard = cache.data.read().await;
            if let Some(cached) = guard.as_ref() {
                return cached.info.clone();
            }
            drop(guard);

            SystemVersionInfo {
                current_version: CURRENT_VERSION.to_string(),
                latest_version: None,
                has_update: false,
                release_url: None,
                release_notes: None,
                published_at: None,
            }
        }
    }
}

pub async fn get_system_version(State(_state): State<AppState>) -> impl IntoResponse {
    let info = get_version_info().await;
    Json(serde_json::json!({
        "success": true,
        "data": info
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_version() {
        assert_eq!(normalize_version("v0.1.0"), "0.1.0");
        assert_eq!(normalize_version("V1.2.3"), "1.2.3");
        assert_eq!(normalize_version("0.1.0"), "0.1.0");
        assert_eq!(normalize_version("0.1.0-alpha.1"), "0.1.0");
        assert_eq!(normalize_version("v1.0.0-rc.1"), "1.0.0");
    }

    #[test]
    fn test_compare_versions() {
        assert!(compare_versions("0.1.0", "0.2.0"));
        assert!(compare_versions("0.1.0", "v0.2.0"));
        assert!(compare_versions("1.0.0", "1.0.1"));
        assert!(compare_versions("1.0.0", "2.0.0"));
        assert!(!compare_versions("0.2.0", "0.1.0"));
        assert!(!compare_versions("0.1.0", "0.1.0"));
        assert!(!compare_versions("1.0.0", "0.9.9"));
        // Pre-release suffix is stripped, so these are equal
        assert!(!compare_versions("0.1.0-alpha", "0.1.0"));
        assert!(!compare_versions("0.1.0", "0.1.0-alpha"));
    }
}
