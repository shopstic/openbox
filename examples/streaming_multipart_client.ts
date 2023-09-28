import { delay } from "https://deno.land/std@0.202.0/async/delay.ts";

const boundary = "myboundary";
const url = "http://localhost:9876";

async function* streamFile(filename: string, rate = 1024) {
  const file = await Deno.open(filename);
  const buf = new Uint8Array(rate);
  while (true) {
    const bytesRead = await file.read(buf);
    if (bytesRead === null) break;
    yield buf.subarray(0, bytesRead);
    await delay(1); // Throttle by waiting 1 second
  }
  file.close();
}

async function sendRequest() {
  const headers = new Headers();
  headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
  headers.set("Transfer-Encoding", "chunked");

  const formData = [
    `--${boundary}\r\nContent-Disposition: form-data; name="foo"\r\n\r\nbar\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="multi"\r\n\r\none\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="multi"\r\n\r\ntwo\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="cool"; filename="me_portrait.png"\r\nContent-Type: image/png\r\n\r\n`,
  ];

  const fileStream = streamFile("/Users/nktpro/Documents/me_portrait.png");

  const data = (async function* () {
    for (const part of formData) {
      yield new TextEncoder().encode(part);
    }

    for await (const chunk of fileStream) {
      yield chunk;
    }

    yield new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  })();

  const rs = new ReadableStream({
    async pull(controller) {
      try {
        for await (const chunk of data) {
          controller.enqueue(chunk);
        }
      } catch (e) {
        console.error("rs error", e);
      } finally {
        controller.close();
      }
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: rs,
  });

  const text = await res.text();
  console.log(text);
}

await sendRequest();
