import { createClient } from "../../../utils/supabase/server";

export const runtime = "nodejs";

function imageMimeType(photoPath, blobType) {
  if (blobType?.startsWith("image/")) return blobType;
  if (/\.png$/i.test(photoPath)) return "image/png";
  if (/\.gif$/i.test(photoPath)) return "image/gif";
  if (/\.webp$/i.test(photoPath)) return "image/webp";
  return "image/jpeg";
}

function fillPromptTemplate(template, values) {
  const rendered = template.replace(/{{(style_templates|terms|keywords|caption_briefs|previous_output|steps\.([a-z][a-z0-9_]*))}}/g, (_, key, stepKey) => {
    if (stepKey) return values.steps[stepKey] ?? "";
    if (key === "caption_briefs") return values.previous_output;
    return values[key] ?? "";
  });
  if (/{{[^}]+}}/.test(rendered)) throw new Error("A prompt-chain step contains an unsupported template variable.");
  return rendered;
}

async function finishRequest(supabase, requestId, startedAt, details) {
  await supabase.from("ai_generation_requests").update({ ...details, completed_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq("id", requestId);
}

async function generateContent(image, prompt, photoPath, modelIdentifier) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelIdentifier)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: imageMimeType(photoPath, image.type), data: Buffer.from(await image.arrayBuffer()).toString("base64") } }, { text: prompt }] }] }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Gemini couldn't generate a caption.");
  return result?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim() ?? "";
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to generate a caption." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const photoPath = typeof body?.photoPath === "string" ? body.photoPath.trim() : "";
  const bucket = typeof body?.bucket === "string" ? body.bucket : "";
  const keywords = typeof body?.keywords === "string" ? body.keywords.trim().slice(0, 1000) : "";
  if (!photoPath || photoPath.startsWith("/") || photoPath.includes("..") || !["meme_photos", "user_meme_photos"].includes(bucket)) return Response.json({ error: "Choose an image from the library." }, { status: 400 });

  const startedAt = Date.now();
  const { data: requestLog, error: logError } = await supabase.from("ai_generation_requests").insert({ user_id: user.id, photo_bucket: bucket, photo_path: photoPath, input_keywords: keywords }).select("id").single();
  if (logError || !requestLog) return Response.json({ error: "Couldn’t start generation logging." }, { status: 500 });
  if (!process.env.GEMINI_API_KEY) {
    await finishRequest(supabase, requestLog.id, startedAt, { status: "failed", error_message: "Gemini API key is not configured." });
    return Response.json({ error: "Gemini is not configured on this server." }, { status: 503 });
  }

  const { data: chain, error: chainError } = await supabase.from("meme_prompt_chains").select("id, slug, name").eq("is_active", true).maybeSingle();
  const [{ data: styles, error: stylesError }, { data: steps, error: stepsError }, { data: terms, error: termsError }] = await Promise.all([
    supabase.from("meme_caption_styles").select("name, prompt_template, llm_models(model_identifier, llm_model)").eq("is_active", true).order("sort_order"),
    chain ? supabase.from("meme_prompt_chain_steps").select("step_key, prompt_template, llm_models(model_identifier, llm_model)").eq("prompt_chain_id", chain.id).eq("is_active", true).order("step_order") : Promise.resolve({ data: [], error: null }),
    supabase.from("terms").select("term, guidance").eq("is_active", true).order("sort_order"),
  ]);
  if (chainError || !chain || stylesError || stepsError || termsError || !steps?.length || steps.some((step) => !step.prompt_template || !step.llm_models?.model_identifier)) {
    await finishRequest(supabase, requestLog.id, startedAt, { status: "failed", error_message: "Caption prompt configuration is incomplete." });
    return Response.json({ error: "Caption prompts are not configured yet." }, { status: 503 });
  }

  const { data: image, error: downloadError } = await supabase.storage.from(bucket).download(photoPath);
  if (downloadError || !image) return Response.json({ error: "The selected image could not be loaded." }, { status: 400 });

  try {
    const values = { style_templates: (styles ?? []).map((style, index) => `${index + 1}. ${style.name}: ${style.prompt_template}`).join("\n"), terms: (terms ?? []).map((term) => `${term.term}: ${term.guidance}`).join("\n") || "None configured.", keywords: keywords || "None provided.", previous_output: "", steps: {} };
    await supabase.from("ai_generation_requests").update({ prompt_chain_id: chain.id, prompt_chain_slug: chain.slug, prompt_chain_inputs: { keywords, styles, terms }, model_config: Object.fromEntries(steps.map((step) => [step.step_key, step.llm_models])), image_mime_type: imageMimeType(photoPath, image.type), image_bytes: image.size }).eq("id", requestLog.id);
    const executed = [];
    for (const step of steps) {
      const prompt = fillPromptTemplate(step.prompt_template, values);
      const output = await generateContent(image, prompt, photoPath, step.llm_models.model_identifier);
      if (!output) throw new Error(`The ${step.step_key} step returned no content.`);
      executed.push({ step_key: step.step_key, prompt, output, model: step.llm_models });
      values.previous_output = output;
      values.steps[step.step_key] = output;
    }
    const captions = (executed.at(-1)?.output ?? "").split("\n").map((caption) => caption.replace(/^\s*(?:\d+[.)-]?|[-•])\s*/, "").trim()).filter(Boolean).slice(0, 5);
    if (captions.length !== 5) throw new Error("The final prompt-chain step did not return five captions.");
    await finishRequest(supabase, requestLog.id, startedAt, { status: "succeeded", first_step_prompt: executed[0]?.prompt ?? null, first_step_output: executed[0]?.output ?? null, second_step_prompt: executed[1]?.prompt ?? null, output_captions: captions, prompt_chain_execution: { chain, steps: executed } });
    return Response.json({ captions, chain });
  } catch (error) {
    await finishRequest(supabase, requestLog.id, startedAt, { status: "failed", error_message: error instanceof Error ? error.message : "Unknown generation error." });
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t generate captions." }, { status: 502 });
  }
}
