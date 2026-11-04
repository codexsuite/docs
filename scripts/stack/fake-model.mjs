// A fake OpenAI-compatible model for capture runs. It answers on port 4010 with the same text every time, so screens that
// call a model show the same result every time. Plain Node, no dependencies.
import { createServer } from "node:http";

const modelId = "fake-model";
const reply = "The lamp turned slowly, and the keeper counted the flashes until dawn.";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://fake-model").pathname;
  req.resume();
  req.on("end", () => {
    if (req.method === "GET" && path === "/v1/models") {
      return send(res, 200, { object: "list", data: [{ id: modelId, object: "model", owned_by: "docs" }] });
    }
    if (req.method === "POST" && path === "/v1/chat/completions") {
      // The app always asks for a stream, so this answers as server-sent events: content chunks, a chunk with
      // finish_reason "stop", a usage chunk, then [DONE].
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      const chunk = (delta, finish, extra = {}) =>
        `data: ${JSON.stringify({
          id: "chatcmpl-fake",
          object: "chat.completion.chunk",
          created: 1767225600,
          model: modelId,
          choices: [{ index: 0, delta, finish_reason: finish }],
          ...extra,
        })}\n\n`;
      for (const word of reply.split(/(?<= )/)) res.write(chunk({ content: word }, null));
      res.write(chunk({}, "stop"));
      res.write(`data: ${JSON.stringify({ id: "chatcmpl-fake", object: "chat.completion.chunk", created: 1767225600, model: modelId, choices: [], usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 } })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    send(res, 404, { error: { message: "not found" } });
  });
}).listen(4010, "0.0.0.0");
