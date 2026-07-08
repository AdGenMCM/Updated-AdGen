import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../AuthProvider";
import { auth } from "../firebaseConfig";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const db = getFirestore();
const WorkspaceContext = createContext(null);

function getBrandKitStatus(brandKit) {
  if (!brandKit) {
    return {
      percent: 0,
      label: "Not Started",
      description: "Set up your logo, colors, and brand defaults.",
      missing: ["Logo", "Brand name", "Website", "Brand colors", "Brand fonts", "Brand voice"],
      checks: {},
    };
  }

  const hasLogo = !!brandKit.logoUrl;
  const hasBrandName = !!brandKit.brandName;
  const hasWebsite = !!brandKit.websiteUrl;

  const hasColors =
    !!brandKit.colorEnabled?.primary ||
    !!brandKit.colorEnabled?.secondary ||
    !!brandKit.colorEnabled?.accent;

  const hasFonts =
    !!brandKit.fontEnabled?.headline ||
    !!brandKit.fontEnabled?.body ||
    !!brandKit.fontEnabled?.cta;

  const hasVoice =
    !!brandKit.voice ||
    !!brandKit.brandPersonality ||
    !!brandKit.brandDna;

  const checks = [hasLogo, hasBrandName, hasWebsite, hasColors, hasFonts, hasVoice];

  const missing = [];
  if (!hasLogo) missing.push("Logo");
  if (!hasBrandName) missing.push("Brand name");
  if (!hasWebsite) missing.push("Website");
  if (!hasColors) missing.push("Brand colors");
  if (!hasFonts) missing.push("Brand fonts");
  if (!hasVoice) missing.push("Brand voice");

  const complete = checks.filter(Boolean).length;
  const percent = Math.round((complete / checks.length) * 100);

  let label = "Needs Setup";
  if (percent >= 85) label = "Excellent";
  else if (percent >= 60) label = "Ready";
  else if (percent >= 35) label = "In Progress";

  return {
    percent,
    label,
    description: `${complete} of ${checks.length} key brand items completed.`,
    missing,
    checks: {
      hasLogo,
      hasBrandName,
      hasWebsite,
      hasColors,
      hasFonts,
      hasVoice,
    },
  };
}

export function WorkspaceProvider({ children }) {
  const { currentUser, stripe } = useAuth();

  const [usage, setUsage] = useState(null);
  const [videoUsage, setVideoUsage] = useState(null);
  const [recentCreatives, setRecentCreatives] = useState([]);
  const [brandKitStatus, setBrandKitStatus] = useState(getBrandKitStatus(null));
  const [loading, setLoading] = useState(false);

  const didFetchRef = useRef(false);
  const lastUserIdRef = useRef(null);

  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  const tierLabels = useMemo(
    () => ({
      trial_monthly: "Trial",
      early_access: "Early Access",
      starter_monthly: "Starter",
      pro_monthly: "Pro",
      business_monthly: "Business",
    }),
    []
  );

  const planLabel = tierLabels[stripe?.tier] || stripe?.tier || "No active plan";

  async function fetchWorkspaceData({ force = false } = {}) {
    if (!currentUser || !apiBase) return;

    if (!force && didFetchRef.current && lastUserIdRef.current === currentUser.uid) {
      return;
    }

    didFetchRef.current = true;
    lastUserIdRef.current = currentUser.uid;

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();

      const [usageRes, videoRes, videoJobsRes, imageJobsRes, userSnap] =
        await Promise.all([
          fetch(`${apiBase}/usage`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/video/usage`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/video/jobs?limit=50`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/image/jobs?limit=50`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          getDoc(doc(db, "users", user.uid)),
        ]);

      const usageData = usageRes.ok ? await usageRes.json() : null;
      const videoData = videoRes.ok ? await videoRes.json() : null;
      const videoJobsData = videoJobsRes.ok ? await videoJobsRes.json() : { items: [] };
      const imageJobsData = imageJobsRes.ok ? await imageJobsRes.json() : { items: [] };

      setUsage(usageData);
      setVideoUsage(videoData);

      const brandKit = userSnap.data()?.brandKit || null;
      setBrandKitStatus(getBrandKitStatus(brandKit));

      const videoItems = Array.isArray(videoJobsData.items) ? videoJobsData.items : [];
      const imageItems = Array.isArray(imageJobsData.items) ? imageJobsData.items : [];

      const mappedVideos = videoItems.map((v) => ({
        kind: "video",
        id: v.id,
        title: v.productName ? `Video: ${v.productName}` : "Video Ad",
        status: v.status,
        createdAt: v.createdAt,
        thumb: v.thumbnailUrl || v.finalVideoUrl || null,
        url: v.finalVideoUrl || null,
      }));

      const mappedImages = imageItems.map((i) => ({
        kind: "image",
        id: i.id,
        title: i.productName ? `Image: ${i.productName}` : "Image Ad",
        status: i.status,
        createdAt: i.createdAt,
        thumb: i.imageUrl || null,
        url: i.imageUrl || null,
      }));

      const succeeded = [...mappedVideos, ...mappedImages]
        .filter((item) => item.status === "succeeded")
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 4);

      setRecentCreatives(succeeded);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser?.uid) {
      didFetchRef.current = false;
      lastUserIdRef.current = null;
      return;
    }

    fetchWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  return (
    <WorkspaceContext.Provider
      value={{
        currentUser,
        stripe,
        planLabel,
        usage,
        videoUsage,
        recentCreatives,
        brandKitStatus,
        loading,
        refreshWorkspace: () => fetchWorkspaceData({ force: true }),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}