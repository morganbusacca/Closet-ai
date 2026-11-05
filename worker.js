// Closet AI helper (free version): runs on Cloudflare Workers AI. No API key needed.

const ALLOWED_ORIGIN = "https://morganbusacca.github.io";
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const CATS = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Accessories"];

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return reply({ error: "Not allowed" }, 403);
    }
    if (!env.AI) return reply({ error: "Workers AI binding named AI is missing" }, 500);

    try {
      const { image } = await request.json();
      if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(image || "")) return reply({ error: "Unsupported image" }, 400);
      if (image.length > 2000000) return reply({ error: "Image too large" }, 413);

      const prompt =
        "You are cataloging a wardrobe. Look at the single clothing item in this photo. " +
        "Reply with ONLY a JSON object and nothing else, in this form: " +
        '{"name":"Black satin midi slip dress","category":"Dresses"}. ' +
        "The name must be 2 to 6 words and include the color and the type of garment. " +
        "The category must be exactly one of: " + CATS.join(", ") + ".";

      const run = () => env.AI.run(MODEL, {
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } }
          ]
        }],
        max_tokens: 120
      });

      let result;
      try {
        result = await run();
      } catch (e) {
        // This model asks for a one-time license acceptance on first use.
        if (/agree|licen[cs]e/i.test(String(e && e.message))) {
          await env.AI.run(MODEL, { prompt: "agree" });
          result = await run();
        } else {
          throw e;
        }
      }

      let text = result && result.response;
      if (typeof text !== "string") text = JSON.stringify(text || "");
      let name = "", category = "";
      const j = /\{[\s\S]*?\}/.exec(text);
      if (j) {
        try { const o = JSON.parse(j[0]); name = String(o.name || ""); category = String(o.category || ""); } catch (_) {}
      }
      if (!name) name = text.replace(/[{}"\n]/g, " ").trim().split(/\s+/).slice(0, 6).join(" ");
      if (!CATS.includes(category)) category = "";
      return reply({ name: name.slice(0, 60), category });
    } catch (e) {
      return reply({ error: "AI request failed: " + String((e && e.message) || e).slice(0, 120) }, 502);
    }
  }
};
