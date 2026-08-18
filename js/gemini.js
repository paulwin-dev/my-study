// Thin wrapper around the Gemini API. Called directly from the browser using
// the free API key you paste into Settings — nothing goes through a server
// you don't control.
//
// Model names on the free tier change fairly often as Google ships new
// versions, so the model is a plain text setting (see Settings screen) rather
// than hard-coded. If generation stops working with a "model not found"
// error, open https://ai.google.dev/gemini-api/docs/models, copy the current
// free-tier Flash model's id, and paste it into Settings.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function getSettings() {
  return {
    apiKey: localStorage.getItem("ss_api_key") || "",
    model: localStorage.getItem("ss_model") || "gemini-2.5-flash",
  };
}

async function callGemini(parts, { temperature = 0.4 } = {}) {
  const { apiKey, model } = getSettings();
  if (!apiKey) {
    throw new Error("No Gemini API key set. Add one in Settings first.");
  }

  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || "";
    } catch (_) {
      /* ignore */
    }
    if (res.status === 404) {
      throw new Error(
        `Model "${model}" wasn't found (${detail || "404"}). Free-tier model names change over time — check Settings and update the model id.`
      );
    }
    if (res.status === 429) {
      throw new Error(
        "Rate limit hit on the free tier. Wait a minute and try again."
      );
    }
    throw new Error(`Gemini API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Response blocked: ${blockReason}` : "Empty response from Gemini.");
  }
  return text.trim();
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const Gemini = {
  async testKey() {
    return callGemini([{ text: "Reply with exactly one word: OK" }]);
  },

  // Transcribes a photographed page of notes into clean text.
  async ocrImage(imageBlob) {
    const base64 = await blobToBase64(imageBlob);
    const prompt =
      "Transcribe this page of student notes exactly as written, correcting only " +
      "obvious spelling slips. Keep the original structure (headings, bullet points, " +
      "numbered lists, diagrams described in [brackets]). Return ONLY the transcribed " +
      "text, no preamble, no commentary, no markdown code fences.";
    return callGemini([
      { text: prompt },
      { inline_data: { mime_type: imageBlob.type || "image/jpeg", data: base64 } },
    ]);
  },

  // Builds a study guide or quiz from a set of dated notes.
  async generateStudyMaterial({ className, notes, mode, dateLabel }) {
    const body = notes
      .map((n) => `### ${n.date}\n${n.ocrText || "(no legible text)"}`)
      .join("\n\n");

    const instructions =
      mode === "quiz"
        ? "Create a practice quiz (mix of multiple-choice and short-answer questions) " +
          "that tests understanding of the material below. Include an answer key at the " +
          "end under a '## Answer Key' heading."
        : "Create a clear, well-organized study guide from the material below: group " +
          "related concepts, define key terms, and call out anything that looks likely " +
          "to be exam-relevant (formulas, dates, definitions, cause/effect).";

    const prompt =
      `You are helping a student review their handwritten class notes for "${className}"` +
      `${dateLabel ? `, covering ${dateLabel}` : ""}. ${instructions}\n\n` +
      `Format the response in Markdown with headings and bullet points. ` +
      `Base everything only on the notes provided — do not invent facts not present or implied in them.\n\n` +
      `--- NOTES ---\n${body}`;

    return callGemini([{ text: prompt }], { temperature: 0.5 });
  },
};
