"""Reusable healthcare-grade HTML and Plain-text email templates for SwasthyaFlow AI."""

from __future__ import annotations

import html

APP_NAME = "SwasthyaFlow AI"
SUPPORT_EMAIL = "support@swasthyatriage.gov.in"

TEMPLATE_REGISTRY = [
    "welcome",
    "email_verification",
    "password_reset",
    "password_changed",
    "staff_invitation",
    "encounter_assignment",
    "clarification_request",
    "referral_status",
    "security_alert",
]

# Base responsive HTML email wrapper with medical SaaS design tokens
BASE_HTML_WRAPPER = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
  <style>
    body {{
      margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;
    }}
    .email-container {{
      max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
    }}
    .email-header {{
      background: linear-gradient(135deg, #0f766e 0%, #0284c7 100%); padding: 32px 36px; text-align: left;
    }}
    .header-logo {{
      color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0; display: inline-flex; align-items: center; gap: 8px;
    }}
    .header-subtitle {{
      color: #ccfbf1; font-size: 13px; font-weight: 500; margin-top: 4px; margin-bottom: 0;
    }}
    .email-body {{
      padding: 36px;
    }}
    .greeting {{
      font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;
    }}
    .content-text {{
      font-size: 15px; color: #334155; margin-bottom: 20px; line-height: 1.65;
    }}
    .highlight-card {{
      background-color: #f0fdfa; border: 1px solid #99f6e4; border-radius: 12px; padding: 18px 22px; margin: 24px 0; color: #115e59; font-size: 14px;
    }}
    .btn-container {{
      margin: 32px 0 24px 0; text-align: left;
    }}
    .cta-button {{
      display: inline-block; background-color: #0f766e; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 2px 6px rgba(15, 118, 110, 0.25); text-align: center;
    }}
    .security-notice {{
      margin-top: 24px; padding-top: 18px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.5;
    }}
    .email-footer {{
      background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: left; font-size: 12px; color: #64748b; line-height: 1.5;
    }}
    .footer-disclaimer {{
      color: #94a3b8; font-size: 11px; margin-top: 8px;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1 class="header-logo">🏥 {app_name}</h1>
      <p class="header-subtitle">Multimodal Clinical Triage & Handoff Network</p>
    </div>
    <div class="email-body">
      {content}
      <div class="security-notice">
        <strong>Privacy & Security Reminder:</strong> SwasthyaFlow AI is a clinical workflow support system. We never request passwords, verification codes, or personal health records via email.
      </div>
    </div>
    <div class="email-footer">
      <div><strong>{app_name}</strong> · National Digital Health Mission Aligned System</div>
      <div>Need assistance? Contact our technical helpdesk at <a href="mailto:{support_email}" style="color: #0f766e;">{support_email}</a>.</div>
      <p class="footer-disclaimer">
        Notice: This platform supports authorized healthcare teams and does not replace independent clinical judgment. All patient consultations must be reviewed by qualified medical professionals.
      </p>
    </div>
  </div>
</body>
</html>
"""


def render_email_template(
    template_name: str, context: dict
) -> tuple[str, str, str]:
    """Renders (subject, html_content, text_content) for any of the 9 Resend transactional templates."""
    name = html.escape(context.get("name") or "User")
    app_url = context.get("app_url", "http://localhost:5173")

    if template_name == "welcome":
        subject = f"Welcome to {APP_NAME}"
        login_url = f"{app_url}/auth/login"
        role_label = html.escape(str(context.get("role", "Authorized Member")).replace("_", " ").title())

        body_html = f"""
        <h2 class="greeting">Welcome, {name}!</h2>
        <p class="content-text">
          Your account on <strong>{APP_NAME}</strong> has been created successfully. The platform helps authorized healthcare teams organize patient-reported symptoms, review structured evidence, and coordinate timely clinical handoffs.
        </p>
        <div class="highlight-card">
          <strong>Account Role:</strong> {role_label}<br>
          <strong>Security Protocol:</strong> Single-session token authentication enabled.
        </div>
        <p class="content-text">
          You can now sign in to access your assigned queue, patient assessment records, and healthcare facilities.
        </p>
        <div class="btn-container">
          <a href="{login_url}" class="cta-button" target="_blank">Sign In to {APP_NAME}</a>
        </div>
        """
        text = f"""Welcome to {APP_NAME}, {name}!

Your account has been created successfully.
Role: {role_label}

{APP_NAME} helps authorized healthcare teams organize patient-reported symptoms, review evidence, and coordinate timely clinical handoffs.

Sign in to your account:
{login_url}

Need support? Contact {SUPPORT_EMAIL}.
"""

    elif template_name == "email_verification":
        subject = f"Verify your {APP_NAME} email address"
        token = context.get("token", "")
        verify_url = f"{app_url}/auth/verify-email?token={token}"
        expires_hours = context.get("expires_hours", 24)

        body_html = f"""
        <h2 class="greeting">Hello, {name}</h2>
        <p class="content-text">
          Please confirm your email address to verify your <strong>{APP_NAME}</strong> account and activate full workflow permissions.
        </p>
        <div class="btn-container">
          <a href="{verify_url}" class="cta-button" target="_blank">Verify Email Address</a>
        </div>
        <p class="content-text">
          This verification link is single-use and will expire in <strong>{expires_hours} hours</strong>. If you did not create an account on {APP_NAME}, please disregard this message.
        </p>
        <p class="content-text" style="font-size: 13px; color: #64748b;">
          If the button does not work, copy and paste this link in your browser:<br>
          <span style="word-break: break-all; color: #0f766e;">{verify_url}</span>
        </p>
        """
        text = f"""Verify your {APP_NAME} email address

Hello {name},

Please confirm your email address using the following link:
{verify_url}

This link is valid for {expires_hours} hours. If you did not request this, please ignore this email.
"""

    elif template_name == "password_reset":
        subject = f"Reset your {APP_NAME} password"
        token = context.get("token", "")
        reset_url = f"{app_url}/auth/reset-password?token={token}"
        expires_minutes = context.get("expires_minutes", 30)

        body_html = f"""
        <h2 class="greeting">Password Reset Request</h2>
        <p class="content-text">
          We received a request to reset the password for your <strong>{APP_NAME}</strong> account.
        </p>
        <div class="btn-container">
          <a href="{reset_url}" class="cta-button" target="_blank">Reset Password</a>
        </div>
        <div class="highlight-card">
          <strong>Security Expiry:</strong> This secure reset link is valid for {expires_minutes} minutes and can only be used once.
        </div>
        <p class="content-text">
          If you did not request this password reset, no action is required. Your password remains safe and unchanged.
        </p>
        <p class="content-text" style="font-size: 13px; color: #64748b;">
          Direct reset link:<br>
          <span style="word-break: break-all; color: #0f766e;">{reset_url}</span>
        </p>
        """
        text = f"""Reset your {APP_NAME} password

A request was made to reset your password. Use the link below:
{reset_url}

This link expires in {expires_minutes} minutes. If you did not request this, no action is required.
"""

    elif template_name == "password_changed":
        subject = f"Your {APP_NAME} password was changed"
        time_str = context.get("time_str", "Just now")

        body_html = f"""
        <h2 class="greeting">Security Alert: Password Changed</h2>
        <p class="content-text">
          The password for your <strong>{APP_NAME}</strong> account was successfully updated on <strong>{html.escape(time_str)}</strong>.
        </p>
        <p class="content-text">
          All existing refresh tokens and active mobile/web sessions have been revoked for your security.
        </p>
        <div class="highlight-card" style="background-color: #fef2f2; border-color: #fecaca; color: #991b1b;">
          <strong>Did not make this change?</strong><br>
          If you did not initiate this change, contact your facility administrator or email our security desk immediately at <a href="mailto:{SUPPORT_EMAIL}" style="color: #991b1b;">{SUPPORT_EMAIL}</a>.
        </div>
        """
        text = f"""Your {APP_NAME} password was changed

The password for your account was changed at {time_str}.
If you did not make this change, please contact {SUPPORT_EMAIL} immediately.
"""

    elif template_name == "staff_invitation":
        facility = html.escape(context.get("facility_name") or "Healthcare Centre")
        role = html.escape(str(context.get("role", "Healthcare Worker")).replace("_", " ").title())
        token = context.get("token", "")
        invite_url = f"{app_url}/auth/login?invite={token}"

        subject = f"You have been invited to {APP_NAME} — {facility}"
        body_html = f"""
        <h2 class="greeting">Staff Invitation</h2>
        <p class="content-text">
          You have been invited to join <strong>{facility}</strong> on <strong>{APP_NAME}</strong> as a certified <strong>{role}</strong>.
        </p>
        <p class="content-text">
          The platform streamlines outpatient queue management, multimodal patient intake triage, and secure clinical referrals.
        </p>
        <div class="btn-container">
          <a href="{invite_url}" class="cta-button" target="_blank">Accept Invitation & Get Started</a>
        </div>
        <p class="content-text">
          Please complete your onboarding and verification within 7 days.
        </p>
        """
        text = f"""You have been invited to {APP_NAME}

Facility: {facility}
Assigned Role: {role}

Accept your invitation:
{invite_url}
"""

    elif template_name == "encounter_assignment":
        case_ref = html.escape(str(context.get("case_number", "Case Reference")))
        case_id = context.get("case_id", "")
        case_url = f"{app_url}/app/hcw/cases/{case_id}"

        subject = f"Encounter Assigned for Review: {case_ref}"
        body_html = f"""
        <h2 class="greeting">New Encounter Assigned</h2>
        <p class="content-text">
          A patient triage encounter with reference <strong>#{case_ref}</strong> has been assigned to your review queue.
        </p>
        <div class="highlight-card">
          <strong>Encounter Reference:</strong> #{case_ref}<br>
          <strong>Status:</strong> Ready for Clinical Handoff / Review
        </div>
        <p class="content-text">
          For patient privacy and statutory data security, clinical details and symptoms are accessible only within the authenticated application.
        </p>
        <div class="btn-container">
          <a href="{case_url}" class="cta-button" target="_blank">Open Encounter in Application</a>
        </div>
        """
        text = f"""New Encounter Assigned: #{case_ref}

A new encounter has been assigned to your clinical queue.
Sign in to review details securely:
{case_url}
"""

    elif template_name == "clarification_request":
        case_ref = html.escape(str(context.get("case_number", "Case Reference")))
        case_id = context.get("case_id", "")
        case_url = f"{app_url}/app/hcw/cases/{case_id}"

        subject = f"Clarification Requested: Encounter #{case_ref}"
        body_html = f"""
        <h2 class="greeting">Clarification Required</h2>
        <p class="content-text">
          Additional clinical information or clarifying documentation has been requested for encounter <strong>#{case_ref}</strong>.
        </p>
        <p class="content-text">
          Please log in to your secure portal to respond to the healthcare provider's inquiry.
        </p>
        <div class="btn-container">
          <a href="{case_url}" class="cta-button" target="_blank">Review Clarification Request</a>
        </div>
        """
        text = f"""Clarification Requested for Encounter #{case_ref}

Additional details have been requested for this case.
View and respond securely:
{case_url}
"""

    elif template_name == "referral_status":
        case_ref = html.escape(str(context.get("case_number", "Case Reference")))
        status = html.escape(str(context.get("status", "UPDATED")).replace("_", " ").title())
        case_id = context.get("case_id", "")
        case_url = f"{app_url}/app/hcw/cases/{case_id}"

        subject = f"Clinical Handoff Status: {status} (#{case_ref})"
        body_html = f"""
        <h2 class="greeting">Clinical Handoff Status Update</h2>
        <p class="content-text">
          The referral / clinical handoff status for encounter <strong>#{case_ref}</strong> has transitioned to:
        </p>
        <div class="highlight-card">
          <strong>Current Status:</strong> {status}<br>
          <strong>Encounter ID:</strong> #{case_ref}
        </div>
        <div class="btn-container">
          <a href="{case_url}" class="cta-button" target="_blank">View Referral Details</a>
        </div>
        """
        text = f"""Clinical Handoff Status Update: #{case_ref}

Status: {status}
View referral details:
{case_url}
"""

    elif template_name == "security_alert":
        action = html.escape(context.get("action_title", "Account Security Event"))
        details = html.escape(context.get("details", "A security-relevant event occurred on your account."))
        time_str = context.get("time_str", "Recently")

        subject = f"Security Alert: {action} — {APP_NAME}"
        body_html = f"""
        <h2 class="greeting">Account Security Alert</h2>
        <p class="content-text">
          We detected the following activity on your <strong>{APP_NAME}</strong> account:
        </p>
        <div class="highlight-card" style="background-color: #fffbeb; border-color: #fde68a; color: #92400e;">
          <strong>Event:</strong> {action}<br>
          <strong>Time:</strong> {time_str}<br>
          <strong>Details:</strong> {details}
        </div>
        <p class="content-text">
          If this action was taken by you, no further action is necessary. If this was unexpected, please sign in and change your password, or contact our support team immediately.
        </p>
        """
        text = f"""Security Alert: {action}

Time: {time_str}
Details: {details}

If you did not authorize this action, please contact {SUPPORT_EMAIL} immediately.
"""

    else:
        subject = f"Notification from {APP_NAME}"
        msg = html.escape(context.get("message", "You have a new notification from SwasthyaFlow AI."))
        body_html = f"""
        <h2 class="greeting">Notification</h2>
        <p class="content-text">{msg}</p>
        """
        text = f"""Notification from {APP_NAME}

{msg}
"""

    full_html = BASE_HTML_WRAPPER.format(
        subject=subject,
        content=body_html,
        app_name=APP_NAME,
        support_email=SUPPORT_EMAIL,
    )
    return subject, full_html, text
