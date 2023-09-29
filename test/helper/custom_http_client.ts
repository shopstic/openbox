/// <reference lib="deno.unstable" />
export function useCustomHttpClient() {
  const client = Deno.createHttpClient({
    // proxy: {
    //   url: "http://192.168.2.22:9090",
    // },
  });

  return {
    client,
    [Symbol.dispose]() {
      client.close();
    },
  };
}
