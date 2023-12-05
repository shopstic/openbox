import { readerFromStreamReader } from "../src/deps/std.ts";
import { StreamingMultipartReader } from "../src/runtime/streaming_multipart_reader.ts";

await Deno
  .serve({
    port: 9876,
    onListen({ hostname, port }) {
      console.log(`OpenAPI server is up at http://${hostname}:${port}`);
    },
  }, async (request) => {
    const ct = request.headers.get("content-type");

    if (ct?.startsWith("multipart/form-data")) {
      const boundary = ct.split(";", 2)[1]?.split("=", 2)?.[1];

      if (boundary && request.body) {
        console.log("Parsing with MultipartReader");
        const streamReader = request.body.getReader();
        const multipartReader = new StreamingMultipartReader(readerFromStreamReader(streamReader), boundary);

        for await (const partReader of multipartReader.partReaders()) {
          console.log(
            "Got partReader",
            "fileName",
            partReader.fileName,
            "formName",
            partReader.formName,
            "headers",
            partReader.headers,
          );

          const buf = new Uint8Array(1024);

          let ret: number | null = null;
          let total = 0;

          while (true) {
            ret = await partReader.read(buf);

            if (ret === null) {
              break;
            }

            total += ret;

            if (total > 500000) {
              console.log("total too big", total, "canceling");
              // streamReader.cancel();
              return new Response("Too big yo", {
                status: 422,
              });
            }
          }

          console.log(
            "Finishing reading",
            "total",
            total,
          );
        }

        return new Response("OK");
      }
    }

    return new Response(`Not multipart/form-data with boundary. Got ${ct}`, { status: 422 });
  })
  .finished;
