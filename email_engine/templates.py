from __future__ import annotations

from dataclasses import dataclass
from html import escape
from typing import Optional
from urllib.parse import urljoin


BACKGROUND = "#070B14"
SURFACE = "#0F172A"
SURFACE_ALT = "#111C33"
BORDER = "#263247"
TEXT = "#F8FAFC"
MUTED = "#A8B3C7"
SUBTLE = "#7F8BA3"
PURPLE = "#7C3AED"
PURPLE_DARK = "#5B21B6"
PURPLE_LIGHT = "#A970FF"
BLUE = "#2563EB"
GREEN = "#10B981"
AMBER = "#F59E0B"
RED = "#EF4444"


@dataclass(frozen=True)
class LifecycleTemplate:
    subject: str
    preview: str
    eyebrow: str
    heading: str
    intro: str
    detail: str
    cta_label: str
    accent: str = PURPLE
    panel_title: Optional[str] = None
    panel_items: tuple[str, ...] = ()
    footer_note: Optional[str] = None


def _safe(value: Optional[str], fallback: str = "") -> str:
    return escape((value or fallback).strip(), quote=True)


def _paragraph(text: str, *, margin_bottom: int = 0) -> str:
    return (
        f'<p style="margin:0 0 {margin_bottom}px;">'
        f"{_safe(text)}"
        "</p>"
    )


def _feature_panel(title: str, items: tuple[str, ...], accent: str) -> str:
    if not items:
        return ""

    rows = "".join(
        f"""
        <tr>
          <td
            valign="top"
            style="padding:7px 0;color:{MUTED};font-size:14px;line-height:1.55;"
          >
            <span style="color:{accent};font-weight:900;">✓</span>
            &nbsp;{_safe(item)}
          </td>
        </tr>
        """
        for item in items
    )

    return f"""
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="
        width:100%;
        margin-top:26px;
        border:1px solid {BORDER};
        border-radius:16px;
        background:{SURFACE_ALT};
      "
    >
      <tr>
        <td style="padding:20px 22px;">
          <div
            style="
              margin-bottom:7px;
              color:{TEXT};
              font-size:14px;
              font-weight:800;
              line-height:1.4;
            "
          >
            {_safe(title)}
          </div>

          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
          >
            {rows}
          </table>
        </td>
      </tr>
    </table>
    """


def render_base_email(
    *,
    preview_text: str,
    eyebrow: str,
    heading: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    footer_note: Optional[str] = None,
    accent: str = PURPLE,
    supporting_html: str = "",
) -> str:
    preview = _safe(preview_text)
    safe_eyebrow = _safe(eyebrow)
    safe_heading = _safe(heading)
    safe_cta_label = _safe(cta_label)
    safe_cta_url = _safe(cta_url)
    safe_footer_note = _safe(
        footer_note,
        "You are receiving this service email because you created an ADGen MCM account.",
    )

    cta = ""
    if safe_cta_label and safe_cta_url:
        cta = f"""
        <table
          role="presentation"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="margin-top:30px;"
        >
          <tr>
            <td align="center" style="border-radius:13px;background:{accent};">
              <a
                href="{safe_cta_url}"
                target="_blank"
                style="
                  display:inline-block;
                  padding:15px 25px;
                  border-radius:13px;
                  background:{accent};
                  color:#ffffff;
                  font-size:15px;
                  font-weight:800;
                  line-height:1.2;
                  text-decoration:none;
                "
              >
                {safe_cta_label} →
              </a>
            </td>
          </tr>
        </table>
        """

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>{safe_heading}</title>
  </head>

  <body
    style="
      margin:0;
      padding:0;
      background:{BACKGROUND};
      color:{TEXT};
      font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    "
  >
    <div
      style="
        display:none;
        max-height:0;
        max-width:0;
        overflow:hidden;
        opacity:0;
        color:transparent;
      "
    >
      {preview}
    </div>

    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="width:100%;background:{BACKGROUND};"
    >
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="width:100%;max-width:620px;"
          >
            <tr>
              <td style="padding:0 6px 20px;">
                <div
                  style="
                    color:#ffffff;
                    font-size:24px;
                    font-weight:900;
                    line-height:1;
                    letter-spacing:-0.03em;
                  "
                >
                  ADGen MCM
                </div>

                <div
                  style="
                    margin-top:7px;
                    color:{SUBTLE};
                    font-size:11px;
                    font-weight:700;
                    letter-spacing:0.12em;
                    text-transform:uppercase;
                  "
                >
                  Intelligent Creative Workspace
                </div>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding:34px;
                  border:1px solid {BORDER};
                  border-radius:22px;
                  background:{SURFACE};
                  box-shadow:0 20px 55px rgba(0,0,0,0.28);
                "
              >
                <div
                  style="
                    width:42px;
                    height:4px;
                    margin-bottom:22px;
                    border-radius:999px;
                    background:{accent};
                  "
                ></div>

                <div
                  style="
                    margin-bottom:13px;
                    color:{accent};
                    font-size:12px;
                    font-weight:900;
                    letter-spacing:0.16em;
                    line-height:1.4;
                    text-transform:uppercase;
                  "
                >
                  {safe_eyebrow}
                </div>

                <h1
                  style="
                    margin:0 0 18px;
                    color:{TEXT};
                    font-size:31px;
                    font-weight:800;
                    line-height:1.18;
                    letter-spacing:-0.035em;
                  "
                >
                  {safe_heading}
                </h1>

                <div style="color:{MUTED};font-size:16px;line-height:1.7;">
                  {body_html}
                </div>

                {supporting_html}
                {cta}
              </td>
            </tr>

            <tr>
              <td style="padding-top:16px;">
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    width:100%;
                    border:1px solid {BORDER};
                    border-radius:18px;
                    background:{SURFACE_ALT};
                  "
                >
                  <tr>
                    <td style="padding:20px 24px;">
                      <div style="color:{TEXT};font-size:14px;font-weight:800;">
                        Build, organize, and improve creative in one place.
                      </div>

                      <div
                        style="
                          margin-top:7px;
                          color:{SUBTLE};
                          font-size:13px;
                          line-height:1.6;
                        "
                      >
                        ADGen keeps your creative workflow connected from generation to performance.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding:22px 8px 0;
                  color:{SUBTLE};
                  font-size:12px;
                  line-height:1.7;
                "
              >
                <div>{safe_footer_note}</div>

                <div style="margin-top:10px;">
                  Need help? Reply to this email or contact
                  <a
                    href="mailto:support@adgenmcm.com"
                    style="color:{PURPLE_LIGHT};text-decoration:none;"
                  >
                    support@adgenmcm.com
                  </a>.
                </div>

                <div style="margin-top:10px;">© ADGen MCM</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def render_welcome_email(
    *,
    first_name: str,
    app_url: str,
) -> tuple[str, str]:
    name = (first_name or "there").strip()
    safe_name = _safe(name, "there")
    subject = "Welcome to ADGen MCM — create your first ad"
    ad_generator_url = urljoin(f"{app_url.rstrip('/')}/", "adgenerator")

    html = render_base_email(
        preview_text=(
            "Your ADGen MCM creative workspace is ready. "
            "Create your first campaign-ready ad."
        ),
        eyebrow="Welcome to ADGen MCM",
        heading=f"Your creative workspace is ready, {name}.",
        body_html=(
            f"""
            <p style="margin:0 0 16px;">
              Welcome, {safe_name}. Generate campaign-ready image ads,
              videos, and marketing copy from one intelligent creative
              workspace.
            </p>

            <p style="margin:0;">
              Start by creating your first ad. ADGen MCM will save your
              work automatically as you begin building your creative
              library and performance intelligence.
            </p>
            """
        ),
        cta_label="Create My First Ad",
        cta_url=ad_generator_url,
    )

    return subject, html


def _campaign_template(
    *,
    campaign_key: str,
    first_name: str,
    title: str,
    body: str,
    cta_label: str,
    tier: str,
) -> LifecycleTemplate:
    name = first_name or "there"
    plan_name = {
        "free": "Free",
        "trial_monthly": "Trial",
        "starter_monthly": "Starter",
        "pro_monthly": "Pro",
        "business_monthly": "Business",
    }.get(tier, "your")

    templates: dict[str, LifecycleTemplate] = {
        "first_image": LifecycleTemplate(
            subject="Your first ADGen creative is one prompt away",
            preview="Turn your idea into a campaign-ready image ad in minutes.",
            eyebrow="Start creating",
            heading=f"Create your first image, {name}.",
            intro=body,
            detail=(
                "Describe your brand, product, audience, and goal. ADGen will generate the "
                "creative and ad copy, then save the result directly to your Library."
            ),
            cta_label=cta_label,
            panel_title="A simple first workflow",
            panel_items=(
                "Choose a creative style and format",
                "Add your product, audience, and offer",
                "Generate an image and matching ad copy",
            ),
        ),
        "brand_kit": LifecycleTemplate(
            subject="Make every ADGen creative feel like your brand",
            preview="Set up your Brand Kit once and keep future creative consistent.",
            eyebrow="Brand consistency",
            heading="Give every creative a consistent identity.",
            intro=body,
            detail=(
                "Add your logo, colors, fonts, voice, audience, and preferred creative style. "
                "Once enabled, ADGen can use that identity throughout your workflow."
            ),
            cta_label=cta_label,
            panel_title="Your Brand Kit can guide",
            panel_items=(
                "Image and video creative direction",
                "Brand voice, calls to action, and copy tone",
                "Logos, colors, fonts, and visual consistency",
            ),
        ),
        "first_video": LifecycleTemplate(
            subject="Your plan includes campaign-ready Video Ads",
            preview="Animate an image or generate a marketing video from a prompt.",
            eyebrow=f"Included with {plan_name}",
            heading="Bring your next campaign to life with video.",
            intro=body,
            detail=(
                "Start from an existing image or describe the scene you want. ADGen helps turn "
                "the idea into a polished short-form video built for marketing."
            ),
            cta_label=cta_label,
            panel_title="Two ways to get started",
            panel_items=(
                "Animate an image you already created",
                "Generate a video directly from a prompt",
                "Choose a duration and mobile-ready format",
            ),
            accent=BLUE,
        ),
        "google_ads": LifecycleTemplate(
            subject="Connect Google Ads and bring performance into ADGen",
            preview="Use real campaign results to strengthen your creative intelligence.",
            eyebrow="Performance connection",
            heading="Let your campaign data inform what you create next.",
            intro=body,
            detail=(
                "Once connected, ADGen can bring your Google Ads performance into Insights and "
                "use qualified results to support smarter creative decisions."
            ),
            cta_label=cta_label,
            panel_title="What the connection unlocks",
            panel_items=(
                "Campaign and creative performance in Insights",
                "A clearer view of winning creative patterns",
                "Better inputs for Performance Intelligence",
            ),
            accent=BLUE,
        ),
        "meta_ads": LifecycleTemplate(
            subject="Connect Meta Ads and centralize your creative results",
            preview="Bring Meta campaign performance into your ADGen workspace.",
            eyebrow="Performance connection",
            heading="Keep Meta performance beside the creative that produced it.",
            intro=body,
            detail=(
                "Sync eligible Meta campaign data so your performance view stays connected to "
                "the creative workflow you already use inside ADGen."
            ),
            cta_label=cta_label,
            panel_title="A connected performance workflow",
            panel_items=(
                "Review campaign outcomes in one workspace",
                "Compare performance across creative assets",
                "Build a stronger history for future decisions",
            ),
            accent=BLUE,
        ),
        "performance_intelligence": LifecycleTemplate(
            subject="Help ADGen learn from your best-performing creative",
            preview="Turn qualified performance data into guidance for future generations.",
            eyebrow="Performance Intelligence",
            heading="Your winners can shape what ADGen creates next.",
            intro=body,
            detail=(
                "As qualified performance data becomes available, ADGen can identify useful "
                "patterns across style, tone, calls to action, formats, and creative direction."
            ),
            cta_label=cta_label,
            panel_title="Intelligence built from real outcomes",
            panel_items=(
                "Identify repeatable creative patterns",
                "Build a generation profile from strong performers",
                "Apply learned guidance to future image and video prompts",
            ),
            accent=GREEN,
        ),
        "optimizer_intro": LifecycleTemplate(
            subject="Turn an existing ad into a stronger next version",
            preview="Use the ADGen Optimizer to diagnose creative and generate improvements.",
            eyebrow="Ad Performance Optimizer",
            heading="Find the next improvement hidden in your current ad.",
            intro=body,
            detail=(
                "Upload an existing ad and add the performance context you have. The Optimizer "
                "can diagnose likely issues and generate actionable creative recommendations."
            ),
            cta_label=cta_label,
            panel_title="From diagnosis to improved creative",
            panel_items=(
                "Review likely creative weaknesses",
                "Receive focused recommendations",
                "Generate improved copy and image direction",
            ),
            accent=GREEN,
        ),
        "free_upgrade": LifecycleTemplate(
            subject="Keep creating beyond your Free plan allowance",
            preview="Compare plans for more generation capacity and expanded creative tools.",
            eyebrow="Your next plan",
            heading="You have reached the edge of your Free workspace.",
            intro=body,
            detail=(
                "A paid plan gives you more monthly image capacity and access to a broader "
                "creative workflow when you are ready to continue."
            ),
            cta_label=cta_label,
            panel_title="Upgrade when you need more room",
            panel_items=(
                "More monthly image generations",
                "Video Ads starting with eligible paid access",
                "Expanded brand and creative workflow features",
            ),
            accent=AMBER,
        ),
        "trial_upgrade": LifecycleTemplate(
            subject="Continue your ADGen workflow after the Trial",
            preview="Choose the plan that matches how you want to create.",
            eyebrow="Continue creating",
            heading="Your Trial showed you what the workspace can do.",
            intro=body,
            detail=(
                "Choose a paid plan to keep your creative library moving with recurring monthly "
                "capacity and the feature access that fits your workflow."
            ),
            cta_label=cta_label,
            panel_title="Choose around your workflow",
            panel_items=(
                "Starter for core creative production",
                "Pro for performance and optimization tools",
                "Business for higher limits and priority generation",
            ),
            accent=AMBER,
        ),
        "starter_upgrade": LifecycleTemplate(
            subject="You are approaching your Starter image allowance",
            preview="Compare Pro for more capacity and performance intelligence.",
            eyebrow="Plan capacity",
            heading="Your creative workflow is outgrowing Starter.",
            intro=body,
            detail=(
                "Pro increases your monthly creative capacity and unlocks ADGen's performance "
                "tracking, intelligence, and optimization workflow."
            ),
            cta_label=cta_label,
            panel_title="What Pro adds",
            panel_items=(
                "Higher image and video limits",
                "Google and Meta Ads performance connections",
                "Performance Intelligence and the Optimizer",
            ),
            accent=AMBER,
        ),
        "pro_upgrade": LifecycleTemplate(
            subject="Your Pro workspace is approaching its current capacity",
            preview="Compare Business for higher limits and priority generation.",
            eyebrow="Plan capacity",
            heading="Your usage is beginning to look like a Business workflow.",
            intro=body,
            detail=(
                "Business is designed for heavier creative production with expanded monthly "
                "limits, more storage, and priority generation."
            ),
            cta_label=cta_label,
            panel_title="Built for higher-volume creation",
            panel_items=(
                "Expanded image, video, and optimizer capacity",
                "More creative storage",
                "Priority generation access",
            ),
            accent=AMBER,
        ),
        "inactive_7_days": LifecycleTemplate(
            subject="Your ADGen workspace is ready for your next idea",
            preview="Return to the creative workflow you started.",
            eyebrow="Your workspace",
            heading="Pick up where you left off.",
            intro=body,
            detail=(
                "Your Library and account access are waiting. Open ADGen when you have your next "
                "campaign, product, offer, or creative direction ready."
            ),
            cta_label=cta_label,
            panel_title="A quick way back in",
            panel_items=(
                "Generate a new image and ad copy",
                "Review creative already saved in your Library",
                "Use the features included with your current plan",
            ),
        ),
        "inactive_21_days": LifecycleTemplate(
            subject="A fresh campaign idea can start in a few minutes",
            preview="Come back to ADGen and turn your next idea into creative.",
            eyebrow="Create something new",
            heading="Your next campaign does not need to start from a blank page.",
            intro=body,
            detail=(
                "Bring a product, audience, offer, or rough concept. ADGen can help turn it into "
                "a campaign-ready direction and keep the output organized in your Library."
            ),
            cta_label=cta_label,
            panel_title="Start with what you already know",
            panel_items=(
                "A product or service to promote",
                "An audience you want to reach",
                "A goal, offer, or creative style",
            ),
        ),
        "inactive_45_days": LifecycleTemplate(
            subject="Your creative workspace is still here when you need it",
            preview="Return to your ADGen account and continue creating.",
            eyebrow="Welcome back anytime",
            heading="Your ADGen workspace has not gone anywhere.",
            intro=body,
            detail=(
                "When a new campaign or content need comes up, your account is ready. Return to "
                "generate, organize, and improve creative from one place."
            ),
            cta_label=cta_label,
            panel_title="Everything stays connected",
            panel_items=(
                "Creative generation and copy",
                "Your saved Library assets",
                "Plan-aware tools and usage",
            ),
        ),
        "inactive_90_days": LifecycleTemplate(
            subject="ADGen is ready when your next campaign is",
            preview="One final reminder that your creative workspace remains available.",
            eyebrow="A final check-in",
            heading="We will keep this simple, {name}.",
            intro=body,
            detail=(
                "There is nothing you need to do today. When the next campaign, launch, or content "
                "need arrives, ADGen will be ready to help you move from idea to creative."
            ),
            cta_label=cta_label,
            panel_title="Return when the timing is right",
            panel_items=(
                "No need to rebuild your workflow",
                "Your account remains ready to use",
                "Start again with a single creative brief",
            ),
        ),
    }

    if campaign_key in {"image_usage", "video_usage", "optimizer_usage"}:
        reached = "reached" in title.lower()
        resource_label = {
            "image_usage": "image generation",
            "video_usage": "video credit",
            "optimizer_usage": "optimizer",
        }[campaign_key]
        accent = RED if reached else AMBER
        return LifecycleTemplate(
            subject=title,
            preview=f"Review your current {resource_label} usage before your next session.",
            eyebrow="Usage update",
            heading=title,
            intro=body,
            detail=(
                "This alert is sent once for the current threshold and billing period, so you can "
                "plan ahead without receiving repeated reminders."
            ),
            cta_label=cta_label,
            panel_title="Your options from here",
            panel_items=(
                "Review your current usage and reset timing",
                "Continue with the capacity still available",
                "Compare plans if you need more room",
            ),
            accent=accent,
        )

    return templates.get(
        campaign_key,
        LifecycleTemplate(
            subject=title,
            preview=body,
            eyebrow="Your next step",
            heading=title,
            intro=body,
            detail="Open your ADGen workspace to continue from here.",
            cta_label=cta_label,
        ),
    )


def render_lifecycle_campaign_email(
    *,
    campaign_key: str,
    first_name: str,
    title: str,
    body: str,
    cta_label: str,
    cta_url: str,
    tier: str,
) -> tuple[str, str]:
    template = _campaign_template(
        campaign_key=campaign_key,
        first_name=first_name,
        title=title,
        body=body,
        cta_label=cta_label,
        tier=tier,
    )

    body_html = (
        _paragraph(f"Hi {first_name or 'there'},", margin_bottom=14)
        + _paragraph(template.intro, margin_bottom=14)
        + _paragraph(template.detail)
    )

    supporting_html = _feature_panel(
        template.panel_title or "",
        template.panel_items,
        template.accent,
    )

    html = render_base_email(
        preview_text=template.preview,
        eyebrow=template.eyebrow,
        heading=template.heading,
        body_html=body_html,
        cta_label=template.cta_label,
        cta_url=cta_url,
        footer_note=template.footer_note,
        accent=template.accent,
        supporting_html=supporting_html,
    )

    return template.subject, html


def render_lifecycle_email(
    *,
    first_name: str,
    title: str,
    body: str,
    cta_label: str,
    cta_url: str,
    eyebrow: str = "Your next step",
) -> tuple[str, str]:
    """Backward-compatible generic lifecycle renderer."""
    del eyebrow
    return render_lifecycle_campaign_email(
        campaign_key="generic",
        first_name=first_name,
        title=title,
        body=body,
        cta_label=cta_label,
        cta_url=cta_url,
        tier="",
    )
