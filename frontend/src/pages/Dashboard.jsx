import { useEffect } from "react";
import "./Dashboard.css";
import SectionTitle from "../components/ui/SectionTitle";
import StatCard from "../components/ui/StatCard";
import ActionCard from "../components/ui/ActionCard";
import Card from "../components/ui/Card";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  Wand2,
  Clapperboard,
  BarChart3,
  Image,
  Palette,
  Video,
  HardDrive,
} from "lucide-react";
import { auth } from "../firebaseConfig";

function formatStorageUsage(usedBytes = 0, limitBytes = 0) {
  const safeUsed = Math.max(0, Number(usedBytes) || 0);
  const safeLimit = Math.max(0, Number(limitBytes) || 0);

  const KB = 1024;
  const MB = 1024 ** 2;
  const GB = 1024 ** 3;

  let usedLabel = "0 B";

  if (safeUsed >= GB) {
    usedLabel = `${(safeUsed / GB).toFixed(2)} GB`;
  } else if (safeUsed >= MB) {
    usedLabel = `${(safeUsed / MB).toFixed(2)} MB`;
  } else if (safeUsed >= KB) {
    usedLabel = `${(safeUsed / KB).toFixed(1)} KB`;
  } else if (safeUsed > 0) {
    usedLabel = `${Math.round(safeUsed)} B`;
  }

  let limitLabel = "0 GB";

  if (safeLimit >= GB) {
    const limitInGb = safeLimit / GB;
    limitLabel = `${Number.isInteger(limitInGb) ? limitInGb.toFixed(0) : limitInGb.toFixed(1)} GB`;
  } else if (safeLimit >= MB) {
    limitLabel = `${(safeLimit / MB).toFixed(0)} MB`;
  } else if (safeLimit >= KB) {
    limitLabel = `${(safeLimit / KB).toFixed(0)} KB`;
  } else if (safeLimit > 0) {
    limitLabel = `${Math.round(safeLimit)} B`;
  }

  return `${usedLabel} / ${limitLabel}`;
}

export default function Dashboard() {
  const {
    usage,
    videoUsage,
    storageUsage,
    recentCreatives,
    brandKitStatus,
    refreshWorkspace,
  } = useWorkspace() || {};

  const imageUsed = usage?.used ?? 0;
  const imageCap = usage?.cap ?? 0;
  const videoUsed = videoUsage?.used ?? 0;
  const videoCap = videoUsage?.cap ?? 0;

  useEffect(() => {
    refreshWorkspace?.();
    // Refresh once whenever the Dashboard mounts so usage, storage,
    // recent creatives, and Brand Kit data are current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missingBrandItems = brandKitStatus?.missing || [];

  const nextStep = (() => {
    if (missingBrandItems.length) {
      return {
        title: "Finish your Brand Kit",
        description: `Complete ${missingBrandItems.slice(0, 3).join(", ")} to improve brand consistency across future creatives.`,
        link: "/brand-kit",
        cta: "Complete Brand Kit →",
      };
    }

    if (!recentCreatives?.length) {
      return {
        title: "Generate your first ad",
        description: "Create your first image ad so AdGen can start building your creative library.",
        link: "/adgenerator",
        cta: "Generate Ad →",
      };
    }

    if (videoCap > 0 && videoUsed === 0) {
      return {
        title: "Try your first video ad",
        description: "You have video credits available. Turn an image or prompt into a short-form ad.",
        link: "/video-ads",
        cta: "Generate Video →",
      };
    }

    return {
      title: "Track creative performance",
      description: "Add performance data in your Library so AdGen can identify winning patterns.",
      link: "/library",
      cta: "Open Library →",
    };
  })();

  const fullName = auth.currentUser?.displayName || "";
  const firstName = fullName.trim().split(" ")[0] || "there";

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <SectionTitle
          eyebrow="Workspace"
          title={`Welcome back, ${firstName}`}
          description="Generate, optimize, and track high-performing ad creative from one command center."
        />
      </section>

      <div className="dashboard-stats">
        <StatCard
          to="/account"
          label="Image Usage"
          value={`${imageUsed} / ${imageCap}`}
          description="Monthly image credits used"
          icon={<Image size={20} />}
        />

        <StatCard
          to="/account"
          label="Video Usage"
          value={videoCap > 0 ? `${videoUsed} / ${videoCap}` : "Not included"}
          description={videoCap > 0 ? "Monthly video credits used" : "Upgrade to unlock video"}
          icon={<Video size={20} />}
        />

        <StatCard
          to="/brand-kit"
          label="Brand Kit"
          value={brandKitStatus?.label || "Needs Setup"}
          description={
            missingBrandItems.length
              ? `${missingBrandItems.length} key items remaining`
              : "Brand Kit ready"
          }
          icon={<Palette size={20} />}
        />

        <StatCard
          to="/account"
          label="Storage"
          value={formatStorageUsage(
            storageUsage?.usedBytes,
            storageUsage?.limitBytes
          )}
          description="Creative storage used"
          icon={<HardDrive size={20} />}
        />
      </div>

      <section className="dashboard-section">
        <SectionTitle
          eyebrow="Quick Actions"
          title="Create your next campaign asset"
          description="Jump directly into the tools used most often."
        />

        <div className="dashboard-actions-grid">
          <ActionCard
            to="/adgenerator"
            icon={<Wand2 size={22} />}
            title="Generate Ad"
            description="Create image ads and copy."
          />

          <ActionCard
            to="/video-ads"
            icon={<Clapperboard size={22} />}
            title="Generate Video"
            description="Turn prompts or images into video ads."
          />

          <ActionCard
            to="/optimizer"
            icon={<BarChart3 size={22} />}
            title="Optimize Creative"
            description="Improve ads using performance data."
          />
        </div>
      </section>

      <section className="dashboard-section">
        <SectionTitle
          eyebrow="Overview"
          title="Workspace snapshot"
          description="Recent creative activity and next recommended actions."
        />

        <div className="dashboard-lower-grid">
          <Card className="dashboard-panel dashboard-recent-card">
            <div className="dashboard-panel-head">
              <h3>Recent Creatives</h3>
              <a href="/library">View Library →</a>
            </div>

            {recentCreatives?.length ? (
              <div className="dashboard-recent-grid">
                {recentCreatives.map((item) => (
                  <a
                    key={`${item.kind}-${item.id}`}
                    href={item.url || "/library"}
                    className="dashboard-recent-item"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="dashboard-recent-thumb">
                    {item.thumb ? (
                        item.kind === "video" ? (
                        <video
                            src={item.thumb}
                            muted
                            playsInline
                            preload="metadata"
                        />
                        ) : (
                        <img
                            src={item.thumb}
                            alt={item.title}
                        />
                        )
                    ) : (
                        <span>{item.kind === "video" ? "Video" : "Image"}</span>
                    )}
                    </div>
                    <strong>{item.title}</strong>
                    <span>{item.kind}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p>No successful creatives yet. Generate your first ad to see it here.</p>
            )}
          </Card>

          <Card className="dashboard-panel dashboard-brand-health">
            <h3>Brand Health</h3>

            <div className="brand-health-score">
              <strong>{brandKitStatus?.label || "Needs Setup"}</strong>
            </div>

            {missingBrandItems.length ? (
              <>
                <p>Complete these first to improve brand consistency:</p>

                <div className="brand-health-list">
                  {missingBrandItems.slice(0, 4).map((item) => (
                    <span key={item}>○ {item}</span>
                  ))}
                </div>

                <a href="/brand-kit" className="brand-health-link">
                  Complete Brand Kit →
                </a>
              </>
            ) : (
              <>
                <p>Your Brand Kit looks strong and is ready to guide future creatives.</p>
                <a href="/brand-kit" className="brand-health-link">
                  Review Brand Kit →
                </a>
              </>
            )}
          </Card>
        </div>

        <Card className="dashboard-panel dashboard-next-step">
          <div>
            <span className="dashboard-next-eyebrow">Recommended Next Step</span>
            <h3>{nextStep.title}</h3>
            <p>{nextStep.description}</p>
          </div>

          <a href={nextStep.link}>{nextStep.cta}</a>
        </Card>
      </section>
    </div>
  );
}