"use client";

import { useState } from "react";
import { createClient } from "../utils/supabase/client";

export default function TestPromptChain({ images, onUploaded }) {
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [keywords, setKeywords] = useState("");
  const [captions, setCaptions] = useState([]);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setStatus("");
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { setError("Choose a JPEG, PNG, WebP, or GIF image."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Images must be 10 MB or smaller."); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: storageError } = await supabase.storage.from("user_meme_photos").upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (storageError) throw storageError;
      const image = { name: file.name, path, bucket: "user_meme_photos", url: supabase.storage.from("user_meme_photos").getPublicUrl(path).data.publicUrl };
      setUploadedImages((current) => [image, ...current]);
      setSelectedImage(image);
    } catch (caughtError) { setError(caughtError.message || "Couldn’t upload the image."); }
    finally { setUploading(false); }
  }

  async function generate(event) {
    event.preventDefault();
    if (!selectedImage) return;
    setGenerating(true); setError(""); setStatus(""); setCaptions([]); setCaptionIndex(0);
    try {
      const response = await fetch("/api/generate-meme-caption", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoPath: selectedImage.path, bucket: selectedImage.bucket, keywords }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Couldn’t generate captions.");
      setCaptions(result.captions ?? []);
    } catch (caughtError) { setError(caughtError.message || "Couldn’t generate captions."); }
    finally { setGenerating(false); }
  }

  async function uploadCaption() {
    const caption = captions[captionIndex];
    if (!selectedImage || !caption) return;
    setUploading(true); setError(""); setStatus("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      const { data, error: insertError } = await supabase.from("ai_generations").insert({ user_id: user.id, prompt_text: keywords || null, content_text: caption, image_url: selectedImage.url, upvotes: 0, downvotes: 0 }).select().single();
      if (insertError) throw insertError;
      onUploaded?.(data);
      setStatus("Meme uploaded successfully.");
    } catch (caughtError) { setError(caughtError.message || "Couldn’t upload the meme."); }
    finally { setUploading(false); }
  }

  const availableImages = [...uploadedImages, ...images];
  return <section className="panel chain-tester"><form onSubmit={generate}><PanelTitle title="Test the active prompt chain" detail="Choose an image, add optional context, then review its five generated captions." /><label className="tester-label">Image library<div className="tester-images">{availableImages.map((image) => <button type="button" key={`${image.bucket}:${image.path}`} className={selectedImage?.bucket === image.bucket && selectedImage?.path === image.path ? "selected" : ""} onClick={() => { setSelectedImage(image); setCaptions([]); setStatus(""); }}><img src={image.url} alt={image.name} /><span>{image.name}</span></button>)}{!availableImages.length && <p className="empty">No meme images are available.</p>}</div></label><label className="tester-photo-upload"><span>{uploading ? "Uploading image…" : "Upload an image"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadPhoto} disabled={uploading} /></label><label className="tester-label">Keyword or prompt <span className="muted">(optional)</span><textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="e.g. awkward work meeting, dry humor" rows={4} /></label><button className="primary compact" disabled={!selectedImage || generating || uploading}>{generating ? "Generating…" : "Generate captions"}</button></form>{captions.length > 0 && <div className="caption-tester" aria-live="polite"><p className="eyebrow">Generated captions</p><div><button type="button" disabled={captions.length < 2} onClick={() => setCaptionIndex((captionIndex + captions.length - 1) % captions.length)} aria-label="Previous caption">←</button><output>{captions[captionIndex]}</output><button type="button" disabled={captions.length < 2} onClick={() => setCaptionIndex((captionIndex + 1) % captions.length)} aria-label="Next caption">→</button></div><p className="muted">Caption {captionIndex + 1} of {captions.length}</p><button className="primary compact" type="button" onClick={uploadCaption} disabled={uploading || Boolean(status)}>{uploading ? "Uploading…" : status ? "Uploaded" : "Upload this meme"}</button></div>}{error && <p className="error">{error}</p>}{status && <p className="positive">{status}</p>}</section>;
}

function PanelTitle({ title, detail }) { return <header className="panel-head"><div><h2>{title}</h2><p className="muted">{detail}</p></div></header>; }
