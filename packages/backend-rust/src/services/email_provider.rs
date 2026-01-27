use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;
use tokio::sync::RwLock;

const SENDGRID_ENDPOINT: &str = "https://api.sendgrid.com/v3/mail/send";

#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub provider: EmailProviderType,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_user: Option<String>,
    pub smtp_password: Option<String>,
    pub sendgrid_api_key: Option<String>,
    pub from_address: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum EmailProviderType {
    Smtp,
    SendGrid,
    Mock,
    None,
}

#[derive(Debug, Error)]
pub enum EmailError {
    #[error("email not configured: {0}")]
    NotConfigured(&'static str),
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("HTTP {status}: {body}")]
    HttpStatus {
        status: reqwest::StatusCode,
        body: String,
    },
    #[error("smtp error: {0}")]
    Smtp(String),
}

#[derive(Clone)]
pub struct EmailService {
    config: EmailConfig,
    client: reqwest::Client,
    last_send: Arc<RwLock<std::collections::HashMap<String, i64>>>,
}

#[derive(Serialize)]
struct SendGridPayload<'a> {
    personalizations: Vec<SendGridPersonalization<'a>>,
    from: SendGridAddress<'a>,
    subject: &'a str,
    content: Vec<SendGridContent<'a>>,
}

#[derive(Serialize)]
struct SendGridPersonalization<'a> {
    to: Vec<SendGridAddress<'a>>,
}

#[derive(Serialize)]
struct SendGridAddress<'a> {
    email: &'a str,
}

#[derive(Serialize)]
struct SendGridContent<'a> {
    #[serde(rename = "type")]
    content_type: &'a str,
    value: &'a str,
}

impl EmailService {
    pub fn from_env() -> Self {
        let provider = match env_string("EMAIL_PROVIDER").as_deref() {
            Some("smtp") => EmailProviderType::Smtp,
            Some("sendgrid") => EmailProviderType::SendGrid,
            Some("mock") => EmailProviderType::Mock,
            _ => EmailProviderType::None,
        };

        let config = EmailConfig {
            provider,
            smtp_host: env_string("SMTP_HOST"),
            smtp_port: env_u16("SMTP_PORT").unwrap_or(587),
            smtp_user: env_string("SMTP_USER"),
            smtp_password: env_string("SMTP_PASSWORD"),
            sendgrid_api_key: env_string("SENDGRID_API_KEY"),
            from_address: env_string("EMAIL_FROM").unwrap_or_else(|| "noreply@danci.app".into()),
        };

        Self {
            config,
            client: reqwest::Client::new(),
            last_send: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    pub fn is_available(&self) -> bool {
        match self.config.provider {
            EmailProviderType::Smtp => {
                self.config.smtp_host.is_some() && self.config.smtp_user.is_some()
            }
            EmailProviderType::SendGrid => self.config.sendgrid_api_key.is_some(),
            EmailProviderType::Mock => true,
            EmailProviderType::None => false,
        }
    }

    pub fn provider_type(&self) -> &EmailProviderType {
        &self.config.provider
    }

    pub async fn check_rate_limit(&self, email: &str, window_secs: i64) -> bool {
        let now = chrono::Utc::now().timestamp();
        let guard = self.last_send.read().await;
        if let Some(&last) = guard.get(email) {
            return now - last >= window_secs;
        }
        true
    }

    pub async fn record_send(&self, email: &str) {
        let now = chrono::Utc::now().timestamp();
        let mut guard = self.last_send.write().await;
        guard.insert(email.to_string(), now);
    }

    pub async fn send_email(
        &self,
        to: &str,
        subject: &str,
        html_body: &str,
    ) -> Result<(), EmailError> {
        match self.config.provider {
            EmailProviderType::SendGrid => self.send_via_sendgrid(to, subject, html_body).await,
            EmailProviderType::Smtp => self.send_via_smtp(to, subject, html_body).await,
            EmailProviderType::Mock => Ok(()),
            EmailProviderType::None => Err(EmailError::NotConfigured("EMAIL_PROVIDER")),
        }
    }

    async fn send_via_sendgrid(
        &self,
        to: &str,
        subject: &str,
        html_body: &str,
    ) -> Result<(), EmailError> {
        let api_key = self
            .config
            .sendgrid_api_key
            .as_deref()
            .ok_or(EmailError::NotConfigured("SENDGRID_API_KEY"))?;

        let payload = SendGridPayload {
            personalizations: vec![SendGridPersonalization {
                to: vec![SendGridAddress { email: to }],
            }],
            from: SendGridAddress {
                email: &self.config.from_address,
            },
            subject,
            content: vec![SendGridContent {
                content_type: "text/html",
                value: html_body,
            }],
        };

        let resp = self
            .client
            .post(SENDGRID_ENDPOINT)
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(EmailError::HttpStatus { status, body });
        }

        Ok(())
    }

    async fn send_via_smtp(
        &self,
        to: &str,
        subject: &str,
        html_body: &str,
    ) -> Result<(), EmailError> {
        let host = self
            .config
            .smtp_host
            .as_deref()
            .ok_or(EmailError::NotConfigured("SMTP_HOST"))?;
        let user = self
            .config
            .smtp_user
            .as_deref()
            .ok_or(EmailError::NotConfigured("SMTP_USER"))?;
        let password = self
            .config
            .smtp_password
            .as_deref()
            .ok_or(EmailError::NotConfigured("SMTP_PASSWORD"))?;

        let from = &self.config.from_address;
        let port = self.config.smtp_port;

        tokio::task::spawn_blocking({
            let host = host.to_string();
            let user = user.to_string();
            let password = password.to_string();
            let from = from.to_string();
            let to = to.to_string();
            let subject = subject.to_string();
            let html_body = html_body.to_string();

            move || {
                send_smtp_sync(&host, port, &user, &password, &from, &to, &subject, &html_body)
            }
        })
        .await
        .map_err(|e| EmailError::Smtp(e.to_string()))?
    }
}

fn send_smtp_sync(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    from: &str,
    to: &str,
    subject: &str,
    html_body: &str,
) -> Result<(), EmailError> {
    use std::io::Write;
    use std::net::TcpStream;

    let addr = format!("{host}:{port}");
    let mut stream = TcpStream::connect(&addr).map_err(|e| EmailError::Smtp(e.to_string()))?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(30)))
        .ok();
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(30)))
        .ok();

    let mut buf = [0u8; 1024];

    macro_rules! read_response {
        () => {{
            use std::io::Read;
            let n = stream.read(&mut buf).map_err(|e| EmailError::Smtp(e.to_string()))?;
            String::from_utf8_lossy(&buf[..n]).to_string()
        }};
    }

    macro_rules! send_cmd {
        ($cmd:expr) => {{
            stream
                .write_all(format!("{}\r\n", $cmd).as_bytes())
                .map_err(|e| EmailError::Smtp(e.to_string()))?;
            read_response!()
        }};
    }

    let _ = read_response!();
    let _ = send_cmd!(format!("EHLO {host}"));
    let _ = send_cmd!("AUTH LOGIN");

    let user_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, user);
    let pass_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, password);

    let _ = send_cmd!(user_b64);
    let _ = send_cmd!(pass_b64);
    let _ = send_cmd!(format!("MAIL FROM:<{from}>"));
    let _ = send_cmd!(format!("RCPT TO:<{to}>"));
    let _ = send_cmd!("DATA");

    let message = format!(
        "From: {from}\r\nTo: {to}\r\nSubject: {subject}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{html_body}\r\n."
    );
    let _ = send_cmd!(message);
    let _ = send_cmd!("QUIT");

    Ok(())
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn env_u16(key: &str) -> Option<u16> {
    env_string(key)?.parse().ok()
}
