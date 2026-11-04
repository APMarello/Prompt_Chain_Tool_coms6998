"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import ThemeToggle from "./ThemeToggle";
import TestPromptChain from "./TestPromptChain";

const formatDate = (value) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
const emptyRow = (columns) => <tr><td className="empty" colSpan={columns}>Nothing to show yet.</td></tr>;
const navigationItems = ["promptChains", "promptChainMix", "terms", "llmModels", "memeImages", "testPromptChain"];

export default function AdminDashboard({ adminName, initialMedia, initialProfiles, initialVotes, initialPromptChains, initialPromptChainMix, initialPromptChainSteps, promptChainsError, promptChainMixError, promptChainStepsError, initialLlmModels, llmModelsError, initialGenerationRequests, generationRequestsError, initialTerms, termsError, initialAllowedEmailDomains, allowedEmailDomainsError, initialMemeImages, memeImagesError }) {
  const router = useRouter();
  const [view, setView] = useState("promptChains");
  const [media, setMedia] = useState(initialMedia);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [votes] = useState(initialVotes);
  const [promptChains, setPromptChains] = useState(initialPromptChains);
  const [promptChainMix, setPromptChainMix] = useState(initialPromptChainMix);
  const [promptChainSteps, setPromptChainSteps] = useState(initialPromptChainSteps);
  const [selectedPromptChain, setSelectedPromptChain] = useState(null);
  const [llmModels, setLlmModels] = useState(initialLlmModels);
  const [memeImages, setMemeImages] = useState(initialMemeImages);
  const [generationRequests] = useState(() => [...initialGenerationRequests].sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0)));
  const [terms, setTerms] = useState(initialTerms);
  const [allowedEmailDomains, setAllowedEmailDomains] = useState(initialAllowedEmailDomains);
  const [editing, setEditing] = useState(null);
  const [editingPromptChain, setEditingPromptChain] = useState(null);
  const [editingChainMix, setEditingChainMix] = useState(null);
  const [editingChainStep, setEditingChainStep] = useState(null);
  const [editingLlmModel, setEditingLlmModel] = useState(null);
  const [editingMemeImage, setEditingMemeImage] = useState(null);
  const [viewingGenerationRequest, setViewingGenerationRequest] = useState(null);
  const [editingTerm, setEditingTerm] = useState(null);
  const [editingAllowedEmailDomain, setEditingAllowedEmailDomain] = useState(null);
  const [viewingVotesFor, setViewingVotesFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    const up = media.reduce((sum, item) => sum + (item.upvotes || 0), 0);
    const down = media.reduce((sum, item) => sum + (item.downvotes || 0), 0);
    return { up, down, approval: up + down ? Math.round((up / (up + down)) * 100) : 0 };
  }, [media]);
  const profileById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const mediaById = useMemo(() => Object.fromEntries(media.map((item) => [item.id, item])), [media]);
  const labels = {
    overview: ["The room at a glance", "Signals from the creative community."],
    media: ["Shape the gallery", "Create, correct, or retire AI-generated media."],
    people: ["Know the audience", "Read-only profile directory and roles."],
    votes: ["Every signal counts", "Read-only record of upvotes and downvotes."],
    promptChains: ["Prompt chains", "Select a chain to view and edit its ordered steps."],
    promptChainMix: ["Prompt chain mix", "Review and update existing caption-style mix records."],
    terms: ["Terms", "Manage application terms and definitions."],
    allowedEmailDomains: ["Allowed e-mail domains", "Manage allowed signup domains."],
    llmModels: ["LLM providers/models", "Manage provider and model records."],
    memeImages: ["Meme images", "Manage images in meme_photos and user_meme_photos."],
    testPromptChain: ["Test prompt chain", "Run the active chain against an image and review its five captions."],
    generationRequests: ["Generation requests", "Read-only request activity from ai_generation_requests."],
  };

  async function saveMedia(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const imageSource = form.get("image_source") || "current";
    const payload = {
      prompt_text: form.get("prompt_text") || null,
      content_text: form.get("content_text"),
      image_url: imageSource === "library" ? form.get("library_url") : editing?.image_url,
    };
    if (imageSource === "upload") {
      const file = form.get("image_file");
      if (!file?.size) { setSaving(false); setMessage("Choose an image to upload."); return; }
      const bucket = form.get("image_bucket");
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const storage = createClient().storage.from(bucket);
      const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setSaving(false); setMessage(uploadError.message); return; }
      const { data: signed } = await storage.createSignedUrl(path, 3600);
      payload.image_url = signed?.signedUrl ?? storage.getPublicUrl(path).data.publicUrl;
      setMemeImages((current) => [{ id: `${bucket}:${path}`, name: file.name, bucket, path, url: payload.image_url, metadata: { mimetype: file.type, size: file.size } }, ...current]);
    }
    if (!payload.image_url) { setSaving(false); setMessage("Select an image from the library or upload a new one."); return; }
    if (!editing?.id) {
      payload.upvotes = 0;
      payload.downvotes = 0;
    }
    const supabase = createClient();
    const result = editing
      ? await supabase.from("ai_generations").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("ai_generations").insert(payload).select().single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setMedia((current) => editing ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current]);
    setEditing(null);
  }

  async function deleteMedia(id) {
    if (!window.confirm("Delete this generation permanently?")) return;
    const { error } = await createClient().from("ai_generations").delete().eq("id", id);
    if (error) { setMessage(error.message); return; }
    setMedia((current) => current.filter((item) => item.id !== id));
  }

  async function updateProfileWhitelist(profile, isWhitelisted) {
    setSaving(true); setMessage("");
    const whitelistColumn = Object.hasOwn(profile, "whitelisted") ? "whitelisted" : "is_whitelisted";
    const { data, error } = await createClient().from("profiles").update({ [whitelistColumn]: isWhitelisted }).eq("id", profile.id).select().single();
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setProfiles((current) => current.map((item) => item.id === data.id ? data : item));
  }

  async function saveChainMix(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    let payload;
    try { payload = JSON.parse(new FormData(event.currentTarget).get("payload")); }
    catch { setSaving(false); setMessage("Mix details must be valid JSON."); return; }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const { data, error } = await createClient().from("meme_caption_styles").update(payload).eq("id", editingChainMix.id).select().single();
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setPromptChainMix((current) => current.map((item) => item.id === data.id ? data : item));
    setEditingChainMix(null);
  }

  async function saveChainStep(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      step_key: form.get("step_key")?.trim(),
      prompt_template: form.get("prompt_template")?.trim(),
      prompt_chain_id: editingChainStep.prompt_chain_id,
      step_order: editingChainStep.step_order,
      is_active: editingChainStep.is_active ?? true,
      llm_model_id: editingChainStep.llm_model_id ?? null,
      llm_model: editingChainStep.llm_model || "gemini-3.1-flash-lite",
    };
    if (editingChainStep.id) payload.id = editingChainStep.id;
    const { data, error } = await createClient().rpc("save_meme_prompt_chain_step", { step_payload: payload });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const savedStep = Array.isArray(data) ? data[0] : data;
    setPromptChainSteps((current) => editingChainStep.id ? current.map((item) => item.id === savedStep.id ? savedStep : item) : [...current, savedStep]);
    setEditingChainStep(null);
  }

  async function deleteChainStep(step) {
    if (!window.confirm(`Delete the ${step.step_key} step permanently?`)) return;
    setSaving(true); setMessage("");
    const { error } = await createClient().rpc("delete_meme_prompt_chain_step", { target_step_id: step.id });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setPromptChainSteps((current) => current.filter((item) => item.id !== step.id));
  }

  async function moveChainStep(step, direction) {
    setSaving(true); setMessage("");
    const { data, error } = await createClient().rpc("move_meme_prompt_chain_step", { target_step_id: step.id, move_direction: direction });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const updatedOrders = Object.fromEntries((data ?? []).map((item) => [item.step_id, item.step_order]));
    setPromptChainSteps((current) => current.map((item) => updatedOrders[item.id] === undefined ? item : { ...item, step_order: updatedOrders[item.id] }));
  }

  async function activatePromptChain(chain) {
    setSaving(true); setMessage("");
    const { data, error } = await createClient().rpc("activate_meme_prompt_chain", { target_chain_id: chain.id });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const activeChain = Array.isArray(data) ? data[0] : data;
    setPromptChains((current) => current.map((item) => ({ ...item, is_active: item.id === activeChain.id })));
    setSelectedPromptChain((current) => current?.id === activeChain.id ? { ...current, is_active: true } : current);
  }

  async function savePromptChain(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const result = editingPromptChain.id
      ? await createClient().rpc("update_meme_prompt_chain_metadata", {
        target_chain_id: editingPromptChain.id,
        chain_name: form.get("name")?.trim(),
        chain_description: form.get("description")?.trim() || "",
      })
      : await createClient().rpc("create_meme_prompt_chain", {
        chain_slug: form.get("slug")?.trim(),
        chain_name: form.get("name")?.trim(),
        chain_description: form.get("description")?.trim() || "",
      });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    const chain = Array.isArray(result.data) ? result.data[0] : result.data;
    setPromptChains((current) => editingPromptChain.id ? current.map((item) => item.id === chain.id ? chain : item) : [...current, chain]);
    setSelectedPromptChain((current) => current?.id === chain.id ? chain : current);
    setEditingPromptChain(null);
  }

  async function deletePromptChain(chain) {
    if (!window.confirm(`Delete ${chain.name} and all of its steps permanently?`)) return;
    setSaving(true); setMessage("");
    const { data, error } = await createClient().rpc("delete_meme_prompt_chain", { target_chain_id: chain.id });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const replacementId = Array.isArray(data) ? data[0] : data;
    setPromptChains((current) => current.filter((item) => item.id !== chain.id).map((item) => ({ ...item, is_active: item.id === replacementId ? true : item.is_active && item.id !== chain.id })));
    setPromptChainSteps((current) => current.filter((step) => step.prompt_chain_id !== chain.id));
    setSelectedPromptChain((current) => current?.id === chain.id ? null : current);
  }

  async function saveLlmModel(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    let payload;
    try { payload = JSON.parse(new FormData(event.currentTarget).get("payload")); }
    catch { setSaving(false); setMessage("Model details must be valid JSON."); return; }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const result = editingLlmModel?.id
      ? await createClient().from("llm_models").update(payload).eq("id", editingLlmModel.id).select().single()
      : await createClient().from("llm_models").insert(payload).select().single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setLlmModels((current) => editingLlmModel?.id ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current]);
    setEditingLlmModel(null);
  }

  async function deleteLlmModel(model) {
    if (!window.confirm(`Delete ${model.name || model.model_name || model.id} permanently?`)) return;
    const { error } = await createClient().from("llm_models").delete().eq("id", model.id);
    if (error) { setMessage(error.message); return; }
    setLlmModels((current) => current.filter((item) => item.id !== model.id));
  }

  async function saveTerm(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      term: form.get("term")?.trim(),
      guidance: form.get("guidance")?.trim(),
      sort_order: Number(form.get("sort_order")),
      is_active: form.get("is_active") === "on",
    };
    if (editingTerm?.id) payload.id = editingTerm.id;
    const result = await createClient().rpc("save_term", { term_payload: payload });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    const savedTerm = Array.isArray(result.data) ? result.data[0] : result.data;
    setTerms((current) => editingTerm?.id ? current.map((item) => item.id === savedTerm.id ? savedTerm : item) : [...current, savedTerm]);
    setEditingTerm(null);
  }

  async function deleteTerm(term) {
    if (!window.confirm(`Delete ${term.term || term.name || term.id} permanently?`)) return;
    const { error } = await createClient().rpc("delete_term", { target_term_id: term.id });
    if (error) { setMessage(error.message); return; }
    setTerms((current) => current.filter((item) => item.id !== term.id));
  }

  async function saveAllowedEmailDomain(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    let payload;
    try { payload = JSON.parse(new FormData(event.currentTarget).get("payload")); }
    catch { setSaving(false); setMessage("Domain details must be valid JSON."); return; }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const result = editingAllowedEmailDomain?.id
      ? await createClient().from("allowed_email_domains").update(payload).eq("id", editingAllowedEmailDomain.id).select().single()
      : await createClient().from("allowed_email_domains").insert(payload).select().single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setAllowedEmailDomains((current) => editingAllowedEmailDomain?.id ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current]);
    setEditingAllowedEmailDomain(null);
  }

  async function deleteAllowedEmailDomain(domain) {
    if (!window.confirm(`Delete ${domain.domain || domain.name || domain.id} permanently?`)) return;
    const { error } = await createClient().from("allowed_email_domains").delete().eq("id", domain.id);
    if (error) { setMessage(error.message); return; }
    setAllowedEmailDomains((current) => current.filter((item) => item.id !== domain.id));
  }

  async function saveMemeImage(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const bucket = editingMemeImage?.bucket || form.get("bucket");
    if (!file?.size) { setSaving(false); setMessage("Choose an image file first."); return; }
    const requestedPath = form.get("path")?.trim();
    const path = editingMemeImage?.path || requestedPath || `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: Boolean(editingMemeImage) });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const storage = createClient().storage.from(bucket);
    const { data: signed } = await storage.createSignedUrl(path, 3600);
    const image = { ...(editingMemeImage || {}), id: `${bucket}:${path}`, name: path.split("/").pop(), bucket, path, url: signed?.signedUrl ?? storage.getPublicUrl(path).data.publicUrl, metadata: { mimetype: file.type, size: file.size } };
    setMemeImages((current) => editingMemeImage ? current.map((item) => item.bucket === bucket && item.path === path ? image : item) : [image, ...current]);
    setEditingMemeImage(null);
  }

  async function deleteMemeImage(image) {
    if (!window.confirm(`Delete ${image.name} permanently?`)) return;
    const { error } = await createClient().storage.from(image.bucket).remove([image.path]);
    if (error) { setMessage(error.message); return; }
    setMemeImages((current) => current.filter((item) => !(item.bucket === image.bucket && item.path === image.path)));
  }

  async function signOut() { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }

  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - 6 + index);
    return { day, count: media.filter((item) => new Date(item.created_at).toDateString() === day.toDateString()).length };
  });
  const maxCount = Math.max(1, ...dailyCounts.map((entry) => entry.count));

  return <main className="admin-shell">
    <aside className="sidebar">
      <div className="brand">Prompt Chain Tool</div>
      <nav aria-label="Admin navigation">{navigationItems.map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => { setView(key); if (key !== "promptChains") setSelectedPromptChain(null); }}>{key === "promptChains" ? "Prompt Chains" : key === "promptChainMix" ? "Chain mix" : key === "terms" ? "Terms" : key === "llmModels" ? "LLM providers/models" : key === "memeImages" ? "Meme images" : "Test prompt chain"}</button>)}</nav>
      <div className="account"><span>{adminName}</span><button onClick={signOut}>Sign out</button></div>
    </aside>
    <section className="admin-content">
      <header className="top"><div><p className="eyebrow">Realtime snapshot</p><h1>{labels[view][0]}</h1><p className="muted">{labels[view][1]}</p></div><div className="header-actions"><span className="admin-pill">● Superadmin session</span><ThemeToggle /></div></header>
      {message && <p className="error">{message}</p>}
      {view === "overview" && <>
        <div className="stats">
          <Stat label="Generations" value={media.length} note="All-time creative artifacts" />
          <Stat label="Community pulse" value={`${totals.approval}%`} note="positive reaction rate" dark />
          <Stat label="People" value={profiles.length} note="profiles in the room" violet />
          <Stat label="Vote volume" value={votes.length} note="individual decisions" />
        </div>
        <div className="overview-grid"><section className="panel"><PanelHead title="Creation cadence" detail="last 7 days" /><div className="chart">{dailyCounts.map(({ day, count }) => <div key={day} className="chart-bar" title={`${count} creations on ${day.toLocaleDateString()}`} style={{ height: `${22 + (count / maxCount) * 170}px` }} />)}</div></section>
          <section className="panel"><PanelHead title="Most loved" detail="↗" /><ul className="loved-list">{media.slice().sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0))).slice(0, 5).map((item) => <li key={item.id}><span>{item.content_text || item.prompt_text || "Untitled"}</span><b>+{(item.upvotes || 0) - (item.downvotes || 0)}</b></li>)}{!media.length && <li className="empty">No media yet.</li>}</ul></section>
        </div>
      </>}
      {view === "media" && <section className="panel"><PanelHead title="AI-generated media" action={<button className="primary compact" onClick={() => { setMessage(""); setEditing({}); }}>+ New generation</button>} /><Table headings={["Media", "Keyword/prompt (optional)", "Caption", "Created", "Reaction", ""]}>{media.map((item) => <tr key={item.id}><td><img className="media-thumb" src={item.image_url} alt="" /></td><td>{item.prompt_text || item.keyword || item.prompt || "—"}</td><td>{item.content_text || item.caption || "—"}</td><td>{formatDate(item.created_at)}</td><td>↑ {item.upvotes || 0}&nbsp; ↓ {item.downvotes || 0}</td><td className="row-actions"><button onClick={() => setViewingVotesFor(item)}>Votes</button><button onClick={() => { setMessage(""); setEditing(item); }}>Edit</button><button className="danger" onClick={() => deleteMedia(item.id)}>Delete</button></td></tr>)}{!media.length && emptyRow(6)}</Table></section>}
      {view === "people" && <section className="panel"><PanelHead title="Profiles" detail="Directory and whitelist access" /><Table headings={["Person", "Email", "Joined", "Role", "Whitelisted"]}>{profiles.map((profile) => { const isWhitelisted = Boolean(profile.is_whitelisted ?? profile.whitelisted); return <tr key={profile.id}><td><span className="avatar">{(profile.display_name || profile.email || "?").slice(0, 1).toUpperCase()}</span>{profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed"}</td><td>{profile.email}</td><td>{formatDate(profile.created_at)}</td><td>{profile.is_superadmin ? <span className="admin-pill">SUPERADMIN</span> : <span className="muted">Member</span>}</td><td><label className="check-control"><input type="checkbox" checked={isWhitelisted} disabled={saving} onChange={(event) => updateProfileWhitelist(profile, event.target.checked)} /><span>{isWhitelisted ? "Yes" : "No"}</span></label></td></tr>; })}{!profiles.length && emptyRow(5)}</Table></section>}
      {view === "votes" && <section className="panel"><PanelHead title="Vote ledger" detail="Read-only audit trail" /><Table headings={["Generation", "Voter", "Vote", "When"]}>{votes.map((vote) => <tr key={`${vote.generation_id}-${vote.user_id}`}><td>{mediaById[vote.generation_id]?.content_text || mediaById[vote.generation_id]?.prompt_text || `${vote.generation_id.slice(0, 8)}…`}</td><td>{profileById[vote.user_id]?.display_name || profileById[vote.user_id]?.email || `${vote.user_id.slice(0, 8)}…`}</td><td className={vote.vote > 0 ? "positive" : "negative"}>{vote.vote > 0 ? "↑ Upvote" : "↓ Downvote"}</td><td>{formatDate(vote.created_at)}</td></tr>)}{!votes.length && emptyRow(4)}</Table></section>}
      {view === "promptChains" && (selectedPromptChain ? <><button className="secondary compact" onClick={() => setSelectedPromptChain(null)}>← All prompt chains</button>{!selectedPromptChain.is_active && <button className="primary compact" disabled={saving} onClick={() => activatePromptChain(selectedPromptChain)}>{saving ? "Activating…" : "Make this the active chain"}</button>}<ChainStepsTable title={`${selectedPromptChain.name} steps`} rows={promptChainSteps.filter((step) => step.prompt_chain_id === selectedPromptChain.id).sort((a, b) => a.step_order - b.step_order)} error={promptChainStepsError} saving={saving} onCreate={() => { const chainSteps = promptChainSteps.filter((step) => step.prompt_chain_id === selectedPromptChain.id); const nextOrder = Math.max(0, ...chainSteps.map((step) => Number(step.step_order) || 0)) + 1; setMessage(""); setEditingChainStep({ prompt_chain_id: selectedPromptChain.id, step_key: "new_step", step_order: nextOrder, prompt_template: "", is_active: true, llm_model: "gemini-3.1-flash-lite" }); }} onEdit={(step) => { setMessage(""); setEditingChainStep(step); }} onDelete={deleteChainStep} onMove={moveChainStep} /></> : <PromptChainsTable rows={promptChains} steps={promptChainSteps} error={promptChainsError} saving={saving} onCreate={() => { setMessage(""); setEditingPromptChain({}); }} onEdit={(chain) => { setMessage(""); setEditingPromptChain(chain); }} onOpen={setSelectedPromptChain} onActivate={activatePromptChain} onDelete={deletePromptChain} />)}
      {view === "promptChainMix" && <MixTable rows={promptChainMix} error={promptChainMixError} onEdit={(item) => { setMessage(""); setEditingChainMix(item); }} />}
      {view === "testPromptChain" && <TestPromptChain images={memeImages} onUploaded={(generation) => setMedia((current) => [generation, ...current])} />}
      {view === "llmModels" && <LlmModelsTable rows={llmModels} error={llmModelsError} onCreate={() => { setMessage(""); setEditingLlmModel({}); }} onEdit={(model) => { setMessage(""); setEditingLlmModel(model); }} onDelete={deleteLlmModel} />}
      {view === "memeImages" && <MemeImagesTable images={memeImages} error={memeImagesError} onCreate={() => { setMessage(""); setEditingMemeImage({}); }} onEdit={(image) => { setMessage(""); setEditingMemeImage(image); }} onDelete={deleteMemeImage} />}
      {view === "generationRequests" && <><GenerationRequestAnalytics rows={generationRequests} /><GenerationRequestsTable rows={generationRequests} error={generationRequestsError} onView={setViewingGenerationRequest} /></>}
      {view === "terms" && <TermsTable rows={terms} error={termsError} onCreate={() => { setMessage(""); setEditingTerm({ term: "", guidance: "", sort_order: Math.max(0, ...terms.map((item) => Number(item.sort_order) || 0)) + 1, is_active: true }); }} onEdit={(term) => { setMessage(""); setEditingTerm(term); }} onDelete={deleteTerm} />}
      {view === "allowedEmailDomains" && <AllowedEmailDomainsTable rows={allowedEmailDomains} error={allowedEmailDomainsError} onCreate={() => { setMessage(""); setEditingAllowedEmailDomain({}); }} onEdit={(domain) => { setMessage(""); setEditingAllowedEmailDomain(domain); }} onDelete={deleteAllowedEmailDomain} />}
    </section>
    {editing && <MediaEditor item={editing} library={memeImages} saving={saving} onClose={() => setEditing(null)} onSave={saveMedia} />}
    {editingPromptChain && <PromptChainModal item={editingPromptChain} saving={saving} onClose={() => setEditingPromptChain(null)} onSave={savePromptChain} />}
    {viewingVotesFor && <VoteModal generation={viewingVotesFor} votes={votes.filter((vote) => vote.generation_id === viewingVotesFor.id)} profiles={profileById} onClose={() => setViewingVotesFor(null)} />}
    {editingChainMix && <ChainMixModal item={editingChainMix} saving={saving} onClose={() => setEditingChainMix(null)} onSave={saveChainMix} />}
    {editingChainStep && <ChainStepModal item={editingChainStep} saving={saving} onClose={() => setEditingChainStep(null)} onSave={saveChainStep} />}
    {editingLlmModel && <LlmModelModal item={editingLlmModel} saving={saving} onClose={() => setEditingLlmModel(null)} onSave={saveLlmModel} />}
    {editingMemeImage && <MemeImageModal image={editingMemeImage} saving={saving} onClose={() => setEditingMemeImage(null)} onSave={saveMemeImage} />}
    {viewingGenerationRequest && <GenerationRequestModal request={viewingGenerationRequest} onClose={() => setViewingGenerationRequest(null)} />}
    {editingTerm && <TermModal item={editingTerm} saving={saving} onClose={() => setEditingTerm(null)} onSave={saveTerm} />}
    {editingAllowedEmailDomain && <AllowedEmailDomainModal item={editingAllowedEmailDomain} saving={saving} onClose={() => setEditingAllowedEmailDomain(null)} onSave={saveAllowedEmailDomain} />}
  </main>;
}

function Stat({ label, value, note, dark, violet }) { return <article className={`stat ${dark ? "dark" : ""} ${violet ? "violet" : ""}`}><p className="eyebrow">{label}</p><strong>{value}</strong><small>{note}</small></article>; }
function GenerationRequestAnalytics({ rows }) { const status = (row) => String(row.status || row.state || "").toLowerCase(); const active = rows.filter((row) => ["pending", "queued", "processing", "running", "in_progress"].includes(status(row))).length; const completed = rows.filter((row) => ["completed", "complete", "succeeded", "success", "done"].includes(status(row))).length; const failed = rows.filter((row) => ["failed", "error", "cancelled", "canceled"].includes(status(row))).length; return <div className="stats compact-stats"><Stat label="Total requests" value={rows.length} note="All generation requests" /><Stat label="Active" value={active} note="Queued or processing" dark /><Stat label="Completed" value={completed} note="Successful requests" violet /><Stat label="Failed" value={failed} note="Failed or cancelled" /></div>; }
function PanelHead({ title, detail, action }) { return <header className="panel-head"><h2>{title}</h2>{action || <span className="muted">{detail}</span>}</header>; }
function Table({ headings, children }) { return <div className="table-wrap"><table><thead><tr>{headings.map((heading, index) => <th key={index}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function ReadTable({ title, rows, error }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at", "llm", "llm_used", "llm_model", "llm_model_id", "model", "model_id"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title={title} detail="Read-only" />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Record"]), "LLM used"]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td>{llmUsed(row)}</td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function PromptChainsTable({ rows, steps, error, saving, onCreate, onEdit, onOpen, onActivate, onDelete }) { return <section className="panel"><PanelHead title="Prompt chains" action={<button className="primary compact" onClick={onCreate}>+ Add chain</button>} />{error ? <p className="form-note">Could not load prompt chains: {error}</p> : <Table headings={["Chain", "Description", "Active", "Steps", ""]}>{rows.map((chain) => { const stepCount = steps.filter((step) => step.prompt_chain_id === chain.id).length; return <tr key={chain.id}><td><b>{chain.name}</b><br /><small className="muted">{chain.slug}</small></td><td>{chain.description || "—"}</td><td><label className="check-control"><input type="checkbox" checked={chain.is_active} disabled={saving || chain.is_active} onChange={() => onActivate(chain)} aria-label={`Make ${chain.name} active`} /><span>{chain.is_active ? "Active" : ""}</span></label></td><td>{stepCount}</td><td className="row-actions"><button onClick={() => onOpen(chain)}>View steps</button><button onClick={() => onEdit(chain)}>Edit</button><button className="danger" disabled={saving} onClick={() => onDelete(chain)}>Remove</button></td></tr>; })}{!rows.length && emptyRow(5)}</Table>}</section>; }
function PromptChainModal({ item, saving, onClose, onSave }) { const isEditing = Boolean(item.id); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Prompt chain</p><h2>{isEditing ? "Edit prompt chain" : "Add prompt chain"}</h2><label>Name<input name="name" defaultValue={item.name || ""} required /></label>{isEditing ? <label>Slug<input value={item.slug} disabled /></label> : <label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="e.g. image-first-captions" required /></label>}<label>Description<textarea name="description" defaultValue={item.description || ""} /></label><p className="form-note">{isEditing ? "The slug stays fixed to preserve existing references." : "New chains start inactive. Add steps, then make the chain active when it is ready."}</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : isEditing ? "Save changes" : "Add chain"}</button></div></form></div>; }
function ChainStepsTable({ title = "Prompt chain steps", rows, error, saving, onCreate, onEdit, onDelete, onMove }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at", "prompt_chain_id", "llm", "llm_used", "llm_model", "llm_model_id", "model", "model_id"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title={title} action={<button className="primary compact" onClick={onCreate}>+ Add step</button>} />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Record"]), "LLM used", ""]}>{rows.map((row, index) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td>{llmUsed(row)}</td><td className="row-actions"><button disabled={saving || index === 0} onClick={() => onMove(row, "up")}>↑</button><button disabled={saving || index === rows.length - 1} onClick={() => onMove(row, "down")}>↓</button><button onClick={() => onEdit(row)}>Edit</button><button className="danger" disabled={saving} onClick={() => onDelete(row)}>Remove</button></td></tr>)}{!rows.length && emptyRow(Math.max(3, columns.length + 2))}</Table>}</section>; }
function GenerationRequestsTable({ rows, error, onView }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at"].includes(column)).slice(0, 7); return <section className="panel"><PanelHead title="Generation requests" detail="Select a row to view all details" />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Request"]), "Created"]}>{rows.map((row) => <tr key={row.id} className="request-row" onClick={() => onView(row)}>{columns.map((column) => <td className="request-cell" key={column} title={formatCell(row[column])}>{formatCell(row[column])}</td>)}<td>{formatDate(row.created_at)}</td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function MixTable({ rows, error, onEdit }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at", "llm", "llm_used", "llm_model", "llm_model_id", "model", "model_id"].includes(column)).slice(0, 5); return <section className="panel"><PanelHead title="Prompt chain mix" detail="Update existing records" />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...columns, "LLM used", ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td>{llmUsed(row)}</td><td className="row-actions"><button onClick={() => onEdit(row)}>Edit mix</button></td></tr>)}{!rows.length && emptyRow(columns.length + 2)}</Table>}</section>; }
function formatCell(value) { return value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function llmUsed(row) { const value = row.llm_used || row.llm || row.llm_model || row.model || row.llm_model_id || row.model_id; return typeof value === "object" ? value.name || value.display_name || value.model_name || value.id || "—" : formatCell(value); }
function ChainMixModal({ item, saving, onClose, onSave }) { const initialValue = JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "created_at", "updated_at"].includes(key))), null, 2); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Prompt chain mix</p><h2>Update mix</h2><label>Mix details (JSON)<textarea name="payload" defaultValue={initialValue} required spellCheck="false" /></label><p className="form-note">Only existing records can be updated here. IDs and timestamps are preserved automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save mix"}</button></div></form></div>; }
function ChainStepModal({ item, saving, onClose, onSave }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Prompt chain step</p><h2>{item.id ? "Update step" : "Add step"}</h2><label>Step key<input name="step_key" defaultValue={item.step_key || ""} pattern="[a-z][a-z0-9_]*" required /></label><label>Prompt template<textarea name="prompt_template" defaultValue={item.prompt_template || ""} required /></label><aside className="template-legend"><b>Available placeholders</b><dl><div><dt>{"{{style_templates}}"}</dt><dd>All active Chain mix entries</dd></div><div><dt>{"{{terms}}"}</dt><dd>All active Terms entries</dd></div><div><dt>{"{{keywords}}"}</dt><dd>The optional text entered by the user</dd></div></dl></aside><p className="form-note">New steps are added at the end. Use the ↑ and ↓ controls to reorder them.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : item.id ? "Save step" : "Add step"}</button></div></form></div>; }
function LlmModelsTable({ rows, error, onCreate, onEdit, onDelete }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title="LLM providers/models" action={<button className="primary compact" onClick={onCreate}>+ New record</button>} />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Record"]), ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td className="row-actions"><button onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(row)}>Delete</button></td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function LlmModelModal({ item, saving, onClose, onSave }) { const initialValue = JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "created_at", "updated_at"].includes(key))), null, 2); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">LLM model</p><h2>{item.id ? "Edit model" : "New model"}</h2><label>Model details (JSON)<textarea name="payload" defaultValue={initialValue} required spellCheck="false" /></label><p className="form-note">IDs and timestamps are managed automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save model"}</button></div></form></div>; }
function MediaEditor({ item, library, saving, onClose, onSave }) { const [source, setSource] = useState(item.image_url ? "current" : "library"); const [selectedUrl, setSelectedUrl] = useState(""); const previewUrl = source === "current" ? item.image_url : source === "library" ? selectedUrl : ""; return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Generation record</p><h2>{item.id ? "Edit generation" : "New AI media"}</h2><label>Keyword / prompt (optional)<input name="prompt_text" defaultValue={item.prompt_text || item.keyword || item.prompt || ""} /></label><label>Content / caption<input name="content_text" required defaultValue={item.content_text || ""} /></label><label>Photo source<select name="image_source" value={source} onChange={(event) => setSource(event.target.value)}>{item.image_url && <option value="current">Keep current photo</option>}<option value="library">Choose from photo library</option><option value="upload">Upload a new photo</option></select></label>{source === "library" && <><input type="hidden" name="library_url" value={selectedUrl} /><div className="library-picker" role="group" aria-label="Photo library">{library.map((image) => <button type="button" key={`${image.bucket}:${image.path}`} className={selectedUrl === image.url ? "selected" : ""} onClick={() => setSelectedUrl(image.url)} aria-pressed={selectedUrl === image.url}><img src={image.url} alt={image.name} /><span>{image.name}</span><small>{image.bucket}</small></button>)}{!library.length && <p className="empty">No library images are available.</p>}</div></>}{source === "upload" && <><label>Upload bucket<select name="image_bucket" defaultValue="meme_photos"><option value="meme_photos">meme_photos</option><option value="user_meme_photos">user_meme_photos</option></select></label><label>New photo<input name="image_file" type="file" accept="image/*" required /></label></>}{previewUrl && <img className="edit-media-preview" src={previewUrl} alt="Selected generation preview" />}{item.id && <div className="vote-summary" aria-label="Read-only community votes"><span>Community votes</span><strong>↑ {item.upvotes || 0} <i>upvotes</i></strong><strong>↓ {item.downvotes || 0} <i>downvotes</i></strong></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></div></form></div>; }
function MemeImagesTable({ images, error, onCreate, onEdit, onDelete }) { return <section className="panel"><PanelHead title="Meme images" action={<button className="primary compact" onClick={onCreate}>+ Upload image</button>} />{error && <p className="form-note">Some images could not be loaded: {error}</p>}<div className="image-grid">{images.map((image) => <article className="image-card" key={`${image.bucket}:${image.path}`}><img src={image.url} alt={image.name} /><div><b>{image.name}</b><small>{image.bucket}</small><small>{image.metadata?.mimetype || "image"} · {image.metadata?.size ? `${Math.ceil(image.metadata.size / 1024)} KB` : "—"}</small><p><button onClick={() => onEdit(image)}>Replace</button><button className="danger" onClick={() => onDelete(image)}>Delete</button></p></div></article>)}{!images.length && <p className="empty">No images found in either bucket.</p>}</div></section>; }
function MemeImageModal({ image, saving, onClose, onSave }) { const isReplacing = Boolean(image.path); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Meme image</p><h2>{isReplacing ? "Replace image" : "Upload image"}</h2>{!isReplacing && <><label>Bucket<select name="bucket" defaultValue="meme_photos"><option value="meme_photos">meme_photos</option><option value="user_meme_photos">user_meme_photos</option></select></label><label>Optional storage path<input name="path" placeholder="e.g. featured/my-meme.png" /></label></>}<label>Image file<input name="file" type="file" accept="image/*" required /></label><p className="form-note">{isReplacing ? `This replaces ${image.path} in ${image.bucket}.` : "Leave the path empty to generate a unique filename."}</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : isReplacing ? "Replace image" : "Upload image"}</button></div></form></div>; }
function GenerationRequestModal({ request, onClose }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="request-title"><section className="modal request-modal"><p className="eyebrow">Generation request</p><h2 id="request-title">Request details</h2><dl>{Object.entries(request).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{formatCell(value)}</dd></div>)}</dl><div className="modal-actions"><button className="secondary" onClick={onClose}>Close</button></div></section></div>; }
function TermsTable({ rows, error, onCreate, onEdit, onDelete }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title="Terms" action={<button className="primary compact" onClick={onCreate}>+ New term</button>} />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Term"]), ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td className="row-actions"><button onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(row)}>Delete</button></td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function TermModal({ item, saving, onClose, onSave }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Term</p><h2>{item.id ? "Edit term" : "New term"}</h2><label>Term<input name="term" defaultValue={item.term || ""} required /></label><label>Guidance<textarea name="guidance" defaultValue={item.guidance || ""} required /></label><label>Sort order<input name="sort_order" type="number" min="1" defaultValue={item.sort_order || 1} required /></label><label className="check-control"><input name="is_active" type="checkbox" defaultChecked={item.is_active ?? true} />Active</label><p className="form-note">IDs and timestamps are managed automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save term"}</button></div></form></div>; }
function AllowedEmailDomainsTable({ rows, error, onCreate, onEdit, onDelete }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title="Allowed e-mail domains" action={<button className="primary compact" onClick={onCreate}>+ New domain</button>} />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Domain"]), ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td className="row-actions"><button onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(row)}>Delete</button></td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function AllowedEmailDomainModal({ item, saving, onClose, onSave }) { const initialValue = JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "created_at", "updated_at"].includes(key))), null, 2); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Allowed e-mail domain</p><h2>{item.id ? "Edit domain" : "New domain"}</h2><label>Domain details (JSON)<textarea name="payload" defaultValue={initialValue} required spellCheck="false" /></label><p className="form-note">IDs and timestamps are managed automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save domain"}</button></div></form></div>; }

function VoteModal({ generation, votes, profiles, onClose }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="votes-title"><section className="modal votes-modal"><p className="eyebrow">Community activity</p><h2 id="votes-title">Votes on this generation</h2><p className="vote-caption">{generation.content_text || generation.prompt_text || "Untitled generation"}</p><ul className="voter-list">{votes.map((vote) => {
    const profile = profiles[vote.user_id];
    const name = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || `${vote.user_id.slice(0, 8)}…`;
    return <li key={`${vote.generation_id}-${vote.user_id}`}><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span>{name}<small>{profile?.email && profile.display_name ? profile.email : ""}</small></span><b className={vote.vote > 0 ? "positive" : "negative"}>{vote.vote > 0 ? "↑ Upvote" : "↓ Downvote"}</b></li>;
  })}{!votes.length && <li className="empty">No one has voted on this generation yet.</li>}</ul><div className="modal-actions"><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}
