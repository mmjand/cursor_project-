import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_TITLE, SITE_SUBTITLE, THEME, ENABLE_DELETE } from "../config.js";

const $ = (sel) => document.querySelector(sel);

function sanitizeFileName(name) {
  // Keep it simple: avoid path separators and weird characters.
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function setConfigHint(text, isError = false) {
  const el = $("#configHint");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setUploadStatus(text, isError = false) {
  const el = $("#uploadStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c] || c;
  });
}

function parseCsvTags(s) {
  const raw = String(s || "")
    .split(/[，,]/g)
    .map((t) => t.trim())
    .filter(Boolean);
  // De-duplicate while preserving order
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function escapeAttr(s) {
  // For our simple attributes, the same escaping used for HTML text is enough.
  return escapeHtml(s);
}

function albumLabel(album) {
  const a = String(album || "").trim();
  return a ? a : "未分类";
}

function normalizeText(s) {
  return String(s || "").trim().toLowerCase();
}

function getStorageUrl(storagePath) {
  return supabase.storage.from("photos").getPublicUrl(storagePath).data.publicUrl;
}

function sortPhotos(photos, sortMode) {
  const arr = photos.slice();
  arr.sort((a, b) => {
    if (sortMode === "oldest") return new Date(a.created_at) - new Date(b.created_at);
    if (sortMode === "captionAsc") return normalizeText(a.caption).localeCompare(normalizeText(b.caption));
    // newest default
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return arr;
}

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const gallery = $("#gallery");
const galleryEmpty = $("#galleryEmpty");
const refreshBtn = $("#refreshBtn");
const uploadForm = $("#uploadForm");
const uploadBtn = $("#uploadBtn");
const fileInput = $("#fileInput");
const captionInput = $("#captionInput");
const albumInput = $("#albumInput");
const tagsInput = $("#tagsInput");

const albumFilter = $("#albumFilter");
const tagsFilterInput = $("#tagsFilterInput");
const sortSelect = $("#sortSelect");
const clearFiltersBtn = $("#clearFiltersBtn");
const galleryMeta = $("#galleryMeta");

const allowDelete = ENABLE_DELETE === true;

let allPhotos = [];

async function loadGallery() {
  if (!supabase) {
    setConfigHint("请先在 `config.js` 填写 Supabase 配置", true);
    galleryEmpty.textContent = "缺少 Supabase 配置。";
    gallery.innerHTML = "";
    return;
  }

  gallery.innerHTML = "";
  galleryEmpty.style.display = "block";

  const { data, error } = await supabase
    .from("photos")
    .select("caption, album, tags, storage_path, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    galleryEmpty.textContent = `拉取失败：${error.message}`;
    setConfigHint("可能是数据库/权限配置有误", true);
    return;
  }

  allPhotos = data || [];
  setupAlbumFilter(allPhotos);
  applyFiltersAndRender();
}

function setupAlbumFilter(photos) {
  if (!albumFilter) return;

  const albums = new Map(); // label -> count
  for (const p of photos || []) {
    const label = albumLabel(p.album);
    const count = albums.get(label) || 0;
    albums.set(label, count + 1);
  }

  const albumOptions = Array.from(albums.keys()).sort((a, b) => normalizeText(a).localeCompare(normalizeText(b)));

  albumFilter.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "全部";
  albumFilter.appendChild(allOpt);

  for (const label of albumOptions) {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = `${label}`;
    albumFilter.appendChild(opt);
  }

  albumFilter.value = "__all__";
}

function applyFiltersAndRender() {
  if (!gallery || !galleryEmpty) return;

  const albumSelected = albumFilter?.value || "__all__";
  const sortMode = sortSelect?.value || "newest";

  const tokens = parseCsvTags(tagsFilterInput?.value || "");

  const filtered = allPhotos.filter((row) => {
    const matchesAlbum = albumSelected === "__all__" ? true : albumLabel(row.album) === albumSelected;
    if (!matchesAlbum) return false;

    if (!tokens.length) return true;
    const rowTags = parseCsvTags(row.tags || "");
    if (!rowTags.length) return false;

    // Every token must exist in the row tags
    return tokens.every((t) => rowTags.includes(t));
  });

  const sorted = sortPhotos(filtered, sortMode);

  gallery.innerHTML = "";
  if (!sorted.length) {
    galleryEmpty.style.display = "block";
  } else {
    galleryEmpty.style.display = "none";
  }

  if (galleryMeta) {
    const albumText = albumSelected === "__all__" ? "全部专辑" : `专辑：${albumSelected}`;
    const tagsText = tokens.length ? `标签：${tokens.join(", ")}` : "标签：不限";
    galleryMeta.textContent = `筛选结果：${sorted.length} 张（${albumText}，${tagsText}）`;
  }

  for (const row of sorted) {
    const url = getStorageUrl(row.storage_path);

    const card = document.createElement("div");
    card.className = "photo";

    const caption = row.caption || "";
    const album = albumLabel(row.album);
    const tags = parseCsvTags(row.tags || "").join(", ");

    card.innerHTML = `
      <img src="${url}" alt="${escapeHtml(caption || "photo")}" loading="lazy" />
      <div class="photo__meta">
        <div class="photo__caption">${escapeHtml(caption)}</div>
        <div class="photo__album">${escapeHtml(album)}</div>
        ${tags ? `<div class="photo__tags">${escapeHtml(tags)}</div>` : ""}
        <div class="photo__time">${formatTime(row.created_at)}</div>
      </div>
      ${
        allowDelete
          ? `
        <div class="photo__actions">
          <button class="btn btn--danger btn--delete" type="button" data-storage-path="${escapeAttr(row.storage_path)}">
            删除
          </button>
        </div>
        `
          : ""
      }
    `;

    gallery.appendChild(card);
  }
}

async function handleUpload(e) {
  e.preventDefault();

  if (!supabase) {
    setConfigHint("请先在 `config.js` 填写 Supabase 配置", true);
    setUploadStatus("缺少 Supabase 配置", true);
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    setUploadStatus("请选择图片文件", true);
    return;
  }

  const caption = (captionInput.value || "").trim().slice(0, 80);
  const album = (albumInput?.value || "").trim().slice(0, 60) || null;
  const tags = (tagsInput?.value || "").trim().slice(0, 200) || null;

  uploadBtn.disabled = true;
  setUploadStatus("上传中…");

  try {
    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
    const fileName = sanitizeFileName(file.name);
    const uuid =
      globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `id_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    const storagePath = `uploads/${uuid}-${fileName || `photo.${ext}`}`;

    const contentType = file.type || "application/octet-stream";

    const { error: storageError } = await supabase.storage.from("photos").upload(storagePath, file, {
      contentType,
      upsert: false,
    });
    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from("photos").insert({
      caption,
      album,
      tags,
      storage_path: storagePath,
    });
    if (dbError) throw dbError;

    setUploadStatus("上传成功！正在刷新…");
    await loadGallery();
    uploadForm.reset();
  } catch (err) {
    const msg = err?.message || String(err);
    setUploadStatus(msg, true);
  } finally {
    uploadBtn.disabled = false;
  }
}

async function handleDelete(storagePath) {
  if (!allowDelete) return;
  if (!storagePath) return;

  const ok = window.confirm("确定删除该作品？此操作无法撤销。");
  if (!ok) return;

  uploadBtn.disabled = true;
  setUploadStatus("删除中…");

  try {
    const { error: storageError } = await supabase.storage.from("photos").remove([storagePath]);
    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from("photos").delete().eq("storage_path", storagePath);
    if (dbError) throw dbError;

    setUploadStatus("删除成功！正在刷新…");
    await loadGallery();
  } catch (err) {
    const msg = err?.message || String(err);
    setUploadStatus(`删除失败：${msg}`, true);
  } finally {
    uploadBtn.disabled = false;
  }
}

function init() {
  $("#year").textContent = new Date().getFullYear();

  if (!supabase) {
    setConfigHint("请先在 `config.js` 填写 Supabase 配置", true);
    galleryEmpty.textContent = "配置缺失：请填好 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`。";
    return;
  }

  // Homepage customization
  if (SITE_TITLE) {
    document.title = SITE_TITLE;
    const t = $("#siteTitle");
    if (t) t.textContent = SITE_TITLE;
  }
  if (SITE_SUBTITLE) {
    const st = $("#siteSubtitle");
    if (st) st.textContent = SITE_SUBTITLE;
  }
  if (THEME && typeof THEME === "object") {
    if (THEME.accent) document.documentElement.style.setProperty("--accent", THEME.accent);
    if (THEME.accent2) document.documentElement.style.setProperty("--accent2", THEME.accent2);
  }

  setConfigHint("连接配置成功", false);
  refreshBtn.addEventListener("click", loadGallery);
  uploadForm.addEventListener("submit", handleUpload);

  albumFilter?.addEventListener("change", applyFiltersAndRender);
  tagsFilterInput?.addEventListener("input", applyFiltersAndRender);
  sortSelect?.addEventListener("change", applyFiltersAndRender);
  clearFiltersBtn?.addEventListener("click", () => {
    if (albumFilter) albumFilter.value = "__all__";
    if (tagsFilterInput) tagsFilterInput.value = "";
    if (sortSelect) sortSelect.value = "newest";
    applyFiltersAndRender();
  });

  if (allowDelete) {
    // Event delegation because cards are re-rendered frequently
    gallery?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-storage-path]");
      if (!btn) return;
      const storagePath = btn.dataset.storagePath;
      handleDelete(storagePath);
    });
  }

  loadGallery();
}

init();

