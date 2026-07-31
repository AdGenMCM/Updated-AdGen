from __future__ import annotations

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


def _safe(value: Optional[str], fallback: str = "") -> str:
    return escape((value or fallback).strip(), quote=True)


def render_base_email(
    *,
    preview_text: str,
    eyebrow: str,
    heading: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    footer_note: Optional[str] = None,
) -> str:
    preview = _safe(preview_text)
    safe_eyebrow = _safe(eyebrow)
    safe_heading = _safe(heading)
    safe_cta_label = _safe(cta_label)
    safe_cta_url = _safe(cta_url)
    safe_footer_note = _safe(
        footer_note,
        (
            "You are receiving this service email because "
            "you created an ADGen MCM account."
        ),
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
            <td
              align="center"
              style="
                border-radius:13px;
                background:{PURPLE};
              "
            >
              <a
                href="{safe_cta_url}"
                target="_blank"
                style="
                  display:inline-block;
                  padding:15px 25px;
                  border-radius:13px;
                  background:linear-gradient(
                    135deg,
                    {PURPLE},
                    {PURPLE_DARK}
                  );
                  color:#ffffff;
                  font-size:15px;
                  font-weight:800;
                  line-height:1.2;
                  text-decoration:none;
                "
              >
                {safe_cta_label}
              </a>
            </td>
          </tr>
        </table>
        """

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />
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
      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        Roboto,
        Arial,
        sans-serif;
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
                    margin-bottom:13px;
                    color:{PURPLE_LIGHT};
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

                <div
                  style="
                    color:{MUTED};
                    font-size:16px;
                    line-height:1.7;
                  "
                >
                  {body_html}
                </div>

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
                    <td style="padding:22px 24px;">
                      <div
                        style="
                          margin-bottom:15px;
                          color:{TEXT};
                          font-size:14px;
                          font-weight:800;
                        "
                      >
                        Everything your brand needs in one workspace
                      </div>

                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                      >
                        <tr>
                          <td
                            width="50%"
                            valign="top"
                            style="
                              padding:5px 10px 5px 0;
                              color:{MUTED};
                              font-size:13px;
                              line-height:1.5;
                            "
                          >
                            <span style="color:{PURPLE_LIGHT};">✓</span>
                            Image ads and ad copy
                          </td>

                          <td
                            width="50%"
                            valign="top"
                            style="
                              padding:5px 0 5px 10px;
                              color:{MUTED};
                              font-size:13px;
                              line-height:1.5;
                            "
                          >
                            <span style="color:{PURPLE_LIGHT};">✓</span>
                            Campaign-ready video
                          </td>
                        </tr>

                        <tr>
                          <td
                            width="50%"
                            valign="top"
                            style="
                              padding:5px 10px 5px 0;
                              color:{MUTED};
                              font-size:13px;
                              line-height:1.5;
                            "
                          >
                            <span style="color:{PURPLE_LIGHT};">✓</span>
                            Brand Kit consistency
                          </td>

                          <td
                            width="50%"
                            valign="top"
                            style="
                              padding:5px 0 5px 10px;
                              color:{MUTED};
                              font-size:13px;
                              line-height:1.5;
                            "
                          >
                            <span style="color:{PURPLE_LIGHT};">✓</span>
                            Performance intelligence
                          </td>
                        </tr>
                      </table>
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

                <div style="margin-top:10px;">
                  © ADGen MCM
                </div>
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

    ad_generator_url = urljoin(
        f"{app_url.rstrip('/')}/",
        "adgenerator",
    )

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
        cta_label="Create My First Ad →",
        cta_url=ad_generator_url,
    )

    return subject, html
