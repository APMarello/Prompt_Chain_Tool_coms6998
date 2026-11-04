import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

async function listBucketImages(supabase, bucket) {
  const storage = supabase.storage.from(bucket);
  async function listFolder(prefix = "") {
    const { data, error } = await storage.list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw error;
    const nested = await Promise.all((data ?? []).map(async (file) => {
      const path = `${prefix}${file.name}`;
      if (!file.metadata) return listFolder(`${path}/`);
      const { data: signed } = await storage.createSignedUrl(path, 3600);
      return { ...file, bucket, path, url: signed?.signedUrl ?? storage.getPublicUrl(path).data.publicUrl };
    }));
    return nested.flat();
  }
  try { return { files: await listFolder(), error: "" }; }
  catch (error) { return { files: [], error: error.message }; }
}

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_superadmin) redirect("/access-denied");

  const [mediaResult, profilesResult, votesResult, promptChainMixResult, promptChainsResult, promptChainStepsResult, llmModelsResult, generationRequestsResult, termsResult, allowedEmailDomainsResult, memePhotos, userMemePhotos] = await Promise.all([
    supabase.from("ai_generations").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("meme_votes").select("*").order("created_at", { ascending: false }),
    supabase.from("meme_caption_styles").select("*").order("created_at", { ascending: false }),
    supabase.from("meme_prompt_chains").select("*").order("created_at", { ascending: false }),
    supabase.from("meme_prompt_chain_steps").select("*").order("created_at", { ascending: false }),
    supabase.from("llm_models").select("*").order("created_at", { ascending: false }),
    supabase.from("ai_generation_requests").select("*"),
    supabase.rpc("list_all_terms"),
    supabase.from("allowed_email_domains").select("*"),
    listBucketImages(supabase, "meme_photos"),
    listBucketImages(supabase, "user_meme_photos"),
  ]);

  return <AdminDashboard
    adminName={profile.display_name || profile.email || user.email}
    initialMedia={mediaResult.data ?? []}
    initialProfiles={profilesResult.data ?? []}
    initialVotes={votesResult.data ?? []}
    initialPromptChains={promptChainsResult.data ?? []}
    initialPromptChainMix={promptChainMixResult.data ?? []}
    initialPromptChainSteps={promptChainStepsResult.data ?? []}
    promptChainsError={promptChainsResult.error?.message ?? ""}
    promptChainMixError={promptChainMixResult.error?.message ?? ""}
    promptChainStepsError={promptChainStepsResult.error?.message ?? ""}
    initialLlmModels={llmModelsResult.data ?? []}
    llmModelsError={llmModelsResult.error?.message ?? ""}
    initialGenerationRequests={generationRequestsResult.data ?? []}
    generationRequestsError={generationRequestsResult.error?.message ?? ""}
    initialTerms={termsResult.data ?? []}
    termsError={termsResult.error?.message ?? ""}
    initialAllowedEmailDomains={allowedEmailDomainsResult.data ?? []}
    allowedEmailDomainsError={allowedEmailDomainsResult.error?.message ?? ""}
    initialMemeImages={[...memePhotos.files, ...userMemePhotos.files]}
    memeImagesError={[memePhotos.error, userMemePhotos.error].filter(Boolean).join(" · ")}
  />;
}
