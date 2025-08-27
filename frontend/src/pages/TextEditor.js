import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TextEditor.css";

/** Utilities */
const uid = () => Math.random().toString(36).slice(2, 9);

/** Measure wrapped text into lines; return lines + bounding width/height */
function measureWrapped(ctx, text, font, maxWidth, lineHeight) {
  ctx.font = font;
  const words = (text || "").split(/\s+/);
  const lines = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && i > 0) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const width = Math.min(
    maxWidth,
    Math.max(...lines.map((l) => ctx.measureText(l).width), 0)
  );
  return { lines, width, height: lines.length * lineHeight };
}

export default function TextEditor() {
  const canvasRef = useRef(null);
  const [bgUrl, setBgUrl] = useState("");
  const [imgEl, setImgEl] = useState(null);

  // Text boxes
  const [boxes, setBoxes] = useState([
    {
      id: uid(),
      text: "Your Headline",
      fontFamily: "Inter, system-ui, Arial",
      fontSize: 64,
      color: "#ffffff",
      align: "left", // left | center | right
      bold: true,
      italic: false,
      shadow: true,
      underline: false,      // NEW
      x: 100,
      y: 120,
      maxWidthPct: 0.8,      // wrap width (% of canvas width) — resizable
      lineHeightMult: 1.08,
    },
  ]);
  const [selectedId, setSelectedId] = useState(null);

  // Dragging / Resizing
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ dx: 0, dy: 0 }); // offset from rect top-left

  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef({
    startX: 0,
    startY: 0,
    startMaxWidthPx: 0,
    minPx: 80,
    maxPx: 0, // set when we know canvas width
  });

  // Guides & overlays
  const [guide, setGuide] = useState("none"); // "none" | "ig_story" | "ig_reel" | "ig_feed" | "fb_feed"
  const [showCenters, setShowCenters] = useState(true);
  const [showBorders, setShowBorders] = useState(true);

  // Track rendered (CSS) size of the canvas so overlays align perfectly
  const [canvasCssSize, setCanvasCssSize] = useState({ width: 0, height: 0 });
  const measureCanvasCss = () => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    setCanvasCssSize({
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  };

  /** Load background image */
  useEffect(() => {
    if (!bgUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImgEl(img);
    img.src = bgUrl;
  }, [bgUrl]);

  /** Draw everything */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;

    // intrinsic canvas size = image pixels (keeps crisp export)
    canvas.width = imgEl.width;
    canvas.height = imgEl.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

    const handleSize = Math.max(8, Math.round(canvas.width * 0.01)); // scales with canvas

    boxes.forEach((b) => {
      const weight = b.bold ? "800" : "500";
      const style = b.italic ? "italic" : "normal";
      const font = `${style} ${weight} ${b.fontSize}px ${b.fontFamily}`;
      const lineHeight = Math.round(b.fontSize * (b.lineHeightMult || 1.1));
      const maxWidth = Math.round(canvas.width * (b.maxWidthPct || 0.8));

      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = b.align;
      ctx.fillStyle = b.color;

      if (b.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }

      const { lines, width: rectW, height: rectH } = measureWrapped(
        ctx,
        b.text,
        font,
        maxWidth,
        lineHeight
      );

      // Draw text (with underline if enabled)
      let anchorX = b.x;
      if (b.align === "center") anchorX = b.x;
      if (b.align === "right") anchorX = b.x;

      lines.forEach((ln, i) => {
        const y = b.y + i * lineHeight;
        ctx.fillText(ln, anchorX, y);

        // ---- Underline (manual) ----
        if (b.underline) {
          const metrics = ctx.measureText(ln);
          let lineX = anchorX;
          if (b.align === "center") lineX = anchorX - metrics.width / 2;
          if (b.align === "right") lineX = anchorX - metrics.width;

          const gap = Math.round(b.fontSize * 0.08); // small gap under glyphs
          const underlineY = y + b.fontSize + gap;

          ctx.save();
          ctx.shadowColor = "transparent"; // no shadow on underline
          ctx.beginPath();
          ctx.strokeStyle = b.color;
          ctx.lineWidth = Math.max(1, Math.round(b.fontSize * 0.05)); // scales with size
          ctx.moveTo(lineX, underlineY);
          ctx.lineTo(lineX + metrics.width, underlineY);
          ctx.stroke();
          ctx.restore();
        }
      });

      // Selection outline + handles
      if (b.id === selectedId) {
        let left = b.x;
        if (b.align === "center") left = b.x - Math.round(rectW / 2);
        if (b.align === "right") left = b.x - rectW;
        const top = b.y;

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#00e0ff";
        ctx.shadowColor = "transparent";
        ctx.strokeRect(left, top, rectW, rectH);

        const drawHandle = (hx, hy) => {
          ctx.fillStyle = "#00e0ff";
          ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
          ctx.strokeStyle = "#003d47";
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        };
        // corners (BR is resize handle)
        drawHandle(left, top);
        drawHandle(left + rectW, top);
        drawHandle(left, top + rectH);
        drawHandle(left + rectW, top + rectH);

        // stash for hit-testing
        b.__brHandle = { x: left + rectW, y: top + rectH, size: handleSize };
        b.__rect = { left, top, width: rectW, height: rectH, maxWidthPx: maxWidth };
        ctx.restore();
      } else {
        delete b.__brHandle;
        delete b.__rect;
      }
    });

    // after drawing, measure CSS size so overlays match the visible canvas
    measureCanvasCss();
  }, [imgEl, boxes, selectedId]);

  // Re-measure overlays on window resize
  useEffect(() => {
    const onResize = () => measureCanvasCss();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Upload background */
  const handleUpload = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBgUrl(url);
  };

  /** Geometry helpers (intrinsic pixel space) */
  const getCanvasRect = () => {
    const c = canvasRef.current;
    return { left: 0, top: 0, width: c.width, height: c.height, right: c.width, bottom: c.height };
  };

  const getBoxRect = (b) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const weight = b.bold ? "800" : "500";
    const style = b.italic ? "italic" : "normal";
    const font = `${style} ${weight} ${b.fontSize}px ${b.fontFamily}`;
    const lineHeight = Math.round(b.fontSize * (b.lineHeightMult || 1.1));
    const maxWidth = Math.round(canvas.width * (b.maxWidthPct || 0.8));
    const { width, height } = measureWrapped(ctx, b.text, font, maxWidth, lineHeight);

    let left = b.x;
    if (b.align === "center") left = b.x - Math.round(width / 2);
    if (b.align === "right") left = b.x - width;

    return { left, top: b.y, width, height, maxWidthPx: maxWidth };
  };

  const isInsideRect = (x, y, r) =>
    x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

  const isInHandle = (x, y, handle) => {
    if (!handle) return false;
    const half = handle.size / 2;
    return (
      x >= handle.x - half &&
      x <= handle.x + half &&
      y >= handle.y - half &&
      y <= handle.y + half
    );
  };

  const pickTopmostAt = (cx, cy) => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const r = getBoxRect(boxes[i]);
      if (!r) continue;
      const hit = isInsideRect(cx, cy, r);
      if (hit) return boxes[i].id;
    }
    return null;
  };

  /** Safe-area math (px) */
  const getGuideMarginsPct = (type) => {
    switch (type) {
      case "ig_story":
      case "ig_reel":
        return { t: 13, r: 5, b: 13, l: 5 };
      case "ig_feed":
        return { t: 5, r: 5, b: 5, l: 5 };
      case "fb_feed":
        return { t: 8, r: 7, b: 8, l: 7 };
      default:
        return { t: 0, r: 0, b: 0, l: 0 };
    }
  };

  const getActiveBounds = () => {
    const canvas = canvasRef.current;
    const can = getCanvasRect();
    let bounds = can;

    if (guide !== "none") {
      const m = getGuideMarginsPct(guide);
      const left = (m.l / 100) * canvas.width;
      const right = canvas.width - (m.r / 100) * canvas.width;
      const top = (m.t / 100) * canvas.height;
      const bottom = canvas.height - (m.b / 100) * canvas.height;
      bounds = { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    // Add 5px inward padding for snap/clamp
    const pad = 6;
    return {
      left: bounds.left + pad,
      top: bounds.top + pad,
      right: bounds.right - pad,
      bottom: bounds.bottom - pad,
      width: bounds.width - pad * 2,
      height: bounds.height - pad * 2,
    };
  };

  /** Snap & clamp helpers (px space) */
  const SNAP = 8; // px threshold

  const applySnapAndClamp = (left, top, width, height) => {
    const canvas = canvasRef.current;
    const canvasCenterX = canvas.width / 2;
    const canvasCenterY = canvas.height / 2;

    const bounds = getActiveBounds(); // safe area (if any) or full canvas (padded)
    const right = left + width;
    const bottom = top + height;

    let L = left;
    let T = top;

    // Snap to bounds edges
    if (Math.abs(L - bounds.left) < SNAP) L = bounds.left;
    if (Math.abs(right - bounds.right) < SNAP) L = bounds.right - width;
    if (Math.abs(T - bounds.top) < SNAP) T = bounds.top;
    if (Math.abs(bottom - bounds.bottom) < SNAP) T = bounds.bottom - height;

    // Snap to canvas centers
    const cx = L + width / 2;
    const cy = T + height / 2;
    if (Math.abs(cx - canvasCenterX) < SNAP) L = canvasCenterX - width / 2;
    if (Math.abs(cy - canvasCenterY) < SNAP) T = canvasCenterY - height / 2;

    // Clamp inside active bounds
    L = Math.min(Math.max(L, bounds.left), bounds.right - width);
    T = Math.min(Math.max(T, bounds.top), bounds.bottom - height);

    return { left: L, top: T };
  };

  const applyResizeSnapClamp = (left, top, newWidth, height) => {
    const bounds = getActiveBounds();
    let W = newWidth;

    // snap right edge
    const right = left + W;
    if (Math.abs(right - bounds.right) < SNAP) W = bounds.right - left;

    // clamp
    W = Math.max(40, Math.min(W, bounds.right - left)); // min width 40px

    return { width: W };
  };

  /** Pointer helpers — convert CSS pixels to canvas pixels */
  const pointerToCanvas = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    const xCss = clientX - rect.left;
    const yCss = clientY - rect.top;

    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    return { x: xCss * scaleX, y: yCss * scaleY };
  };

  /** Pointer handlers */
  const onPointerDown = (e) => {
    if (!canvasRef.current) return;
    const { x, y } = pointerToCanvas(e);

    // check BR handle for resize if a box is selected
    if (selectedId) {
      const sel = boxes.find((b) => b.id === selectedId);
      const br = sel?.__brHandle || getBRHandleFallback(sel);
      if (sel && br && isInHandle(x, y, br)) {
        setResizing(true);
        const rect = sel.__rect || getBoxRect(sel);
        resizeRef.current.startX = x;
        resizeRef.current.startY = y;
        resizeRef.current.startMaxWidthPx = rect.maxWidthPx;
        resizeRef.current.maxPx = canvasRef.current.width * 0.98; // tiny margin
        return;
      }
    }

    // hit-test for dragging/moving
    const hitId = pickTopmostAt(x, y);
    if (hitId) {
      setSelectedId(hitId);
      const b = boxes.find((bb) => bb.id === hitId);
      const r = getBoxRect(b);
      dragRef.current.dx = x - (r ? r.left : b.x);
      dragRef.current.dy = y - (r ? r.top : b.y);
      setDragging(true);
    } else {
      setSelectedId(null);
    }
  };

  // fallback if __brHandle not present yet
  const getBRHandleFallback = (b) => {
    if (!b) return null;
    const r = getBoxRect(b);
    if (!r) return null;
    const size = Math.max(8, Math.round(canvasRef.current.width * 0.01));
    return { x: r.left + r.width, y: r.top + r.height, size };
  };

  const onPointerMove = (e) => {
    if (!canvasRef.current) return;
    const { x, y } = pointerToCanvas(e);

    if (resizing && selectedId) {
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== selectedId) return b;
          const canvasW = canvasRef.current.width;
          const dx = x - resizeRef.current.startX;

          // proposed new wrap width (px)
          let newMaxPx = resizeRef.current.startMaxWidthPx + dx;
          const rect = getBoxRect(b);
          const { width: snappedW } = applyResizeSnapClamp(rect.left, rect.top, newMaxPx, rect.height);
          const newPct = Math.max(0.05, Math.min(snappedW / canvasW, 0.98));
          return { ...b, maxWidthPct: newPct };
        })
      );
      return;
    }

    if (dragging && selectedId) {
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== selectedId) return b;
          const rect = getBoxRect(b);
          if (!rect) return b;

          // intended new top-left (before snapping)
          let left = x - dragRef.current.dx;
          let top = y - dragRef.current.dy;

          // snap & clamp
          const snapped = applySnapAndClamp(left, top, rect.width, rect.height);

          // convert back to anchor x based on alignment
          let newX = b.x;
          if (b.align === "left") newX = snapped.left;
          if (b.align === "center") newX = snapped.left + rect.width / 2;
          if (b.align === "right") newX = snapped.left + rect.width;

          return { ...b, x: newX, y: snapped.top };
        })
      );
    }
  };

  const onPointerUp = () => {
    setDragging(false);
    setResizing(false);
  };

  /** Toolbar actions */
  const addTextBox = () => {
    const id = uid();
    setBoxes((prev) => [
      ...prev,
      {
        id,
        text: "New Text",
        fontFamily: "Inter, system-ui, Arial",
        fontSize: 36,
        color: "#ffffff",
        align: "left",
        bold: true,
        italic: false,
        shadow: true,
        underline: false, // NEW
        x: 100,
        y: 100,
        maxWidthPct: 0.75,
        lineHeightMult: 1.12,
      },
    ]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setBoxes((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    const b = boxes.find((x) => x.id === selectedId);
    if (!b) return;
    const id = uid();
    setBoxes((prev) => [...prev, { ...b, id, x: b.x + 20, y: b.y + 20 }]);
    setSelectedId(id);
  };

  const bringToFront = () => {
    if (!selectedId) return;
    setBoxes((prev) => {
      const idx = prev.findIndex((x) => x.id === selectedId);
      if (idx < 0) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.push(item);
      return copy;
    });
  };

  const sendToBack = () => {
    if (!selectedId) return;
    setBoxes((prev) => {
      const idx = prev.findIndex((x) => x.id === selectedId);
      if (idx < 0) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy;
    });
  };

  const downloadComposite = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = "adgen-composite.png";
    link.click();
  };

  const selected = useMemo(
    () => boxes.find((b) => b.id === selectedId) || null,
    [boxes, selectedId]
  );

  /** Safe-area guide overlay renderer (UI only; not exported) */
  const renderGuide = (type) => {
    // margins in % (top, right, bottom, left)
    let m = { t: 0, r: 0, b: 0, l: 0 };
    let label = "";

    switch (type) {
      case "ig_story":
      case "ig_reel":
        m = { t: 13, r: 5, b: 13, l: 5 };
        label = type === "ig_story" ? "IG Story safe area" : "IG Reel safe area";
        break;
      case "ig_feed":
        m = { t: 5, r: 5, b: 5, l: 5 };
        label = "IG Feed (1:1) safe area";
        break;
      case "fb_feed":
        m = { t: 8, r: 7, b: 8, l: 7 };
        label = "Facebook Feed (1.91:1) safe area";
        break;
      default:
        return null;
    }

    const safeStyle = {
      top: `${m.t}%`,
      right: `${m.r}%`,
      bottom: `${m.b}%`,
      left: `${m.l}%`,
    };

    return (
      <>
        <div className="texteditor-guide-safe" style={safeStyle} />
        <div className="texteditor-guide-label">{label}</div>
      </>
    );
  };

  /** Overlay lines (center & borders) — not baked into the canvas */
  const OverlayLines = () => {
    if (!imgEl) return null;

    const borderMargin = 8; // small inset for the border lines (CSS pixels)

    const common = {
      position: "absolute",
      background: "rgba(0, 224, 255, 0.9)",
      pointerEvents: "none",
      zIndex: 3,
    };

    return (
      <>
        {showBorders && (
          <>
            {/* Top & Bottom with margin */}
            <div style={{ ...common, top: borderMargin, left: borderMargin, right: borderMargin, height: 1 }} />
            <div style={{ ...common, bottom: borderMargin, left: borderMargin, right: borderMargin, height: 1 }} />
            {/* Left & Right with margin */}
            <div style={{ ...common, top: borderMargin, bottom: borderMargin, left: borderMargin, width: 1 }} />
            <div style={{ ...common, top: borderMargin, bottom: borderMargin, right: borderMargin, width: 1 }} />
          </>
        )}
        {showCenters && (
          <>
            {/* Horizontal & Vertical center */}
            <div style={{ ...common, top: "50%", left: 0, right: 0, height: 1, transform: "translateY(-0.5px)" }} />
            <div style={{ ...common, left: "50%", top: 0, bottom: 0, width: 1, transform: "translateX(-0.5px)" }} />
          </>
        )}
      </>
    );
  };

  return (
    <div className="texteditor-container">
      <h1 style={{ marginBottom: 12 }}>Text Editor</h1>
      <p style={{ marginBottom: 16 }}>
        Upload a background image, add/drag text boxes, resize their wrap width, then download a flattened PNG.
      </p>

      {/* Toolbar */}
      <div className="texteditor-toolbar">
        <div className="texteditor-row">
          <label className="texteditor-label">
            Background image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </label>

          <label className="texteditor-label">
            Guide
            <select value={guide} onChange={(e) => setGuide(e.target.value)}>
              <option value="none">None</option>
              <option value="ig_story">Instagram Story (9:16)</option>
              <option value="ig_reel">Instagram Reel (9:16)</option>
              <option value="ig_feed">Instagram Feed (1:1)</option>
              <option value="fb_feed">Facebook Feed (1.91:1)</option>
            </select>
          </label>

          <label className="texteditor-checkbox">
            <input
              type="checkbox"
              checked={showCenters}
              onChange={(e) => setShowCenters(e.target.checked)}
            />
            Show center lines
          </label>

          <label className="texteditor-checkbox">
            <input
              type="checkbox"
              checked={showBorders}
              onChange={(e) => setShowBorders(e.target.checked)}
            />
            Show border lines
          </label>

          <button className="texteditor-btn" onClick={addTextBox}>Add Text Box</button>
          <button className="texteditor-btn" onClick={duplicateSelected} disabled={!selectedId}>Duplicate</button>
          <button className="texteditor-btn" onClick={deleteSelected} disabled={!selectedId}>Delete</button>
          <button className="texteditor-btn" onClick={bringToFront} disabled={!selectedId}>Bring Front</button>
          <button className="texteditor-btn" onClick={sendToBack} disabled={!selectedId}>Send Back</button>
          <button className="texteditor-btnPrimary" onClick={downloadComposite}>Download PNG</button>
        </div>

        {selected && (
          <>
            <div className="texteditor-row">
              <label className="texteditor-labelWide">
                Text
                <textarea
                  rows={3}
                  value={selected.text}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) => (b.id === selected.id ? { ...b, text: e.target.value } : b))
                    )
                  }
                />
              </label>
            </div>

            <div className="texteditor-row">
              <label className="texteditor-label">
                Font
                <select
                  value={selected.fontFamily}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) =>
                        b.id === selected.id ? { ...b, fontFamily: e.target.value } : b
                      )
                    )
                  }
                >
                  <option>Inter, system-ui, Arial</option>
                  <option>Arial</option>
                  <option>Helvetica</option>
                  <option>Georgia</option>
                  <option>Times New Roman</option>
                  <option>Courier New</option>
                  <option>Bebas Neue, Arial</option>
                  <option>Anton, Arial</option>
                  <option>Montserrat, Arial</option>
                  <option>Poppins, Arial</option>
                </select>
              </label>

              <label className="texteditor-label">
                Size
                <input
                  type="number"
                  min="8"
                  max="240"
                  value={selected.fontSize}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) =>
                        b.id === selected.id
                          ? { ...b, fontSize: parseInt(e.target.value || "36", 10) }
                          : b
                      )
                    )
                  }
                />
              </label>

              <label className="texteditor-label">
                Color
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) =>
                        b.id === selected.id ? { ...b, color: e.target.value } : b
                      )
                    )
                  }
                />
              </label>

              <label className="texteditor-label">
                Align
                <select
                  value={selected.align}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) =>
                        b.id === selected.id ? { ...b, align: e.target.value } : b
                      )
                    )
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>

              <label className="texteditor-checkbox">
                <input
                  type="checkbox"
                  checked={selected.bold}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) => (b.id === selected.id ? { ...b, bold: e.target.checked } : b))
                    )
                  }
                />
                Bold
              </label>

              <label className="texteditor-checkbox">
                <input
                  type="checkbox"
                  checked={selected.italic}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) => (b.id === selected.id ? { ...b, italic: e.target.checked } : b))
                    )
                  }
                />
                Italic
              </label>

              <label className="texteditor-checkbox">
                <input
                  type="checkbox"
                  checked={selected.shadow}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) => (b.id === selected.id ? { ...b, shadow: e.target.checked } : b))
                    )
                  }
                />
                Shadow
              </label>

              {/* NEW: Underline */}
              <label className="texteditor-checkbox">
                <input
                  type="checkbox"
                  checked={selected.underline}
                  onChange={(e) =>
                    setBoxes((prev) =>
                      prev.map((b) =>
                        b.id === selected.id ? { ...b, underline: e.target.checked } : b
                      )
                    )
                  }
                />
                Underline
              </label>
            </div>
          </>
        )}
      </div>

      {/* Canvas area */}
      <div
        className="texteditor-canvasWrap"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {/* Inner layer sized to visible canvas, so overlays align perfectly */}
        <div
          className="texteditor-inner"
          style={{
            height: canvasCssSize.height ? `${canvasCssSize.height}px` : "auto",
          }}
        >
          {/* Alignment overlays */}
          <OverlayLines />

          {/* Safe-area overlay */}
          {guide !== "none" && <div className="texteditor-guides">{renderGuide(guide)}</div>}

          <canvas ref={canvasRef} className="texteditor-canvas" />
          {!bgUrl && (
            <div className="texteditor-placeholder">
              Upload a background image to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



