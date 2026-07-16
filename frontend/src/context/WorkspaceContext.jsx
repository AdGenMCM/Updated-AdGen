import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  doc,
  getDoc,
  getFirestore,
} from "firebase/firestore";

import { useAuth } from "../AuthProvider";
import { getIdTokenResult } from "firebase/auth";
import { auth } from "../firebaseConfig";

const db = getFirestore();
const WorkspaceContext = createContext(null);

function getBrandKitStatus(brandKit) {
  if (!brandKit) {
    return {
      percent: 0,
      label: "Not Started",
      description: "Set up your logo, colors, and brand defaults.",
      missing: [
        "Logo",
        "Brand name",
        "Website",
        "Brand colors",
        "Brand fonts",
        "Brand voice",
      ],
      checks: {},
    };
  }

  const hasLogo = Boolean(brandKit.logoUrl);
  const hasBrandName = Boolean(brandKit.brandName);
  const hasWebsite = Boolean(brandKit.websiteUrl);

  const hasColors =
    Boolean(brandKit.colorEnabled?.primary) ||
    Boolean(brandKit.colorEnabled?.secondary) ||
    Boolean(brandKit.colorEnabled?.accent);

  const hasFonts =
    Boolean(brandKit.fontEnabled?.headline) ||
    Boolean(brandKit.fontEnabled?.body) ||
    Boolean(brandKit.fontEnabled?.cta);

  const hasVoice =
    Boolean(brandKit.voice) ||
    Boolean(brandKit.brandPersonality) ||
    Boolean(brandKit.brandDna);

  const checks = [
    hasLogo,
    hasBrandName,
    hasWebsite,
    hasColors,
    hasFonts,
    hasVoice,
  ];

  const missing = [];

  if (!hasLogo) missing.push("Logo");
  if (!hasBrandName) missing.push("Brand name");
  if (!hasWebsite) missing.push("Website");
  if (!hasColors) missing.push("Brand colors");
  if (!hasFonts) missing.push("Brand fonts");
  if (!hasVoice) missing.push("Brand voice");

  const complete = checks.filter(Boolean).length;
  const percent = Math.round(
    (complete / checks.length) * 100
  );

  let label = "Needs Setup";

  if (percent >= 85) {
    label = "Excellent";
  } else if (percent >= 60) {
    label = "Ready";
  } else if (percent >= 35) {
    label = "In Progress";
  }

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

async function safeJson(response, fallback = null) {
  if (!response?.ok) {
    return fallback;
  }

  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

export function WorkspaceProvider({ children }) {
  const { currentUser, stripe, userDoc } = useAuth();

  const [usage, setUsage] = useState(null);
  const [videoUsage, setVideoUsage] = useState(null);
  const [storageUsage, setStorageUsage] = useState(null);
  const [recentCreatives, setRecentCreatives] = useState([]);
  const [brandKitStatus, setBrandKitStatus] = useState(
    getBrandKitStatus(null)
  );
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const didFetchRef = useRef(false);
  const lastUserIdRef = useRef(null);
  const fetchInFlightRef = useRef(false);

  const apiBase = (
    process.env.REACT_APP_API_BASE_URL || ""
  ).trim();

    useEffect(() => {
  let cancelled = false;

  const loadAdminClaim = async () => {
    if (!currentUser) {
      if (!cancelled) {
        setIsAdmin(false);
      }
      return;
    }

    try {
      const tokenResult = await getIdTokenResult(
        currentUser,
        true
      );

      const adminAccess =
        tokenResult?.claims?.role === "admin";

      console.log(
        "[WorkspaceContext] adminAccess:",
        adminAccess
      );

      if (!cancelled) {
        setIsAdmin(adminAccess);
      }
    } catch (error) {
      console.error(
        "[WorkspaceContext] Failed to read admin claim:",
        error
      );

      if (!cancelled) {
        setIsAdmin(false);
      }
    }
  };

  loadAdminClaim();

  return () => {
    cancelled = true;
  };
}, [currentUser]);

  const tierLabels = useMemo(
    () => ({
      free: "Free",
      trial_monthly: "Trial",
      early_access: "Early Access",
      starter_monthly: "Starter",
      pro_monthly: "Pro",
      business_monthly: "Business",
    }),
    []
  );

  const stripeStatus = String(
    stripe?.status || ""
  ).toLowerCase();

  const hasConfirmedStripePlan =
    stripe?.tier &&
    (
      stripeStatus === "active" ||
      stripeStatus === "trialing" ||
      stripeStatus === "past_due"
    );

  const effectiveTier =
    (hasConfirmedStripePlan ? stripe.tier : null) ||
    userDoc?.tier ||
    "free";

  const planLabel = isAdmin
    ? "Admin"
    : tierLabels[effectiveTier] || effectiveTier;

  const fetchWorkspaceData = useCallback(
    async ({ force = false } = {}) => {
      if (!currentUser || !apiBase) {
        return;
      }

      if (fetchInFlightRef.current) {
        return;
      }

      if (
        !force &&
        didFetchRef.current &&
        lastUserIdRef.current === currentUser.uid
      ) {
        return;
      }

      didFetchRef.current = true;
      lastUserIdRef.current = currentUser.uid;
      fetchInFlightRef.current = true;

      setLoading(true);

      try {
        const user = auth.currentUser;

        if (!user) {
          return;
        }

        const token = await user.getIdToken();

        const requestOptions = {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };

        /*
         * Keep shared workspace requests lightweight.
         *
         * The Dashboard only needs a few recent creatives, so this
         * requests four of each kind instead of fifty of each kind.
         *
         * Library.jsx remains responsible for loading its complete
         * 50-item image and video history.
         */
        const [
          usageRes,
          videoRes,
          entitlementsRes,
          videoJobsRes,
          imageJobsRes,
          brandKitsRes,
          userSnap,
        ] = await Promise.all([
          fetch(
            `${apiBase}/usage`,
            requestOptions
          ),

          fetch(
            `${apiBase}/video/usage`,
            requestOptions
          ),

          fetch(
            `${apiBase}/me/entitlements`,
            requestOptions
          ),

          fetch(
            `${apiBase}/video/jobs?limit=4`,
            requestOptions
          ),

          fetch(
            `${apiBase}/image/jobs?limit=4`,
            requestOptions
          ),

          fetch(
            `${apiBase}/brand-kits`,
            requestOptions
          ),

          getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          ),
        ]);

        const [
          usageData,
          videoData,
          entitlementsData,
          videoJobsData,
          imageJobsData,
          brandKitsData,
        ] = await Promise.all([
          safeJson(usageRes, null),
          safeJson(videoRes, null),
          safeJson(entitlementsRes, null),
          safeJson(videoJobsRes, { items: [] }),
          safeJson(imageJobsRes, { items: [] }),
          safeJson(brandKitsRes, { items: [] }),
        ]);

        setUsage(usageData);
        setVideoUsage(videoData);
        setStorageUsage(
          entitlementsData?.usage?.storage || null
        );

        const brandKitItems = Array.isArray(
          brandKitsData?.items
        )
          ? brandKitsData.items
          : [];

        const defaultKit =
          brandKitItems.find(
            (item) =>
              item.id ===
              brandKitsData?.defaultBrandKitId
          ) ||
          brandKitItems[0] ||
          userSnap.data()?.brandKit ||
          null;

        setBrandKitStatus(
          getBrandKitStatus(defaultKit)
        );

        const videoItems = Array.isArray(
          videoJobsData?.items
        )
          ? videoJobsData.items
          : [];

        const imageItems = Array.isArray(
          imageJobsData?.items
        )
          ? imageJobsData.items
          : [];

        const mappedVideos = videoItems.map((video) => ({
          kind: "video",
          id: video.id,
          title: video.productName
            ? `Video: ${video.productName}`
            : "Video Ad",
          status: video.status,
          createdAt: video.createdAt,
          thumb:
            video.thumbnailUrl ||
            video.finalVideoUrl ||
            null,
          url: video.finalVideoUrl || null,
        }));

        const mappedImages = imageItems.map((image) => ({
          kind: "image",
          id: image.id,
          title: image.productName
            ? `Image: ${image.productName}`
            : "Image Ad",
          status: image.status,
          createdAt: image.createdAt,
          thumb: image.imageUrl || null,
          url: image.imageUrl || null,
        }));

        const newestSuccessfulCreatives = [
          ...mappedVideos,
          ...mappedImages,
        ]
          .filter(
            (item) => item.status === "succeeded"
          )
          .sort(
            (a, b) =>
              (b.createdAt || 0) -
              (a.createdAt || 0)
          )
          .slice(0, 4);

        setRecentCreatives(
          newestSuccessfulCreatives
        );

        setLastUpdated(Date.now());
      } catch (error) {
        console.error(
          "Failed to load workspace data:",
          error
        );
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
      }
    },
    [
      apiBase,
      currentUser,
    ]
  );

  useEffect(() => {
    if (!currentUser?.uid) {
      didFetchRef.current = false;
      lastUserIdRef.current = null;

      setUsage(null);
      setVideoUsage(null);
      setStorageUsage(null);
      setRecentCreatives([]);
      setBrandKitStatus(
        getBrandKitStatus(null)
      );
      setLastUpdated(null);

      return;
    }

    fetchWorkspaceData();
  }, [
    currentUser?.uid,
    fetchWorkspaceData,
  ]);

  const refreshWorkspace = useCallback(
    () =>
      fetchWorkspaceData({
        force: true,
      }),
    [fetchWorkspaceData]
  );

  const contextValue = useMemo(
    () => ({
      currentUser,
      stripe,
      userDoc,
      isAdmin,
      planLabel,
      usage,
      videoUsage,
      storageUsage,
      recentCreatives,
      brandKitStatus,
      loading,
      lastUpdated,
      refreshWorkspace,
    }),
    [
      currentUser,
      stripe,
      userDoc,
      isAdmin,
      planLabel,
      usage,
      videoUsage,
      storageUsage,
      recentCreatives,
      brandKitStatus,
      loading,
      lastUpdated,
      refreshWorkspace,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}